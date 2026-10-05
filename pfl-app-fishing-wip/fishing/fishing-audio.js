/* PFL Fishing — sounds from files (assets/fishing/sfx/).
 *
 *   cast.mp3    — rod whoosh on the cast (one shot)
 *   splash.mp3  — lure hits the water (one shot; quieter for far casts)
 *   nature.mp3  — ambience: water + birds (LOOP, 90 s)
 *   drag.mp3    — reel drag ratchet (LOOP, 15 s); plays when the fish pulls
 *                 hard: sharp side dash, run away, yellow/red tension
 * A missing file is simply silent — nothing breaks.
 *
 * Files are prepared: loops at the same loudness (-18 LUFS), one-shots
 * peak-normalized. Loops are built as "loop body + first 0.5 s again", so the
 * loop region [start, start + length] is seamless whatever leading padding
 * the mp3 decoder adds.
 *
 * Browsers (and Telegram's WebView) only allow audio after a user gesture,
 * so nothing plays until the first tap — unlock() is called from any tap.
 */
(function () {
  'use strict';

  const SFX = {
    path: './assets/fishing/sfx/',
    files: { cast: 'cast.mp3', splash: 'splash.mp3', nature: 'nature.mp3', drag: 'drag.mp3' },
    master: 1,
    fadeS: 0.25,                      // mute / unmute fade
    // nature ≈ 50% of the other sounds
    // drag.mp3 is mastered hot (~-15 LUFS) and plays at full volume; nature is a quiet bed
    volume: { cast: 1.0, splashNear: 1.0, splashFar: 0.55, nature: 0.2, drag: 1.0 },
    loops: { nature: { start: 0.25, length: 90 }, drag: { start: 0.25, length: 15 } },
    natureFadeInS: 2,
    drag: {
      min: 0.05,                      // intensity below this: silent
      rate: [0.9, 1.15],              // playback speed: light → hard pull
      level: [0.8, 1],                // volume: light → hard pull (always clearly audible)
      attackS: 0.04, releaseS: 0.12,  // how quickly it starts / stops
      holdS: 0.35,                    // once started, plays at least this long
      hookBurstS: 0.7,                // sharp drag scream right on the hookset
    },
  };

  function createFishingAudio() {
    let ctx = null, master = null;
    let enabled = true, hidden = false;
    const buffers = {};               // name → AudioBuffer (missing file → undefined)
    let natureSrc = null;
    let dragSrc = null, dragGain = null;
    let dragOn = false, dragLevel = 0, dragK = 0, dragUntil = 0, burstUntil = 0;

    function ensureCtx() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? SFX.master : 0;
      master.connect(ctx.destination);
      Object.entries(SFX.files).forEach(([name, file]) => load(name, SFX.path + file));
      return ctx;
    }

    function load(name, url) {
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
        .then((buf) => {
          buffers[name] = buf;
          if (name === 'nature') startNature();
          if (name === 'drag') startDragLoop();
        })
        .catch(() => { /* no file → silent */ });
    }

    // ---- unlock / enable ------------------------------------------------------
    function unlock() {
      if (!enabled || !ensureCtx()) return;
      if (ctx.state !== 'running' && !hidden) {
        ctx.resume().catch(() => {});
        // iOS: playing a (silent) buffer inside the gesture unlocks output
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, 22050);
        s.connect(ctx.destination);
        s.start(0);
      }
    }

    function setEnabled(on) {
      enabled = on;
      if (!ctx) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(on ? SFX.master : 0, now + SFX.fadeS);
      if (on) { if (!hidden) ctx.resume().catch(() => {}); }
      else setTimeout(() => { if (!enabled && ctx.state === 'running') ctx.suspend().catch(() => {}); }, SFX.fadeS * 1000 + 50);
    }

    function suspend() { hidden = true; if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
    function resume() { hidden = false; if (ctx && enabled) ctx.resume().catch(() => {}); }
    const live = () => ctx && enabled && !hidden && ctx.state === 'running';

    // ---- one-shots --------------------------------------------------------------
    function play(name, vol, rate = 1) {
      const buf = buffers[name];
      if (!buf || !live()) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(g); g.connect(master);
      src.start();
    }
    // power 0..1 — a harder cast is a bit louder
    function cast(power) {
      play('cast', SFX.volume.cast * (0.7 + 0.3 * power), 0.95 + Math.random() * 0.1);
    }
    // quieter far away
    function splash(distanceM) {
      const k = Math.min(1, distanceM / 70);
      const v = SFX.volume.splashNear + (SFX.volume.splashFar - SFX.volume.splashNear) * k;
      play('splash', v, 0.95 + Math.random() * 0.1);
    }

    // ---- loops ------------------------------------------------------------------
    function loopSource(name) {
      const src = ctx.createBufferSource();
      const buf = buffers[name];
      const L = SFX.loops[name];
      src.buffer = buf;
      src.loop = true;
      let offset = 0;
      if (L && buf.duration >= L.start + L.length) {
        src.loopStart = L.start;
        src.loopEnd = L.start + L.length;
        offset = L.start + Math.random() * L.length;   // start somewhere random
      }
      return { src, offset };
    }

    function startNature() {
      if (natureSrc || !buffers.nature) return;
      const l = loopSource('nature');
      natureSrc = l.src;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(SFX.volume.nature, ctx.currentTime + SFX.natureFadeInS);
      natureSrc.connect(g); g.connect(master);
      natureSrc.start(0, l.offset);
    }

    function startDragLoop() {
      if (dragSrc || !buffers.drag) return;
      const l = loopSource('drag');
      dragSrc = l.src;
      dragGain = ctx.createGain();
      dragGain.gain.value = 0;        // silent until the fish pulls hard
      dragSrc.connect(dragGain); dragGain.connect(master);
      dragSrc.start(0, l.offset);
    }

    // Every frame: how hard the drag is working, 0..1 (decided by the game).
    function drag(intensity) {
      if (!dragSrc || !ctx) return;
      const D = SFX.drag;
      const t = ctx.currentTime;
      if (t < burstUntil) intensity = 1;                         // hookset burst
      let on = intensity > D.min;
      if (on && !dragOn) dragUntil = t + D.holdS;                 // short blips last a bit
      if (!on && dragOn && t < dragUntil) { on = true; intensity = dragK; }
      const k = on ? Math.min(1, intensity) : 0;
      const level = on ? SFX.volume.drag * (D.level[0] + (D.level[1] - D.level[0]) * k) : 0;
      if (on === dragOn && Math.abs(level - dragLevel) < 0.03) return; // don't reschedule every frame
      dragGain.gain.cancelScheduledValues(t);
      dragGain.gain.setTargetAtTime(level, t, on ? D.attackS : D.releaseS);
      if (on) dragSrc.playbackRate.setTargetAtTime(D.rate[0] + (D.rate[1] - D.rate[0]) * k, t, 0.15);
      dragOn = on; dragLevel = level; dragK = k;
    }

    // Hookset: the drag always screams for a moment, at full speed.
    function hookBurst() {
      if (!dragSrc || !live()) return;
      const t = ctx.currentTime;
      burstUntil = t + SFX.drag.hookBurstS;
      dragOn = true; dragLevel = SFX.volume.drag; dragK = 1; dragUntil = burstUntil;
      dragGain.gain.cancelScheduledValues(t);
      dragGain.gain.setValueAtTime(dragGain.gain.value, t);
      dragGain.gain.linearRampToValueAtTime(SFX.volume.drag, t + 0.015);   // sharp start
      dragSrc.playbackRate.cancelScheduledValues(t);
      dragSrc.playbackRate.setValueAtTime(SFX.drag.rate[1], t);
    }

    return { unlock, setEnabled, suspend, resume, cast, splash, drag, hookBurst, config: SFX };
  }

  window.PFLFishing = window.PFLFishing || {};
  window.PFLFishing.createFishingAudio = createFishingAudio;
})();
