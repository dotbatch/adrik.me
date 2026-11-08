// Interactive pads: drive onto one, press Enter (or tap the prompt).
import * as THREE from 'three';
import { FACE, scene, mat, shadowed, box, reduceMotion } from './core.js';
import { floorText } from './props.js';

// ---- Interactive pads: drive onto them, press Enter ----
const pads = [];
export let activePad = null;
export function makePad(label, x, z, color, action, promptText = `Open ${label} ↵`, enabled = null) {
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
export function addArrow(pad, color) {
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

const prompt = document.getElementById('prompt');
const promptBtn = document.getElementById('prompt-btn');
promptBtn.addEventListener('click', () => activePad && activePad.action());

// For pads whose action changes their own prompt while you're still on them
export function refreshPrompt() {
  if (activePad) promptBtn.textContent = activePad.promptText;
}

export function dismissPad() {
  prompt.classList.remove('is-visible');
  activePad = null;
}

export function updatePads(carPos, t, driving) {
  const car2 = new THREE.Vector2(carPos.x, carPos.z);
  let near = null;
  for (const p of pads) {
    const open = driving && (!p.enabled || p.enabled());
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
  if (near !== activePad) {
    activePad = near;
    if (near) promptBtn.textContent = near.promptText;
    prompt.classList.toggle('is-visible', !!near);
  }
}
