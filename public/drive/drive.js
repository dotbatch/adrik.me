// adrik.me/drive: a small drivable world, inspired by bruno-simon.com.
// three.js for rendering, cannon-es for physics. Everything is built from
// primitive shapes in code, so there are no model files to load.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSoccer } from './soccer.js';
import {
  COLORS, CAM_OFFSET, FACE, canvas, renderer, scene, camera, sun, SUN_OFFSET, world,
  groundMat, bouncyMat, synced, sync, staticBody, mat, shadowed, box, canvasTexture,
  roundRect, clock, reduceMotion
} from './core.js';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json';
const LINKEDIN = 'https://www.linkedin.com/in/adrik-grigorian/';

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
// Roads run between centreline points and overhang each end by half a width,
// so corners and T-junctions meet flush.
const ROAD_W = 5;
function road(x1, z1, x2, z2) {
  pathStrip((x1 + x2) / 2, (z1 + z2) / 2, Math.abs(x2 - x1) + ROAD_W, Math.abs(z2 - z1) + ROAD_W);
}
road(2, 0, -60, 0);           // main road heading "up"
road(2, 0, 2, 30);            // spawn to the jump
road(2, 30, -60, 30);         // the jump run
road(-60, 30, -60, 0);        // back round to the main road, closing the loop
road(-14, 0, -14, -34.5);     // past the court to the soccer pitch
road(-50, 0, -50, -12);       // into the construction lot

