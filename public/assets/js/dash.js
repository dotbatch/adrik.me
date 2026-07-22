// Instrument cluster in About: an arc gauge, a running counter and indicator lights.
(function () {
  'use strict';

  var arc = document.getElementById('dash-value');
  var dot = document.getElementById('dash-dot');
  var rpsEl = document.getElementById('dash-rps');
  var odo = document.getElementById('dash-odo');
  var lcd = document.getElementById('dash-lcd');
  var timeEl = document.getElementById('dash-time');
  if (!arc || !odo) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MAX = 600;                  // gauge full scale, requests/sec
  var AVG = 30000000 / 86400;     // ~30M requests a day ≈ 347/sec
  var SWEEP = 240;                // degrees, -120 → +120
  var CX = 110, CY = 110, R = 90; // arc geometry from the SVG path

  // ---- Gauge: ease the shown value toward a target every frame ----
  var shown = 0, target = 0;

  function draw(value) {
    var pct = Math.max(0, Math.min(1, value / MAX));
    var a = (-SWEEP / 2 + SWEEP * pct) * Math.PI / 180;
    arc.style.strokeDashoffset = String(100 - pct * 100);
    dot.setAttribute('cx', (CX + R * Math.sin(a)).toFixed(2));
    dot.setAttribute('cy', (CY - R * Math.cos(a)).toFixed(2));
    rpsEl.textContent = Math.round(value);
  }

  function animate() {
    shown += (target - shown) * 0.06;
    draw(shown);
    if (Math.abs(target - shown) > 0.3) requestAnimationFrame(animate);
    else { shown = target; draw(shown); animating = false; }
  }
  var animating = false;
  function setTarget(v) {
    target = v;
    if (reduceMotion) { shown = v; draw(v); return; }
    if (!animating) { animating = true; requestAnimationFrame(animate); }
  }

  draw(0);
  tick();
  setInterval(tick, 1000);

  function wobble() {
    // drift around the daily average like real traffic
    setTarget(Math.max(240, Math.min(460, target + (Math.random() - 0.5) * 70 + (AVG - target) * 0.3)));
  }

  // ---- Counter: estimated requests since midnight in Austin ----
  function austinNow() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(new Date());
      var get = function (type) { return +parts.filter(function (p) { return p.type === type; })[0].value; };
      return { h: get('hour') % 24, m: get('minute'), s: get('second') };
    } catch (e) {
      var d = new Date();
      return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() };
    }
  }
  function tick() {
    var t = austinNow();
    odo.textContent = Math.floor((t.h * 3600 + t.m * 60 + t.s) * AVG).toLocaleString('en-US');
    if (timeEl) {
      var h12 = t.h % 12 || 12;
      timeEl.textContent = h12 + ':' + String(t.m).padStart(2, '0') + (t.h < 12 ? ' AM' : ' PM');
    }
  }

  // ---- Indicator lights ----
  var lights = Array.prototype.slice.call(document.querySelectorAll('.dash__lights button'));
  var idle = lcd.textContent;
  var autoIndex = -1, autoTimer = null, userTookOver = false;

  function show(btn) {
    lights.forEach(function (b) {
      b.classList.toggle('is-on', b === btn);
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    lcd.textContent = btn ? btn.getAttribute('data-msg') : idle;
    lcd.classList.remove('flash');
    void lcd.offsetWidth; // restart the fade
    lcd.classList.add('flash');
  }

  lights.forEach(function (b) {
    b.addEventListener('click', function () {
      userTookOver = true;
      clearInterval(autoTimer);
      show(b.classList.contains('is-on') ? null : b);
    });
    b.addEventListener('mouseenter', function () {
      if (!userTookOver) { clearInterval(autoTimer); show(b); }
    });
  });

  function autoCycle() {
    autoIndex = (autoIndex + 1) % lights.length;
    show(lights[autoIndex]);
  }

  // ---- Start when the cluster is on screen ----
  var started = false;
  function start() {
    if (started) return;
    started = true;
    setTarget(AVG);
    if (reduceMotion) return;
    setInterval(wobble, 1400);
    autoTimer = setInterval(autoCycle, 3200);
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { start(); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(arc.ownerSVGElement);
  } else {
    start();
  }
})();
