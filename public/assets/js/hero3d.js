// 3D hero: a giant "ADRIK" surrounded by floating, clickable hobbies.
// Built with three.js primitives only, no model files to download.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json';

const hero = document.querySelector('.hero');
const canvas = document.getElementById('hero-canvas');
const toast = document.getElementById('hero-toast');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = matchMedia('(pointer: coarse)').matches;

// What each hobby says when you click it
const MESSAGES = {
  car: '🚗  Cars: lifelong car guy, and the software inside them is my day job',
  basketball: '🏀  Basketball: pickup runs, playoff nights, always a good teammate',
  bike: '🚴  Biking: two wheels, no notifications, head cleared',
  wheel: '🛞  Built for the long haul: 13+ years at General Motors',
  heart: '❤️  Family: the center of everything',
  code: '💻  Tech: always tinkering, lately with a lot of AI',
  film: '🎬  Movies: blockbusters, thrillers and shameless rewatches',
  plus: '🤝  Helping others: mentoring, assists, and the "quick question" that never is',
  letter: '👋  That\'s me. Keep clicking, the letters like it'
};

// Bright, iridescent normal-shaded look (same material on everything)
const material = new THREE.MeshNormalMaterial();

// ---------------------------------------------------------------------------
// Little builders for each hobby, all from primitive shapes
// ---------------------------------------------------------------------------
function mesh(geometry) { return new THREE.Mesh(geometry, material); }

// cylinder stretched between two points (bike frames, spokes)
function bar(a, b, radius) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const m = mesh(new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 12));
  m.position.copy(from).lerp(to, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return m;
}

function makeCar() {
  const g = new THREE.Group();
  const body = mesh(new RoundedBoxGeometry(1.6, 0.42, 0.78, 4, 0.14));
  const cabin = mesh(new RoundedBoxGeometry(0.85, 0.36, 0.66, 4, 0.14));
  cabin.position.set(-0.08, 0.34, 0);
  g.add(body, cabin);
  for (const [x, z] of [[0.5, 0.4], [-0.5, 0.4], [0.5, -0.4], [-0.5, -0.4]]) {
    const w = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 24));
    w.rotation.x = Math.PI / 2;
    w.position.set(x, -0.22, z);
    g.add(w);
  }
  return g;
}

function makeBasketball() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.62, 40, 28)));
  const seam = new THREE.TorusGeometry(0.625, 0.022, 8, 64);
  const a = mesh(seam);
  const b = mesh(seam); b.rotation.y = Math.PI / 2;
  const c = mesh(seam); c.rotation.x = Math.PI / 2;
  g.add(a, b, c);
  return g;
}

function makeBike() {
  const g = new THREE.Group();
  const wheel = new THREE.TorusGeometry(0.36, 0.045, 10, 40);
  const back = mesh(wheel); back.position.x = -0.62;
  const front = mesh(wheel); front.position.x = 0.62;
  g.add(back, front);
  const r = 0.035;
  const seat = [-0.18, 0.42, 0], crank = [0, 0, 0], head = [0.42, 0.42, 0];
  g.add(
    bar([-0.62, 0, 0], crank, r), bar(crank, seat, r), bar(seat, [-0.62, 0, 0], r),
    bar(seat, head, r), bar(crank, head, r), bar(head, [0.62, 0, 0], r),
    bar([0.42, 0.42, 0], [0.38, 0.58, 0], r),
    bar([0.38, 0.58, -0.18], [0.38, 0.58, 0.18], r)
  );
  const saddle = mesh(new RoundedBoxGeometry(0.26, 0.06, 0.12, 2, 0.03));
  saddle.position.set(-0.2, 0.48, 0);
  g.add(saddle);
  return g;
}

function makeWheel() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(0.5, 0.17, 16, 48)));
  const hub = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 20));
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(bar([0, 0, 0], [Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0], 0.04));
  }
  return g;
}

function makeHeart() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.2, -0.32, -0.62, -0.1, -0.62, 0.2);
  s.bezierCurveTo(-0.62, 0.48, -0.3, 0.62, 0, 0.36);
  s.bezierCurveTo(0.3, 0.62, 0.62, 0.48, 0.62, 0.2);
  s.bezierCurveTo(0.62, -0.1, 0.2, -0.32, 0, -0.5);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.22, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 8, curveSegments: 24
  });
  geo.center();
  const g = new THREE.Group();
  g.add(mesh(geo));
  return g;
}

function makeFilm() {
  const g = new THREE.Group();
  const board = mesh(new RoundedBoxGeometry(1, 0.66, 0.1, 3, 0.04));
  const clap = mesh(new RoundedBoxGeometry(1, 0.16, 0.1, 3, 0.04));
  clap.position.set(-0.05, 0.47, 0);
  clap.rotation.z = 0.22;
  g.add(board, clap);
  return g;
}