// Walls at the edge of the world. The grid is drawn in the shader on world
// coordinates and only shows within a few metres of the car, so the edge
// appears as you reach it and stays out of the way the rest of the time.
const EDGE_H = 5;
const edgeMat = new THREE.ShaderMaterial({
  uniforms: { uCar: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(COLORS.accent) } },
  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uCar;
    uniform vec3 uColor;
    varying vec3 vWorld;
    void main() {
      // walls are axis-aligned, so x + z runs along whichever wall this is
      vec2 c = vec2(vWorld.x + vWorld.z, vWorld.y) * 2.0;   // half-metre cells
      vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
      float line = 1.0 - min(min(g.x, g.y), 1.0);
      float near = 1.0 - smoothstep(3.0, 10.0, distance(vWorld.xz, uCar.xz));
      float top = 1.0 - smoothstep(${(EDGE_H - 2).toFixed(1)}, ${EDGE_H.toFixed(1)}, vWorld.y);
      float a = near * top * (0.06 + 0.55 * line);
      if (a < 0.005) discard;
      gl_FragColor = vec4(uColor, a);
    }`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide
});
for (const [x, z, w, d] of [[0, -60, 140, 1], [0, 60, 140, 1], [-70, 0, 1, 120], [70, 0, 1, 120]]) {
  staticBody(new CANNON.Box(new CANNON.Vec3(w / 2, 3, d / 2)), [x, 3, z]);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, d), EDGE_H), edgeMat);
  if (d > w) face.rotation.y = Math.PI / 2;
  // sit on the inner face so the car touches the grid, not a gap in front of it
  face.position.set(x - Math.sign(x) * w / 2, EDGE_H / 2, z - Math.sign(z) * d / 2);
  scene.add(face);
}

// ---------------------------------------------------------------------------
// The car
// ---------------------------------------------------------------------------
const SPAWN = new CANNON.Vec3(4, 1.6, 0);

// The box sits COM_DROP above the body's origin, which puts the centre of mass
// down near the axles. A low centre of mass is what keeps a car from tipping.
const COM_DROP = 0.35;
// Only the wheels grip. With a frictionless body the car slides off a ramp's side
// edge instead of wedging on it at full throttle.
const chassisMat = new CANNON.Material('chassis');
world.addContactMaterial(new CANNON.ContactMaterial(chassisMat, groundMat, { friction: 0, restitution: 0.15 }));
const chassisBody = new CANNON.Body({ mass: 150, material: chassisMat, angularDamping: 0.7, linearDamping: 0.08 });
chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(1.1, 0.3, 0.55)), new CANNON.Vec3(0, COM_DROP, 0));
chassisBody.position.copy(SPAWN);
chassisBody.allowSleep = false;

// forward = -x, up = y, right = z (matches the cannon-es vehicle demo)
const vehicle = new CANNON.RaycastVehicle({ chassisBody, indexRightAxis: 2, indexUpAxis: 1, indexForwardAxis: 0 });
const wheelOptions = {
  radius: 0.34,
  directionLocal: new CANNON.Vec3(0, -1, 0),
  suspensionStiffness: 45,
  suspensionRestLength: 0.3,
  frictionSlip: 2.4,
  dampingRelaxation: 3,
  dampingCompression: 4.8,
  maxSuspensionForce: 100000,
  rollInfluence: 0,
  axleLocal: new CANNON.Vec3(0, 0, 1),
  chassisConnectionPointLocal: new CANNON.Vec3(),
  maxSuspensionTravel: 0.3,
  customSlidingRotationalSpeed: -30,
  useCustomSlidingRotationalSpeed: true
};
const WHEEL_POS = [[-0.8, COM_DROP, 0.68], [-0.8, COM_DROP, -0.68], [0.8, COM_DROP, 0.68], [0.8, COM_DROP, -0.68]]; // FL FR RL RR
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
carMesh.children.forEach((c) => { c.position.y += COM_DROP; });
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

function placeCar(x, z, yaw = 0) {
  chassisBody.position.set(x, 1.2, z);
  chassisBody.quaternion.setFromEuler(0, yaw, 0);
  chassisBody.velocity.setZero();
  chassisBody.angularVelocity.setZero();
  throttle = 0;
  steer = 0;
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
  if (mode === 'shoot') {
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) startCharge(); return; }
    if (e.code === 'Escape' || e.code === 'KeyR') { exitShoot(); return; }
  }
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyR') resetCar();
  if (e.code === 'Enter' && activePad) activePad.action();
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space' && mode === 'shoot') release();
  if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
});
addEventListener('blur', () => { for (const k in input) input[k] = false; });

document.querySelectorAll('.pad [data-key], .shoot__touch [data-key]').forEach((btn) => {
  const k = btn.dataset.key;
  const on = (e) => { e.preventDefault(); input[k] = true; btn.classList.add('is-down'); };
  const off = () => { input[k] = false; btn.classList.remove('is-down'); };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointerleave', off);
  btn.addEventListener('pointercancel', off);
});
document.getElementById('reset').addEventListener('click', () => { resetCar(); canvas.focus(); });

const MAX_FORCE = 700;      // total engine force, split across all four wheels
const MAX_STEER = 0.5;      // radians at a standstill
const MAX_SPEED = 15;       // m/s forward
const MAX_REVERSE = 6;      // m/s backward
let steer = 0;
let throttle = 0;

// The jump runs toward -x along z = JUMP.z. The take-off lip is at x = -24 and the
// landing ramp's top at x = -32: the ring of fire floats over the gap between.
// The landing ramp is long and gentle so both normal and boosted jumps land on it.
const JUMP = { z: 30, w: 5, run: 10, rise: 3, landRun: 14, landRise: 2.6, takeoffX: -19, landX: -39, boostX: -9, boostLen: 6 };
// The car reaches ~14 m/s at the lip from almost any run-up; the boost gets it
// to ~16.5, which carries it noticeably further down the landing ramp.
const BOOST_SPEED = 22;
let boostMat = null;

// On the pad, top the car up to BOOST_SPEED along the run (only when already heading that way)
function boost(dt) {
  const p = chassisBody.position;
  if (Math.abs(p.x - JUMP.boostX) > JUMP.boostLen / 2 || Math.abs(p.z - JUMP.z) > JUMP.w / 2 || p.y > 1.5) return;
  const v = -chassisBody.velocity.x;
  if (v > 2 && v < BOOST_SPEED) chassisBody.velocity.x -= (BOOST_SPEED - v) * Math.min(1, dt * 6);
}

const _fwd = new CANNON.Vec3();
function forwardSpeed() {
  chassisBody.quaternion.vmult(new CANNON.Vec3(-1, 0, 0), _fwd);
  return chassisBody.velocity.dot(_fwd);
}

function drive(dt) {
  const v = forwardSpeed();

  // Pressing the opposite way while still rolling brakes first instead of
  // slamming into reverse, which is what used to pitch the car over.
  let want = 0, brake = 0;
  if (input.forward) { if (v < -1) brake = 6; else if (v < MAX_SPEED) want = 1; }
  if (input.back) { if (v > 1) brake = 6; else if (v > -MAX_REVERSE) want = -0.6; }
  if (input.brake) brake = 10;
  if (!input.forward && !input.back && !input.brake) brake = 0.8; // gentle coast-down

  // Ease into the throttle so launches don't lift the nose
  throttle += (want - throttle) * Math.min(1, dt * (want === 0 ? 8 : 3));
  const force = -throttle * MAX_FORCE;
  vehicle.applyEngineForce(force * 0.4, 0);
  vehicle.applyEngineForce(force * 0.4, 1);
  vehicle.applyEngineForce(force * 0.6, 2);
  vehicle.applyEngineForce(force * 0.6, 3);

  // Less steering lock the faster you go, eased in and out
  const lock = MAX_STEER * (1 - 0.6 * Math.min(1, Math.abs(v) / MAX_SPEED));
  const target = input.left ? lock : input.right ? -lock : 0;
  steer += (target - steer) * Math.min(1, dt * 6);
  vehicle.setSteeringValue(steer, 0);
  vehicle.setSteeringValue(steer, 1);

  for (let i = 0; i < 4; i++) vehicle.setBrake(brake, i);
}

// Keep the car planted: a soft spring that pulls it upright, damping on roll
// and pitch, and a little downforce that grows with speed. Yaw is left alone
// so steering still feels free, and it's weak enough that ramps still jump.
const WORLD_UP = new CANNON.Vec3(0, 1, 0);
const _up = new CANNON.Vec3(), _axis = new CANNON.Vec3(), _w = new CANNON.Vec3();
world.addEventListener('preStep', () => {
  chassisBody.quaternion.vmult(WORLD_UP, _up);
  if (_up.y < 0.2) return; // upside down: let the auto-flip handle it

  _up.cross(WORLD_UP, _axis);                       // tilt direction, length = sin(tilt)
  _w.copy(chassisBody.angularVelocity);
  _w.y = 0;                                         // only roll + pitch
  chassisBody.torque.x += _axis.x * 900 - _w.x * 60;
  chassisBody.torque.z += _axis.z * 900 - _w.z * 60;

  const speed = chassisBody.velocity.length();
  chassisBody.force.y -= speed * speed * 1.2;
});

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
    let size = 92;   // shrink long titles to fit
    ctx.font = `800 ${size}px Inter, Arial, sans-serif`;
    while (ctx.measureText(title).width > w - 160 && size > 48) { size -= 4; ctx.font = `800 ${size}px Inter, Arial, sans-serif`; }
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

// A knock-over-able traffic cone
function addCone(x, z) {
  const cone = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 16), mat(COLORS.accent));
  c.position.y = 0.05;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 16), mat(COLORS.paper));
  band.position.y = 0.08;
  const base = box(0.6, 0.08, 0.6, COLORS.ink, 0.03); base.position.y = -0.33;
  cone.add(c, band, base);
  const body = new CANNON.Body({ mass: 0.4, material: groundMat });
  body.addShape(new CANNON.Cylinder(0.08, 0.3, 0.75, 8));
  body.position.set(x, 0.4, z);
  body.sleepSpeedLimit = 0.3;
  body.sleep();
  sync(shadowed(cone), body);
}

// A solid wedge sitting on the ground that rises toward -x, or toward +x when
// flipped. Solid (not a tilted slab) so there's no gap to drive under.
function addRamp(x, z, run, rise, w, color, flip = false) {
  const shape = new THREE.Shape([new THREE.Vector2(run / 2, 0), new THREE.Vector2(-run / 2, 0), new THREE.Vector2(-run / 2, rise)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2);
  const mesh = shadowed(new THREE.Mesh(geo, mat(color)));
  const rotY = flip ? Math.PI : 0;
  mesh.position.set(x, 0, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
  const v = [[run / 2, 0, -w / 2], [-run / 2, 0, -w / 2], [-run / 2, rise, -w / 2], [run / 2, 0, w / 2], [-run / 2, 0, w / 2], [-run / 2, rise, w / 2]];
  staticBody(new CANNON.ConvexPolyhedron({
    vertices: v.map((p) => new CANNON.Vec3(...p)),
    faces: [[0, 1, 2], [3, 5, 4], [0, 3, 4, 1], [1, 4, 5, 2], [0, 2, 5, 3]]
  }), [x, 0, z], rotY);
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
function makePad(label, x, z, color, action, promptText = `Open ${label} ↵`, enabled = null) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.1, 48), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.03, z);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.18 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(x, 0.025, z);
  scene.add(ring, disc);
  floorText(label, x + Math.sin(FACE) * 3.2, z + Math.cos(FACE) * 3.2, 0.5, color);
  const pad = { label, promptText, pos: new THREE.Vector2(x, z), ring, action, enabled };
  pads.push(pad);
  return pad;
}

// Arrow hovering over a pad so people know they can play there. A four-sided
// head keeps the spin visible (a round cone would look still).
const ARROW_Y = 1.6; // low enough that, from the tilted camera, it still reads as over the pad
function addArrow(pad, color) {
  const arrow = new THREE.Group();
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 4), mat(color, { flatShading: true }));
  head.rotation.x = Math.PI;                         // point at the ground
  const shaft = box(0.22, 0.6, 0.22, color, 0.04);
  shaft.position.y = 0.6;
  arrow.add(head, shaft);
  arrow.position.set(pad.pos.x, ARROW_Y, pad.pos.y);
  scene.add(shadowed(arrow));
  pad.arrow = arrow;
}

// Ring of fire over the jump gap. A boosted full-throttle launch puts the car's
// centre about 4 m up at mid-gap; the ring sits a little higher because the
// cabin sticks up more than the wheels hang down.
const RING = { x: -28, y: 4.2, z: JUMP.z, r: 2.1, tube: 0.16, flames: 180, sparks: 60 };
let fireRing = null;
function addFireRing() {
  const group = new THREE.Group();
  group.position.set(RING.x, RING.y, RING.z);
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(RING.r, RING.tube, 12, 64),
    new THREE.MeshStandardMaterial({ color: COLORS.ink, emissive: COLORS.accent, emissiveIntensity: 0.4, roughness: 0.5 })
  );
  torus.rotation.y = Math.PI / 2;   // face down the run
  torus.castShadow = true;

  // Flames: one Points system, animated entirely in the shader. Each particle
  // starts on the ring, rises, shrinks and fades, then loops on its own phase.
  const pos = new Float32Array(RING.flames * 3);
  const phase = new Float32Array(RING.flames);
  for (let i = 0; i < RING.flames; i++) {
    const a = (i / RING.flames) * Math.PI * 2;
    const r = RING.r + (Math.random() - 0.5) * RING.tube * 2;
    pos.set([(Math.random() - 0.5) * 0.2, Math.cos(a) * r, Math.sin(a) * r], i * 3);
    phase[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const uniforms = { uTime: { value: 0 }, uScale: { value: 1 } };
  const flames = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      uniform float uTime, uScale;
      attribute float aPhase;
      varying float vLife;
      void main() {
        float life = fract(uTime * (1.2 + fract(aPhase * 13.7) * 0.8) + aPhase);
        vLife = life;
        vec3 p = position;
        p.y += life * 1.5;
        p.x += sin(uTime * 6.0 + aPhase * 20.0) * 0.08 * life;   // a little sideways lick
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // 0.9 m sprite, shrinking as it rises, sized in drawing-buffer pixels
        gl_PointSize = 0.9 * (1.0 - life * 0.7) * projectionMatrix[1][1] * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.15, d) * (1.0 - vLife * vLife) * smoothstep(0.0, 0.15, vLife);
        gl_FragColor = vec4(mix(vec3(1.0, 0.85, 0.35), vec3(1.0, 0.3, 0.05), vLife), a);
      }`
  }));

  const light = new THREE.PointLight(COLORS.accent, 25, 12, 2);

  // Sparks for a clean pass: a burst of points under gravity, simulated in JS
  // only while it's alive
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RING.sparks * 3), 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: '#ffd27a', size: 0.22, transparent: true, depthWrite: false }));
  sparks.visible = false;
  group.add(torus, flames, light, sparks);
  scene.add(group);

  // Rim collider: a circle of small spheres like the hoop's rim, so clipping the
  // ring bounces the car off instead of stopping it dead
  const rim = new CANNON.Body({ mass: 0, material: groundMat });
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    rim.addShape(new CANNON.Sphere(RING.tube), new CANNON.Vec3(0, Math.cos(a) * RING.r, Math.sin(a) * RING.r));
  }
  rim.position.set(RING.x, RING.y, RING.z);
  world.addBody(rim);
  chassisBody.addEventListener('collide', (e) => { if (e.body === rim) fireRing.touchedAt = clock.elapsedTime; });

  fireRing = { uniforms, light, sparks, sparkVel: new Float32Array(RING.sparks * 3), sparkLife: 0, flash: 0, touchedAt: -Infinity, prevX: null, count: 0 };
}

