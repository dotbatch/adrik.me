// adrik.me/drive: a small drivable world, inspired by bruno-simon.com.
// three.js for rendering, cannon-es for physics. Everything is built from
// primitive shapes in code, so there are no model files to load.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json';
const LINKEDIN = 'https://www.linkedin.com/in/adrik-grigorian/';

const COLORS = {
  sky: '#f7d9b4',
  ground: '#f1c08c',
  path: '#e9ad74',
  ink: '#2a1f17',
  paper: '#fff8ef',
  accent: '#ff6a2b',
  car: '#3a6df0',
  purple: '#7b61ff',
  teal: '#2ec4b6',
  pink: '#ff5f7e',
  leaf: '#7fb069',
  trunk: '#8a5a3b'
};

// Camera sits behind-right of the car at a fixed angle, so "forward" (-x) is up the screen
const CAM_OFFSET = new THREE.Vector3(11, 12, 5);
const FACE = Math.atan2(CAM_OFFSET.x, CAM_OFFSET.z); // rotation that makes a plane face the camera

// ---------------------------------------------------------------------------
// Renderer, scene, lights
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.sky, 38, 85);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight('#ffffff', COLORS.ground, 1.1));
const sun = new THREE.DirectionalLight('#fff3e0', 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(12, 26, 14);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  // pull back a bit on narrow screens so you can see where you're going
  camera.zoom = camera.aspect < 1 ? 0.7 : 1;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.defaultContactMaterial.friction = 0.35;
world.defaultContactMaterial.restitution = 0.15;

const groundMat = new CANNON.Material('ground');
const bouncyMat = new CANNON.Material('bouncy');
world.addContactMaterial(new CANNON.ContactMaterial(groundMat, bouncyMat, { friction: 0.4, restitution: 0.75 }));

const groundBody = new CANNON.Body({ mass: 0, material: groundMat });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Things whose mesh follows a physics body
const synced = [];
function sync(mesh, body) {
  scene.add(mesh);
  world.addBody(body);
  synced.push({ mesh, body });
  mesh.position.copy(body.position);
  mesh.quaternion.copy(body.quaternion);
}

function staticBody(shape, pos, rotY = 0, quat = null) {
  const b = new CANNON.Body({ mass: 0, material: groundMat });
  b.addShape(shape);
  b.position.set(...pos);
  if (quat) b.quaternion.copy(quat); else b.quaternion.setFromEuler(0, rotY, 0);
  world.addBody(b);
  return b;
}

// ---------------------------------------------------------------------------
// Materials + small helpers
// ---------------------------------------------------------------------------
const mats = {};
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  return (mats[key] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts }));
}
function shadowed(obj) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}
function box(w, h, d, color, r = 0.08) {
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), mat(color));
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Ground + paths
// ---------------------------------------------------------------------------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(COLORS.ground));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function pathStrip(x, z, w, d, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(COLORS.path));
  m.rotation.set(-Math.PI / 2, 0, rotY);
  m.position.set(x, 0.01, z);
  m.receiveShadow = true;
  scene.add(m);
}
pathStrip(-20, 0, 48, 5);     // main road heading "up"
pathStrip(-14, -16, 5, 30);   // side road to the court
pathStrip(-30, 14, 5, 26);    // side road to the ramp

// Invisible walls at the edge of the world
for (const [x, z, w, d] of [[0, -60, 140, 1], [0, 60, 140, 1], [-70, 0, 1, 120], [70, 0, 1, 120]]) {
  staticBody(new CANNON.Box(new CANNON.Vec3(w / 2, 3, d / 2)), [x, 3, z]);
}

// ---------------------------------------------------------------------------
// The car
// ---------------------------------------------------------------------------
const SPAWN = new CANNON.Vec3(4, 1.6, 0);

const chassisBody = new CANNON.Body({ mass: 150, angularDamping: 0.5, linearDamping: 0.05 });
chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(1.1, 0.3, 0.55)));
chassisBody.position.copy(SPAWN);
chassisBody.allowSleep = false;

