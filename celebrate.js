/* pepe.coffee – kleiner Erfolgs-Effekt: Ton + kurzes Konfetti.
   Keine Dateien, keine Inline-Styles, kein Fremdcode (CSP-sicher).
   Aufruf: window.pepeCelebrate();  (z. B. direkt wenn "Sent!" erscheint) */
(function () {
  'use strict';

  var audioCtx = null;
  var lastRun = 0;

  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  // Drei helle, kurze Töne (E5 – A5 – E6), per Web Audio erzeugt.
  function playSound() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t0 = audioCtx.currentTime;
      [[659.25, 0], [880, 0.09], [1318.5, 0.18]].forEach(function (n) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        var start = t0 + n[1];
        osc.type = 'sine';
        osc.frequency.value = n[0];
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.32);
      });
    } catch (e) { /* Ton ist nur Zugabe, nie ein Fehler */ }
  }

  var COLORS = ['#2fbf71', '#7ae582', '#ffd23f', '#ffffff', '#1b9e5a', '#f4a259'];

  function confetti() {
    try {
      var canvas = document.createElement('canvas');
      canvas.className = 'pepe-confetti';
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = window.innerWidth || 400;
      var h = window.innerHeight || 400;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      var c = canvas.getContext('2d');
      if (!c) return;
      c.scale(dpr, dpr);
      document.body.appendChild(canvas);

      var parts = [];
      var n = 70;
      for (var i = 0; i < n; i++) {
        var angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5; // Fächer nach oben
        var speed = 6 + Math.random() * 7;
        parts.push({
          x: w / 2, y: h * 0.62,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 4 + Math.random() * 4,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.4,
          color: COLORS[(Math.random() * COLORS.length) | 0]
        });
      }

      var started = null;
      var DURATION = 1600;
      function frame(ts) {
        if (started === null) started = ts;
        var p = (ts - started) / DURATION;
        c.clearRect(0, 0, w, h);
        if (p >= 1) { canvas.remove(); return; }
        c.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
        for (var i = 0; i < parts.length; i++) {
          var q = parts[i];
          q.vy += 0.28;      // Schwerkraft
          q.vx *= 0.99;
          q.x += q.vx;
          q.y += q.vy;
          q.rot += q.vr;
          c.save();
          c.translate(q.x, q.y);
          c.rotate(q.rot);
          c.fillStyle = q.color;
          c.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
          c.restore();
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    } catch (e) { /* Konfetti ist nur Zugabe */ }
  }

  window.pepeCelebrate = function () {
    var now = Date.now();
    if (now - lastRun < 2000) return; // nie doppelt auslösen
    lastRun = now;
    playSound();
    if (!reducedMotion()) confetti();
  };
})();