// A pass is the car's chassis centre crossing the ring's plane inside the ring,
// without having touched the rim on the way through
const jumpUI = { chip: document.getElementById('jump-chip'), count: document.getElementById('jump-count'), msg: document.getElementById('jump-msg') };
const CHASSIS_CENTRE = new CANNON.Vec3(0, COM_DROP, 0);
const _carCentre = new CANNON.Vec3();
function checkRingPass(t) {
  chassisBody.pointToWorldFrame(CHASSIS_CENTRE, _carCentre);
  const { x, y, z } = _carCentre;
  const prevX = fireRing.prevX;
  fireRing.prevX = x;
  if (prevX === null || (prevX - RING.x) * (x - RING.x) > 0 || Math.abs(prevX - x) > 2) return; // no crossing, or a teleport
  if (Math.hypot(y - RING.y, z - RING.z) > RING.r - RING.tube || t - fireRing.touchedAt < 0.5) return;
  fireRing.count++;
  jumpUI.count.textContent = fireRing.count;
  jumpUI.chip.hidden = false;
  jumpUI.msg.textContent = fireRing.count === 1 ? 'Nice!' : `Nice! ×${fireRing.count}`;
  jumpUI.msg.classList.remove('pop');
  void jumpUI.msg.offsetWidth;   // restart the animation
  jumpUI.msg.classList.add('pop');
  fireRing.flash = 1;
  if (!reduceMotion) burstSparks(x - RING.x, y - RING.y, z - RING.z);
}

