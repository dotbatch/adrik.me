// The car: physics body, raycast vehicle, meshes and how it drives.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COLORS, scene, world, groundMat, mat, shadowed, box } from './core.js';
import { input } from './input.js';

// ---------------------------------------------------------------------------
// The car
// ---------------------------------------------------------------------------
const SPAWN = new CANNON.Vec3(4, 1.6, 0);

// The box sits COM_DROP above the body's origin, which puts the centre of mass
// down near the axles. A low centre of mass is what keeps a car from tipping.
export const COM_DROP = 0.35;
// Only the wheels grip. With a frictionless body the car slides off a ramp's side
// edge instead of wedging on it at full throttle.
const chassisMat = new CANNON.Material('chassis');
world.addContactMaterial(new CANNON.ContactMaterial(chassisMat, groundMat, { friction: 0, restitution: 0.15 }));
export const chassisBody = new CANNON.Body({ mass: 150, material: chassisMat, angularDamping: 0.7, linearDamping: 0.08 });
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
export const carMesh = new THREE.Group();
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

export function resetCar(atSpawn = true) {
  const p = atSpawn ? SPAWN : chassisBody.position;
  chassisBody.position.set(p.x, atSpawn ? SPAWN.y : p.y + 1.5, p.z);
  // keep the heading when flipping back over, otherwise face forward
  const q = chassisBody.quaternion;
  const heading = atSpawn ? 0 : new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w), 'YXZ').y;
  chassisBody.quaternion.setFromEuler(0, heading, 0);
  chassisBody.velocity.setZero();
  chassisBody.angularVelocity.setZero();
}

export function placeCar(x, z, yaw = 0) {
  chassisBody.position.set(x, 1.2, z);
  chassisBody.quaternion.setFromEuler(0, yaw, 0);
  chassisBody.velocity.setZero();
  chassisBody.angularVelocity.setZero();
  throttle = 0;
  steer = 0;
}

export function setCarVisible(visible) {
  carMesh.visible = visible;
  wheelMeshes.forEach((w) => { w.visible = visible; });
}

export function parkCar() {
  for (let i = 0; i < 4; i++) { vehicle.applyEngineForce(0, i); vehicle.setBrake(10, i); }
}

// Fell off the world, or stuck on its roof for a couple of seconds
let upsideDownFor = 0;
export function recoverCar(dt) {
  if (chassisBody.position.y < -10) resetCar();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(carMesh.quaternion);
  upsideDownFor = up.y < 0.3 ? upsideDownFor + dt : 0;
  if (upsideDownFor > 2) { resetCar(false); upsideDownFor = 0; }
}

const MAX_FORCE = 700;      // total engine force, split across all four wheels
const MAX_STEER = 0.5;      // radians at a standstill
const MAX_SPEED = 15;       // m/s forward
const MAX_REVERSE = 6;      // m/s backward
let steer = 0;
let throttle = 0;

const _fwd = new CANNON.Vec3();
function forwardSpeed() {
  chassisBody.quaternion.vmult(new CANNON.Vec3(-1, 0, 0), _fwd);
  return chassisBody.velocity.dot(_fwd);
}

export function drive(dt) {
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
