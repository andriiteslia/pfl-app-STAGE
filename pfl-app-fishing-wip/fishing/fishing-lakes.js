/* PFL Fishing — lakes (водойми).
 *
 * Each lake has its own name, artwork and FISH: which species live there, how
 * often each one bites, how big they grow, where the perch school stands, where
 * the catfish bites… Everything in `config` is merged over the base
 * FISHING_CONFIG (fishing-engine.js), so a lake can also override anything else
 * there (cast distance, snags, bite rate…) — only list what differs.
 * How a species fights (styles, weightPower) is in the engine: a pike fights
 * like a pike in every lake.
 *
 * Add a lake: copy the Prylbychi block, give it a new `id`, `name`, `art`, and
 * change its fish. With 2+ lakes the player chooses one before fishing.
 *
 * Load order: fishing-engine.js → fishing-lakes.js → fishing-view.js.
 */
(function () {
  'use strict';

  const P = window.PFLFishing;

  const LAKES = [
    {
      id: 'prylbychi',
      name: 'Прилбичі',
      nameEn: 'Prylbychi',
      // scene: sky (top), water (bottom 60% of the screen), far bank on the horizon
      art: {
        sky: './assets/fishing/sky.webp',
        water: './assets/fishing/water.webp',
        land: './assets/fishing/land.webp',
      },
      config: {
        bite: {
          fishChance: 0.75,        // 75% fish (+1), 25% crab (-1)
          pausePerchChance: 0.85,  // a bite on a pause is a perch with this chance
        },
        species: {
          // Which fish bites (crab is decided separately by bite.fishChance).
          // chance — share among perch / zander / pike; power scales how hard it fights.
          // Weight: tiers [chance, fromKg, toKg] — the bigger, the rarer.
          perch: {
            name: 'Окунь', nameAcc: 'окуня', chance: 0.55, power: 0.6, kg: [0.02, 1.5],
            // (perch weight comes from the school / loner rules below)
            tiers: [[0.82, 0.02, 0.45], [0.15, 0.45, 0.9], [0.03, 0.9, 1.5]],
          },
          zander: {
            name: 'Судак', nameAcc: 'судака', chance: 0.15, power: 0.9, kg: [0.4, 5.6],
            tiers: [[0.82, 0.4, 1.8], [0.15, 1.8, 3.5], [0.03, 3.5, 5.6]],
          },
          pike: {
            name: 'Щука', nameAcc: 'щуку', chance: 0.30, power: 1.0, kg: [0.4, 7.2],
            tiers: [[0.82, 0.4, 2.0], [0.15, 2.0, 4.2], [0.03, 4.2, 7.2]],
          },
          crab: { name: 'Краб', power: 0.5, kg: [0.05, 0.3], tiers: [[1, 0.05, 0.3]] },
          // Catfish — rare trophy. Bites only FAR out and NEAR THE BOTTOM
          // (lure lying on the bottom, or a slow retrieve), see `catfishBite`.
          // chance: 0 = never picked by the normal perch/zander/pike roll.
          catfish: {
            name: 'Сом', nameAcc: 'сома', chance: 0, power: 1.5, kg: [5, 35],
            tiers: [[0.70, 5, 12], [0.25, 12, 22], [0.05, 22, 35]],
          },
          catfishBite: { minDistM: 35, slowReel: 0.3, chance: 0.08 }, // far + bottom/slow → this share of fish bites is a catfish
          // Perch is a schooling fish: each session has one school of about the
          // same size (picked at random within perchSchoolKg). Now and then a
          // lone big perch bites instead.
          perchSchoolKg: [0.12, 0.25], // size of this session's school
          perchSchoolSpread: 0.2,  // ±20% around the school size
          perchLonerChance: 0.15,  // chance the perch is a lone big one, not from the school
          perchLonerTiers: [[0.85, 0.35, 0.9], [0.15, 0.9, 1.5]],
          // The school stands at one hidden SPOT (direction + distance). Lead the
          // lure through it → more bites, almost all school perch. The spot slowly
          // drifts, and after a few catches the school moves to a new place.
          school: {
            distM: [15, 55],       // spot distance range
            aimRange: 0.9,         // spot direction range (-0.9 … 0.9)
            aimTol: 0.224,         // lure counts as "in the spot" within ± this direction… (+12%, was 0.2)
            distTol: 8,            // …and ± this many metres
            perchChance: 0.85,     // a bite in the spot is a school perch with this chance
            driftEveryS: 12,       // slow drift: every N seconds…
            driftAim: 0.06,        // …shift direction by up to this
            driftDistM: 2,         // …and distance by up to this
            moveAfterCatches: [3, 6], // after this many school catches the school moves…
            moveAim: [0.3, 0.6],   // …by this much sideways
            moveDistM: [8, 15],    // …and this many metres closer / farther
          },
          // Near the shore ("під ноги"): mostly small perch, now and then a pike.
          // Farther out: all species as above. Decided by where the fish bites.
          nearShoreM: 12,          // bites closer than this = "near the shore"
          nearPikeChance: 0.1,     // about one pike per ten small perch
          nearPerchKg: [0.02, 0.12],
          // The very first fish (guaranteed bite on the 2nd cast) is a special nice
          // perch — it does NOT define the school.
          firstFish: { species: 'perch', kg: 0.68, spread: 0.04 },
        },
      },
    },
  ];

  const DEFAULT_LAKE = 'prylbychi';

  // plain objects merge key by key; arrays and values replace
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function merge(base, over) {
    const out = Array.isArray(base) ? base.slice() : { ...base };
    for (const k of Object.keys(over || {})) {
      out[k] = isObj(base?.[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
    }
    return out;
  }

  const getLake = (id) => LAKES.find((l) => l.id === id) || LAKES.find((l) => l.id === DEFAULT_LAKE);

  /** Full engine config for a lake: base FISHING_CONFIG + the lake's overrides. */
  function lakeConfig(id) {
    const lake = getLake(id);
    const cfg = merge(P.FISHING_CONFIG, lake.config);
    cfg.lake = { id: lake.id, name: lake.name, nameEn: lake.nameEn };
    return cfg;
  }

  P.LAKES = LAKES;
  P.DEFAULT_LAKE = DEFAULT_LAKE;
  P.getLake = getLake;
  P.lakeConfig = lakeConfig;
})();