function burstSparks(x, y, z) {
  const pos = fireRing.sparks.geometry.attributes.position.array;
  const vel = fireRing.sparkVel;
  for (let i = 0; i < RING.sparks; i++) {
    pos.set([x, y, z], i * 3);
    const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 4;
    vel.set([(Math.random() - 0.5) * 3, Math.cos(a) * s + 2, Math.sin(a) * s], i * 3);
  }
  fireRing.sparkLife = 1;
  fireRing.sparks.visible = true;
}

function updateFireRing(t, dt) {
  if (!fireRing) return;
  if (mode === 'drive') checkRingPass(t);
  fireRing.uniforms.uScale.value = canvas.height / 2;
  // Light flares on a pass, then settles back to its flicker
  fireRing.flash = Math.max(0, fireRing.flash - dt * 2);
  const flicker = reduceMotion ? 0.85 : 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
  fireRing.light.intensity = 25 * (flicker + fireRing.flash * 3);
  if (!reduceMotion) fireRing.uniforms.uTime.value = t;   // otherwise flames hold still

  if (fireRing.sparkLife > 0) {
    fireRing.sparkLife -= dt;
    const attr = fireRing.sparks.geometry.attributes.position;
    const vel = fireRing.sparkVel;
    for (let i = 0; i < attr.array.length; i++) {
      if (i % 3 === 1) vel[i] -= 9.8 * dt;
      attr.array[i] += vel[i] * dt;
    }
    attr.needsUpdate = true;
    fireRing.sparks.material.opacity = Math.max(0, fireRing.sparkLife);
    fireRing.sparks.visible = fireRing.sparkLife > 0;
  }
}