// forward = -x, up = y, right = z (matches the cannon-es vehicle demo)
const vehicle = new CANNON.RaycastVehicle({ chassisBody, indexRightAxis: 2, indexUpAxis: 1, indexForwardAxis: 0 });
const wheelOptions = {
  radius: 0.34,
  directionLocal: new CANNON.Vec3(0, -1, 0),
  suspensionStiffness: 32,
  suspensionRestLength: 0.32,
  frictionSlip: 1.6,
  dampingRelaxation: 2.3,
  dampingCompression: 4.4,
  maxSuspensionForce: 100000,
  rollInfluence: 0.02,
  axleLocal: new CANNON.Vec3(0, 0, 1),
  chassisConnectionPointLocal: new CANNON.Vec3(),
  maxSuspensionTravel: 0.3,
  customSlidingRotationalSpeed: -30,
  useCustomSlidingRotationalSpeed: true
};
const WHEEL_POS = [[-0.72, 0, 0.62], [-0.72, 0, -0.62], [0.72, 0, 0.62], [0.72, 0, -0.62]]; // FL FR RL RR
for (const [x, y, z] of WHEEL_POS) {
  wheelOptions.chassisConnectionPointLocal.set(x, y, z);
  vehicle.addWheel(wheelOptions);
}
vehicle.addToWorld(world);

// Car body visuals (front faces -x)
const carMesh = new THREE.Group();
const carBody = box(2.3, 0.5, 1.2, COLORS.car, 0.2);
carBody.position.y = 0.05;
const cabin = box(1.15, 0.46, 1.02, COLORS.paper, 0.18);
cabin.position.set(0.18, 0.5, 0);
const windshield = box(0.06, 0.34, 0.9, COLORS.ink, 0.03);
windshield.position.set(-0.4, 0.52, 0);
windshield.rotation.z = -0.35;
const stripe = box(2.32, 0.08, 0.3, COLORS.paper, 0.04);
stripe.position.set(0, 0.31, 0);
carMesh.add(carBody, cabin, windshield, stripe);
for (const z of [0.4, -0.4]) {
  const lamp = box(0.06, 0.12, 0.24, '#fff4c2', 0.03);
  lamp.material = new THREE.MeshStandardMaterial({ color: '#fff4c2', emissive: '#ffe08a', emissiveIntensity: 0.6 });
  lamp.position.set(-1.16, 0.1, z);
  const tail = box(0.06, 0.1, 0.24, '#ff3b3b', 0.03);
  tail.position.set(1.16, 0.12, z);
  carMesh.add(lamp, tail);
}
shadowed(carMesh);
scene.add(carMesh);

const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 24);
wheelGeo.rotateX(Math.PI / 2); // axle along z, like the physics wheels
const wheelMeshes = vehicle.wheelInfos.map(() => {
  const w = new THREE.Group();
  w.add(new THREE.Mesh(wheelGeo, mat(COLORS.ink)));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 12).rotateX(Math.PI / 2), mat('#d9d4cc'));
  w.add(hub);
  shadowed(w);
  scene.add(w);
  return w;
});

world.addEventListener('postStep', () => {
  for (let i = 0; i < vehicle.wheelInfos.length; i++) {
    vehicle.updateWheelTransform(i);
    const t = vehicle.wheelInfos[i].worldTransform;
    wheelMeshes[i].position.copy(t.position);
    wheelMeshes[i].quaternion.copy(t.quaternion);
  }
});

function resetCar(atSpawn = true) {
  const p = atSpawn ? SPAWN : chassisBody.position;
  chassisBody.position.set(p.x, atSpawn ? SPAWN.y : p.y + 1.5, p.z);
  // keep the heading when flipping back over, otherwise face forward
  const q = chassisBody.quaternion;
  const heading = atSpawn ? 0 : new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w), 'YXZ').y;
  chassisBody.quaternion.setFromEuler(0, heading, 0);
  chassisBody.velocity.setZero();
  chassisBody.angularVelocity.setZero();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const input = { forward: false, back: false, left: false, right: false, brake: false };
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake'
};
addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyR') resetCar();
  if (e.code === 'Enter' && activePad) activePad.action();
});
addEventListener('keyup', (e) => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });
addEventListener('blur', () => { for (const k in input) input[k] = false; });

document.querySelectorAll('.pad [data-key]').forEach((btn) => {
  const k = btn.dataset.key;
  const on = (e) => { e.preventDefault(); input[k] = true; btn.classList.add('is-down'); };
  const off = () => { input[k] = false; btn.classList.remove('is-down'); };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointerleave', off);
  btn.addEventListener('pointercancel', off);
});
document.getElementById('reset').addEventListener('click', () => { resetCar(); canvas.focus(); });

