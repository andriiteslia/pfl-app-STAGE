/* =========================================================================
   PFL Fishing — view / input layer
   -------------------------------------------------------------------------
   - Reads touch input (cast swipe, twitch button, reel lever) → engine.
   - Every frame writes the game state to the root element so the final
     artwork can be animated with plain CSS:

       data-state      idle | casting | retrieving | bite | hooked | missed | caught | empty | broken | snagged | freed
       data-species    perch | zander | pike | crab   (while hooked / caught)
       data-catch      fish | crab            (while hooked / caught)
       --reel-speed    0..1   actual reel speed (lever knob follows this)
       --lure-x/--lure-y px   lure position on screen
       --tip-x/--tip-y  px    rod tip position on screen
       --twitch-hold   0..1   left button hold strength while pressed
       --line-tension  0..1   line tension while fighting (indicator above the lever)
       --line-strain   0..1   time spent in the red zone; 1 = line snaps
       data-tension    ok | warn | danger   (only while a fish is on)
       --cast-drag     0..1   cast power preview while swiping
       --cast-aim      -1..1  cast direction preview (left .. right)
       --cast-angle    deg    same as an angle, for rotating an aim arrow
       --target-x/-y   px     where the lure will land (while swiping)
       --target-scale  0..1   smaller when farther (perspective)

   - The grey SVG rod / line / lure are PLACEHOLDERS (#fgPlaceholder),
     to be replaced by the real artwork from assets/fishing/.
   ========================================================================= */
