(function () {
  'use strict';

  var root = document.documentElement;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Theme toggle (remembers the visitor's choice) ----
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  } catch (e) { /* storage unavailable */ }

  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var current = root.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      var next = current === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
    });
  }

  // ---- Nav background on scroll ----
  var nav = document.querySelector('.nav');
  function onScroll() { nav.classList.toggle('is-scrolled', window.scrollY > 24); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- Typing rotator ----
  var rotator = document.querySelector('.rotator');
  var phrases = [
    'a technical lead manager.',
    'a car guy.',
    'a cyclist.',
    'a hooper.',
    'a tech nerd.',
    'a movie buff.',
    'a family man.',
    'here to help.'
  ];

  if (rotator && !reduceMotion) {
    var i = 0, chars = phrases[0].length, deleting = true;
    var holdUntil = Date.now() + 2200;

    (function tick() {
      var phrase = phrases[i];
      var delay = deleting ? 35 : 70;

      if (Date.now() < holdUntil) {
        delay = 120;
      } else if (deleting) {
        chars--;
        if (chars <= 0) { deleting = false; i = (i + 1) % phrases.length; }
      } else {
        chars++;
        if (chars >= phrases[i].length) { deleting = true; holdUntil = Date.now() + 2000; }
      }

      rotator.textContent = phrases[i].slice(0, Math.max(chars, 0)) || '​';
      setTimeout(tick, delay);
    })();
  }

  // ---- Reveal on scroll ----
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // ---- Active nav link ----
  var links = document.querySelectorAll('.nav__links a');
  var sections = Array.prototype.map.call(links, function (a) {
    return document.querySelector(a.getAttribute('href'));
  });
  if ('IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { if (s) spy.observe(s); });
  }

  // ---- Local Austin clock in the status pill ----
  var clock = document.querySelector('.clock');
  function tickClock() {
    try {
      clock.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
    } catch (e) { clock.parentNode.removeChild(clock); }
  }
  if (clock) { tickClock(); setInterval(tickClock, 30000); }

  // ---- Pointer spotlight on hero + cards ----
  if (window.matchMedia('(hover: hover)').matches && !reduceMotion) {
    document.querySelectorAll('.hero, .card').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  // ---- Party mode: Konami code ----
  window.adrikParty = function () {
    if (reduceMotion) return;
    var emoji = ['🏀', '🚗', '🚴', '💻', '🎬', '❤️', '🏎️', '⚡'];
    var layer = document.createElement('div');
    layer.className = 'party';
    layer.setAttribute('aria-hidden', 'true');
    for (var n = 0; n < 60; n++) {
      var s = document.createElement('span');
      s.textContent = emoji[n % emoji.length];
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDelay = Math.random() * 1.2 + 's';
      s.style.animationDuration = 2.2 + Math.random() * 1.8 + 's';
      s.style.fontSize = 18 + Math.random() * 22 + 'px';
      layer.appendChild(s);
    }
    document.body.appendChild(layer);
    root.classList.add('is-party');
    setTimeout(function () { layer.remove(); root.classList.remove('is-party'); }, 4500);
  };

  var konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var kpos = 0;
  document.addEventListener('keydown', function (e) {
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    kpos = key === konami[kpos] ? kpos + 1 : (key === konami[0] ? 1 : 0);
    if (kpos === konami.length) { kpos = 0; window.adrikParty(); }
  });

  // ---- Hello, fellow dev ----
  if (window.console && console.log) {
    console.log('%c ag_ %c Hey, you opened the console. My kind of person.',
      'background:#ff6a2b;color:#0b0c0f;font-weight:700;padding:4px 6px;border-radius:4px',
      'color:inherit;padding:4px');
    console.log('Try ↑↑↓↓←→←→BA on the page. → https://www.linkedin.com/in/adrik-grigorian/');
  }

  // ---- Footer year ----
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
