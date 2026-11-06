// Shared by everything in drive mode: palette, renderer, scene, physics world
// and the small mesh and material helpers.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const COLORS = {
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
export const CAM_OFFSET = new THREE.Vector3(11, 12, 5);
export const FACE = Math.atan2(CAM_OFFSET.x, CAM_OFFSET.z); // rotation that makes a plane face the camera

// ---------------------------------------------------------------------------
// Renderer, scene, lights
// ---------------------------------------------------------------------------
export const canvas = document.getElementById('scene');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.sky, 38, 85);

export const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight('#ffffff', COLORS.ground, 1.1));
export const sun = new THREE.DirectionalLight('#fff3e0', 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
export const SUN_OFFSET = new THREE.Vector3(12, 26, 14);

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
export const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.defaultContactMaterial.friction = 0.35;
world.defaultContactMaterial.restitution = 0.15;

export const groundMat = new CANNON.Material('ground');
export const bouncyMat = new CANNON.Material('bouncy');
world.addContactMaterial(new CANNON.ContactMaterial(groundMat, bouncyMat, { friction: 0.4, restitution: 0.75 }));

const groundBody = new CANNON.Body({ mass: 0, material: groundMat });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Things whose mesh follows a physics body
export const synced = [];
export function sync(mesh, body) {
  scene.add(mesh);
  world.addBody(body);
  synced.push({ mesh, body });
  mesh.position.copy(body.position);
  mesh.quaternion.copy(body.quaternion);
}

export function staticBody(shape, pos, rotY = 0, quat = null) {
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
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  return (mats[key] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts }));
}
export function shadowed(obj) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}
export function box(w, h, d, color, r = 0.08) {
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), mat(color));
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export const clock = new THREE.Clock();
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