function makePlus() {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(0.95, 0.3, 0.3, 4, 0.12)));
  g.add(mesh(new RoundedBoxGeometry(0.3, 0.95, 0.3, 4, 0.12)));
  return g;
}

function makeText(font, text, size) {
  const geo = new TextGeometry(text, {
    font, size, height: size * 0.32, curveSegments: 10,
    bevelEnabled: true, bevelThickness: size * 0.06, bevelSize: size * 0.045, bevelSegments: 6
  });
  geo.center();
  const g = new THREE.Group();
  g.add(mesh(geo));
  return g;
}

// Fillers, like confetti in 3D
const FILLERS = [
  () => new THREE.TorusGeometry(0.28, 0.12, 16, 40),
  () => new RoundedBoxGeometry(0.42, 0.42, 0.42, 3, 0.08),
  () => new THREE.SphereGeometry(0.22, 24, 16),
  () => new THREE.CapsuleGeometry(0.13, 0.3, 8, 16),
  () => new THREE.OctahedronGeometry(0.26),
  () => new THREE.ConeGeometry(0.22, 0.42, 24)
];

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
async function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 18);

  const world = new THREE.Group();
  scene.add(world);

  const font = await new FontLoader().loadAsync(FONT_URL);

  const items = [];   // everything that floats and reacts to clicks
  function add(group, kind, pos, opts = {}) {
    group.position.set(...pos);
    group.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.4);
    group.traverse((o) => { o.userData.item = group; });
    group.userData = {
      ...group.userData,
      kind,
      base: new THREE.Vector3(...pos),
      phase: Math.random() * Math.PI * 2,
      bob: opts.bob ?? 0.18,
      spin: opts.spin ?? new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 0),
      hopAt: -10,
      hopHeight: opts.hopHeight ?? 1,
      boost: 0,
      scale: opts.scale ?? 1,
      hover: 0
    };
    group.scale.setScalar(group.userData.scale);
    world.add(group);
    items.push(group);
    return group;
  }

  // Big tilted name, one mesh per letter so each can jump on its own
  const name = new THREE.Group();
  const LETTER_SIZE = 2;
  const letters = 'ADRIK'.split('').map((ch) => {
    const g = makeText(font, ch, LETTER_SIZE);
    const box = new THREE.Box3().setFromObject(g);
    return { g, w: box.max.x - box.min.x };
  });
  const gap = 0.18;
  const total = letters.reduce((sum, l) => sum + l.w, 0) + gap * (letters.length - 1);
  let x = -total / 2;
  for (const l of letters) {
    const lx = x + l.w / 2;
    x += l.w + gap;
    l.g.rotation.set(0, 0, 0);
    add(l.g, 'letter', [lx, 0, 0], { bob: 0.06, spin: new THREE.Vector3(0, 0, 0), hopHeight: 0.9 });
    l.g.rotation.set(0, 0, 0);
    world.remove(l.g);
    name.add(l.g);
  }
  name.rotation.set(-0.18, 0.32, 0.1);
  world.add(name);

  // Hobbies placed around the name (x, y, z)
  const layout = {
    car: [-5.6, 2.6, -1.2],
    basketball: [5.2, 2.5, 0.2],
    bike: [4.6, -2.7, -0.4],
    wheel: [-7.4, 0.6, -2.4],
    heart: [2.2, -3.3, 0.9],
    code: [-1.4, 3.5, -1.6],
    film: [6.9, 0.1, -2.6],
    plus: [7.6, -2.9, -1.8]
  };
  const hobbyGroups = {
    car: add(makeCar(), 'car', layout.car),
    basketball: add(makeBasketball(), 'basketball', layout.basketball),
    bike: add(makeBike(), 'bike', layout.bike, { scale: 1.2 }),
    wheel: add(makeWheel(), 'wheel', layout.wheel),
    heart: add(makeHeart(), 'heart', layout.heart),
    code: add(makeText(font, '</>', 0.7), 'code', layout.code),
    film: add(makeFilm(), 'film', layout.film),
    plus: add(makePlus(), 'plus', layout.plus)
  };

  // Scatter fillers in a loose shell, keeping the middle clear for the name
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    let p;
    do {
      p = [(rand() - 0.5) * 18, (rand() - 0.5) * 10, (rand() - 0.5) * 8 - 1.5];
    } while ((Math.abs(p[0]) < 5.5 && Math.abs(p[1]) < 1.8 && p[2] > -3) || (p[0] < 0 && p[1] < -1.6));
    // (second check keeps the bottom-left clear for the overlay text)
    add(new THREE.Group().add(mesh(FILLERS[i % FILLERS.length]())), 'filler', p, {
      scale: 0.6 + rand() * 0.9, bob: 0.25, hopHeight: 0.8
    });
  }

  // ---- Responsive framing ----
  const base = {};
  for (const g of items) base[g.uuid] = g.userData.base.clone();

  function resize() {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    // On tall screens pull things in sideways and spread them vertically
    const portrait = camera.aspect < 1;
    for (const g of items) {
      if (g.userData.kind === 'letter') continue;
      const b = base[g.uuid];
      g.userData.base.set(portrait ? b.x * 0.5 : b.x, portrait ? b.y * 1.7 : b.y, b.z);
    }

    // Fit the name to ~85% of the width (and keep the whole scene in view)
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const fitWidth = (total + 1) / (0.85 * 2 * Math.tan(halfFov) * camera.aspect);
    const fitHeight = 9 / (2 * Math.tan(halfFov));
    const dist = Math.max(fitWidth, portrait ? 12 : fitHeight);
    camera.position.setLength(dist);
    // shift the scene up so the overlay text has room at the bottom
    // (on phones the overlay covers about half the screen)
    world.position.y = portrait ? 2 * dist * Math.tan(halfFov) * 0.2 : 0.9;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(hero);
  resize();

  // ---- Drag to orbit (mouse/trackpad only, so touch scrolling still works) ----
  let controls = null;
  if (!coarsePointer) {
    controls = new OrbitControls(camera, canvas);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.55;
    controls.minPolarAngle = Math.PI / 2 - 0.7;
    controls.maxPolarAngle = Math.PI / 2 + 0.7;
    controls.minAzimuthAngle = -1.1;
    controls.maxAzimuthAngle = 1.1;
  }

  // ---- Click / tap things ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = null;
  let toastTimer = 0;

  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(world, true)[0];
    return hit ? hit.object.userData.item : null;
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  let clickCount = 0;
  function poke(item, now) {
    item.userData.hopAt = now;
    item.userData.boost = 9;
    const msg = MESSAGES[item.userData.kind];
    if (msg) showToast(item.userData.kind === 'letter' && ++clickCount > 4 ? '🎉  OK OK, you found the party. ↑↑↓↓←→←→BA' : msg);
  }

  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const item = pick(e);
    if (item) poke(item, clock.elapsedTime);
  });
  if (!coarsePointer) {
    canvas.addEventListener('pointermove', (e) => {
      hovered = pick(e);
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
    });
    canvas.addEventListener('pointerleave', () => { hovered = null; });
  }

  // Konami code (main.js) makes everything jump at once
  window.addEventListener('adrik:party', () => {
    items.forEach((g, i) => setTimeout(() => poke(g, clock.elapsedTime), i * 25));
  });

  // ---- Pointer parallax for a little life even without dragging ----
  const parallax = new THREE.Vector2();
  if (!coarsePointer && !reduceMotion) {
    addEventListener('pointermove', (e) => {
      parallax.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
    });
  }

  // ---- Animate ----
  const clock = new THREE.Clock();
  const HOP = 0.7; // seconds
  const motion = reduceMotion ? 0 : 1;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    for (const g of items) {
      const u = g.userData;
      const since = t - u.hopAt;
      const hop = since < HOP ? Math.sin((since / HOP) * Math.PI) * u.hopHeight : 0;
      g.position.set(u.base.x, u.base.y + Math.sin(t * 0.9 + u.phase) * u.bob * motion + hop, u.base.z);

      u.boost *= 0.94;
      const spinBoost = 1 + u.boost;
      if (u.kind === 'letter') {
        // letters do a flip when poked and otherwise sit still
        g.rotation.y = since < HOP * 1.4 ? (since / (HOP * 1.4)) * Math.PI * 2 : 0;
      } else {
        g.rotation.x += u.spin.x * dt * spinBoost * motion + (u.boost > 0.1 ? dt * u.boost * 0.3 : 0);
        g.rotation.y += u.spin.y * dt * spinBoost * motion + (u.boost > 0.1 ? dt * u.boost * 0.5 : 0);
      }

      u.hover += ((hovered === g ? 1 : 0) - u.hover) * 0.15;
      g.scale.setScalar(u.scale * (1 + u.hover * 0.12));
    }

    // gentle idle sway + parallax
    world.rotation.y += ((Math.sin(t * 0.25) * 0.08 + parallax.x * 0.25) * motion - world.rotation.y) * 0.05;
    world.rotation.x += ((parallax.y * 0.15) * motion - world.rotation.x) * 0.05;

    if (controls) controls.update();
    renderer.render(scene, camera);
  }

  // Only render while the hero is on screen
  let running = false;
  function loop() { if (!running) return; frame(); requestAnimationFrame(loop); }
  new IntersectionObserver(([entry]) => {
    const visible = entry.isIntersecting;
    if (visible && !running) { running = true; clock.getDelta(); loop(); }
    if (!visible) running = false;
  }).observe(hero);

  hero.classList.add('is-3d');
}

init().catch((err) => {
  console.warn('3D hero disabled:', err);
  hero.classList.add('no-3d');
});