// ---------------------------------------------------------------------------
// Build the world (needs the font)
// ---------------------------------------------------------------------------
let soccer = null;
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
  initShootGame(
    new THREE.Vector3(court.x - 6.5 + 1.4, 3.2, court.z),   // rim centre
    new THREE.Vector3(court.x - 6.5 + 0.9, 3.6, court.z)    // backboard centre
  );
  addArrow(makePad('Shoot hoops', court.x + 5, court.z + 2.5, '#e8742c', enterShoot, 'Shoot hoops ↵'), '#e8742c');

  for (let i = 0; i < 6; i++) {
    const r = 0.45;
    const body = new CANNON.Body({ mass: 0.6, material: bouncyMat, linearDamping: 0.15, angularDamping: 0.2 });
    body.addShape(new CANNON.Sphere(r));
    // off to the side of the court, out of the shooting lane
    body.position.set(court.x - 3 + (i % 3) * 1.1, r + 0.5, court.z + 3.4 + Math.floor(i / 3) * 1.0);
    sync(makeBall(r), body);
  }
  // ---- Soccer pitch + penalty challenge (soccer.js) ----
  soccer = createSoccer({
    THREE, CANNON, scene, world, mat, box, shadowed, canvasTexture, staticBody, sync,
    floorText, makePad, addArrow, makeSign, placeSign, chassisBody, groundMat, placeCar, COLORS
  });

  placeSign(makeSign('Sports', [
    'Basketball these days, and soccer too.',
    'The best part is playing on a team.',
    'Shoot hoops here, penalties next door.'
  ], { accent: '#e8742c' }), -5, -28);

  // ---- Jump: boost pad, take-off ramp, ring of fire over the gap, landing ramp ----
  // It runs up the screen (-x) so you can see the landing coming.
  addRamp(JUMP.takeoffX, JUMP.z, JUMP.run, JUMP.rise, JUMP.w, COLORS.purple);
  addRamp(JUMP.landX, JUMP.z, JUMP.landRun, JUMP.landRise, JUMP.w, COLORS.teal, true);
  addFireRing();

  const boostTex = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = COLORS.accent; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = COLORS.paper; ctx.lineWidth = 26; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const x of [110, 250, 390]) {       // chevrons pointing toward -x, the way to go
      ctx.beginPath(); ctx.moveTo(x + 50, 50); ctx.lineTo(x - 30, h / 2); ctx.lineTo(x + 50, h - 50); ctx.stroke();
    }
  });
  boostMat = new THREE.MeshStandardMaterial({ map: boostTex, emissive: COLORS.accent, emissiveIntensity: 0.3 });
  const boostMesh = new THREE.Mesh(new THREE.PlaneGeometry(JUMP.boostLen, JUMP.w), boostMat);
  boostMesh.rotation.x = -Math.PI / 2;
  boostMesh.position.set(JUMP.boostX, 0.03, JUMP.z);
  boostMesh.receiveShadow = true;
  scene.add(boostMesh);
  floorText('SEND IT ↑', JUMP.boostX + 7, JUMP.z, 0.6, COLORS.accent);

  // ---- Traffic cone slalom ----
  for (let i = 0; i < 7; i++) addCone(-34 + (i % 2) * 2.4, 2 + i * 2.6);

  // ---- Under construction: an empty lot at the end of a short road, for whatever comes next ----
  const LOT = { x: -50, z: -20, w: 20, d: 14 };       // centre and size (w along x, d along z)
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(LOT.w, LOT.d), mat('#c99566'));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(LOT.x, 0.012, LOT.z);
  dirt.receiveShadow = true;
  scene.add(dirt);

  // Striped barriers all the way round, so it's closed off until there's something to see
  const stripes = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = COLORS.paper; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = COLORS.accent;
    for (let x = -h; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 32, h); ctx.lineTo(x + 32 + h, 0); ctx.lineTo(x + h, 0); ctx.fill(); }
  });
  const barrierMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.7 });
  const BARRIER = 3.2;
  const barrier = (x, z, rotY) => {
    const m = shadowed(new THREE.Mesh(new RoundedBoxGeometry(BARRIER, 0.5, 0.25, 2, 0.05), barrierMat));
    m.position.set(x, 0.8, z);
    m.rotation.y = rotY;
    for (const s of [-1, 1]) {
      const leg = box(0.12, 0.8, 0.5, COLORS.ink, 0.03);
      leg.position.set(s * (BARRIER / 2 - 0.3), -0.4, 0);
      m.add(shadowed(leg));
    }
    scene.add(m);
    staticBody(new CANNON.Box(new CANNON.Vec3(BARRIER / 2, 0.55, 0.25)), [x, 0.55, z], rotY);
  };
  for (const sz of [-1, 1]) for (let i = 0; i < 6; i++) barrier(LOT.x - LOT.w / 2 + BARRIER * (i + 0.5) + 0.4, LOT.z + sz * LOT.d / 2, 0);
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) barrier(LOT.x + sx * LOT.w / 2, LOT.z - LOT.d / 2 + BARRIER * (i + 0.5) + 0.6, Math.PI / 2);

  placeSign(makeSign('Under construction 🚧', [
    'More of my world is coming here.',
    'Check back soon.'
  ], { accent: COLORS.accent }), LOT.x - 2, LOT.z - 2);
  for (const [x, z] of [[-44, -16], [-45.5, -22], [-56, -17]]) addCone(x, z);

  // ---- Life sign + family heart ----
  placeSign(makeSign('Life', [
    'Cars · sports · biking · tech · movies',
    'Family comes first.',
    'I like helping people out.'
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
    (Math.abs(z) < 9 && x > -66 && x < 10) ||          // main road
    (x > -20 && x < 0 && z < -12 && z > -32) ||        // court
    (x > -40 && x < -18 && z > -8 && z < 30) ||        // stack + cones
    (x > -66 && x < 6 && z > 24 && z < 36) ||          // jump run
    (x > -66 && x < -54 && z > -4 && z < 36) ||        // road back to the main road
    (x > -64 && x < -36 && z > -31 && z < -4) ||       // construction lot
    (x > -16 && x < 22 && z > -20 && z < 26) ||        // spawn, pads, signs
    (x > -18 && x < -10 && z > -40 && z < -28) ||      // road to the pitch
    soccer.clear(x, z);                                // soccer pitch
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
// Shoot hoops: park on the court pad, hold space to charge, release to shoot
// ---------------------------------------------------------------------------
const shootUI = {
  root: document.getElementById('shoot'),
  makes: document.getElementById('shoot-makes'),
  pct: document.getElementById('shoot-pct'),
  streak: document.getElementById('shoot-streak'),
  best: document.getElementById('shoot-best'),
  fill: document.getElementById('shoot-fill'),
  msg: document.getElementById('shoot-msg')
};

const BALL_R = 0.24;              // smaller than the push-around balls so it fits the rim
const RIM_R = 0.42;               // matches the rim torus
const SHOT_ANGLE = 52 * Math.PI / 180;
const SWEET = 0.5;                // charge that produces the perfect arc
const SWEET_BAND = 0.035;         // +/- around it that still drops cleanly
const AIM_LIMIT = 0.3;            // radians either side

const shoot = {
  rim: null, board: null, spot: null, camPos: null, rimBodies: [],
  aim: 0, aimOffset: 0, charging: false, chargeT: 0, charge: 0,
  cooldown: 0, held: null, balls: [],
  makes: 0, attempts: 0, streak: 0, best: 0, msgTimer: 0
};
try { shoot.best = +localStorage.getItem('drive.hoops.best') || 0; } catch (e) { /* storage blocked */ }

let mode = 'drive';
const rimMat = new CANNON.Material('rim');
const boardMat = new CANNON.Material('board');
world.addContactMaterial(new CANNON.ContactMaterial(bouncyMat, rimMat, { friction: 0.2, restitution: 0.55 }));
// a lively backboard, so overhit shots carom away instead of always banking in
world.addContactMaterial(new CANNON.ContactMaterial(bouncyMat, boardMat, { friction: 0.05, restitution: 0.9 }));

// Called from buildWorld once the hoop exists
function initShootGame(rimPos, boardPos) {
  shoot.rim = rimPos.clone();
  // A ring of small spheres gives the rim real collision, so shots can rattle in or out
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const b = staticBody(new CANNON.Sphere(0.05), [rimPos.x + Math.cos(a) * RIM_R, rimPos.y, rimPos.z + Math.sin(a) * RIM_R]);
    b.material = rimMat;
    shoot.rimBodies.push(b);
  }
  const board = staticBody(new CANNON.Box(new CANNON.Vec3(0.06, 0.6, 0.9)), boardPos.toArray());
  board.material = boardMat;
  shoot.rimBodies.push(board);

  // Free-throw-ish spot straight out from the hoop, camera just behind it
  shoot.spot = new THREE.Vector3(rimPos.x + 4.6, 2.1, rimPos.z);
  shoot.camPos = new THREE.Vector3(rimPos.x + 9.6, 4.1, rimPos.z);
  shoot.look = new THREE.Vector3(rimPos.x + 1.6, 1.9, rimPos.z); // a bit below the rim so the ball stays in frame

  const spotMark = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 32), new THREE.MeshBasicMaterial({ color: COLORS.paper }));
  spotMark.rotation.x = -Math.PI / 2;
  spotMark.position.set(shoot.spot.x, 0.025, shoot.spot.z);
  scene.add(spotMark);

  // Aim arrow on the floor, only visible while shooting
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS.accent }));
  arrow.visible = false;
  scene.add(arrow);
  shoot.arrow = arrow;

  // Ball in hand, waiting to be shot
  shoot.held = makeBall(BALL_R);
  shoot.held.visible = false;
  scene.add(shoot.held);
}

