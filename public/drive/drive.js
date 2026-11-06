// adrik.me/drive: a small drivable world, inspired by bruno-simon.com.
// three.js for rendering, cannon-es for physics. Everything is built from
// primitive shapes in code, so there are no model files to load.
// This file routes the keyboard and runs the frame loop; the rest lives in its sibling modules.
import * as THREE from 'three';
import {
  CAM_OFFSET, canvas, renderer, scene, camera, sun, SUN_OFFSET, world, synced, clock
} from './core.js';
import { input, KEYMAP } from './input.js';
import { chassisBody, carMesh, resetCar, drive, parkCar, recoverCar } from './car.js';
import { activePad, updatePads } from './pads.js';
import { boost, updateJump } from './jump.js';
import { shoot, shooting, exitShoot, startCharge, release, updateShoot } from './hoops.js';
import { soccer, buildWorld, updateEdge } from './world.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (shooting) {
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) startCharge(); return; }
    if (e.code === 'Escape' || e.code === 'KeyR') { exitShoot(); return; }
  }
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyR') resetCar();
  if (e.code === 'Enter' && activePad) activePad.action();
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space' && shooting) release();
  if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
});

document.getElementById('reset').addEventListener('click', () => { resetCar(); canvas.focus(); });

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const _desiredCam = new THREE.Vector3();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);

  if (!shooting) { drive(dt); boost(dt); }
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
  const focus = soccer && !shooting ? soccer.update(dt, clock.elapsedTime, carMesh.position) : null;

  recoverCar(dt);

  // Camera + shadow light follow the car, or frame the hoop while shooting
  const ease = 1 - Math.pow(0.001, dt);
  if (shooting) {
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
  updateEdge(carMesh.position);

  const t = clock.elapsedTime;
  updatePads(carMesh.position, t, !shooting);
  updateJump(t, dt, !shooting);

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
