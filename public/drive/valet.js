// Valet: cars parked outside a small lot. Drive onto the spot in front of one
// and press Enter to swap: you take that car and yours gets parked in its place.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COLORS, scene, mat, staticBody } from './core.js';
import { CARS, makeCarBody, makeWheel, carStyle, setCarStyle } from './car.js';
import { makePad, refreshPrompt } from './pads.js';
import { makeSign, placeSign } from './props.js';

export const VALET = { x: -50, z: -20, w: 20, d: 14 };   // centre and size (w along x, d along z)
const BAYS = [-56, -50, -44];                             // bay centres along x
const BAY_Z = VALET.z - 4;
const PAD_Z = VALET.z + 2.5;
const PARKED_Y = 0.23;   // chassis origin height when the driven car rests on its wheels (measured)
const WHEEL_R = 0.34;
export const VALET_COLOR = COLORS.purple;

function parkedCar(style, x) {
  const g = new THREE.Group();
  g.add(makeCarBody(style));
  for (const [wx, wz] of [[-0.8, 0.68], [-0.8, -0.68], [0.8, 0.68], [0.8, -0.68]]) {
    const w = makeWheel();
    w.position.set(wx, WHEEL_R - PARKED_Y, wz);   // sitting on the ground
    g.add(w);
  }
  g.position.set(x, PARKED_Y, BAY_Z);
  g.rotation.y = Math.PI / 2;   // nose toward the pad, so it's ready to drive out
  scene.add(g);
  return g;
}

const promptFor = (style) => `Drive the ${style.name} ↵`;

export function buildValet() {
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(VALET.w, VALET.d), mat('#8d7a6b'));
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(VALET.x, 0.012, VALET.z);
  lot.receiveShadow = true;
  scene.add(lot);

  // Painted lines between the bays
  const lineMat = mat(COLORS.paper);
  for (let i = 0; i <= BAYS.length; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 3.6), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(BAYS[0] - 3 + i * 6, 0.016, BAY_Z);
    scene.add(line);
  }

  BAYS.forEach((x, i) => {
    const bay = { style: CARS[i + 1], mesh: parkedCar(CARS[i + 1], x) };
    staticBody(new CANNON.Box(new CANNON.Vec3(1.2, 0.45, 0.62)), [x, 0.6, BAY_Z], Math.PI / 2);
    const pad = makePad('Swap', x, PAD_Z, VALET_COLOR, () => {
      const mine = carStyle;
      setCarStyle(bay.style);
      scene.remove(bay.mesh);
      bay.style = mine;
      bay.mesh = parkedCar(mine, x);
      pad.promptText = promptFor(mine);
      refreshPrompt();
    }, promptFor(bay.style));
  });

  placeSign(makeSign('Valet', [
    'Pick a different car to drive.',
    'Park on a spot and press Enter.',
    'Your car waits here for you.'
  ], { accent: VALET_COLOR }), VALET.x, VALET.z - VALET.d / 2 - 2);
}