// Launch speed that lands exactly in the rim at the given angle
function idealSpeed() {
  const d = shoot.rim.x - shoot.spot.x;
  const dist = Math.abs(d);
  const h = shoot.rim.y - shoot.spot.y;
  const c = Math.cos(SHOT_ANGLE);
  return Math.sqrt((9.82 * dist * dist) / (2 * c * c * (dist * Math.tan(SHOT_ANGLE) - h)));
}

function enterShoot() {
  if (!shoot.rim || mode === 'shoot') return;
  if (soccer && soccer.active) soccer.stop();
  mode = 'shoot';
  document.body.classList.add('is-shooting');
  prompt.classList.remove('is-visible');
  activePad = null;
  for (const k in input) input[k] = false;
  carMesh.visible = false;
  wheelMeshes.forEach((w) => { w.visible = false; });
  shoot.arrow.visible = true;
  newShot();
  updateScore();
  flash(matchMedia('(pointer: coarse)').matches ? 'Hold the button, let go to shoot' : 'Hold space, let go to shoot');
}

function exitShoot() {
  if (mode !== 'shoot') return;
  mode = 'drive';
  document.body.classList.remove('is-shooting');
  shoot.charging = false;
  shoot.arrow.visible = false;
  shoot.held.visible = false;
  carMesh.visible = true;
  wheelMeshes.forEach((w) => { w.visible = true; });
  for (const k in input) input[k] = false;
  canvas.focus();
}

