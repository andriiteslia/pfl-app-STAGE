/* PFL Fishing — lures (коробка з приманками).
 *
 * The player picks a lure, its size and the jig weight in the lure box
 * (fishing-view.js). lureProfile(choice) turns that choice into numbers the
 * engine uses (engine.setLure):
 *
 *   castMaxM  – how far a full-power cast goes (light jig = short cast)
 *   sinkS     – time to sink to the bottom after you stop (light = slow fall)
 *   snagMul   – × chance to catch a snag after a long rest on the bottom
 *   noBottom  – a suspending wobbler never lies on the bottom (no pauses, no snags)
 *   m         – how much each species wants it: bite rate AND share of that
 *               species, × the lake's normal odds (1 = like before, 0 = never)
 *   big       – weight shift per species: > 1 → heavier fish more often
 *               (tier odds × big^tier), < 1 → smaller ones
 *   capKg     – upper weight limit per species for this lure (small pike on a micro lure)
 *   speedMax  – bite factor at max retrieve speed (wobbler: pike like it fast)
 *
 * Hidden from the player — they find out what works by fishing.
 * The default (Easy Shiner 3" on 10 g) plays like the old game, but casts 68 m (was 73).
 * Balance was checked with a Node bot (see the handoff).
 *
 * Load order: fishing-engine.js → fishing-lakes.js → fishing-lures.js → …
 */
