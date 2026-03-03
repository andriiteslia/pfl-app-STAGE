/* ============================================
   PFL App — Configuration
   API URLs, Sheet IDs, app settings
   ============================================ */

const CONFIG = {
  // ---- API ----
  API_URL: 'https://script.google.com/macros/s/AKfycbyCPOHRIiJSqh-0xRVPWnJBPUuj0mtTcjUCRHa1ioT8aKuFO7TKB8Wd1cNr41RxL4gQDQ/exec',

  // ---- Cache Settings ----
  CACHE_TTL_MS: 3 * 60 * 1000, // 3 minutes
  CACHE_VERSION_KEY: '__pfl_cache_version_v2',

  // ---- Google Sheets: Leaderboard ----
  LEADERBOARD: {
    SHEET_ID: '1xUnEaAtgj5rE87LBPfQJeydXj-wI_D4JzwNjwadusao',
    RESULTS_SHEET: 'LeaderboardResults',
    RESULTS_RANGE: 'A1:D100',
    CONFIG_SHEET: 'CONFIG_LB',
    CONFIG_RANGE: 'A1:B50',
  },

  // ---- Google Sheets: Arena ----
  ARENA: {
    CONFIG_SHEET_ID: '1iYaFcFvCAN0R8Wr2cc6grMCVQG9ggFQ3HuEggvFM3xc',
    CONFIG_SHEET_NAME: 'CONFIG_LFR_2026',
    CONFIG_RANGE: 'A1:AA50',
  },

  // ---- Google Sheets: Styles ----
  STYLES: {
    SHEET_ID: '1iYaFcFvCAN0R8Wr2cc6grMCVQG9ggFQ3HuEggvFM3xc',
    SHEET_NAME: 'STYLES',
    RANGE: 'A1:B100',
  },

  // ---- Google Sheets: Fests (2025) ----
  FESTS_2025: {
    // Perch Cup 2025
    PERCH_CUP: {
      SHEET_ID: '', // default sheet
      RESULTS_RANGE: 'A1:I18',
      TOURS_RANGE: 'A1:I18',
    },
    // Perch Cup R1 2025
    PERCH_CUP_R1: {
      SHEET_ID: '1BbRlP6S2OejgiCkQKdoTRqm-przP_qz1Ge17BTmnIbs',
      SHEET_NAME: 'ResultsPM1',
      RANGE: 'A1:I100',
    },
    // Predator Cup 2025
    PREDATOR_CUP: {
      PERSONAL: {
        SHEET_ID: '15AOf0iB_sND2KjXqnbVJCVRhVj-b5JE8EVjl9CtFxv4',
        SHEET_NAME: 'ResultsPR25',
        RANGE: 'O1:R18',
      },
      TEAM: {
        SHEET_ID: '15AOf0iB_sND2KjXqnbVJCVRhVj-b5JE8EVjl9CtFxv4',
        SHEET_NAME: 'ResultsPR25',
        RANGE: 'A1:F18',
      },
    },
  },

  // ---- Telegram ----
  TELEGRAM: {
    HAPTIC_ENABLED: true,
  },

  // ---- UI Defaults ----
  UI: {
    DEFAULT_TAB: 'fests',
    ANIMATION_DURATION: 200,
  },
};

// Freeze config to prevent accidental modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.LEADERBOARD);
Object.freeze(CONFIG.ARENA);
Object.freeze(CONFIG.STYLES);
Object.freeze(CONFIG.FESTS_2025);
Object.freeze(CONFIG.TELEGRAM);
Object.freeze(CONFIG.UI);

export default CONFIG;
