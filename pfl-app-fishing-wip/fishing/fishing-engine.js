/* =========================================================================
   PFL Fishing — game engine (pure logic, no DOM)
   -------------------------------------------------------------------------
   State machine:

     idle ──swipe──▶ casting ──lure lands──▶ retrieving ──random bite──▶ bite
                                               │  ▲                        │
                        lure reached shore ◀───┘  └──── missed ◀── no tap ─┤
                               │                  (also: fish on, no reeling 2 s ──▶ missed)
                               │                                           │ tap in time
                               ▼                                           ▼
                             empty ──▶ idle        caught ◀── reeled in ── hooked
                                                     │                        │ line tension too
                                                     └──▶ idle   ◀── broken ◀─┘ high for too long

     retrieving ──very slow, no twitches──▶ snagged ──twitch frees it──▶ freed ──▶ retrieving
                                               └──twitch snaps / reeling hard──▶ broken

   All state is local to the page session. No backend, no persistence.
   All tunables live in FISHING_CONFIG below; the fish of each lake (which, how
   many, how big) live in fishing-lakes.js and are merged over it per lake.
   ========================================================================= */
(function (global) {
  'use strict';

  const FISHING_CONFIG = {
    cast: {
      minSwipePx: 40,          // shorter upward swipe is ignored (no accidental casts)
      fullSwipeRatio: 0.5,     // swipe length = 50% of screen height -> full length power
      fastSwipePxPerMs: 2.5,   // flick speed that counts as "full speed" power
      lengthWeight: 0.6,       // power = length * 0.6 + speed * 0.4
      minDistanceM: 3.5,       // weakest cast ("під ноги"), lands right at the bottom of the screen
      maxDistanceM: 74,        // strongest cast, lands at the far edge of the water (v1.24: 74, was 73; the lure sets its own max)
      jitterM: 1,              // ± random metres around the lure's max
      flightBaseS: 0.45,       // lure flight time = base + distance * perM
      flightPerM: 0.018,
      directions: 0,           // PFL app: 0 = any direction (no snapping); N > 1 = snap to N fixed directions (was 9)
      deadZoneDeg: 4,          // swipes within ± this of vertical cast dead straight (a thumb is never exactly vertical)
      maxAimDeg: 45,           // swipe angle from vertical that reaches the outermost direction (20 px from the screen edge)
      maxSwipeAngleDeg: 80,    // swipes flatter than this (almost sideways) are not casts
    },
    reel: {
      maxSpeedMps: 5.5,        // lever at top -> 5.5 m/s retrieve
      followRate: 10,          // how fast actual speed follows the lever while held
      releaseDecayS: 0.8,      // lever released: speed 1 -> 0 in this time
      stopSwipePxPerMs: 0.9,   // released with a downward flick faster than this -> instant stop
      fightSpeedFactor: 0.8,   // with a fish on, reeling is slower
    },
    twitch: {
      fullHoldS: 0.45,         // hold this long for a max-strength twitch
      minStrength: 0.15,       // quick tap strength
      cooldownS: 0.05,         // allows very fast double twitches
      lurePullM: 0.8,          // max-strength twitch pulls the lure this far
      aggressionGain: 0.35,    // each twitch adds strength * gain to "aggression"
      aggressionDecayPerS: 0.2,
    },
    bite: {
      // Bite rate per second = base × retrieve speed × smoothness × rhythm.
      // Target: ~1 bite per 3–4 casts without rhythm, ~1 per 2 with rhythm.
      // Override with engine.setBiteRateFn(fn) without touching the rest.
      baseRatePerS: 0.029,
      graceAfterLandingS: 1.5, // no bites right after the splash
      noBiteNearShoreM: 2,     // no bites in the last metres
      shortCastExtraM: 3,      // cast ≤ species.nearShoreM + this = a short cast "під ноги"
      shortCastGraceS: 0.6,    // bites can start sooner after a short cast…
      shortCastBoost: 4,       // …and come more often (small perch stand at the shore)
      pauseBiteS: [0.4, 5],    // lure lying on the bottom this long = an attractive pause…
      pauseBiteBoost: 2.2,     // …bite chance × this (instead of the "stopped lure" penalty)
      schoolBoost: 5,          // bite chance × this while the lure is in the perch school spot
      // retrieve speed: moderate is best, stopped or max-speed lure is less attractive
      speedBest: [0.2, 0.75],  // lever range with full chance
      speedStopped: 0.35,      // factor for a stopped lure
      speedMax: 0.5,           // factor at max speed
      // smoothness: a jerky lever (constantly moved up/down) scares fish
      jerkyFactor: 0.65,       // factor for a very jerky lever
      // no twitches at all for this long → "just pulling" → lower chance
      plainAfterS: 3,
      plainFactor: 0.75,
      // rhythm (see RHYTHM below): up to ×(1 + rhythmBonus) when the rhythm is solid
      rhythmBonus: 3.2,
      hookWindowS: 1.0,        // time to tap the left button after a bite
      missPauseS: 0.9,         // after a missed hook no new bite for this long
      // Superstition rule: the 1st cast of a session never gets a bite,
      // the 2nd cast always does (at a random moment), then it's random.
      noBiteCasts: [1],
      guaranteedBiteCast: 2,
      guaranteedBiteTimeS: [2.5, 7], // fallback: bite anyway this long after the splash
    },
    rhythm: {
      // A "series" = twitches less than groupGapS apart (a fast double counts).
      // Between series you pull (reel). Rhythm = several series in a row with
      // the SAME number of twitches and roughly the SAME time between them.
      // Any tempo works as long as it is even. Hidden from the player.
      groupGapS: 0.6,          // twitches closer than this = one series
      maxGroupSize: 3,         // 4+ twitches in a row = spamming, breaks the rhythm
      intervalS: [0.7, 5],     // allowed time between the starts of two series
      tolerance: 0.2,          // ±20% interval deviation still counts as "even"
      minPull: 0.12,           // you must be reeling between the series (avg lever speed)
      startAfter: 1,           // rhythm starts to count from the 2nd matching series…
      fullAfter: 4,            // …and is at full strength from the 4th
      riseSpeed: 3,            // how fast the hidden rhythm level rises (per s)
      decayPerS: 0.25,         // how slowly it fades after the rhythm breaks
      loseAfterS: 1.4,         // no next series within (last interval × this) → rhythm broken
    },
    species: {
      // PFL app: WHICH fish live here, how many and how big is set per lake in
      // fishing-lakes.js (merged over this config). Here only what a species IS:
      // How each species fights (multipliers on the base `fight` settings).
      //   turn   – how much it wanders / turns      dart  – sudden direction changes
      //   side   – lateral speed                   sideBias – likes to run sideways
      //   away   – steers away from the shore on runs
      //   swim   – how fast it actually moves      press – pulls (tension) even without moving
      //   start  – how hard the first run after the hookset is
      // `big*` values are reached by the heaviest fish of the species (weight-scaled).
      styles: {
        // perch: swims fairly straight and calm; a big one wanders sideways / away more
        perch:  { turn: 0.45, dart: 0.3, side: 0.55, sideBias: 0,   away: 0.8, swim: 1.0, press: 0.2, start: 0.7,
                  bigTurn: 1.0, bigSide: 1.1, bigAway: 1.3 },
        // pike: explosive start, loves to run sideways, darts, presses sideways and far
        pike:   { turn: 1.2, dart: 1.6, side: 1.5, sideBias: 2.2, away: 1.0, swim: 1.25, press: 0.45, start: 1.4 },
        // zander: stubborn — stays almost in place and presses hard, drifting only a little
        zander: { turn: 0.35, dart: 0.25, side: 0.35, sideBias: 0, away: 0.6, swim: 0.35, press: 0.9, start: 0.9,
                  forceMul: 1.25 },
        crab:   { turn: 0.6, dart: 0.4, side: 0.6, sideBias: 0.6, away: 0.4, swim: 0.7, press: 0.3, start: 0.6 },
        // catfish: heavy and stubborn — slow, long, straight runs away from the shore,
        // leans on the line hard even standing still. Takes a lot of line. Reel slowly:
        //   extraLineM     – line it can take beyond the cast (others: fight.maxExtraLineM)
        //   yellowEscapeS  – reeling in the YELLOW zone this long (faster than yellowSafeReel)
        //                    tears the hook out ("сом зійшов"); easing off lets it recover
        //   tensionMul     – scales the fish's share of the line tension (keeps a 35 kg
        //                    monster playable: red only when you reel against its run)
        catfish: { turn: 0.3, dart: 0.15, side: 0.35, sideBias: 0, away: 1.6, swim: 0.5, press: 1.2, start: 1.1,
                   forceMul: 1.5, extraLineM: 60, yellowEscapeS: 4, yellowSafeReel: 0.2, yellowRecoverPerS: 1.5,
                   tensionMul: 0.75,
                   // stamina: full strength at the hookset, tires over the fight down to `minStamina`;
                   // the heavier, the longer it lasts: tireS = tireBaseS + tirePerKgS × kg
                   tireBaseS: 40, tirePerKgS: 4, minStamina: 0.3 },
      },
      // bigger fish within a species fights harder: power × (from…to) lightest → heaviest
      weightPower: [0.75, 1.55],
    },
    snag: {
      // Stop reeling (or reel very slowly) and don't twitch → the lure sinks
      // and lies on the bottom. A short pause there is GOOD (perch bite on
      // pauses). But if it lies there 5+ s, then the moment you start
      // reeling / twitching again it most likely catches a snag.
      // Twitch to free it; reeling hard against it can snap the line.
      slowSpeed: 0.15,         // reel speed below this = the lure is not being pulled
      sinkS: 1.2,              // time to sink to the bottom after you stop
      snagAfterRestS: 5,       // lying on the bottom at least this long…
      snagOnResumeChance: 0.8, // …then resuming → snag with this chance
      warnAtS: 4,              // warning vibration: "time to move it"
      minDistanceM: 5,         // no snags right at the shore
      freeBase: 0.25,          // each twitch frees it with chance base + perStrength × strength
      freePerStrength: 0.35,
      breakBase: 0.06,         // …and snaps the line with chance base + perStrength × strength
      breakPerStrength: 0.1,
      reelTension: 1.1,        // line tension while reeling against the snag = reel speed × this
      breakAfterS: 0.6,        // time in the red zone (reeling hard) before the line snaps
    },
    fight: {
      // After the hookset the fish "walks" around the water at random:
      // it has a heading (0 = straight away from you, ±90° = sideways,
      // 180° = towards you) that keeps turning randomly, and an effort that
      // alternates between runs (strong) and rests (weak).
      runSpeedMps: 1.8,        // swim speed at full effort
      restEffort: 0.3,         // effort while resting (it never fully stops)
      runS: [0.6, 1.6],        // run duration range
      restS: [0.6, 1.6],       // rest duration range
      firstRunS: [0.8, 1.4],   // right after the hookset the fish always runs
      turnRateMax: 3.2,        // rad/s — how sharply it can turn
      turnChangeS: [0.25, 0.9],// how often it picks a new turning direction
      dartChance: 0.35,        // chance of a sudden dart to a new direction at each change
      awayBias: 0.15,          // tendency to turn back to "away from you" (escape)
      runAwayBias: 1.6,        // during a run it steers away from the shore much harder…
      runTurnFactor: 0.3,      // …and swims almost straight (turns much less)
      runLengthPow: 1.0,       // run length × power^this (big pike: ~2× longer runs, perch shorter)
      slackAwayBias: 2.4,      // …and hardest when you stop reeling
      slackEffort: 0.8,        // not reeling → it keeps swimming at least this hard
      reelingSpeed: 0.15,      // reel speed below this = "you stopped reeling"
      sideSpeed: 1.1,          // lateral speed at full effort (aim units per second)
      sideLimit: 1.3,          // how far to the side it can go (aim units)
      centerPull: 6,           // near the sides it turns back to the middle
      maxExtraLineM: 25,       // it can take at most this much extra line beyond the cast
      slackEscapeS: 2,         // stop reeling this long with a fish on → it escapes ("Ой, зійшла")
      slackSpeed: 0.08,        // lever position below this counts as "not reeling"
      slackWarnS: 1.2,         // warning signal after this long without reeling
    },
    tension: {
      // Line tension 0..1 while fighting. The red zone is reached only when
      // you reel fast WHILE the fish makes a strong run away from you.
      // In the red zone the line is being overloaded ("strain"):
      //   - keep reeling fast  → strain grows → the line snaps
      //   - ease off the lever → strain goes away
      base: 0.1,
      reelWeight: 0.35,        // share from your reel speed
      pullWeight: 0.45,        // share from the fish pulling away …
      pullReelBase: 0.3,       // … multiplied by (base + reel speed): it hurts when you reel against it
      follow: 8,               // smoothing
      warn: 0.6,               // yellow zone from here
      danger: 0.85,            // red zone from here
      hardReel: 0.5,           // lever speed that counts as "still reeling hard"
      breakAfterS: 0.4,        // total overload (s in red while reeling hard) before the line snaps
      recoverPerS: 1.5,        // how fast the overload goes away after you ease off
      // Reel drag (фрикціон): above this tension the spool slips and gives line —
      // a strong fish swims away from the shore even while you reel.
      dragAt: 0.7,
      dragSlipMps: 7,            // line given per second per unit of tension above dragAt
      dragKeepHard: 0.75,      // reeling hard: the drag absorbs little → tension still climbs (red → snap)
      dragKeepSoft: 0.25,      // reeling gently: the drag absorbs most of it → safe, fish takes line
    },
    result: {
      caughtShowS: 2.2,
      emptyShowS: 0.9,
      brokenShowS: 1.4,
      freedShowS: 0.6,
    },
  };

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // PFL app (v1.24): neutral lure = the old game (every species ×1)
  const NO_LURE = { m: { perch: 1, pike: 1, zander: 1, catfish: 1, crab: 1 }, big: {}, capKg: {} };
  const oddsAdj = (p, k) => (k <= 0 ? 0 : p * k / (p * k + (1 - p)));   // chance p, its odds × k

  // How much the fish around want the lure, for the bite RATE (1 = as before).
  // Fish vs crab mixed by bite.fishChance; fish by species share × lure m.
  function lureRateFactor(s, cfg) {
    const L = s.lure || NO_LURE;
    const m = L.m, sp = cfg.species, b = cfg.bite;
    const fc = b.fishChance ?? 0.75;
    const keys = ['perch', 'zander', 'pike'];
    const tot = keys.reduce((a, k) => a + (sp[k]?.chance || 0), 0) || 1;
    const main = keys.reduce((a, k) => a + (sp[k]?.chance || 0) * m[k], 0) / tot;
    let fish = main;
    if (s.onBottom) {                       // bottom pause: mostly perch
      const pp = b.pausePerchChance ?? 0.85;
      fish = pp * m.perch + (1 - pp) * main;
    } else if (s.lureDistance <= sp.nearShoreM) {   // at the shore: small perch, sometimes a pike
      const np = sp.nearPikeChance ?? 0.1;
      fish = (1 - np) * m.perch + np * m.pike;
    }
    return fc * fish + (1 - fc) * m.crab;
  }

  function defaultBiteRate(s, cfg) {
    const b = cfg.bite;
    const L = s.lure || NO_LURE;
    const lureF = lureRateFactor(s, cfg);
    // in the perch school spot: the boost is for perch — a pike lure barely gets it
    const schoolF = s.inSchool ? 1 + (b.schoolBoost - 1) * Math.min(1.3, L.m.perch) : 1;
    // A short cast "під ноги": the lure is in the water only a few seconds,
    // but small perch stand right there — so bites come sooner and more often.
    const shortCast = s.castDistance <= cfg.species.nearShoreM + b.shortCastExtraM;
    if (s.waterTime < (shortCast ? b.shortCastGraceS : b.graceAfterLandingS)) return 0;
    if (s.lureDistance < b.noBiteNearShoreM) return 0;
    const shortF = shortCast ? b.shortCastBoost : 1;

    // A pause on the bottom (up to ~5 s) provokes bites — mostly perch.
    if (s.onBottom && s.bottomTime >= b.pauseBiteS[0] && s.bottomTime <= b.pauseBiteS[1]) {
      return b.baseRatePerS * b.pauseBiteBoost * (1 + b.rhythmBonus * 0.5 * Math.pow(s.rhythm, 1.5)) * shortF
        * schoolF * lureF;
    }

    // retrieve speed
    const v = s.reelSpeed;
    let speedF;
    if (v < b.speedBest[0]) speedF = b.speedStopped + (1 - b.speedStopped) * (v / b.speedBest[0]);
    else if (v <= b.speedBest[1]) speedF = 1;
    else speedF = 1 - (1 - (L.speedMax ?? b.speedMax)) * ((v - b.speedBest[1]) / (1 - b.speedBest[1]));

    // smoothness of the lever
    const smoothF = 1 - (1 - b.jerkyFactor) * clamp(s.leverJerk / 1.5);

    // just pulling without any twitches
    const plainF = s.time - s.lastTwitchAt > b.plainAfterS ? b.plainFactor : 1;

    // hidden rhythm level 0..1
    const rhythmF = 1 + b.rhythmBonus * Math.pow(s.rhythm, 1.5); // a solid rhythm pays off much more than a shaky one

    return b.baseRatePerS * speedF * smoothF * plainF * rhythmF * shortF * schoolF * lureF;
  }

  function createFishingEngine(config = FISHING_CONFIG, rng = Math.random) {
    const listeners = {};
    let biteRateFn = defaultBiteRate;

    const s = {
      state: 'idle',
      stateTime: 0,
      time: 0,
      score: 0,
      totalKg: 0,          // total weight of the fish in the bag
      bag: [],             // fish caught this session: { species, kg } — score = bag.length
      stats: { casts: 0, bites: 0, fish: 0, crabs: 0, missed: 0, empty: 0, broken: 0, escaped: 0, snags: 0, freed: 0 },
      castPower: 0,
      castAim: 0,          // -1 left .. 0 straight .. 1 right
      castDistance: 0,
      lureDistance: 0,     // metres from shore
      flightDuration: 0,
      waterTime: 0,        // seconds since the lure landed this cast
      reelHeld: false,
      reelInput: 0,        // lever position 0..1
      reelSpeed: 0,        // actual normalized speed 0..1
      aggression: 0,       // 0..1, rises with twitches, decays over time
      lastTwitchAt: -99,
      lastTwitchStrength: 0,
      twitchDownAt: null,
      catchType: null,     // 'fish' | 'crab'
      biteRate: 0,
      castNo: 0,           // number of this cast within the session (1, 2, 3…)
      species: null,       // 'perch' | 'zander' | 'pike' | 'crab' while hooked / caught
      firstFishPending: false, // the guaranteed bite → a nice perch if hooked
      perchSchoolKg: 0,    // size of this session's perch school
      school: null,        // { aim, dist, found, catches, moveAfter, driftT } — hidden spot
      inSchool: false,     // the lure is in the school spot right now
      biteInSchool: false, // the current bite happened in the spot
      catchFromSchool: false,
      biteReady: false,        // PFL app: species already picked at the bite (see prepareBite)
      weightKg: 0,
      fishPower: 1,
      onBottom: false,     // the lure lies on the bottom
      sinkTime: 0,         // seconds since you stopped pulling (sinking)
      bottomTime: 0,       // seconds lying on the bottom
      bottomWarned: false,
      biteOnPause: false,  // the current bite happened during a bottom pause
      snagStrain: 0,
      // retrieve rhythm (hidden)
      rhythm: 0,           // 0..1 smoothed rhythm level used by the bite chance
      rhythmTarget: 0,
      rhythmStreak: 0,     // matching series in a row
      groups: [],          // recent series: { start, count, pull }
      curGroup: null,      // series being tapped right now
      pullAcc: 0, pullTime: 0, // avg reel speed since the last series started
      leverJerk: 0,        // smoothed |lever change| per second
      lastReelInput: 0,
      forcedBite: null,    // { dist, time } on the guaranteed-bite cast
      // fight (hooked state)
      fishRunning: false,
      fishEffort: 0,       // 0..1 smoothed swim effort
      fishHeading: 0,      // rad, 0 = away from you, ±π/2 sideways, π towards you
      fishTurnRate: 0,     // rad/s
      turnTimer: 0,
      fishPull: 0,         // 0..1 how hard it pulls line away right now (effort × away component)
      fishSide: 0,         // lateral offset from the cast line (aim units)
      fightTimer: 0,
      style: null,         // fight style of the fish on the hook
      tension: 0,          // 0..1 line tension
      dragSlip: 0,         // m/s of line the drag is giving right now
      lineOutMps: 0,       // m/s of line going OUT from the reel right now (drag sound)
      strain: 0,           // seconds accumulated in the red zone
      slackTime: 0,        // seconds without reeling while a fish is on
      yellowTime: 0,       // PFL app: catfish — seconds reeling in the yellow zone (tears the hook out)
      lure: null,          // PFL app (v1.24): lure profile (fishing-lures.js lureProfile); null = neutral
    };

    function emit(name, payload = {}) {
      const run = (fn) => { try { fn(payload, s); } catch (e) { console.error('[Fishing]', e); } };
      (listeners[name] || []).forEach(run);
      (listeners['*'] || []).forEach((fn) => { try { fn({ event: name, ...payload }, s); } catch (e) { console.error(e); } });
    }

    function on(name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
      return () => { listeners[name] = listeners[name].filter((f) => f !== fn); };
    }

    function setState(next, extra = {}) {
      const prev = s.state;
      s.state = next;
      s.stateTime = 0;
      emit('state', { state: next, prev, ...extra });
    }

    // ---- Input API --------------------------------------------------------

    /** power 0..1, aim -1 (left) .. 0 (straight) .. 1 (right) → cast. Only from idle. */
    function cast(power, aim = 0) {
      if (s.state !== 'idle') return false;
      const c = config.cast;
      s.castPower = clamp(power);
      s.castAim = clamp(aim, -1, 1);
      const maxM = castMaxDistance();
      s.castDistance = clamp(
        c.minDistanceM + s.castPower * (maxM - c.minDistanceM) + (rng() * 2 - 1) * c.jitterM,
        3, Math.min(maxM + c.jitterM, c.maxDistanceM + c.jitterM),
      );
      s.lureDistance = s.castDistance;
      s.flightDuration = c.flightBaseS + s.castDistance * c.flightPerM;
      s.waterTime = 0;
      s.aggression = 0;
      s.catchType = null;
      s.stats.casts++;
      s.castNo = s.stats.casts;
      s.firstFishPending = false;
      s.biteReady = false;
      liftFromBottom();
      s.biteOnPause = false;
      s.species = null;
      resetRhythm();
      s.forcedBite = null;
      const b = config.bite;
      if (s.castNo === b.guaranteedBiteCast) {
        // bite somewhere in the middle part of the retrieve…
        const lo = Math.min(b.noBiteNearShoreM + 1, s.castDistance * 0.5);
        const hi = Math.max(lo, s.castDistance * 0.8);
        s.forcedBite = {
          dist: lo + rng() * (hi - lo),
          time: b.guaranteedBiteTimeS[0] + rng() * (b.guaranteedBiteTimeS[1] - b.guaranteedBiteTimeS[0]),
        };
      }
      setState('casting', { power: s.castPower, distance: s.castDistance });
      return true;
    }

    /** PFL app (v1.24): full-power cast distance with the current lure (light jig = shorter). */
    function castMaxDistance() {
      const c = config.cast;
      return Math.max(c.minDistanceM + 5, Math.min(c.maxDistanceM, s.lure?.castMaxM ?? c.maxDistanceM));
    }

    /** PFL app (v1.24): put on a lure (profile from fishing-lures.js). Only between casts. */
    function setLure(profile) {
      if (s.state !== 'idle' && s.state !== 'caught' && s.state !== 'empty' && s.state !== 'broken') return false;
      s.lure = profile || null;
      emit('lure', { lure: s.lure });
      return true;
    }

    /** Swipe → power helper, so the view and tests share one formula. */
    function castPowerFromSwipe(swipePx, peakPxPerMs, screenH) {
      const c = config.cast;
      if (swipePx < c.minSwipePx) return null;
      const len = clamp(swipePx / (screenH * c.fullSwipeRatio));
      const spd = clamp(peakPxPerMs / c.fastSwipePxPerMs);
      return clamp(len * c.lengthWeight + spd * (1 - c.lengthWeight));
    }

    /**
     * Swipe vector → aim -1..1 (dx > 0 = right, dy > 0 = up / away from you).
     * Returns null if the swipe is not upward enough to be a cast.
     */
    function castAimFromSwipe(dx, dy) {
      const c = config.cast;
      if (dy <= 0) return null;
      const deg = Math.atan2(dx, dy) * 180 / Math.PI; // 0 = straight up
      if (Math.abs(deg) > c.maxSwipeAngleDeg) return null;
      // dead zone around vertical, then a smooth -1..1 up to ±maxAimDeg
      const dz = c.deadZoneDeg || 0;
      const a = Math.max(0, Math.abs(deg) - dz) / Math.max(1, c.maxAimDeg - dz);
      const raw = clamp(Math.sign(deg) * a, -1, 1);
      if (!(c.directions > 1)) return raw;             // PFL app: free direction
      // snap to one of N fixed directions: -1, -0.75 … 0 … 0.75, 1 (for N = 9)
      const steps = c.directions - 1;
      return Math.round(((raw + 1) / 2) * steps) / steps * 2 - 1;
    }

    /** Lever held at position v (0 bottom .. 1 top). */
    function reelSet(v) {
      s.reelHeld = true;
      s.reelInput = clamp(v);
    }

    /** Lever released. stop=true → instant stop (downward swipe). */
    function reelRelease(stop = false) {
      s.reelHeld = false;
      s.reelInput = 0;
      if (stop) {
        s.reelSpeed = 0;
        emit('reelStop');
      }
    }

    /** Left button pressed. During a bite this is the hookset. */
    function twitchStart() {
      if (s.state === 'bite') {
        s.twitchDownAt = null;
        hook();
        return 'hook';
      }
      s.twitchDownAt = s.time;
      return 'press';
    }

    /** Left button released → twitch with strength from hold duration. */
    function twitchEnd() {
      if (s.twitchDownAt == null) return 0;
      const t = config.twitch;
      const held = s.time - s.twitchDownAt;
      s.twitchDownAt = null;
      if (s.time - s.lastTwitchAt < t.cooldownS) return 0;

      const strength = clamp(t.minStrength + (1 - t.minStrength) * (held / t.fullHoldS));
      s.lastTwitchAt = s.time;
      s.lastTwitchStrength = strength;

      if (s.state === 'snagged') {
        emit('twitch', { strength, aggression: s.aggression });
        snagTwitch(strength);
        return strength;
      }
      if (s.state === 'retrieving' || s.state === 'missed') {
        trackTwitch(s.time - held);
        s.aggression = clamp(s.aggression + strength * t.aggressionGain);
        s.lureDistance = Math.max(0, s.lureDistance - strength * t.lurePullM);
      }
      emit('twitch', { strength, aggression: s.aggression });
      return strength;
    }

    /** Current hold strength while the left button is down (for UI). */
    function twitchHoldStrength() {
      if (s.twitchDownAt == null) return 0;
      const t = config.twitch;
      return clamp(t.minStrength + (1 - t.minStrength) * ((s.time - s.twitchDownAt) / t.fullHoldS));
    }

    // ---- Internals --------------------------------------------------------

    const rand = ([a, b]) => a + rng() * (b - a);

    // ---- Retrieve rhythm (hidden) ----------------------------------------
    function resetRhythm() {
      s.rhythm = s.rhythmTarget = 0;
      s.rhythmStreak = 0;
      s.groups = [];
      s.curGroup = null;
      s.pullAcc = s.pullTime = 0;
    }

    function trackTwitch(pressTime) {
      const R = config.rhythm;
      if (s.curGroup && pressTime - s.curGroup.last <= R.groupGapS) {
        s.curGroup.count++;
        s.curGroup.last = pressTime;
        return;
      }
      closeGroup();
      s.curGroup = { start: pressTime, last: pressTime, count: 1 };
    }

    // Called when a series is finished (next series starts or the gap ran out).
    function closeGroup() {
      const R = config.rhythm;
      const g = s.curGroup;
      if (!g) return;
      s.curGroup = null;
      const prev = s.groups[s.groups.length - 1];
      g.pull = s.pullTime > 0 ? s.pullAcc / s.pullTime : 0; // avg reel speed since the previous series
      s.pullAcc = s.pullTime = 0;
      s.groups.push(g);
      if (s.groups.length > 6) s.groups.shift();

      let matches = false;
      if (prev && g.count <= R.maxGroupSize && g.count === prev.count && g.pull >= R.minPull) {
        const iv = g.start - prev.start;
        if (iv >= R.intervalS[0] && iv <= R.intervalS[1]) {
          const pp = s.groups[s.groups.length - 3];
          const prevIv = pp ? prev.start - pp.start : iv;
          matches = Math.abs(iv - prevIv) <= prevIv * R.tolerance;
        }
      }
      s.rhythmStreak = matches ? s.rhythmStreak + 1 : (g.count <= R.maxGroupSize ? 1 : 0);
      // streak counts series in the pattern: 1 = just this one
      // 3rd matching series → 1/3, 4th → 2/3, 5th+ → full
      s.rhythmTarget = clamp((s.rhythmStreak - R.startAfter) / (R.fullAfter - R.startAfter));
    }

    function updateRhythm(dt) {
      const R = config.rhythm;
      // lever smoothness
      const dLever = Math.abs(s.reelInput - s.lastReelInput) / Math.max(dt, 1e-3);
      s.lastReelInput = s.reelInput;
      s.leverJerk += (dLever - s.leverJerk) * Math.min(1, 3 * dt);
      // pulling between series
      s.pullAcc += s.reelSpeed * dt;
      s.pullTime += dt;
      // a series is finished once the gap is over
      if (s.curGroup && s.time - s.curGroup.last > R.groupGapS) closeGroup();
      // rhythm lost: next series did not come in time
      const last = s.groups[s.groups.length - 1];
      if (last && !s.curGroup) {
        const pp = s.groups[s.groups.length - 2];
        const iv = pp ? last.start - pp.start : R.intervalS[1];
        if (s.time - last.start > Math.min(R.intervalS[1], iv * R.loseAfterS) + R.groupGapS) {
          s.rhythmStreak = 0;
          s.rhythmTarget = 0;
        }
      }
      // hidden level: rises quickly, fades slowly
      if (s.rhythmTarget > s.rhythm) s.rhythm = Math.min(s.rhythmTarget, s.rhythm + R.riseSpeed * dt);
      else s.rhythm = Math.max(s.rhythmTarget, s.rhythm - R.decayPerS * dt);
    }

    const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    // big (PFL app, lure): tier odds × big^tier → > 1 heavier fish more often, < 1 smaller
    function weightFromTiers(tiers, big = 1) {
      if (big !== 1) {
        const w = tiers.map(([p], i) => p * Math.pow(big, i));
        const sum = w.reduce((a, x) => a + x, 0);
        tiers = tiers.map((t, i) => [w[i] / sum, t[1], t[2]]);
      }
      let r = rng();
      for (const [p, lo, hi] of tiers) {
        if ((r -= p) < 0) return lo + rng() * (hi - lo);
      }
      const last = tiers[tiers.length - 1];
      return last[1] + rng() * (last[2] - last[1]);
    }

    const d0 = (x) => x;
    function pickSpecies() {
      const sp = config.species;
      const L = s.lure || NO_LURE, m = L.m;
      const big = (k) => L.big[k] ?? 1;
      s.catchFromSchool = false;
      // perch vs the other fish (for the pause / shore rules)
      const otherM = (sp.zander.chance * m.zander + sp.pike.chance * m.pike) / ((sp.zander.chance + sp.pike.chance) || 1);
      let key = 'crab';
      let kg;
      if (s.firstFishPending) {
        // superstition cast: always a nice perch
        s.firstFishPending = false;
        s.catchType = 'fish';
        key = sp.firstFish.species;
        kg = sp.firstFish.kg + (rng() * 2 - 1) * sp.firstFish.spread;
      } else if (s.catchType === 'fish' && s.lureDistance >= sp.catfishBite.minDistM
                 && (s.biteOnPause || s.reelSpeed <= sp.catfishBite.slowReel)
                 && !L.noBottom && rng() < oddsAdj(sp.catfishBite.chance, m.catfish)) {
        key = 'catfish';                  // far out, near the bottom → now and then a catfish
      } else if (s.catchType === 'fish' && s.biteInSchool && rng() < oddsAdj(sp.school.perchChance, m.perch / (otherM || 1e-6))) {
        key = 'perch';                    // in the school spot → a school perch
        kg = s.perchSchoolKg * (1 + (rng() * 2 - 1) * sp.perchSchoolSpread);
        s.catchFromSchool = true;
      } else if (s.catchType === 'fish' && s.biteOnPause && rng() < oddsAdj(config.bite.pausePerchChance, m.perch / (otherM || 1e-6))) {
        key = 'perch';                    // bite on a pause → perch (near shore: a small one)
        if (s.lureDistance <= sp.nearShoreM) kg = sp.nearPerchKg[0] + rng() * (sp.nearPerchKg[1] - sp.nearPerchKg[0]);
        else kg = weightFromTiers(d0(sp.perch).tiers, big('perch'));
      } else if (s.catchType === 'fish' && s.lureDistance <= sp.nearShoreM) {
        // near the shore: small perch, sometimes a pike
        if (rng() < oddsAdj(sp.nearPikeChance, m.pike / (m.perch || 1e-6))) key = 'pike';
        else {
          key = 'perch';
          kg = sp.nearPerchKg[0] + rng() * (sp.nearPerchKg[1] - sp.nearPerchKg[0]);
        }
      } else if (s.catchType === 'fish') {
        const keys = ['perch', 'zander', 'pike'];
        const total = keys.reduce((a, k) => a + sp[k].chance * m[k], 0);
        let r = rng() * total;
        key = keys.find((k) => (r -= sp[k].chance * m[k]) < 0) || keys.reduce((a, k) => (m[k] > m[a] ? k : a), 'perch');
      }
      const d = sp[key];
      if (kg == null) {
        if (key === 'perch') {
          // away from the school spot: a lone big perch now and then, otherwise a random one
          kg = rng() < oddsAdj(sp.perchLonerChance, big('perch') * big('perch'))
            ? weightFromTiers(sp.perchLonerTiers, big('perch')) : weightFromTiers(d.tiers, big('perch'));
        } else {
          kg = weightFromTiers(d.tiers, big(key));
        }
      }
      // a micro lure: only small pike / zander take it
      const cap = L.capKg[key];
      if (cap && kg > cap) kg = d.kg[0] + rng() * (Math.max(d.kg[0], cap) - d.kg[0]);
      kg = clamp(kg, d.kg[0], d.kg[1]);
      const w = (kg - d.kg[0]) / (d.kg[1] - d.kg[0]);  // 0 = lightest, 1 = heaviest
      s.species = key;
      s.weightKg = Math.round(kg * 1000) / 1000;
      s.fishPower = d.power * (sp.weightPower[0] + w * (sp.weightPower[1] - sp.weightPower[0]));
    }

    // ---- Perch school spot (hidden) -----------------------------------------
    function randIn([a, b]) { return a + rng() * (b - a); }
    function newSchool() {
      const sc = config.species.school;
      const [lo, hi] = config.species.perchSchoolKg;
      s.perchSchoolKg = lo + rng() * (hi - lo);
      s.school = {
        aim: (rng() * 2 - 1) * sc.aimRange,
        dist: randIn(sc.distM),
        found: false,
        catches: 0,
        moveAfter: Math.round(randIn(sc.moveAfterCatches)),
        driftT: sc.driftEveryS,
      };
    }
    function clampSchool() {
      const sc = config.species.school;
      s.school.aim = clamp(s.school.aim, -sc.aimRange, sc.aimRange);
      s.school.dist = clamp(s.school.dist, sc.distM[0], sc.distM[1]);
    }
    function updateSchool(dt) {
      if (!s.school) return;
      const sc = config.species.school;
      s.school.driftT -= dt;
      if (s.school.driftT <= 0) {
        s.school.driftT = sc.driftEveryS;
        s.school.aim += (rng() * 2 - 1) * sc.driftAim;
        s.school.dist += (rng() * 2 - 1) * sc.driftDistM;
        clampSchool();
      }
      s.inSchool = Math.abs(s.castAim - s.school.aim) <= sc.aimTol &&
                   Math.abs(s.lureDistance - s.school.dist) <= sc.distTol;
    }
    function schoolCatch() {
      const sc = config.species.school;
      const sch = s.school;
      if (!sch.found) { sch.found = true; emit('schoolFound'); }
      sch.catches++;
      if (sch.catches >= sch.moveAfter) {
        // the school moves away — sideways and/or to another distance
        const side = (rng() < 0.5 ? -1 : 1) * randIn(sc.moveAim);
        const dist = (rng() < 0.5 ? -1 : 1) * randIn(sc.moveDistM);
        sch.aim = Math.abs(sch.aim + side) > sc.aimRange ? sch.aim - side : sch.aim + side;
        sch.dist = (sch.dist + dist < sc.distM[0] || sch.dist + dist > sc.distM[1]) ? sch.dist - dist : sch.dist + dist;
        clampSchool();
        sch.found = false;
        sch.catches = 0;
        sch.moveAfter = Math.round(randIn(sc.moveAfterCatches));
        emit('schoolMoved', { aim: sch.aim, dist: sch.dist });
      }
    }

    // Fight style for the fish on the hook: species style, blended towards the
    // `big*` values by weight (0 = lightest … 1 = heaviest of the species).
    function fightStyle() {
      const sp = config.species;
      const st = { ...(sp.styles[s.species] || sp.styles.perch) };
      const d = sp[s.species];
      const w = d ? clamp((s.weightKg - d.kg[0]) / (d.kg[1] - d.kg[0])) : 0;
      if (st.bigTurn != null) st.turn += (st.bigTurn - st.turn) * w;
      if (st.bigSide != null) st.side += (st.bigSide - st.side) * w;
      if (st.bigAway != null) st.away += (st.bigAway - st.away) * w;
      st.forceMul = st.forceMul || 1;
      return st;
    }

    // PFL app: the fish is chosen at the BITE (was: at the hookset), so the bite
    // vibration can differ per species. Same rules and odds — the lure moves
    // less than a second between the two moments. A missed bite already lost
    // the fish (firstFishPending is cleared on miss), so nothing else changes.
    function prepareBite() {
      if (speciesFilter) return prepareBiteFiltered();
      s.catchType = rng() < lureFishChance() ? 'fish' : 'crab';
      pickSpecies();
      s.biteReady = true;
      return true;
    }

    // fish vs crab with the lure: crabs barely notice a wobbler; a perch lure in
    // the school spot still mostly gets fish
    function lureFishChance() {
      const L = s.lure;
      const fc = config.bite.fishChance;
      if (!L) return fc;
      const sp = config.species, m = L.m;
      const keys = ['perch', 'zander', 'pike'];
      const tot = keys.reduce((a, k) => a + sp[k].chance, 0) || 1;
      const fish = keys.reduce((a, k) => a + sp[k].chance * m[k], 0) / tot;
      const crab = m.crab;
      return fish + crab > 0 ? fc * fish / (fc * fish + (1 - fc) * crab) : fc;
    }

    // ---- TEST (PFL app): only some species can bite ----------------------------
    // setSpeciesFilter(['catfish']) → only catfish bite; null → normal game.
    // The usual rules pick the fish; a pick that isn't enabled is re-rolled within
    // the same bite, so the bite rate stays normal. Catfish keep their conditions
    // (far + bottom / slow reel); if catfish is the only fish enabled it is a
    // catfish every time those conditions are met — otherwise no bite at all.
    // While testing, the 1st-cast "no bite" and 2nd-cast "nice perch" rules are off.
    const TEST_SPECIES = ['perch', 'pike', 'zander', 'catfish', 'crab'];
    let speciesFilter = null;
    function setSpeciesFilter(list) {
      const on = Array.isArray(list) ? TEST_SPECIES.filter((k) => list.includes(k)) : TEST_SPECIES;
      speciesFilter = on.length === TEST_SPECIES.length ? null : new Set(on);
      if (speciesFilter) { s.forcedBite = null; s.firstFishPending = false; }
    }
    const getSpeciesFilter = () => (speciesFilter ? [...speciesFilter] : null);

    function prepareBiteFiltered() {
      const E = speciesFilter;
      const fishOn = ['perch', 'pike', 'zander', 'catfish'].filter((k) => E.has(k));
      if (!fishOn.length && !E.has('crab')) return false;          // everything off → no bites
      const cb = config.species.catfishBite;
      const keepChance = cb.chance;
      if (fishOn.length === 1 && fishOn[0] === 'catfish') cb.chance = 1;   // catfish-only test
      let ok = false;
      for (let i = 0; i < 60 && !ok; i++) {
        s.catchType = !fishOn.length ? 'crab' : !E.has('crab') ? 'fish'
          : (rng() < config.bite.fishChance ? 'fish' : 'crab');
        pickSpecies();
        ok = E.has(s.species);
      }
      cb.chance = keepChance;
      if (!ok) { s.species = null; s.catchFromSchool = false; return false; }
      s.biteReady = true;
      return true;
    }

    function hook() {
      const f = config.fight;
      if (!s.biteReady) {                          // safety: bite without prepareBite()
        s.catchType = rng() < config.bite.fishChance ? 'fish' : 'crab';
        pickSpecies();
      }
      s.biteReady = false;
      s.style = fightStyle();
      s.fishRunning = true;
      s.fishEffort = s.style.start > 1 ? 0.8 : 0;   // pike: explodes right away
      // first move: pike bolts sideways, the others roughly away from you
      s.fishHeading = s.style.sideBias > 1
        ? (rng() < 0.5 ? -1 : 1) * (1.0 + rng() * 0.6)
        : (rng() * 2 - 1) * 0.8;
      s.fishTurnRate = (rng() * 2 - 1) * f.turnRateMax;
      s.turnTimer = rand(f.turnChangeS);
      s.fishPull = 0;
      s.fishSide = 0;
      s.fightTimer = rand(f.firstRunS) * s.style.start;
      s.fightTime = 0;
      s.stamina = 1;
      s.yellowTime = 0;
      s.tension = 0;
      s.strain = 0;
      setState('hooked', { type: s.catchType });
      emit('hook', { type: s.catchType });
    }

    function updateFight(dt) {
      const f = config.fight;
      const r = config.reel;
      const tc = config.tension;
      const st = s.style || config.species.styles.perch;
      // PFL app: catfish tires over the fight (style.tireBaseS); other fish: always 1
      s.fightTime = (s.fightTime || 0) + dt;
      s.stamina = st.tireBaseS
        ? Math.max(st.minStamina, 1 - s.fightTime / (st.tireBaseS + st.tirePerKgS * s.weightKg))
        : 1;
      const k = s.fishPower * s.stamina;         // species × weight (× stamina)

      // runs / rests
      s.fightTimer -= dt;
      if (s.fightTimer <= 0) {
        s.fishRunning = !s.fishRunning;
        // bigger fish: longer runs, shorter rests
        const big = Math.pow(clamp(s.fishPower, 0.5, 1.6), f.runLengthPow);
        s.fightTimer = s.fishRunning ? rand(f.runS) * big : rand(f.restS) / Math.sqrt(big);
        if (s.fishRunning) {
          // a new run often starts with a sharp change of direction
          s.fishHeading = wrapAngle(s.fishHeading + (rng() * 2 - 1) * 1.6);
          emit('fishRun');
        }
      }
      const reeling = s.reelSpeed >= f.reelingSpeed;
      let effortTarget = s.fishRunning ? 1 : f.restEffort;
      // line slack → it swims off (a big fish hard, a small perch barely)
      if (!reeling) effortTarget = Math.max(effortTarget, f.slackEffort * clamp(s.fishPower, 0.3, 1.2));
      s.fishEffort += (effortTarget - s.fishEffort) * Math.min(1, 6 * dt);

      // random wandering heading
      s.turnTimer -= dt;
      if (s.turnTimer <= 0) {
        s.turnTimer = rand(f.turnChangeS);
        s.fishTurnRate = (rng() * 2 - 1) * f.turnRateMax * st.turn;
        // sometimes a sudden dart in a new direction (pike: often, even mid-run)
        const dartOk = !s.fishRunning || st.dart > 1;
        if (dartOk && rng() < f.dartChance * st.dart) {
          s.fishHeading = wrapAngle(s.fishHeading + (rng() < 0.5 ? -1 : 1) * (0.8 + rng() * 1.6));
        }
      }
      // Steering away from the shore: a little normally, hard during a run
      // (the bigger the fish, the harder), hardest when you stop reeling.
      const awayBias = !reeling ? f.slackAwayBias
        : s.fishRunning ? f.runAwayBias * Math.min(1.5, s.fishPower) * st.away
        : f.awayBias * st.away;
      // pike likes to run sideways: its heading is pulled towards ±90°
      const sideTarget = (Math.sin(s.fishHeading) >= 0 ? 1 : -1) * Math.PI / 2;
      const sideTurn = st.sideBias ? wrapAngle(sideTarget - s.fishHeading) * st.sideBias : 0;
      // near the sides it tends to turn back towards the middle, so it roams
      // the whole water instead of sticking to one edge
      const outward = s.fishSide * Math.sin(s.fishHeading) > 0;
      const edge = Math.max(0, Math.abs(s.fishSide) - 0.4);
      const centerTurn = outward ? -Math.sign(Math.sin(s.fishHeading)) * f.centerPull * edge : 0;
      s.fishHeading = wrapAngle(
        s.fishHeading + (s.fishTurnRate * (s.fishRunning ? f.runTurnFactor : 1) + centerTurn + sideTurn) * dt
          - Math.sin(s.fishHeading) * awayBias * dt,
      );

      const speed = s.fishEffort * k;
      const away = Math.cos(s.fishHeading);     // +1 away from you, −1 towards you
      const side = Math.sin(s.fishHeading);     // −1 left, +1 right

      // lateral movement; bounce off the sides
      s.fishSide += side * speed * f.sideSpeed * st.side * dt;
      if (Math.abs(s.fishSide) > f.sideLimit) {
        s.fishSide = Math.sign(s.fishSide) * f.sideLimit;
        s.fishHeading = wrapAngle(-s.fishHeading);
      }

      // distance: we reel it in, it swims away (or towards us → slack)
      // pull on the line: swimming away, plus "pressing" (zander leans on the line
      // even when it isn't going anywhere; pike presses on its side runs)
      s.fishPull = Math.max(Math.max(0, away), st.press) * s.fishEffort;
      const reelIn = s.reelSpeed * r.maxSpeedMps * r.fightSpeedFactor;
      const swimOut = away * speed * f.runSpeedMps * st.swim;

      // line tension (before the drag)
      let target = clamp(
        tc.base + tc.reelWeight * s.reelSpeed +
        tc.pullWeight * s.fishPull * k * st.forceMul * (st.tensionMul || 1) * (tc.pullReelBase + s.reelSpeed) - (away < 0 ? 0.1 : 0),
      );
      // the drag slips above dragAt: gives line, and absorbs part of the tension
      let slip = 0;
      if (target > tc.dragAt) {
        const over = target - tc.dragAt;
        slip = over * tc.dragSlipMps;
        const keep = s.reelSpeed >= tc.hardReel ? tc.dragKeepHard : tc.dragKeepSoft;
        target = tc.dragAt + over * keep;
      }
      s.dragSlip = slip;
      s.tension += (target - s.tension) * Math.min(1, tc.follow * dt);

      const maxLine = s.castDistance + (st.extraLineM ?? f.maxExtraLineM);
      s.lineOutMps = s.lureDistance < maxLine ? Math.max(0, swimOut + slip - reelIn) : 0;
      s.lureDistance = clamp(
        s.lureDistance - (reelIn - swimOut - slip) * dt,
        0,
        maxLine,
      );

      // Overload: grows in the red zone while you keep reeling hard; it does
      // NOT go away just because the fish turned — only when you ease off the lever.
      const reelingHard = s.reelSpeed >= tc.hardReel;
      if (s.tension >= tc.danger && reelingHard) s.strain += dt;
      else if (!reelingHard) s.strain = Math.max(0, s.strain - tc.recoverPerS * dt);

      if (s.strain >= tc.breakAfterS) { breakLine(); return; }

      // Catfish (style.yellowEscapeS): reeling in the yellow zone for too long
      // tears the hook out. Easing off (slow reel / let the drag work) recovers.
      if (st.yellowEscapeS) {
        if (s.tension >= tc.warn && s.reelSpeed > st.yellowSafeReel) s.yellowTime += dt;
        else s.yellowTime = Math.max(0, s.yellowTime - st.yellowRecoverPerS * dt);
        if (s.yellowTime >= st.yellowEscapeS) { escape('tore'); return; }
      }

      // Slack line: stop reeling for too long → the fish shakes the hook off
      if (!s.reelHeld || s.reelInput < f.slackSpeed) { // finger off the lever (or lever at the bottom)
        const before = s.slackTime;
        s.slackTime += dt;
        if (before < f.slackWarnS && s.slackTime >= f.slackWarnS) emit('slackWarn');
        if (s.slackTime >= f.slackEscapeS) { escape(); return; }
      } else {
        s.slackTime = 0;
      }
      if (s.lureDistance <= 0.05) land();
    }

    function resetFight() {
      s.fishPull = 0;
      s.fishEffort = 0;
      s.fishSide = 0;
      s.fishRunning = false;
      s.tension = 0;
      s.strain = 0;
      s.slackTime = 0;
      s.yellowTime = 0;
    }

    // Fish escaped because the line went slack: the lure stays in the water
    // and the retrieve simply continues (like after a missed hookset).
    function escape(reason = 'slack') {
      s.stats.escaped++;
      const type = s.catchType;
      s.castAim = clamp(s.castAim + s.fishSide, -1.4, 1.4); // lure stays where the fish left it
      resetFight();
      s.catchType = null;
      setState('missed', { reason: 'escaped', type });
      emit('escape', { type, reason, species: s.species });
    }

    function breakLine() {
      s.stats.broken++;
      const type = s.catchType;
      resetFight();
      setState('broken', { type });
      emit('lineBreak', { type });
    }

    // ---- Snags -------------------------------------------------------------
    function liftFromBottom() {
      s.onBottom = false;
      s.sinkTime = 0;
      s.bottomTime = 0;
      s.bottomWarned = false;
    }

    // Returns true if the lure just caught a snag.
    function updateBottom(dt) {
      const g = config.snag;
      const pulled = s.reelSpeed >= g.slowSpeed || s.time - s.lastTwitchAt < 0.15;
      if (s.lure?.noBottom) {             // PFL app: suspending wobbler — just hangs in the water
        if (pulled) liftFromBottom();
        return false;
      }
      if (pulled) {
        // resuming after a long rest on the bottom → likely a snag
        const longRest = s.onBottom && s.bottomTime >= g.snagAfterRestS;
        liftFromBottom();
        if (longRest && s.lureDistance >= g.minDistanceM && !s.forcedBite
            && rng() < Math.min(0.97, g.snagOnResumeChance * (s.lure?.snagMul ?? 1))) {
          s.stats.snags++;
          s.snagStrain = 0;
          s.tension = 0;
          setState('snagged');
          emit('snag');
          return true;
        }
        return false;
      }
      if (!s.onBottom) {
        s.sinkTime += dt;
        if (s.sinkTime >= (s.lure?.sinkS ?? g.sinkS)) {
          s.onBottom = true;
          s.bottomTime = 0;
          emit('bottomTouch');
        }
      } else {
        s.bottomTime += dt;
        if (!s.bottomWarned && s.bottomTime >= g.warnAtS) {
          s.bottomWarned = true;
          emit('bottomWarn');
        }
      }
      return false;
    }

    function updateSnag(dt) {
      const g = config.snag;
      const tc = config.tension;
      // reeling against the snag loads the line; the lure does not move
      const target = clamp(s.reelSpeed * g.reelTension);
      s.tension += (target - s.tension) * Math.min(1, tc.follow * dt);
      if (s.tension >= tc.danger) s.snagStrain += dt;
      else s.snagStrain = Math.max(0, s.snagStrain - tc.recoverPerS * dt);
      if (s.snagStrain >= g.breakAfterS) snagBreak();
    }

    function snagTwitch(strength) {
      const g = config.snag;
      const r = rng();
      const pFree = g.freeBase + g.freePerStrength * strength;
      const pBreak = g.breakBase + g.breakPerStrength * strength;
      if (r < pBreak) { snagBreak(); return; }
      if (r < pBreak + pFree) {
        s.stats.freed++;
        s.tension = 0;
        s.lastTwitchAt = s.time;
        liftFromBottom();
        setState('freed');
        emit('unsnag');
      }
    }

    function snagBreak() {
      s.stats.broken++;
      s.tension = 0;
      s.snagStrain = 0;
      setState('broken', { reason: 'snag' });
      emit('lineBreak', { reason: 'snag' });
    }

    function moveLure(dt, factor) {
      const d = s.reelSpeed * config.reel.maxSpeedMps * factor * dt;
      s.lureDistance = Math.max(0, s.lureDistance - d);
    }

    // Fish go into the bag. A crab eats the SMALLEST fish from the bag
    // (together with its weight); with an empty bag it finds nothing.
    // So the catch count and the total weight always match.
    function land() {
      let delta = 0;
      let eaten = null;
      if (s.catchType === 'fish') {
        s.bag.push({ species: s.species, kg: s.weightKg });
        if (s.catchFromSchool) schoolCatch();
        s.stats.fish++;
        delta = 1;
      } else {
        s.stats.crabs++;
        if (s.bag.length) {
          let i = 0;
          s.bag.forEach((f, k) => { if (f.kg < s.bag[i].kg) i = k; });
          const f = s.bag.splice(i, 1)[0];
          const d = config.species[f.species];
          eaten = { species: f.species, kg: f.kg, name: d?.name, nameAcc: d?.nameAcc };
          delta = -1;
        }
      }
      s.score = s.bag.length;
      s.totalKg = s.bag.reduce((a, f) => a + f.kg, 0);
      resetFight();
      const info = { type: s.catchType, species: s.species, weightKg: s.weightKg,
        name: config.species[s.species]?.name, delta, eaten, score: s.score, totalKg: s.totalKg };
      setState('caught', info);
      emit('catch', info);
      emit('score', { score: s.score, delta, totalKg: s.totalKg });
    }

    function update(dt) {
      const r = config.reel;
      const b = config.bite;
      s.time += dt;
      s.stateTime += dt;
      updateSchool(dt);

      // Reel speed: follows lever while held, smoothly decays when released.
      if (s.reelHeld) s.reelSpeed += (s.reelInput - s.reelSpeed) * Math.min(1, r.followRate * dt);
      else s.reelSpeed = Math.max(0, s.reelSpeed - dt / r.releaseDecayS);

      s.aggression = Math.max(0, s.aggression - config.twitch.aggressionDecayPerS * dt);
      s.biteRate = 0;

      switch (s.state) {
        case 'casting':
          if (s.stateTime >= s.flightDuration) {
            setState('retrieving');
            emit('splash', { distance: s.castDistance });
          }
          break;

        case 'retrieving':
        case 'missed':
          s.waterTime += dt;
          updateRhythm(dt);
          moveLure(dt, 1);
          if (s.forcedBite && s.state === 'retrieving' && s.lureDistance <= 1.5) {
            // guaranteed-bite cast reeled in too fast: the fish grabs it right before the shore
            s.lureDistance = Math.max(s.lureDistance, 1.5);
            s.forcedBite.dist = Infinity;
          }
          if (s.lureDistance <= 0) {
            s.stats.empty++;
            setState('empty');
            emit('empty');
            break;
          }
          if (updateBottom(dt)) break;
          if (s.state === 'missed') {
            if (s.stateTime >= b.missPauseS) setState('retrieving');
            break;
          }
          if (!speciesFilter && b.noBiteCasts.includes(s.castNo)) break;   // 1st cast: never (not while testing)
          if (s.forcedBite && !speciesFilter) {            // 2nd cast: always
            const fb = s.forcedBite;
            if ((s.waterTime >= 0.6 && s.lureDistance <= fb.dist) || s.waterTime >= fb.time) {
              s.forcedBite = null;
              s.firstFishPending = true;   // this bite is the nice perch
              s.biteOnPause = false;
              s.biteInSchool = false;
              liftFromBottom();
              s.stats.bites++;
              prepareBite();
              setState('bite');
              emit('bite', { species: s.species, type: s.catchType });
            }
            break;
          }
          s.biteRate = biteRateFn(s, config);
          if (s.biteRate > 0 && rng() < 1 - Math.exp(-s.biteRate * dt)) {
            s.biteOnPause = s.onBottom;
            s.biteInSchool = s.inSchool;
            if (!prepareBite()) break;                     // TEST filter: nothing enabled bites here
            liftFromBottom();
            s.stats.bites++;
            setState('bite');
            emit('bite', { species: s.species, type: s.catchType });
          }
          break;

        case 'bite':
          // Lure is held by the fish — no movement. Waiting for the hookset.
          if (s.stateTime >= b.hookWindowS) {
            s.firstFishPending = false;
            s.biteReady = false;
            s.stats.missed++;
            setState('missed');
            emit('miss');
          }
          break;

        case 'hooked':
          updateFight(dt);
          break;

        case 'broken':
          if (s.stateTime >= config.result.brokenShowS) setState('idle');
          break;

        case 'snagged':
          updateSnag(dt);
          break;

        case 'freed':
          // short pause after unhooking, then keep reeling from the same spot
          s.waterTime += dt;
          moveLure(dt, 1);
          if (s.stateTime >= config.result.freedShowS) setState('retrieving');
          break;

        case 'caught':
          if (s.stateTime >= config.result.caughtShowS) setState('idle');
          break;

        case 'empty':
          if (s.stateTime >= config.result.emptyShowS) setState('idle');
          break;
      }
    }

    // ---- Session snapshot (so a page reload doesn't lose the catch) ---------
    // Only what matters between casts: the bag, stats, cast number and the
    // hidden perch school. Mid-cast state is not saved (you just cast again).
    function exportSession() {
      return {
        v: 1,
        bag: s.bag.map((f) => ({ species: f.species, kg: f.kg })),
        stats: { ...s.stats },
        perchSchoolKg: s.perchSchoolKg,
        school: s.school ? { ...s.school } : null,
      };
    }

    function importSession(d) {
      if (!d || d.v !== 1 || !Array.isArray(d.bag)) return false;
      s.bag = d.bag.filter((f) => f && config.species[f.species] && f.kg > 0)
        .map((f) => ({ species: f.species, kg: +f.kg }));
      Object.keys(s.stats).forEach((k) => { if (typeof d.stats?.[k] === 'number') s.stats[k] = d.stats[k]; });
      s.castNo = s.stats.casts;
      if (d.perchSchoolKg > 0) s.perchSchoolKg = d.perchSchoolKg;
      if (d.school && typeof d.school.aim === 'number') s.school = { ...s.school, ...d.school };
      s.score = s.bag.length;
      s.totalKg = s.bag.reduce((a, f) => a + f.kg, 0);
      emit('score', { score: s.score, delta: 0, totalKg: s.totalKg });
      return true;
    }

    function reset() {
      s.state = 'idle';
      s.stateTime = 0;
      s.score = 0;
      s.totalKg = 0;
      s.bag = [];
      Object.keys(s.stats).forEach((k) => { s.stats[k] = 0; });
      s.castDistance = s.lureDistance = s.castPower = 0;
      s.reelHeld = false;
      s.reelInput = s.reelSpeed = s.aggression = 0;
      s.twitchDownAt = null;
      s.catchType = null;
      s.castNo = 0;
      s.forcedBite = null;
      s.firstFishPending = false;
      newSchool();
      liftFromBottom();
      s.biteOnPause = false;
      s.species = null;
      resetRhythm();
      resetFight();
      emit('state', { state: 'idle', prev: null });
      emit('score', { score: 0, delta: 0, totalKg: 0 });
    }

    newSchool();

    return {
      config,
      state: s,
      on,
      update,
      reset,
      cast,
      castPowerFromSwipe,
      castAimFromSwipe,
      castMaxDistance,                // PFL app (v1.24)
      setLure,                        // PFL app (v1.24)
      reelSet,
      reelRelease,
      twitchStart,
      twitchEnd,
      twitchHoldStrength,
      setBiteRateFn(fn) { biteRateFn = typeof fn === 'function' ? fn : defaultBiteRate; },
      setSpeciesFilter,               // TEST (PFL app): only these species bite; null = all
      getSpeciesFilter,
      exportSession,
      importSession,
    };
  }

  global.PFLFishing = { FISHING_CONFIG, createFishingEngine, defaultBiteRate };
})(typeof window !== 'undefined' ? window : globalThis);