(function () {
  'use strict';

  const P = window.PFLFishing;

  // Jig head weights in the box (g)
  const WEIGHTS = [1, 2, 3, 5, 7, 10, 15];

  // How the jig weight itself changes who bites (interpolated between points):
  // light — slow fall, perch love it; heavy — near the bottom, zander / catfish.
  const WEIGHT_PREFS = {
    g:       [1,    2,    3,    5,    7,    10,   15],
    perch:   [1.35, 1.3,  1.2,  1.1,  1.0,  1.0,  0.85],
    zander:  [0.45, 0.55, 0.7,  0.85, 0.95, 1.0,  1.4],
    pike:    [0.85, 0.9,  0.95, 1.0,  1.0,  1.0,  0.95],
    catfish: [0.3,  0.4,  0.5,  0.7,  0.9,  1.0,  1.7],
    crab:    [0.75, 0.8,  0.85, 0.9,  1.0,  1.0,  1.05],
  };

  // Cast distance (m) by jig weight — Андрій's table (05.10). A wobbler: by its size (castM).
  const WEIGHT_CAST = { 1: 34, 2: 38, 3: 44, 5: 50, 7: 54, 10: 68, 15: 74 };
  // total weight (jig + lure body) still drives the sink speed and snags
  const CAST = { refG: 11.6 };
  const SINK = { refS: 1.2, pow: 0.5 };       // 1.2 s at refG, slower when lighter
  const SNAG = { pow: 0.35, min: 0.4, max: 1.15 };

  // m: perch / pike / zander / catfish / crab;  big: weight shift;  capKg: max weight
  const S = (bodyG, m, big = {}, capKg, castM) => ({ bodyG, m, big, capKg, castM });

  const LURES = [
    {
      id: 'easy-shiner', brand: 'Keitech', name: 'Easy Shiner', art: 1.0, unit: 'in',
      // all fish; on 4" more trophy fish
      sizes: {
        2: S(0.7, { perch: 1.5, pike: 0.6, zander: 0.7, catfish: 0.4, crab: 1 },
                  { perch: 0.8, pike: 0.7, zander: 0.8 }),
        3: S(1.6, { perch: 1, pike: 1, zander: 1, catfish: 1, crab: 1 }),
        4: S(3.5, { perch: 0.6, pike: 1.2, zander: 1.2, catfish: 1.3, crab: 1 },
                  { perch: 1.6, pike: 1.8, zander: 1.8, catfish: 1.5 }),
      },
      defaultSize: 3,
    },
    {
      id: 'swing-impact-fat', brand: 'Keitech', name: 'Swing Impact Fat', art: 0.98, unit: 'in',
      // all fish, fewer perch, most of all pike, now and then catfish and zander
      sizes: {
        2.8: S(1.5, { perch: 0.8,  pike: 1.4, zander: 0.5,  catfish: 0.4, crab: 1 }, { pike: 0.9 }),
        3.3: S(2.5, { perch: 0.6,  pike: 1.6, zander: 0.5,  catfish: 0.5, crab: 1 },
                    { perch: 1.2, pike: 1.2, zander: 1.2, catfish: 1.2 }),
        3.8: S(3.8, { perch: 0.4,  pike: 1.6, zander: 0.45, catfish: 0.6, crab: 1 },
                    { perch: 1.5, pike: 1.5, zander: 1.4, catfish: 1.4 }),
        4.3: S(5.5, { perch: 0.25, pike: 1.45, zander: 0.4,  catfish: 0.7, crab: 1 },
                    { perch: 2.0, pike: 1.8, zander: 1.7, catfish: 1.7 }),
      },
      defaultSize: 3.3,
    },
    {
      id: 'cheater', brand: 'M5 Craft', name: 'Cheater', art: 0.7, unit: 'in',
      // mostly perch (on 1.5" up to a trophy one), small pike and zander, no catfish
      sizes: {
        1.2: S(0.4, { perch: 1.9, pike: 0.35, zander: 0.35, catfish: 0, crab: 1 },
                    { perch: 0.7, pike: 0.4, zander: 0.4 }, { pike: 1.4, zander: 1.2 }),
        1.5: S(0.7, { perch: 1.7, pike: 0.35, zander: 0.35, catfish: 0, crab: 1 },
                    { perch: 1.6, pike: 0.5, zander: 0.5 }, { pike: 1.8, zander: 1.5 }),
      },
      defaultSize: 1.5,
    },
    {
      id: 'fusion', brand: 'Upstream', name: 'Fusion', art: 0.97, unit: 'in',
      // all fish, but a pike lure: 2" and 2.5" — lots of pike, 4" — trophy pike
      sizes: {
        2:   S(0.8, { perch: 0.9,  pike: 1.5, zander: 0.6, catfish: 0.3,  crab: 1 }, { perch: 0.9, pike: 0.8 }),
        2.5: S(1.2, { perch: 0.8,  pike: 1.4, zander: 0.6, catfish: 0.35, crab: 1 }, { pike: 0.9 }),
        3:   S(1.8, { perch: 0.55, pike: 1.5, zander: 0.7, catfish: 0.5,  crab: 1 },
                    { perch: 1.2, pike: 1.2, zander: 1.2 }),
        4:   S(3.5, { perch: 0.3,  pike: 1.4, zander: 0.6, catfish: 0.7,  crab: 1 },
                    { perch: 1.6, pike: 2.0, zander: 1.5, catfish: 1.5 }),
      },
      defaultSize: 2.5,
    },
    {
      id: 'orbit', brand: 'Jackall', name: 'Orbit', art: 1.0, unit: 'mm', wobbler: true,
      // suspending wobbler (own weight, no jig): pike of all sizes, very rarely
      // perch or zander, never catfish; never touches the bottom → no snags,
      // no bottom pauses, crabs hardly notice it
      sizes: {
        80:  S(8.5,  { perch: 0.04, pike: 1.7, zander: 0.04, catfish: 0, crab: 0.35 }, { perch: 1.3, pike: 0.9 }, null, 40),
        90:  S(10.5, { perch: 0.03, pike: 1.65, zander: 0.03, catfish: 0, crab: 0.35 }, { perch: 1.4, pike: 1.2 }, null, 44),
        110: S(16.5, { perch: 0.02, pike: 1.5, zander: 0.02, catfish: 0, crab: 0.35 }, { perch: 1.6, pike: 1.7 }, null, 54),
      },
      defaultSize: 90,
      speedMax: 0.85,
    },
  ];

  const DEFAULT_CHOICE = { lure: 'easy-shiner', size: 3, weight: 10 };

  const getLure = (id) => LURES.find((l) => l.id === id) || LURES[0];
  const sizeKeys = (lure) => Object.keys(lure.sizes).map(Number).sort((a, b) => a - b);

  /** Any saved / partial choice → a valid one. */
  function normalizeChoice(c) {
    const lure = getLure(c?.lure);
    const sizes = sizeKeys(lure);
    const size = sizes.includes(+c?.size) ? +c.size : lure.defaultSize;
    const weight = WEIGHTS.includes(+c?.weight) ? +c.weight : DEFAULT_CHOICE.weight;
    return { lure: lure.id, size, weight };
  }

  /** "3’", "2.8’", "90 мм" */
  function sizeLabel(lure, size) {
    return lure.unit === 'mm' ? `${size} мм` : `${String(size)}’`;
  }

  function interp(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) {
      if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    }
    return ys[ys.length - 1];
  }

  /** Total cast weight of a choice (g): jig + lure body; a wobbler — its own weight. */
  function castWeight(choice) {
    const c = normalizeChoice(choice);
    const lure = getLure(c.lure);
    const sz = lure.sizes[c.size];
    return lure.wobbler ? sz.bodyG : c.weight + sz.bodyG;
  }

  /** Choice → numbers for the engine (see the top of the file). maxCastM = scene max (74 m). */
  function lureProfile(choice, maxCastM = 74) {
    const c = normalizeChoice(choice);
    const lure = getLure(c.lure);
    const sz = lure.sizes[c.size];
    const g = castWeight(c);
    const m = {};
    ['perch', 'pike', 'zander', 'catfish', 'crab'].forEach((k) => {
      const w = lure.wobbler ? 1 : interp(WEIGHT_PREFS.g, WEIGHT_PREFS[k], c.weight);
      m[k] = (sz.m[k] ?? 1) * w;
    });
    return {
      id: lure.id,
      choice: c,
      wobbler: !!lure.wobbler,
      castG: g,
      castMaxM: Math.min(maxCastM, lure.wobbler ? (sz.castM || maxCastM) : (WEIGHT_CAST[c.weight] || maxCastM)),
      sinkS: SINK.refS * Math.pow(CAST.refG / g, SINK.pow),
      snagMul: Math.min(SNAG.max, Math.max(SNAG.min, Math.pow(g / CAST.refG, SNAG.pow))),
      noBottom: !!lure.wobbler,
      m,
      big: { ...sz.big },
      capKg: { ...(sz.capKg || {}) },
      speedMax: lure.speedMax,
      lengthIn: lure.unit === 'mm' ? c.size / 25.4 : c.size,
    };
  }

  P.LURES = LURES;
  P.LURE_WEIGHTS = WEIGHTS;
  P.DEFAULT_LURE = DEFAULT_CHOICE;
  P.getLure = getLure;
  P.lureSizes = sizeKeys;
  P.lureSizeLabel = sizeLabel;
  P.normalizeLureChoice = normalizeChoice;
  P.lureCastWeight = castWeight;
  P.lureProfile = lureProfile;
})();