(function () {
  'use strict';

  const { createFishingEngine, FISHING_CONFIG } = window.PFLFishing;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---- Telegram helpers (same pattern as utils.js haptic) ------------------
  const tg = window.Telegram?.WebApp;
  function haptic(type = 'light') {
    try { tg?.HapticFeedback?.impactOccurred(type); } catch (e) { /* n/a */ }
  }
  function hapticNotify(type = 'success') {
    try { tg?.HapticFeedback?.notificationOccurred(type); } catch (e) { /* n/a */ }
  }
  function hapticTick() {
    try { tg?.HapticFeedback?.selectionChanged(); } catch (e) { /* n/a */ }
  }

  // ---- Bite vibration: a series of "pecks" for the whole hook window --------
  // Telegram HapticFeedback works in the Telegram app (iOS + Android).
  // Outside Telegram, navigator.vibrate() works on Android browsers only
  // (iOS Safari has no vibration API at all).
  const BITE_VIBRATION = {
    pecks: [                  // [delay ms from bite start, strength]
      [0, 'heavy'], [110, 'heavy'],
      [300, 'medium'], [390, 'heavy'],
      [520, 'medium'], [640, 'heavy'],
      [780, 'medium'], [890, 'heavy'], // pecks cover the whole hook window (1 s)
    ],
    androidPattern: [45, 65, 45, 190, 35, 55, 45, 85, 35, 85, 45, 95, 35], // vibrate / pause / vibrate ...
  };
  let biteTimers = [];

  function vibrateBite() {
    stopBiteVibration();
    if (tg?.HapticFeedback) {
      biteTimers = BITE_VIBRATION.pecks.map(([delay, type]) => setTimeout(() => haptic(type), delay));
    } else {
      try { navigator.vibrate?.(BITE_VIBRATION.androidPattern); } catch (e) { /* n/a */ }
    }
  }

  function stopBiteVibration() {
    biteTimers.forEach(clearTimeout);
    biteTimers = [];
    try { if (!tg?.HapticFeedback) navigator.vibrate?.(0); } catch (e) { /* n/a */ }
  }

  // ---- Scene layout — proportional to the viewport -------------------------
  //   water: bottom 60% of the screen, land sits on top of it, sky above;
  //   rod:   88% of the screen height, same shape/angle as rod.svg.
  const GEO = {
    waterShare: 0.60,        // water height / viewport height
    rodShare: 0.88,          // rod height / viewport height
    // rod.svg (207×677): tip at (0,0), butt of the blank at (197.5, 677)
    rodSvgButt: [197.5, 677],
    rodButtXShare: 317.5 / 390, // butt x as share of screen width (from Figma)
    rodButtWidth: 7,         // blank thickness at the butt … (rod.svg units)
    rodTipWidth: 1.6,        // … and at the tip
    tipDroopBack: 70,        // at bend = 1 the tip sinks back along the blank… (rod.svg units)
    tipDroopSide: 60,        // …and falls sideways
    landSvg: [390, 27],
    lureNearShare: 0.84,     // lure y at the shore, as share of the water height
    lureFarGap: 5,           // lure y at max distance: px below the far bank
    lureXShare: 205 / 390,   // straight cast
    edgeMargin: 20,          // outermost cast direction lands this many px from the screen edge
    castArcShare: 0.22,      // cast flight arc height / viewport height
  };

  function getElements() {
    return {
      root: document.getElementById('fishingGame'),
      stage: document.getElementById('fgStage'),
      svg: document.getElementById('fgPlaceholder'),
      rod: document.getElementById('fgRod'),
      grip: document.getElementById('fgGrip'),
      line: document.getElementById('fgLine'),
      lure: document.getElementById('fgLure'),
      bait: document.getElementById('fgBait'),
      ripples: document.getElementById('fgRipples'),
      splash: document.getElementById('fgSplash'),
      castDist: document.getElementById('fgCastDist'),
      score: document.getElementById('fgScore'),
      weight: document.getElementById('fgWeight'),
      hint: document.getElementById('fgHint'),
      toast: document.getElementById('fgToast'),
      twitch: document.getElementById('fgTwitch'),
      lever: document.getElementById('fgLever'),
      leverTrack: document.getElementById('fgLeverTrack'),
      exit: document.getElementById('fgExit'),
      sound: document.getElementById('fgSound'),
      debug: document.getElementById('fgDebug'),
      debugToggle: document.getElementById('fgDebugToggle'),
      aim: document.getElementById('fgAim'),
      catch: document.getElementById('fgCatch'),
      catchImg: document.getElementById('fgCatchImg'),
      catchEmoji: document.getElementById('fgCatchEmoji'),
      catchName: document.getElementById('fgCatchName'),
      catchWeight: document.getElementById('fgCatchWeight'),
      catchDelta: document.getElementById('fgCatchDelta'),
      catchNote: document.getElementById('fgCatchNote'),
      stats: document.getElementById('fgStats'),
      bag: document.getElementById('fgBag'),
      bagList: document.getElementById('fgBagList'),
      bagSub: document.getElementById('fgBagSub'),
      bagEmpty: document.getElementById('fgBagEmpty'),
    };
  }

  // PFL app: created once on the first open (fishing-launcher.js), then
  // start() on every open and stop() on every close. opts.onExit is called
  // after the X icon ends the session (the launcher hides the view).
  function initFishingGame(opts = {}) {
    const el = getElements();
    if (!el.root) return null;

    const engine = createFishingEngine(FISHING_CONFIG);
    const s = engine.state;
    // sounds (fishing-audio.js); no-op stub if the file isn't loaded
    const audio = window.PFLFishing.createFishingAudio
      ? window.PFLFishing.createFishingAudio()
      : { unlock() {}, setEnabled() {}, suspend() {}, resume() {}, cast() {}, splash() {}, drag() {}, hookBurst() {} };

    let W = 0, H = 0;
    let rafId = 0, lastTs = 0;
    let running = false;               // true between start() and stop(): window-level handlers idle otherwise
    let bend = 0, bendV = 0;           // rod tip spring
    let reelAngle = 0, lastTickAngle = 0;
    let lureDriftSeed = Math.random() * 10;
    let toastTimer = 0;
    let debugOn = /[?&]debug=1/.test(location.search);

    // ---- Layout -----------------------------------------------------------
    // L = layout in screen px, recomputed on resize
    const L = {};
    function measure() {
      const r = el.stage.getBoundingClientRect();
      W = r.width; H = r.height;

      L.horizonY = H * (1 - GEO.waterShare);
      L.landH = W * GEO.landSvg[1] / GEO.landSvg[0];

      L.rodScale = (H * GEO.rodShare) / GEO.rodSvgButt[1];
      L.rodButt = [W * GEO.rodButtXShare, H];
      L.rodTip = [
        L.rodButt[0] - GEO.rodSvgButt[0] * L.rodScale,
        H - GEO.rodSvgButt[1] * L.rodScale,
      ];
      L.rodButtWidth = GEO.rodButtWidth * L.rodScale;
      L.rodTipWidth = Math.max(1.2, GEO.rodTipWidth * L.rodScale);
      L.tipDroopBack = GEO.tipDroopBack * L.rodScale;
      L.tipDroopSide = GEO.tipDroopSide * L.rodScale;

      const waterH = H - L.horizonY;
      L.lureNearY = L.horizonY + waterH * GEO.lureNearShare;
      L.lureFarY = L.horizonY + GEO.lureFarGap;
      L.lureX = W * GEO.lureXShare;
      // separate spread to each side: the straight line is not in the screen centre
      L.aimSpreadLeft = L.lureX - GEO.edgeMargin;
      L.aimSpreadRight = W - GEO.edgeMargin - L.lureX;
      L.castArcH = H * GEO.castArcShare;
      L.sagMax = H * 0.07;

      el.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      el.grip.setAttribute('transform', `translate(${L.rodTip[0]} ${L.rodTip[1]}) scale(${L.rodScale})`);
      el.root.style.setProperty('--horizon', `${L.horizonY}px`);
      el.root.style.setProperty('--land-h', `${L.landH}px`);
      el.root.style.setProperty('--tension-warn', FISHING_CONFIG.tension.warn);
      el.root.style.setProperty('--tension-danger', FISHING_CONFIG.tension.danger);
    }

    function toScreen(p) { return p; } // scene is drawn in screen px

    // ---- Telegram: no vertical swipe-to-close while playing ---------------
    // On close, restore what was there before: the PFL app keeps swipes
    // disabled all the time, so they must not be re-enabled by the game.
    let swipesWereEnabled = false;
    function lockTelegramGestures(lock) {
      try {
        if (lock) {
          swipesWereEnabled = tg?.isVerticalSwipesEnabled === true;
          tg?.expand?.(); tg?.disableVerticalSwipes?.();
        } else if (swipesWereEnabled) tg?.enableVerticalSwipes?.();
      } catch (e) { /* older clients */ }
    }

    // ---- Cast swipe -------------------------------------------------------
    let castPtr = null;

    function onStageDown(e) {
      if (s.state !== 'idle' || castPtr) return;
      if (e.target.closest('.fg-control, .fg-hud-btn, .fg-exit, .fg-stats, button')) return; // UI, not a cast
      castPtr = {
        id: e.pointerId, x0: e.clientX, y0: e.clientY,
        samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
      };
      el.stage.setPointerCapture?.(e.pointerId);
    }

    // Swipe → { power, aim } or null (too short / not upward)
    function readSwipe(x, y) {
      const dx = x - castPtr.x0;
      const dy = castPtr.y0 - y;               // up = positive
      const aim = engine.castAimFromSwipe(dx, dy);
      if (aim == null) return null;
      const power = engine.castPowerFromSwipe(Math.hypot(dx, dy), peakSpeed(castPtr.samples), H);
      if (power == null) return null;
      return { power, aim, angleDeg: Math.atan2(dx, dy) * 180 / Math.PI };
    }

    function onStageMove(e) {
      if (!castPtr || e.pointerId !== castPtr.id) return;
      castPtr.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (castPtr.samples.length > 12) castPtr.samples.shift();
      const sw = readSwipe(e.clientX, e.clientY);
      el.root.classList.toggle('is-aiming', !!sw);
      if (!sw) return;
      const rs = el.root.style;
      rs.setProperty('--cast-drag', sw.power.toFixed(3));
      rs.setProperty('--cast-aim', sw.aim.toFixed(3));
      rs.setProperty('--cast-angle', `${(sw.aim * FISHING_CONFIG.cast.maxAimDeg).toFixed(1)}deg`);
      // where the lure would land
      const c = FISHING_CONFIG.cast;
      const dist = c.minDistanceM + sw.power * (c.maxDistanceM - c.minDistanceM);
      const [tx, ty] = toScreen(waterPoint(dist / c.maxDistanceM, sw.aim, false));
      rs.setProperty('--target-x', `${tx.toFixed(1)}px`);
      rs.setProperty('--target-y', `${ty.toFixed(1)}px`);
      rs.setProperty('--target-scale', lerp(1, 0.45, dist / c.maxDistanceM).toFixed(3));
    }

    function peakSpeed(samples) {
      let peak = 0;
      for (let i = 1; i < samples.length; i++) {
        const dt = samples[i].t - samples[i - 1].t;
        if (dt <= 0) continue;
        const d = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
        peak = Math.max(peak, d / dt);
      }
      return peak;
    }

    function onStageUp(e) {
      if (!castPtr || e.pointerId !== castPtr.id) return;
      castPtr.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      const sw = e.type === 'pointercancel' ? null : readSwipe(e.clientX, e.clientY);
      castPtr = null;
      el.root.classList.remove('is-aiming');
      el.root.style.setProperty('--cast-drag', '0');
      const power = sw?.power;
      if (sw && engine.cast(sw.power, sw.aim)) {
        haptic(power > 0.66 ? 'heavy' : power > 0.33 ? 'medium' : 'light');
        bendV += 14; // rod whips forward
      }
    }

    // ---- Twitch button ----------------------------------------------------
    let twitchPtr = null;

    function onTwitchDown(e) {
      e.preventDefault();
      if (twitchPtr != null) releaseTwitch(); // previous touch lost its pointerup
      twitchPtr = e.pointerId;
      el.twitch.setPointerCapture?.(e.pointerId);
      el.twitch.classList.add('is-pressed');
      const res = engine.twitchStart();
      if (res === 'hook') haptic('heavy');
    }

    function onTwitchUp(e) {
      if (e.pointerId !== twitchPtr) return;
      releaseTwitch();
    }

    function releaseTwitch() {
      if (twitchPtr == null) return;
      twitchPtr = null;
      el.twitch.classList.remove('is-pressed');
      engine.twitchEnd();
    }

    // ---- Reel lever -------------------------------------------------------
    let leverPtr = null;

    // The knob's centre (white dot) travels exactly from the bottom end of the
    // track to its top end; the finger position maps onto the same range.
    function leverValue(clientY) {
      const r = el.leverTrack.getBoundingClientRect();
      return clamp((r.bottom - clientY) / r.height);
    }

    function onLeverDown(e) {
      e.preventDefault();
      if (leverPtr) releaseLever(false); // previous touch lost its pointerup
      leverPtr = { id: e.pointerId, samples: [{ y: e.clientY, t: e.timeStamp }] };
      el.lever.setPointerCapture?.(e.pointerId);
      el.lever.classList.add('is-held');
      engine.reelSet(leverValue(e.clientY));
    }

    function onLeverMove(e) {
      if (!leverPtr || e.pointerId !== leverPtr.id) return;
      leverPtr.samples.push({ y: e.clientY, t: e.timeStamp });
      if (leverPtr.samples.length > 8) leverPtr.samples.shift();
      engine.reelSet(leverValue(e.clientY));
    }

    function onLeverUp(e) {
      if (!leverPtr || e.pointerId !== leverPtr.id) return;
      const sm = leverPtr.samples;
      sm.push({ y: e.clientY, t: e.timeStamp });
      // downward velocity over the last ~100ms
      const last = sm[sm.length - 1];
      let first = sm[0];
      for (let i = sm.length - 1; i >= 0; i--) { if (last.t - sm[i].t > 100) break; first = sm[i]; }
      const dt = last.t - first.t;
      const downSpeed = dt > 0 ? (last.y - first.y) / dt : 0;
      const stop = downSpeed > FISHING_CONFIG.reel.stopSwipePxPerMs;
      releaseLever(stop);
      if (stop) haptic('rigid');
    }

    // Single place that lets go of the lever. Also called from safety nets
    // (lost pointer capture, window pointerup, app hidden) so the lever can
    // never stay "held" at the top after the finger is gone.
    function releaseLever(stop = false) {
      leverPtr = null;
      el.lever.classList.remove('is-held');
      engine.reelRelease(stop);
    }

    function onLostCapture(e) {
      if (leverPtr && e.pointerId === leverPtr.id) releaseLever(false);
      if (twitchPtr != null && e.pointerId === twitchPtr) releaseTwitch();
    }

    function onWindowPointerEnd(e) {
      // the element may miss pointerup (finger lifted during a re-layout, iOS webview quirks)
      if (leverPtr && e.pointerId === leverPtr.id) onLeverUp(e);
      if (twitchPtr != null && e.pointerId === twitchPtr) releaseTwitch();
    }

    function releaseAllInputs() {
      if (leverPtr) releaseLever(false);
      releaseTwitch();
    }

    // ---- Keyboard (desktop testing only) ------------------------------------
    // Keyboard (web): Space = the left button — twitch / hookset / free a snag.
    // Works exactly like pressing the button: hold longer = stronger twitch.
    function onKey(e) {
      if (!running) return;                 // game closed: keys belong to the app
      if (bagOpen) {                        // summary open: Esc/Space close it, no game input
        if (e.type === 'keydown' && (e.key === 'Escape' || e.code === 'Space')) { e.preventDefault(); closeBag(); }
        return;
      }
      if (e.code !== 'Space' && e.key !== ' ') return;
      e.preventDefault();          // no page scroll, no "click" on a focused button
      e.stopPropagation();
      if (e.type === 'keydown') {
        if (e.repeat) return;      // holding the key = one long press
        if (twitchPtr != null) releaseTwitch();
        twitchPtr = 'key';
        el.twitch.classList.add('is-pressed');
        const res = engine.twitchStart();
        if (res === 'hook') haptic('heavy');
      } else if (twitchPtr === 'key') {
        releaseTwitch();
      }
    }

    // ---- Engine events → feedback ------------------------------------------
    function showToast(text, kind, durationMs = 1500) {
      el.toast.textContent = text;
      el.toast.dataset.kind = kind || '';
      el.toast.classList.remove('is-visible');
      void el.toast.offsetWidth; // restart animation
      el.toast.classList.add('is-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), durationMs);
    }

    // Catch card: picture + name + weight. PNGs: assets/fishing/<species>.png
    const CATCH_EMOJI = { perch: '🐟', zander: '🐟', pike: '🐟', crab: '🦀' };
    // One <img> per species, created once and fully loaded up front. On a catch
    // we only switch which one is visible, so the right picture shows at once
    // (swapping one <img>'s src briefly showed the previous fish).
    const catchPics = {};
    const catchPicFailed = new Set();
    Object.keys(CATCH_EMOJI).forEach((sp) => {
      const im = document.createElement('img');
      im.alt = '';
      im.draggable = false;
      im.hidden = true;
      im.dataset.sp = sp;
      im.decoding = 'sync';
      im.onerror = () => catchPicFailed.add(sp);
      im.src = `./assets/fishing/${sp}.webp`;  // 540px copies of the PNGs (light on memory)
      el.catchImg.parentNode.insertBefore(im, el.catchImg);
      catchPics[sp] = im;
    });
    el.catchImg.remove();

    function showCatch({ species, name, weightKg, delta, eaten, type }) {
      Object.entries(catchPics).forEach(([sp, im]) => { im.hidden = sp !== species; });
      const noPic = !catchPics[species] || catchPicFailed.has(species);
      if (catchPics[species]) catchPics[species].hidden = noPic;
      el.catchEmoji.textContent = CATCH_EMOJI[species] || '🐟';
      el.catchEmoji.hidden = !noPic;
      el.catchName.textContent = name || '';
      el.catchWeight.textContent = formatWeight(weightKg);
      el.catchDelta.textContent = delta > 0 ? '+1' : delta < 0 ? '−1' : '0';
      // crab: which fish it ate (or that it found nothing)
      if (type === 'crab') {
        el.catchNote.textContent = eaten
          ? `з'їв ${eaten.nameAcc || eaten.name} ${formatWeight(eaten.kg)}`
          : 'нічого не знайшов — улов порожній';
        el.catchNote.hidden = false;
      } else {
        el.catchNote.hidden = true;
      }
      el.catch.dataset.species = species;
      el.catch.dataset.delta = delta > 0 ? 'plus' : delta < 0 ? 'minus' : 'zero';
      el.catch.classList.remove('is-visible');
      void el.catch.offsetWidth;
      el.catch.classList.add('is-visible');
    }

    const HINTS = {
      idle: 'Свайпни вгору, щоб закинути',
      retrieving: 'Мотай важелем праворуч, смикай та підсікай кнопкою ліворуч',
    };

    engine.on('state', ({ state, power }) => {
      el.root.dataset.state = state;
      if (state === 'casting') audio.cast(power || 0.5, s.flightDuration);
      if (state === 'hooked' || state === 'caught') {
        el.root.dataset.catch = s.catchType;
        el.root.dataset.species = s.species || '';
      } else {
        delete el.root.dataset.catch;
        delete el.root.dataset.species;
      }
      const hint = s.stats.casts < 2 ? HINTS[state] : (state === 'idle' ? HINTS.idle : '');
      el.hint.textContent = hint || '';
      el.hint.classList.toggle('is-visible', !!hint);
    });

    engine.on('splash', ({ distance }) => {
      haptic('light');
      audio.splash(distance);
      el.splash.classList.remove('is-on');
      void el.splash.getBoundingClientRect();
      el.splash.classList.add('is-on');
      // show how far the cast went, right above the splash
      const [x, y] = waterPoint(distance / FISHING_CONFIG.cast.maxDistanceM, s.castAim, false);
      const cd = el.castDist;
      cd.style.setProperty('--dist-x', `${clamp(x, 44, W - 44).toFixed(1)}px`);
      cd.style.setProperty('--dist-y', `${y.toFixed(1)}px`);
      cd.textContent = `${Math.round(distance)} м`;
      cd.classList.remove('is-on');
      void cd.offsetWidth;
      cd.classList.add('is-on');
    });
    engine.on('twitch', ({ strength }) => {
      bendV -= 6 + strength * 16; // tip jerks up
      haptic(strength > 0.7 ? 'medium' : 'light');
      // a small ring on the water where the lure jumped (bigger for a stronger twitch)
      if (lastLure && ['retrieving', 'missed', 'freed', 'snagged'].includes(s.state)) {
        const persp = lerp(1, 0.35, clamp(s.lureDistance / FISHING_CONFIG.cast.maxDistanceM));
        spawnRipple(lastLure[0], lastLure[1], W * 0.045 * persp * (0.6 + 0.8 * strength), 0.7);
      }
    });
    engine.on('bite', vibrateBite);
    engine.on('hook', () => { stopBiteVibration(); hapticNotify('success'); });
    engine.on('miss', () => { stopBiteVibration(); hapticNotify('warning'); showToast('Зійшла…', 'miss'); });
    engine.on('empty', () => showToast('Пусто', 'empty'));
    engine.on('slackWarn', () => hapticNotify('warning'));
    engine.on('escape', () => {
      hapticNotify('error');
      bendV -= 12; // rod straightens
      showToast('Ой, зійшла', 'miss');
    });
    engine.on('lineBreak', ({ reason }) => {
      hapticNotify('error');
      bendV -= 18; // rod springs back up
      showToast(reason === 'snag' ? 'Обрив на зачепі 💥' : 'Обрив! Зійшла 💥', 'miss');
    });
    // bottom: a soft tap when the lure touches it, a double tap after ~4 s ("time to move it")
    engine.on('bottomTouch', () => haptic('soft'));
    engine.on('bottomWarn', () => { haptic('light'); setTimeout(() => haptic('light'), 140); });
    // "School found" comes together with the catch — show it only after the
    // catch card has gone, so they don't overlap.
    let schoolToastTimer = 0;
    engine.on('schoolFound', () => {
      clearTimeout(schoolToastTimer);
      schoolToastTimer = setTimeout(() => showToast('Зграя окуня 😱\nКидай туди ще!', 'school', 2400), CATCH_CARD_MS + 150);
    });
    // the school moved after a few catches (also shown after the catch card)
    engine.on('schoolMoved', () => {
      clearTimeout(schoolToastTimer);
      schoolToastTimer = setTimeout(() => showToast('Зграя окуня\nкудись змістилась 👀', 'school', 2400), CATCH_CARD_MS + 150);
    });
    engine.on('snag', () => {
      hapticNotify('warning');
      showToast('Зачеп! Посмикай, щоб відчепити', 'snag');
    });
    engine.on('unsnag', () => {
      haptic('medium');
      bendV -= 10;
      showToast('Відчепилась!', 'empty');
    });
    const CATCH_CARD_MS = 2100;   // .fg-catch animation length
    engine.on('catch', (info) => {
      hapticNotify(info.type === 'fish' ? 'success' : 'error');
      showCatch(info);
    });
    function formatWeight(kg) {
      if (kg < 1) return `${Math.round(kg * 1000)} г`;
      return `${(Math.round(kg * 100) / 100).toString().replace('.', ',')} кг`;
    }
    function bump(node) {
      node.classList.remove('is-bump');
      void node.offsetWidth;
      node.classList.add('is-bump');
    }
    engine.on('score', ({ score, delta, totalKg = 0 }) => {
      el.score.textContent = String(score);
      el.score.classList.toggle('is-negative', score < 0);
      const w = formatWeight(totalKg);
      const weightChanged = el.weight.textContent !== w;
      el.weight.textContent = w;
      if (delta) bump(el.score);
      if (delta > 0 && weightChanged) bump(el.weight);
    });

    // ---- Per-frame render ---------------------------------------------------
    function rodBendTarget() {
      const t = s.time;
      switch (s.state) {
        case 'bite':   return 0.55 + 0.4 * Math.abs(Math.sin(t * 22));   // nervous pecks
        case 'hooked':
          // Fish on: the rod is loaded; when the fish runs away it bends much harder.
          // Bigger fish (pike) bend it more, a perch only a little.
          return 0.3 + 0.15 * s.fishPower + 0.6 * s.fishPull * s.fishPower + s.reelSpeed * 0.15
               + 0.08 * s.fishPower * Math.sin(t * 9) + 0.12 * s.fishPull * Math.sin(t * 17);
        case 'snagged':
          // Snag: dead, steady load — the harder you reel, the more it bends; no wobble.
          return 0.15 + s.reelSpeed * 0.95;
        case 'casting':return s.stateTime < 0.12 ? -0.6 : 0;
        case 'retrieving':
        case 'freed':
        case 'missed': return 0.05 + s.reelSpeed * 0.2;                  // line tension while reeling
        default:       return 0;
      }
    }

    function updateSpring(dt) {
      const K = 170, C = 13;
      const target = rodBendTarget();
      bendV += (K * (target - bend) - C * bendV) * dt;
      bend = clamp(bend + bendV * dt, -1.2, 1.5);
    }

    // All positions below are in screen px (layout L from measure()).
    // Loaded rod: the tip droops forward — it sinks back along the blank and
    // falls to the outer side, so the upper third arcs over like a real rod.
    function tipPos() {
      const dx = L.rodTip[0] - L.rodButt[0], dy = L.rodTip[1] - L.rodButt[1];
      const len = Math.hypot(dx, dy);
      const ax = dx / len, ay = dy / len; // butt → tip
      let px = -ay, py = ax;               // perpendicular…
      if (py < 0) { px = -px; py = -py; }  // …the one pointing down (outer side)
      const back = bend * L.tipDroopBack;
      const side = bend * L.tipDroopSide;
      return [
        L.rodTip[0] - ax * back + px * side,
        L.rodTip[1] - ay * back + py * side,
      ];
    }

    // Tapered, bendable rod blank — same shape/thickness as rod.svg when straight.
    // The bend is concentrated in the upper part, like a real spinning rod.
    function rodPath(tip) {
      const [bx, by] = L.rodButt;
      const [t0x, t0y] = L.rodTip;
      const dx = t0x - bx, dy = t0y - by;
      const ox = tip[0] - t0x, oy = tip[1] - t0y;
      const P = [
        [bx, by],
        [bx + dx * 0.45, by + dy * 0.45],
        [bx + dx * 0.85 + ox * 0.1, by + dy * 0.85 + oy * 0.1],
        tip,
      ];
      const N = 28;
      const left = [], right = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        const x = u*u*u*P[0][0] + 3*u*u*t*P[1][0] + 3*u*t*t*P[2][0] + t*t*t*P[3][0];
        const y = u*u*u*P[0][1] + 3*u*u*t*P[1][1] + 3*u*t*t*P[2][1] + t*t*t*P[3][1];
        const tx = 3*u*u*(P[1][0]-P[0][0]) + 6*u*t*(P[2][0]-P[1][0]) + 3*t*t*(P[3][0]-P[2][0]);
        const ty = 3*u*u*(P[1][1]-P[0][1]) + 6*u*t*(P[2][1]-P[1][1]) + 3*t*t*(P[3][1]-P[2][1]);
        const len = Math.hypot(tx, ty) || 1;
        const w = lerp(L.rodButtWidth, L.rodTipWidth, Math.pow(t, 0.7)) / 2;
        const nx = -ty / len * w, ny = tx / len * w;
        left.push(`${(x + nx).toFixed(2)},${(y + ny).toFixed(2)}`);
        right.push(`${(x - nx).toFixed(2)},${(y - ny).toFixed(2)}`);
      }
      return `M${left.join(' L')} L${right.reverse().join(' L')} Z`;
    }

    // Point on the water for distance share p (0 shore .. 1 max) and aim -1..1.
    // In perspective a straight cast line keeps the same screen x while the
    // lure comes closer, so the lure retrieves straight down the screen along
    // the cast direction and only converges to the angler in the last metres.
    function waterPoint(p, aim, withDrift = true) {
      const y = lerp(L.lureNearY, L.lureFarY, Math.pow(clamp(p, 0, 1), 0.55)); // never above the far edge
      const converge = clamp(p / 0.08);                // only the last few metres converge to the angler
      const spread = aim < 0 ? L.aimSpreadLeft : L.aimSpreadRight;
      const x = L.lureX + aim * spread * lerp(0.35, 1, converge);
      const drift = withDrift ? Math.sin(s.time * 0.6 + lureDriftSeed) * W * 0.025 * p : 0;
      return [clamp(x + drift, GEO.edgeMargin, W - GEO.edgeMargin), y];
    }

    function lurePos(tip) {
      const cfg = FISHING_CONFIG.cast;
      const landP = s.castDistance / cfg.maxDistanceM;
      const hang = [tip[0], tip[1] + H * 0.045];
      if (s.state === 'idle' || s.state === 'broken') return hang; // hanging from the tip
      if (s.state === 'casting') {
        const k = clamp(s.stateTime / s.flightDuration);
        const to = waterPoint(landP, s.castAim);
        return [lerp(hang[0], to[0], k), lerp(hang[1], to[1], k) - Math.sin(Math.PI * k) * L.castArcH];
      }
      const p = s.lureDistance / cfg.maxDistanceM;
      if (s.state === 'hooked') {
        // fish swims left/right around the cast line
        return waterPoint(p, clamp(s.castAim + s.fishSide, -1.4, 1.4), false);
      }
      const pos = waterPoint(p, s.castAim);
      if (s.state === 'bite') pos[1] += Math.sin(s.time * 40) * 1.5;
      return pos;
    }

    // How taut the line is: 0 = slack (big sag), 1 = straight
    function lineTension() {
      switch (s.state) {
        case 'hooked':
        case 'snagged':
        case 'bite':       return 1;
        case 'casting':    return 0.3;
        case 'retrieving':
        case 'freed':
        case 'missed':     return 0.35 + 0.65 * clamp(s.reelSpeed * 2); // reeling pulls it tight quickly
        default:           return 1; // idle: lure hangs straight under the tip
      }
    }

    // ---- Ripples around the fish while fighting ------------------------------
    // Expanding rings (flattened ellipses for perspective) spawned at the fish.
    // Stronger / more frequent while it runs; smaller when it is far away.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const ripplePool = [];
    let rippleTimer = 0;
    for (let i = 0; i < 10; i++) {
      const e = document.createElementNS(SVG_NS, 'ellipse');
      e.style.display = 'none';
      el.ripples.appendChild(e);
      ripplePool.push({ el: e, life: 0, age: 0, x: 0, y: 0, size: 0, alive: false });
    }

    let lastLure = null;
    function spawnRipple(x, y, size, life) {
      const r = ripplePool.find((p) => !p.alive) || ripplePool.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
      Object.assign(r, { alive: true, x, y, size, age: 0, life: life || 0.9 + Math.random() * 0.4 });
      r.el.style.display = '';
    }

    function updateRipples(dt, lure, farP) {
      const persp = lerp(1, 0.35, clamp(farP));          // far away → smaller rings
      if (s.state === 'hooked') {
        rippleTimer -= dt;
        if (rippleTimer <= 0) {
          const effort = s.fishEffort;
          rippleTimer = lerp(0.55, 0.16, effort) * (0.8 + Math.random() * 0.4);
          const size = W * 0.1 * persp * (0.6 + 0.8 * effort) * Math.min(1.4, 0.7 + 0.4 * s.fishPower);
          spawnRipple(lure[0] + (Math.random() - 0.5) * 6 * persp, lure[1], size);
        }
      } else {
        rippleTimer = 0;
      }
      for (const r of ripplePool) {
        if (!r.alive) continue;
        r.age += dt;
        const k = r.age / r.life;
        if (k >= 1) { r.alive = false; r.el.style.display = 'none'; continue; }
        const rx = r.size * (0.15 + 0.85 * (1 - (1 - k) * (1 - k)));   // ease-out growth
        r.el.setAttribute('cx', r.x.toFixed(1));
        r.el.setAttribute('cy', r.y.toFixed(1));
        r.el.setAttribute('rx', rx.toFixed(1));
        r.el.setAttribute('ry', (rx * 0.32).toFixed(1));
        r.el.setAttribute('stroke-width', (1.6 * (1 - k) + 0.4).toFixed(2));
        r.el.setAttribute('opacity', (0.85 * (1 - k)).toFixed(2));
      }
    }

    const varCache = {};
    function setVar(name, value) {
      if (varCache[name] === value) return;
      varCache[name] = value;
      el.root.style.setProperty(name, value);
    }

    let lastFightTick = 0;
    function render(dt) {
      updateSpring(dt);

      // reel handle rotation + selection haptics every half turn
      const reelRpsMax = 2.2;
      reelAngle += s.reelSpeed * reelRpsMax * 360 * dt;
      if (reelAngle - lastTickAngle >= 180) { lastTickAngle = reelAngle; hapticTick(); }

      // fight feedback: warning pulses in the red zone, soft pulses while the fish pulls
      const tc = FISHING_CONFIG.tension;
      const zone = s.state !== 'hooked' && s.state !== 'snagged' ? '' : s.tension >= tc.danger ? 'danger' : s.tension >= tc.warn ? 'warn' : 'ok';
      if (zone === 'danger' && s.time - lastFightTick > 0.15) {
        lastFightTick = s.time;
        haptic('heavy');
      } else if (s.state === 'hooked' && s.fishPull > 0.5 && s.time - lastFightTick > 0.22) {
        lastFightTick = s.time;
        haptic('soft');
      }
      if (el.root.dataset.tension !== zone) {
        if (zone) el.root.dataset.tension = zone; else delete el.root.dataset.tension;
      }

      const tip = tipPos();
      const lure = lurePos(tip);

      el.rod.setAttribute('d', rodPath(tip));

      // Quadratic line; control point below the chord midpoint by 2×sag.
      const sag = lerp(L.sagMax, 0, lineTension());
      const mid = [(tip[0] + lure[0]) / 2, (tip[1] + lure[1]) / 2 + sag * 2];
      el.line.setAttribute('d', `M${tip[0]},${tip[1]} Q${mid[0]},${mid[1]} ${lure[0]},${lure[1]}`);
      el.lure.setAttribute('cx', lure[0]);
      el.lure.setAttribute('cy', lure[1]);
      const farP = s.state === 'idle' || s.state === 'casting' ? 0 : s.lureDistance / FISHING_CONFIG.cast.maxDistanceM;
      el.lure.setAttribute('r', s.state === 'idle' ? '3' : lerp(4, 1.6, clamp(farP)).toFixed(2)); // smaller while hanging
      updateBait(dt, lure);

      lastLure = lure;
      updateRipples(dt, lure, farP);

      const lureS = toScreen(lure), tipS = toScreen(tip);
      // CSS variables: written only when the (rounded) value changes — avoids
      // restyling the whole screen every frame (heavy on phones).
      setVar('--reel-speed', s.reelSpeed.toFixed(4));   // full precision: the knob must glide, not step
      setVar('--lure-x', `${lureS[0].toFixed(0)}px`);
      setVar('--lure-y', `${lureS[1].toFixed(0)}px`);
      setVar('--tip-x', `${tipS[0].toFixed(0)}px`);
      setVar('--tip-y', `${tipS[1].toFixed(0)}px`);
      setVar('--line-tension', s.tension.toFixed(2));
      setVar('--line-strain', clamp(s.strain / FISHING_CONFIG.tension.breakAfterS).toFixed(2));
      setVar('--twitch-hold', engine.twitchHoldStrength().toFixed(2));

      if (debugOn) {
        el.debug.textContent =
          `state      ${s.state} (${s.stateTime.toFixed(1)}s)\n` +
          `cast       ${(s.castPower * 100).toFixed(0)}%  ${s.castDistance.toFixed(1)} m\n` +
          `lure       ${s.lureDistance.toFixed(1)} m\n` +
          `lever/spd  ${s.reelInput.toFixed(2)} / ${s.reelSpeed.toFixed(2)}${s.reelHeld ? ' (held)' : ''}\n` +
          `rhythm     ${s.rhythm.toFixed(2)}  streak ${s.rhythmStreak}  series ${s.groups.map((g) => g.count).join(',')}  jerk ${s.leverJerk.toFixed(2)}\n` +
          `bite rate  ${(s.biteRate * 100).toFixed(2)} %/s\n` +
          `school     ${s.school ? `aim ${s.school.aim.toFixed(2)} dist ${s.school.dist.toFixed(0)}m${s.school.found ? ' FOUND' : ''} catches ${s.school.catches}/${s.school.moveAfter}` : '-'}${s.inSchool ? '  ◉ IN' : ''}\n` +
          `catch      ${s.species ? `${s.species} ${s.weightKg}kg power ${s.fishPower.toFixed(2)}` : '-'}  bottom ${s.onBottom ? s.bottomTime.toFixed(1) + 's' : (s.sinkTime > 0 ? 'sinking ' + s.sinkTime.toFixed(1) : '-')}\n` +
          `fish       pull ${s.fishPull.toFixed(2)}  side ${s.fishSide.toFixed(2)}  head ${(s.fishHeading * 57.3).toFixed(0)}°${s.fishRunning ? ' RUN' : ''}\n` +
          `tension    ${s.tension.toFixed(2)}  strain ${s.strain.toFixed(2)}s  slack ${s.slackTime.toFixed(1)}s\n` +
          `casts ${s.stats.casts}  bites ${s.stats.bites}  missed ${s.stats.missed}\n` +
          `fish ${s.stats.fish}  crabs ${s.stats.crabs}  empty ${s.stats.empty}  broken ${s.stats.broken}  escaped ${s.stats.escaped}  snags ${s.stats.snags}/${s.stats.freed}`;
      }
    }

    // Drag (фрикціон) sound: how hard the fish is working the reel, 0..1.
    //  - yellow tension zone → 0.5…0.9, red → 1
    //  - a sharp dash to the side (fast sideways movement) → 0.4…0.9
    //  - a run away from the shore taking line → 0.6…1
    let prevSide = null, sideSpeed = 0;
    function dragIntensity(dt) {
      const T = FISHING_CONFIG.tension;
      if (prevSide == null || !dt) { prevSide = s.fishSide; return 0; }
      const v = Math.abs(s.fishSide - prevSide) / dt;
      prevSide = s.fishSide;
      sideSpeed += (v - sideSpeed) * Math.min(1, dt * 8);          // smooth
      let k = 0;
      if (s.tension >= T.warn) k = Math.max(k, s.tension >= T.danger ? 1 : 0.5 + 0.4 * (s.tension - T.warn) / (T.danger - T.warn));
      if (sideSpeed > 0.9) k = Math.max(k, Math.min(0.9, 0.4 + (sideSpeed - 0.9) * 0.6));
      if (s.fishRunning && s.lineOutMps > 0.05) k = Math.max(k, Math.min(1, 0.6 + s.lineOutMps * 0.15));
      return k;
    }
    engine.on('hook', () => { prevSide = null; sideSpeed = 0; audio.hookBurst(); });

    // ---- Bait hanging under the jig head -----------------------------------------
    // Only while the lure hangs from the rod tip (idle). A damped pendulum: it
    // swings when the rod tip moves, plus a gentle "breeze" sway. In the water
    // it's just the dot.
    // bait.webp has 6px padding for the outline (padTop)
    const BAIT = { len: 0.051, aspect: 49 / 212, padTop: 6 / 212, headR: 3, sway: 4, swayHz: 0.35, stiff: 38, damp: 2.2, push: 0.9 };
    let baitAng = 0, baitVel = 0, baitPrev = null, baitPrevV = 0, baitShown = false;
    function updateBait(dt, lure) {
      const show = s.state === 'idle';
      if (show !== baitShown) { el.bait.style.display = show ? '' : 'none'; baitShown = show; }
      if (!show) { baitPrev = null; return; }
      const len = H * BAIT.len, w = len * BAIT.aspect;
      if (dt > 0) {
        // horizontal acceleration of the hanging point kicks the pendulum
        let ax = 0;
        if (baitPrev) {
          const vx = (lure[0] - baitPrev) / dt;
          ax = (vx - baitPrevV) / dt;
          baitPrevV = vx;
        }
        baitPrev = lure[0];
        const breeze = Math.sin(s.time * Math.PI * 2 * BAIT.swayHz) * BAIT.sway + Math.sin(s.time * 1.7 + 1) * BAIT.sway * 0.4;
        const target = breeze * Math.PI / 180;
        const acc = -BAIT.stiff * (baitAng - target) - BAIT.damp * baitVel - clamp(ax, -4000, 4000) / len * BAIT.push * 0.01;
        baitVel += acc * dt;
        baitAng += baitVel * dt;
        baitAng = clamp(baitAng, -0.9, 0.9);
      }
      const r = BAIT.headR;                          // jig head radius (the dot while hanging)
      el.bait.setAttribute('width', w.toFixed(2));
      el.bait.setAttribute('height', len.toFixed(2));
      el.bait.setAttribute('transform',
        `translate(${lure[0].toFixed(2)} ${lure[1].toFixed(2)}) rotate(${(-baitAng * 180 / Math.PI).toFixed(2)}) translate(${(-w / 2).toFixed(2)} ${(r * 0.6 - BAIT.padTop * len).toFixed(2)})`);
    }

    function frame(ts) {
      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
      lastTs = ts;
      if (!bagOpen) engine.update(dt);   // the game is paused while the catch summary is open
      audio.drag(!bagOpen && s.state === 'hooked' ? dragIntensity(dt) : 0);
      render(dt);
      rafId = requestAnimationFrame(frame);
    }

    function onVisibility() {
      if (!running) return;                 // game closed: nothing to pause / resume
      if (document.hidden) { releaseAllInputs(); cancelAnimationFrame(rafId); rafId = 0; audio.suspend(); }
      else { audio.resume(); if (!rafId) { lastTs = 0; rafId = requestAnimationFrame(frame); } }
    }

    // ---- Open / close -------------------------------------------------------
    // ---- Session cache ---------------------------------------------------------
    // The catch lives in sessionStorage while the game session lasts, so if the
    // phone reloads the page (e.g. low memory) the catch comes back.
    // Tapping the close icon ends the session and wipes it; closing the mini
    // app in Telegram drops sessionStorage anyway.
    const SESSION_KEY = 'pfl.fishing.session';
    function saveSession() {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(engine.exportSession())); } catch (e) { /* private mode / full */ }
    }
    function loadSession() {
      try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    function clearSession() {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* n/a */ }
    }
    engine.on('score', saveSession);                 // every catch / crab
    engine.on('state', ({ state }) => { if (state === 'casting' || state === 'idle') saveSession(); });
    engine.on('schoolFound', saveSession);
    engine.on('schoolMoved', saveSession);
    window.addEventListener('pagehide', saveSession);

    function start() {
      if (running) return;
      running = true;
      measure();
      const saved = loadSession();                     // read BEFORE reset (reset saves an empty session)
      engine.reset();
      if (saved) engine.importSession(saved);
      lockTelegramGestures(true);
      audio.resume();                                  // back on after stop(); no-op before the first tap
      lastTs = 0;
      if (!rafId) rafId = requestAnimationFrame(frame);
    }

    function stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      rafId = 0;
      audio.drag(0);
      audio.suspend();                                 // nature + drag loops silent while closed
      stopBiteVibration();
      releaseAllInputs();
      closeBag();
      lockTelegramGestures(false);
      engine.reset(); // score lives only within the session
    }

    function onExit() {
      haptic('light');
      clearSession();                                  // closing = the session is over
      stop();
      clearSession();                                  // stop() saved; the X ends the session for good
      if (typeof opts.onExit === 'function') opts.onExit();
    }

    // ---- Catch summary (tap the Улов/Вага pill) --------------------------------
    // Every fish in the bag in catch order: picture, name, weight. The game is
    // paused while it's open (engine.update is skipped).
    let bagOpen = false;
    function plural(n, one, few, many) {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return one;
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
      return many;
    }
    function renderBag() {
      const bag = engine.exportSession().bag || [];
      const total = bag.reduce((a, f) => a + f.kg, 0);
      el.bagSub.textContent = bag.length
        ? `${bag.length} ${plural(bag.length, 'риба', 'риби', 'риб')} · ${formatWeight(total)}`
        : '0 риб';
      el.bagEmpty.hidden = bag.length > 0;
      el.bagList.hidden = bag.length === 0;
      let maxI = -1;
      if (bag.length > 1) bag.forEach((f, i) => { if (maxI < 0 || f.kg > bag[maxI].kg) maxI = i; });
      const frag = document.createDocumentFragment();
      bag.forEach((f, i) => {
        const li = document.createElement('li');
        li.className = 'fg-bag__item';
        li.dataset.species = f.species;
        const name = FISHING_CONFIG.species[f.species]?.name || 'Риба';
        li.innerHTML =
          `<span class="fg-bag__num">${i + 1}</span>` +
          `<span class="fg-bag__pic"><img src="./assets/fishing/${f.species}.webp" alt="" draggable="false" loading="lazy"></span>` +
          `<span class="fg-bag__name"></span>` +
          `<span class="fg-bag__kg">${formatWeight(f.kg)}</span>`;
        li.querySelector('.fg-bag__name').textContent = name;
        if (i === maxI) {
          const b = document.createElement('span');
          b.className = 'fg-bag__badge';
          b.textContent = 'трофей';
          li.querySelector('.fg-bag__name').appendChild(b);
        }
        frag.appendChild(li);
      });
      el.bagList.replaceChildren(frag);
      el.bagList.scrollTop = 0;
    }
    function openBag() {
      if (bagOpen) return;
      releaseAllInputs();                 // let go of the lever / button before pausing
      stopBiteVibration();
      renderBag();
      bagOpen = true;
      el.bag.hidden = false;
      haptic('light');
    }
    function closeBag() {
      if (!bagOpen) return;
      bagOpen = false;
      el.bag.hidden = true;
      lastTs = 0;                         // no time jump after the pause
    }
    el.stats.addEventListener('click', openBag);
    el.bag.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeBag(); });

    // ---- Bind ---------------------------------------------------------------
    el.stage.addEventListener('pointerdown', onStageDown);
    el.stage.addEventListener('pointermove', onStageMove);
    el.stage.addEventListener('pointerup', onStageUp);
    el.stage.addEventListener('pointercancel', onStageUp);

    el.twitch.addEventListener('pointerdown', onTwitchDown);
    el.twitch.addEventListener('pointerup', onTwitchUp);
    el.twitch.addEventListener('pointercancel', onTwitchUp);

    el.lever.addEventListener('pointerdown', onLeverDown);
    el.lever.addEventListener('pointermove', onLeverMove);
    el.lever.addEventListener('pointerup', onLeverUp);
    el.lever.addEventListener('pointercancel', onLeverUp);
    el.lever.addEventListener('lostpointercapture', onLostCapture);
    el.twitch.addEventListener('lostpointercapture', onLostCapture);
    window.addEventListener('pointerup', onWindowPointerEnd, true);
    window.addEventListener('pointercancel', onWindowPointerEnd, true);
    window.addEventListener('blur', releaseAllInputs);

    el.exit.addEventListener('click', onExit);

    // ---- Sound on/off -----------------------------------------------------------
    // The choice is remembered on this device. Sounds themselves hook in via
    // setSoundOn() (cast, nature ambience, drag).
    const SOUND_KEY = 'pfl.fishing.sound';
    let soundOn = true;
    try { soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { /* n/a */ }
    function setSoundOn(on) {
      soundOn = on;
      el.sound.classList.toggle('is-muted', !on);
      el.sound.setAttribute('aria-pressed', String(on));
      el.sound.setAttribute('aria-label', on ? 'Вимкнути звук' : 'Увімкнути звук');
      try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch (e) { /* n/a */ }
      audio.setEnabled(on);
      if (on) audio.unlock();          // this click is a user gesture → can start audio
    }
    setSoundOn(soundOn);
    el.sound.addEventListener('click', () => { haptic('light'); setSoundOn(!soundOn); });
    // audio may only start after a user gesture: unlock on any tap / key
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) =>
      window.addEventListener(ev, () => { if (running && soundOn) audio.unlock(); }, { capture: true, passive: true }));
    el.debugToggle.addEventListener('click', () => {
      debugOn = !debugOn;
      el.debug.hidden = !debugOn;
    });
    el.debug.hidden = !debugOn;

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    // buttons must not keep keyboard focus (Space would "click" the exit button)
    [el.exit, el.sound, el.twitch, el.debugToggle].forEach((b) => {
      b.setAttribute('tabindex', '-1');
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
    });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', () => { if (running) measure(); });
    el.root.addEventListener('contextmenu', (e) => e.preventDefault());

    console.log('[Fishing] Initialized');
    return { engine, start, stop, isRunning: () => running };
  }

  // No auto-start in the app: fishing-launcher.js calls initFishingGame() on the first open.
  window.PFLFishing.initFishingGame = initFishingGame;
})();
