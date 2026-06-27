// Instrument cluster in the hero: a live-ish gauge, odometer and indicator lights.
(function () {
  'use strict';

  var needle = document.getElementById('dash-needle');
  var arc = document.getElementById('dash-value');
  var ticks = document.getElementById('dash-ticks');
  var rpsEl = document.getElementById('dash-rps');
  var odo = document.getElementById('dash-odo');
  var lcd = document.getElementById('dash-lcd');
  if (!needle || !odo) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MAX = 600;                  // gauge full scale, requests/sec
  var AVG = 30000000 / 86400;     // ~30M requests a day ≈ 347/sec
  var SWEEP = 240;                // degrees, -120 → +120

  // ---- Draw tick marks and labels ----
  var NS = 'http://www.w3.org/2000/svg';
  for (var v = 0; v <= MAX; v += 25) {
    var a = (-SWEEP / 2 + SWEEP * v / MAX) * Math.PI / 180;
    var major = v % 100 === 0;
    var r1 = major ? 72 : 77, r2 = 82;
    var line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', 110 + r1 * Math.sin(a));
    line.setAttribute('y1', 110 - r1 * Math.cos(a));
    line.setAttribute('x2', 110 + r2 * Math.sin(a));
    line.setAttribute('y2', 110 - r2 * Math.cos(a));
    if (major) line.setAttribute('class', 'major');
    ticks.appendChild(line);
    if (major) {
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', 110 + 60 * Math.sin(a));
      t.setAttribute('y', 110 - 60 * Math.cos(a) + 3);
      t.textContent = v / 100;
      ticks.appendChild(t);
    }
  }

  // ---- Gauge ----
  function setGauge(value) {
    var pct = Math.max(0, Math.min(1, value / MAX));
    needle.style.transform = 'rotate(' + (-SWEEP / 2 + SWEEP * pct) + 'deg)';
    arc.style.strokeDashoffset = String(100 - pct * 100);
    rpsEl.textContent = Math.round(value);
  }

  setGauge(0);
  var current = AVG;
  function wobble() {
    // drift around the daily average like real traffic
    current += (Math.random() - 0.5) * 60 + (AVG - current) * 0.25;
    setGauge(current);
  }

  // ---- Odometer: estimated requests since midnight in Austin ----
  function secondsSinceMidnightCT() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(new Date());
      var get = function (type) { return +parts.filter(function (p) { return p.type === type; })[0].value; };
      return (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
    } catch (e) {
      var d = new Date();
      return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    }
  }
  function tickOdo() {
    var n = Math.floor(secondsSinceMidnightCT() * AVG);
    odo.textContent = n.toLocaleString('en-US').padStart(10, '0');
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
    void lcd.offsetWidth; // restart the flash animation
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

  // ---- Start when the cluster is on screen: needle sweep, then idle ----
  var started = false;
  function start() {
    if (started) return;
    started = true;
    tickOdo();
    setInterval(tickOdo, 1000);
    if (reduceMotion) { setGauge(AVG); return; }

    // classic ignition sweep: full scale and back
    setGauge(MAX);
    setTimeout(function () {
      setGauge(AVG);
      setInterval(wobble, 900);
      autoTimer = setInterval(autoCycle, 2600);
    }, 900);
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { start(); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(odo);
  } else {
    start();
  }
})();