const MAX_FORCE = 900;
const MAX_STEER = 0.55;
const MAX_SPEED = 17;
let steer = 0;

function drive(dt) {
  const speed = chassisBody.velocity.length();
  let force = 0;
  if (input.forward && speed < MAX_SPEED) force = -MAX_FORCE;
  if (input.back) force = MAX_FORCE * 0.6;
  for (const i of [2, 3]) vehicle.applyEngineForce(force, i);

  const target = input.left ? MAX_STEER : input.right ? -MAX_STEER : 0;
  steer += (target - steer) * Math.min(1, dt * 10);
  vehicle.setSteeringValue(steer, 0);
  vehicle.setSteeringValue(steer, 1);

  const brake = input.brake ? 12 : (!input.forward && !input.back ? 1.2 : 0);
  for (let i = 0; i < 4; i++) vehicle.setBrake(brake, i);
}

// ---------------------------------------------------------------------------
// World content
// ---------------------------------------------------------------------------
function makeSign(title, lines, { width = 6.4, accent = COLORS.accent } = {}) {
  const tex = canvasTexture(1024, 560, (ctx, w, h) => {
    ctx.fillStyle = COLORS.paper;
    roundRect(ctx, 0, 0, w, h, 48); ctx.fill();
    ctx.fillStyle = accent;
    roundRect(ctx, 56, 56, 16, h - 112, 8); ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.font = '800 92px Inter, Arial, sans-serif';
    ctx.fillText(title, 104, 152);
    ctx.font = '400 44px Inter, Arial, sans-serif';
    ctx.fillStyle = '#5b4a3c';
    lines.forEach((l, i) => ctx.fillText(l, 104, 250 + i * 68));
  });
  const height = width * (560 / 1024);
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, transparent: true }));
  board.position.y = 1.4 + height / 2;
  const back = box(width + 0.1, height + 0.1, 0.12, COLORS.ink, 0.05);
  back.position.set(0, board.position.y, -0.08);
  for (const x of [-width / 2 + 0.6, width / 2 - 0.6]) {
    const post = box(0.16, 1.5, 0.16, COLORS.ink, 0.04);
    post.position.set(x, 0.75, -0.1);
    g.add(post);
  }
  g.add(board, back);
  return shadowed(g);
}

function placeSign(sign, x, z) {
  sign.position.set(x, 0, z);
  sign.rotation.y = FACE;
  scene.add(sign);
  staticBody(new CANNON.Box(new CANNON.Vec3(3, 0.75, 0.15)), [x, 0.75, z], FACE);
}

// Basketball with seams
function makeBall(r) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat('#e8742c')));
  const seam = new THREE.TorusGeometry(r * 1.005, r * 0.035, 6, 48);
  const s1 = new THREE.Mesh(seam, mat(COLORS.ink));
  const s2 = new THREE.Mesh(seam, mat(COLORS.ink)); s2.rotation.y = Math.PI / 2;
  const s3 = new THREE.Mesh(seam, mat(COLORS.ink)); s3.rotation.x = Math.PI / 2;
  g.add(s1, s2, s3);
  return shadowed(g);
}

function makeTree(scale) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.2, 8), mat(COLORS.trunk));
  trunk.position.y = 0.6;
  const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), mat(COLORS.leaf, { flatShading: true }));
  leaf.position.y = 1.9;
  const leaf2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat('#94c47d', { flatShading: true }));
  leaf2.position.set(0.3, 2.6, 0.1);
  g.add(trunk, leaf, leaf2);
  g.scale.setScalar(scale);
  return shadowed(g);
}

function labelTexture(text, bg, fg) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = fg;
    let size = 64;
    ctx.font = `800 ${size}px Inter, Arial, sans-serif`;
    while (ctx.measureText(text).width > w - 40 && size > 24) { size -= 4; ctx.font = `800 ${size}px Inter, Arial, sans-serif`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);
  });
}

// ---- Floor text painted on the ground ----
function floorText(text, x, z, size = 1, color = COLORS.path) {
  const tex = canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.font = '800 150px Inter, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(8 * size, 2 * size), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1 }));
  // lie flat, then turn so the text reads upright from the camera
  m.rotation.order = 'YXZ';
  m.rotation.set(-Math.PI / 2, FACE, 0);
  m.position.set(x, 0.02, z);
  m.receiveShadow = true;
  scene.add(m);
}