function newShot() {
  // a small random aim error each time, so you have to line it up
  shoot.aimOffset = (Math.random() - 0.5) * 0.12;
  shoot.aim = 0;
  shoot.held.visible = true;
}

function startCharge() {
  if (mode !== 'shoot' || shoot.cooldown > 0 || shoot.charging) return;
  shoot.charging = true;
  shoot.chargeT = 0;
}

function release() {
  if (mode !== 'shoot' || !shoot.charging) return;
  shoot.charging = false;
  shoot.attempts++;
  shoot.cooldown = 1.1;
  shoot.held.visible = false;

  // SWEET charge == a clean make. 1.011 corrects for the ball's size against the
  // front of the rim; 0.45 sets how forgiving the white band is (playtested).
  const speed = idealSpeed() * (1.011 + (shoot.charge - SWEET) * 0.45);
  const yaw = shoot.aim + shoot.aimOffset;
  const dir = new CANNON.Vec3(-Math.cos(yaw) * Math.cos(SHOT_ANGLE), Math.sin(SHOT_ANGLE), Math.sin(yaw) * Math.cos(SHOT_ANGLE));

  // no air drag, so the arc matches idealSpeed() exactly
  const body = new CANNON.Body({ mass: 0.6, material: bouncyMat, linearDamping: 0, angularDamping: 0.3 });
  body.addShape(new CANNON.Sphere(BALL_R));
  body.position.set(shoot.spot.x, shoot.spot.y, shoot.spot.z);
  body.velocity.set(dir.x * speed, dir.y * speed, dir.z * speed);
  body.angularVelocity.set(0, 0, -8); // backspin
  const mesh = makeBall(BALL_R);
  sync(mesh, body);

  const ball = { body, mesh, age: 0, prevY: body.position.y, touched: false, scored: false, resolved: false, charge: shoot.charge, yaw };
  body.addEventListener('collide', (e) => { if (shoot.rimBodies.includes(e.body)) ball.touched = true; });
  shoot.balls.push(ball);
  updateScore();
}

function updateScore() {
  shootUI.makes.textContent = `${shoot.makes}/${shoot.attempts}`;
  shootUI.pct.textContent = shoot.attempts ? `${Math.round((shoot.makes / shoot.attempts) * 100)}%` : '–';
  shootUI.streak.textContent = shoot.streak;
  shootUI.best.textContent = shoot.best;
}

function flash(text) {
  shootUI.msg.textContent = text;
  shootUI.msg.classList.remove('pop');
  void shootUI.msg.offsetWidth;
  shootUI.msg.classList.add('pop');
}

function resolve(ball, made) {
  if (ball.resolved) return;
  ball.resolved = true;
  if (made) {
    shoot.makes++;
    shoot.streak++;
    if (shoot.streak > shoot.best) {
      shoot.best = shoot.streak;
      try { localStorage.setItem('drive.hoops.best', shoot.best); } catch (e) { /* ignore */ }
    }
    flash(ball.touched ? 'Bucket' : 'Swish');
  } else {
    shoot.streak = 0;
    const off = ball.charge - SWEET;
    flash(Math.abs(ball.yaw) > 0.05 && Math.abs(off) < SWEET_BAND * 2 ? 'Wide' : off < 0 ? 'Short' : 'Long');
  }
  updateScore();
}

function removeBall(ball) {
  world.removeBody(ball.body);
  scene.remove(ball.mesh);
  const i = synced.findIndex((s) => s.body === ball.body);
  if (i >= 0) synced.splice(i, 1);
}

