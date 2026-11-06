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
  groundMat, bouncyMat, synced, sync, staticBody, mat, shadowed, box, canvasTexture, clock
} from './core.js';
import { input, KEYMAP, clearInput } from './input.js';
import {
  chassisBody, carMesh, resetCar, placeCar, drive, setCarVisible, parkCar, recoverCar
} from './car.js';
import { makeSign, placeSign, makeBall, makeTree, addCone, labelTexture, floorText } from './props.js';
import { makePad, addArrow, activePad, dismissPad, updatePads } from './pads.js';
import { boost, buildJump, updateJump } from './jump.js';

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
// Input
// ---------------------------------------------------------------------------
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

document.getElementById('reset').addEventListener('click', () => { resetCar(); canvas.focus(); });

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

  // ---- Jump (jump.js) ----
  buildJump();

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
  dismissPad();
  clearInput();
  setCarVisible(false);
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
  setCarVisible(true);
  clearInput();
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

const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const _desiredCam = new THREE.Vector3();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);

  if (mode === 'drive') { drive(dt); boost(dt); }
  else {
    parkCar();
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

  recoverCar(dt);

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

  const t = clock.elapsedTime;
  updatePads(carMesh.position, t, mode === 'drive');
  updateJump(t, dt, mode === 'drive');

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