// ---- Interactive pads: drive onto them, press Enter ----
const pads = [];
let activePad = null;
function makePad(label, x, z, color, action) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.1, 48), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.03, z);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.18 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(x, 0.025, z);
  scene.add(ring, disc);
  floorText(label, x + Math.sin(FACE) * 3.2, z + Math.cos(FACE) * 3.2, 0.5, color);
  pads.push({ label, pos: new THREE.Vector2(x, z), ring, action });
}

// ---------------------------------------------------------------------------
// Build the world (needs the font)
// ---------------------------------------------------------------------------
async function buildWorld() {
  const font = await new FontLoader().loadAsync(FONT_URL);

  // ---- Big knock-over-able name, right in front of the spawn ----
  const NAME = 'ADRIK';
  const SIZE = 2.2, DEPTH = 0.9;
  const letterMats = [COLORS.accent, COLORS.purple, COLORS.teal, COLORS.pink, COLORS.car];
  const letters = NAME.split('').map((ch, i) => {
    const geo = new TextGeometry(ch, {
      font, size: SIZE, height: DEPTH, curveSegments: 8,
      bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3
    });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y, d = bb.max.z - bb.min.z;
    geo.translate(-(bb.min.x + w / 2), -(bb.min.y + h / 2), -(bb.min.z + d / 2));
    return { mesh: shadowed(new THREE.Mesh(geo, mat(letterMats[i % letterMats.length]))), w, h, d };
  });
  const gap = 0.25;
  const total = letters.reduce((s, l) => s + l.w, 0) + gap * (letters.length - 1);
  // run the word across the screen (perpendicular to the camera's view)
  const across = new THREE.Vector3(Math.cos(FACE), 0, -Math.sin(FACE));
  const nameCenter = new THREE.Vector3(-8, 0, -2);
  let offset = -total / 2;
  for (const l of letters) {
    const c = offset + l.w / 2;
    offset += l.w + gap;
    const body = new CANNON.Body({ mass: 6, material: groundMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(l.w / 2, l.h / 2, l.d / 2)));
    body.position.set(nameCenter.x + across.x * c, l.h / 2 + 0.01, nameCenter.z + across.z * c);
    body.quaternion.setFromEuler(0, FACE, 0);
    body.sleepSpeedLimit = 0.2;
    body.sleep();
    sync(l.mesh, body);
  }

  // ---- Welcome sign ----
  placeSign(makeSign('Hi, I\'m Adrik 👋', [
    'Technical Lead Manager at General Motors.',
    'Drive around to learn more about me.',
    'WASD / arrows · space to brake · R to reset'
  ]), -1, -7);

  // ---- Work sign + tech stack crates ----
  placeSign(makeSign('Work', [
    '13+ years at GM building secure vehicle',
    'platforms. 30M+ secure requests a day,',
    '50+ services modernized, 80% faster signing.'
  ], { accent: COLORS.car }), -22, -9);

  const stack = ['Java', 'Kafka', 'Spring', 'Redis', 'K8s', 'Postgres', 'Azure', 'PKI', 'OAuth2', 'Next.js'];
  const crateColors = [[COLORS.paper, COLORS.ink], [COLORS.car, COLORS.paper], [COLORS.ink, COLORS.paper]];
  const rows = [4, 3, 2, 1];
  let n = 0;
  const CRATE = 1.1;
  const stackBase = new THREE.Vector3(-28, 0, -2);
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      const word = stack[n % stack.length];
      const [bg, fg] = crateColors[n % crateColors.length];
      n++;
      const tex = labelTexture(word, bg, fg);
      const m = shadowed(new THREE.Mesh(new RoundedBoxGeometry(CRATE, CRATE, CRATE, 2, 0.06), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })));
      const along = (i - (count - 1) / 2) * (CRATE + 0.04);
      const body = new CANNON.Body({ mass: 1.5, material: groundMat });
      body.addShape(new CANNON.Box(new CANNON.Vec3(CRATE / 2, CRATE / 2, CRATE / 2)));
      body.position.set(stackBase.x + across.x * along, CRATE / 2 + row * CRATE + 0.01, stackBase.z + across.z * along);
      body.quaternion.setFromEuler(0, FACE, 0);
      body.sleepSpeedLimit = 0.2;
      body.sleep();
      sync(m, body);
    }
  });

  // ---- Basketball court ----
  const court = new THREE.Vector3(-14, 0, -24);
  const courtMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), mat('#d98b52'));
  courtMesh.rotation.set(-Math.PI / 2, 0, 0);
  courtMesh.position.set(court.x, 0.015, court.z);
  courtMesh.receiveShadow = true;
  const courtLines = new THREE.Mesh(new THREE.RingGeometry(1.8, 1.95, 48), new THREE.MeshBasicMaterial({ color: COLORS.paper }));
  courtLines.rotation.x = -Math.PI / 2;
  courtLines.position.set(court.x, 0.02, court.z);
  scene.add(courtMesh, courtLines);

  const hoop = new THREE.Group();
  const pole = box(0.25, 3.6, 0.25, COLORS.ink, 0.05); pole.position.y = 1.8;
  const arm = box(0.9, 0.15, 0.15, COLORS.ink, 0.04); arm.position.set(0.45, 3.5, 0);
  const board = box(0.12, 1.2, 1.8, COLORS.paper, 0.04); board.position.set(0.9, 3.6, 0);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 32), mat(COLORS.accent));
  rim.rotation.x = Math.PI / 2; rim.position.set(1.4, 3.2, 0);
  hoop.add(pole, arm, board, rim);
  hoop.position.set(court.x - 6.5, 0, court.z);
  scene.add(shadowed(hoop));
  staticBody(new CANNON.Box(new CANNON.Vec3(0.15, 1.8, 0.15)), [court.x - 6.5, 1.8, court.z]);

  for (let i = 0; i < 6; i++) {
    const r = 0.45;
    const body = new CANNON.Body({ mass: 0.6, material: bouncyMat, linearDamping: 0.15, angularDamping: 0.2 });
    body.addShape(new CANNON.Sphere(r));
    body.position.set(court.x + (i % 3) * 1.6 - 1, r + 0.5, court.z + Math.floor(i / 3) * 1.8 - 0.9);
    sync(makeBall(r), body);
  }
  placeSign(makeSign('Hoops 🏀', [
    'Pickup runs and playoff nights.',
    'Competitive, but always a good teammate.',
    'Go on, push the balls around.'
  ], { accent: '#e8742c' }), -5, -28);

  // ---- Ramp ----
  const RAMP = { len: 8, w: 4.5, t: 0.4, angle: 0.26 };
  const rampQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -RAMP.angle));
  const rampPos = new THREE.Vector3(-30, Math.sin(RAMP.angle) * RAMP.len / 2 - RAMP.t / 2, 22);
  const rampMesh = shadowed(box(RAMP.len, RAMP.t, RAMP.w, COLORS.purple, 0.1));
  rampMesh.position.copy(rampPos);
  rampMesh.quaternion.copy(rampQuat);
  scene.add(rampMesh);
  staticBody(new CANNON.Box(new CANNON.Vec3(RAMP.len / 2, RAMP.t / 2, RAMP.w / 2)), rampPos.toArray(), 0,
    new CANNON.Quaternion(rampQuat.x, rampQuat.y, rampQuat.z, rampQuat.w));
  floorText('JUMP →', -24, 22, 0.6, COLORS.purple);

  // ---- Traffic cone slalom ----
  for (let i = 0; i < 7; i++) {
    const cone = new THREE.Group();
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 16), mat(COLORS.accent));
    c.position.y = 0.05;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 16), mat(COLORS.paper));
    band.position.y = 0.08;
    const base = box(0.6, 0.08, 0.6, COLORS.ink, 0.03); base.position.y = -0.33;
    cone.add(c, band, base);
    const body = new CANNON.Body({ mass: 0.4, material: groundMat });
    body.addShape(new CANNON.Cylinder(0.08, 0.3, 0.75, 8));
    body.position.set(-34 + (i % 2) * 2.4, 0.4, 2 + i * 2.6);
    body.sleepSpeedLimit = 0.3;
    body.sleep();
    sync(shadowed(cone), body);
  }

  // ---- Life sign + family heart ----
  placeSign(makeSign('Life', [
    'Cars · biking · basketball · tech · movies',
    'Family first, always.',
    'Happiest when I\'m helping someone out.'
  ], { accent: COLORS.pink }), -12, 18);

  const heart = new THREE.Shape();
  heart.moveTo(0, -0.5);
  heart.bezierCurveTo(-0.2, -0.32, -0.62, -0.1, -0.62, 0.2);
  heart.bezierCurveTo(-0.62, 0.48, -0.3, 0.62, 0, 0.36);
  heart.bezierCurveTo(0.3, 0.62, 0.62, 0.48, 0.62, 0.2);
  heart.bezierCurveTo(0.62, -0.1, 0.2, -0.32, 0, -0.5);
  const heartGeo = new THREE.ExtrudeGeometry(heart, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 6, curveSegments: 24 });
  heartGeo.center();
  const heartMesh = shadowed(new THREE.Mesh(heartGeo, mat(COLORS.pink)));
  heartMesh.scale.setScalar(3);
  heartMesh.position.set(-4, 1.9, 22);
  heartMesh.rotation.y = FACE;
  scene.add(heartMesh);
  staticBody(new CANNON.Box(new CANNON.Vec3(1.5, 1.5, 0.6)), [-4, 1.5, 22], FACE);
  floorText('family', -4 + Math.sin(FACE) * 3, 22 + Math.cos(FACE) * 3, 0.55, COLORS.pink);

  // ---- Link pads ----
  makePad('LinkedIn', 4, -14, '#0a66c2', () => window.open(LINKEDIN, '_blank', 'noopener'));
  makePad('adrik.me', 11, -12, COLORS.ink, () => { location.href = '../'; });

  // ---- Trees around the edges ----
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const clear = (x, z) =>
    (Math.abs(z) < 5 && x > -48 && x < 10) ||          // main road
    (x > -20 && x < 0 && z < -12 && z > -32) ||        // court
    (x > -40 && x < -18 && z > -8 && z < 30) ||        // ramp + stack + cones
    (x > -16 && x < 22 && z > -20 && z < 26);          // spawn, pads, signs
  for (let i = 0; i < 60; i++) {
    const x = (rand() - 0.5) * 120, z = (rand() - 0.5) * 100;
    if (clear(x, z)) continue;
    const s = 0.8 + rand() * 0.9;
    const t = makeTree(s);
    t.position.set(x, 0, z);
    t.rotation.y = rand() * Math.PI * 2;
    scene.add(t);
    staticBody(new CANNON.Cylinder(0.25 * s, 0.25 * s, 2, 8), [x, 1, z]);
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const prompt = document.getElementById('prompt');
const promptBtn = document.getElementById('prompt-btn');
promptBtn.addEventListener('click', () => activePad && activePad.action());

const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
let upsideDownFor = 0;
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);

  drive(dt);
  world.step(1 / 60, dt, 3);

  for (const { mesh, body } of synced) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }
  carMesh.position.copy(chassisBody.position);
  carMesh.quaternion.copy(chassisBody.quaternion);

  // Fell off the world, or stuck on its roof for a couple of seconds
  if (chassisBody.position.y < -10) resetCar();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(carMesh.quaternion);
  upsideDownFor = up.y < 0.3 ? upsideDownFor + dt : 0;
  if (upsideDownFor > 2) { resetCar(false); upsideDownFor = 0; }

  // Camera + shadow light follow the car
  camTarget.lerp(carMesh.position, 1 - Math.pow(0.001, dt));
  camPos.copy(camTarget).add(CAM_OFFSET);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  sun.position.copy(camTarget).add(SUN_OFFSET);
  sun.target.position.copy(camTarget);

  // Pads
  const car2 = new THREE.Vector2(carMesh.position.x, carMesh.position.z);
  const t = clock.elapsedTime;
  let near = null;
  for (const p of pads) {
    const inside = p.pos.distanceTo(car2) < 2.2;
    p.ring.scale.setScalar(inside ? 1.08 : 1 + Math.sin(t * 3) * 0.03);
    if (inside) near = p;
  }
  if (near !== activePad) {
    activePad = near;
    if (near) promptBtn.textContent = `Open ${near.label} ↵`;
    prompt.classList.toggle('is-visible', !!near);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const startBtn = document.getElementById('start');
const intro = document.getElementById('intro');

camTarget.copy(chassisBody.position);
frame();

document.fonts.ready
  .then(buildWorld)
  .then(() => {
    startBtn.disabled = false;
    startBtn.textContent = 'Start driving';
  })
  .catch((err) => {
    console.error(err);
    startBtn.textContent = 'Could not load the world';
  });

startBtn.addEventListener('click', () => {
  intro.classList.add('is-hidden');
  canvas.focus();
});