function updateShoot(dt) {
  const t = clock.elapsedTime;

  // aim with left/right
  const aimInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  shoot.aim = THREE.MathUtils.clamp(shoot.aim + aimInput * dt * 0.2, -AIM_LIMIT, AIM_LIMIT);
  const yaw = shoot.aim + shoot.aimOffset;
  shoot.arrow.position.set(shoot.spot.x - Math.cos(yaw) * 1.2, 0.05, shoot.spot.z + Math.sin(yaw) * 1.2);
  shoot.arrow.rotation.y = Math.PI / 2 + yaw;

  // charge ping-pongs between 0 and 1 while held
  if (shoot.charging) {
    shoot.chargeT += dt * 1.15;
    const p = shoot.chargeT % 2;
    shoot.charge = p < 1 ? p : 2 - p;
  } else if (!shoot.charging && shoot.cooldown <= 0) {
    shoot.charge = 0;
  }
  shootUI.fill.style.height = `${shoot.charge * 100}%`;

  if (shoot.cooldown > 0) {
    shoot.cooldown -= dt;
    if (shoot.cooldown <= 0) newShot();
  }

  // ball in hand bobs a little, and dips as you charge
  if (shoot.held.visible) {
    shoot.held.position.set(shoot.spot.x, shoot.spot.y - shoot.charge * 0.15 + Math.sin(t * 3) * 0.03, shoot.spot.z);
    shoot.held.rotation.y += dt;
  }

  // basket detection: crossing rim height, moving down, inside the ring
  for (const ball of shoot.balls) {
    ball.age += dt;
    const p = ball.body.position;
    if (!ball.resolved && ball.prevY > shoot.rim.y && p.y <= shoot.rim.y && ball.body.velocity.y < 0) {
      const dx = p.x - shoot.rim.x, dz = p.z - shoot.rim.z;
      if (Math.hypot(dx, dz) < RIM_R - BALL_R * 0.5) resolve(ball, true);
    }
    ball.prevY = p.y;
    if (!ball.resolved && (ball.age > 3.5 || (p.y < 1 && ball.age > 0.8))) resolve(ball, false);
  }
  for (const ball of shoot.balls.filter((b) => b.age > 6)) removeBall(ball);
  shoot.balls = shoot.balls.filter((b) => b.age <= 6);
}

document.getElementById('shoot-exit').addEventListener('click', exitShoot);
const shootBtn = document.getElementById('shoot-btn');
shootBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); startCharge(); });
shootBtn.addEventListener('pointerup', release);
shootBtn.addEventListener('pointercancel', release);
shootBtn.addEventListener('pointerleave', release);

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const prompt = document.getElementById('prompt');
const promptBtn = document.getElementById('prompt-btn');
promptBtn.addEventListener('click', () => activePad && activePad.action());

const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const _desiredCam = new THREE.Vector3();
let upsideDownFor = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);

  if (mode === 'drive') { drive(dt); boost(dt); }
  else {
    for (let i = 0; i < 4; i++) { vehicle.applyEngineForce(0, i); vehicle.setBrake(10, i); }
    updateShoot(dt);
  }
  world.step(1 / 120, dt, 8);

  for (const { mesh, body } of synced) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }
  carMesh.position.copy(chassisBody.position);
  carMesh.quaternion.copy(chassisBody.quaternion);
  const focus = soccer && mode === 'drive' ? soccer.update(dt, clock.elapsedTime, carMesh.position) : null;

  // Fell off the world, or stuck on its roof for a couple of seconds
  if (chassisBody.position.y < -10) resetCar();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(carMesh.quaternion);
  upsideDownFor = up.y < 0.3 ? upsideDownFor + dt : 0;
  if (upsideDownFor > 2) { resetCar(false); upsideDownFor = 0; }

  // Camera + shadow light follow the car, or frame the hoop while shooting
  const ease = 1 - Math.pow(0.001, dt);
  if (mode === 'shoot') {
    camTarget.lerp(shoot.look, ease);
    camPos.lerp(shoot.camPos, ease);
  } else {
    camTarget.lerp(focus || carMesh.position, ease);
    camPos.lerp(_desiredCam.copy(camTarget).add(CAM_OFFSET), Math.min(1, ease * 2.5));
  }
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  sun.position.copy(camTarget).add(SUN_OFFSET);
  sun.target.position.copy(camTarget);
  edgeMat.uniforms.uCar.value.copy(carMesh.position);

  // Pads (not while shooting)
  const car2 = new THREE.Vector2(carMesh.position.x, carMesh.position.z);
  const t = clock.elapsedTime;
  let near = null;
  for (const p of pads) {
    const open = mode === 'drive' && (!p.enabled || p.enabled());
    const inside = open && p.pos.distanceTo(car2) < 2.2;
    p.ring.scale.setScalar(inside ? 1.08 : 1 + Math.sin(t * 3) * 0.03);
    if (p.arrow) {
      p.arrow.visible = open && !inside;
      if (!reduceMotion) {
        p.arrow.rotation.y = t * 1.2;
        p.arrow.position.y = ARROW_Y + Math.sin(t * 2) * 0.15;   // gentle bob
      }
    }
    if (inside) near = p;
  }
  if (boostMat && !reduceMotion) boostMat.emissiveIntensity = 0.3 + Math.sin(t * 6) * 0.2;
  updateFireRing(t, dt);
  if (near !== activePad) {
    activePad = near;
    if (near) promptBtn.textContent = near.promptText;
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
camPos.copy(camTarget).add(CAM_OFFSET);
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
