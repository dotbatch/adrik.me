// The jump: boost pad, ramps and the ring of fire.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  COLORS, canvas, scene, world, groundMat, staticBody, mat, shadowed, canvasTexture, clock,
  reduceMotion
} from './core.js';
import { COM_DROP, chassisBody } from './car.js';
import { floorText } from './props.js';

// The jump runs toward -x along z = JUMP.z. The take-off lip is at x = -24 and the
// landing ramp's top at x = -32: the ring of fire floats over the gap between.
// The landing ramp is long and gentle so both normal and boosted jumps land on it.
const JUMP = { z: 30, w: 5, run: 10, rise: 3, landRun: 14, landRise: 2.6, takeoffX: -19, landX: -39, boostX: -9, boostLen: 6 };
// The car reaches ~14 m/s at the lip from almost any run-up; the boost gets it
// to ~16.5, which carries it noticeably further down the landing ramp.
const BOOST_SPEED = 22;
let boostMat = null;

// On the pad, top the car up to BOOST_SPEED along the run (only when already heading that way)
export function boost(dt) {
  const p = chassisBody.position;
  if (Math.abs(p.x - JUMP.boostX) > JUMP.boostLen / 2 || Math.abs(p.z - JUMP.z) > JUMP.w / 2 || p.y > 1.5) return;
  const v = -chassisBody.velocity.x;
  if (v > 2 && v < BOOST_SPEED) chassisBody.velocity.x -= (BOOST_SPEED - v) * Math.min(1, dt * 6);
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

function updateFireRing(t, dt, driving) {
  if (!fireRing) return;
  if (driving) checkRingPass(t);
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

// Boost pad, take-off ramp, ring of fire over the gap, landing ramp. It runs up
// the screen (-x) so you can see the landing coming.
export function buildJump() {
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
}

export function updateJump(t, dt, driving) {
  if (boostMat && !reduceMotion) boostMat.emissiveIntensity = 0.3 + Math.sin(t * 6) * 0.2;
  updateFireRing(t, dt, driving);
}
