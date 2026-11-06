// Basketball court and the shoot-hoops game.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  COLORS, canvas, scene, world, bouncyMat, synced, sync, staticBody, mat, shadowed, box,
  clock
} from './core.js';
import { input, clearInput } from './input.js';
import { setCarVisible } from './car.js';
import { makeBall } from './props.js';
import { makePad, addArrow, dismissPad } from './pads.js';

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

export const shoot = {
  rim: null, board: null, spot: null, camPos: null, rimBodies: [],
  aim: 0, aimOffset: 0, charging: false, chargeT: 0, charge: 0,
  cooldown: 0, held: null, balls: [],
  makes: 0, attempts: 0, streak: 0, best: 0, msgTimer: 0
};
try { shoot.best = +localStorage.getItem('drive.hoops.best') || 0; } catch (e) { /* storage blocked */ }

export let shooting = false;
const rimMat = new CANNON.Material('rim');
const boardMat = new CANNON.Material('board');
world.addContactMaterial(new CANNON.ContactMaterial(bouncyMat, rimMat, { friction: 0.2, restitution: 0.55 }));
// a lively backboard, so overhit shots carom away instead of always banking in
world.addContactMaterial(new CANNON.ContactMaterial(bouncyMat, boardMat, { friction: 0.05, restitution: 0.9 }));

// The court, hoop and push-around balls. stopOthers ends any other game when
// someone steps up to shoot.
export function buildCourt(stopOthers) {
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
  addArrow(makePad('Shoot hoops', court.x + 5, court.z + 2.5, '#e8742c', () => enterShoot(stopOthers), 'Shoot hoops ↵'), '#e8742c');

  for (let i = 0; i < 6; i++) {
    const r = 0.45;
    const body = new CANNON.Body({ mass: 0.6, material: bouncyMat, linearDamping: 0.15, angularDamping: 0.2 });
    body.addShape(new CANNON.Sphere(r));
    // off to the side of the court, out of the shooting lane
    body.position.set(court.x - 3 + (i % 3) * 1.1, r + 0.5, court.z + 3.4 + Math.floor(i / 3) * 1.0);
    sync(makeBall(r), body);
  }
}

// Called from buildCourt once the hoop exists
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

function enterShoot(stopOthers) {
  if (!shoot.rim || shooting) return;
  stopOthers();
  shooting = true;
  document.body.classList.add('is-shooting');
  dismissPad();
  clearInput();
  setCarVisible(false);
  shoot.arrow.visible = true;
  newShot();
  updateScore();
  flash(matchMedia('(pointer: coarse)').matches ? 'Hold the button, let go to shoot' : 'Hold space, let go to shoot');
}

export function exitShoot() {
  if (!shooting) return;
  shooting = false;
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

export function startCharge() {
  if (!shooting || shoot.cooldown > 0 || shoot.charging) return;
  shoot.charging = true;
  shoot.chargeT = 0;
}

export function release() {
  if (!shooting || !shoot.charging) return;
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

export function updateShoot(dt) {
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
