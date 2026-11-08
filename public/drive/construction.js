// Construction site: a fenced-off lot by the main road for whatever gets built
// next. An excavator, a dirt pile, and barriers and blocks you can knock over.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { COLORS, scene, groundMat, sync, staticBody, mat, shadowed, box, canvasTexture } from './core.js';
import { makeSign, placeSign, addCone } from './props.js';

export const SITE = { x: 2, z: 45, w: 14, d: 14 };       // centre and size (w along x, d along z)
export const SITE_COLOR = '#f2b631';                    // construction yellow
const GAP = 5;                                          // opening onto the jump road on the -z side

const stripes = canvasTexture(256, 64, (ctx, w, h) => {
  ctx.fillStyle = COLORS.paper; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = COLORS.accent;
  for (let x = -h; x < w; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, h); ctx.lineTo(x + 32, h); ctx.lineTo(x + 32 + h, 0); ctx.lineTo(x + h, 0);
    ctx.fill();
  }
});

// A-frame barrier: striped board on two legs, light enough to shove aside
function addBarrier(x, z, rotY) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.06),
    [mat(COLORS.ink), mat(COLORS.ink), mat(COLORS.ink), mat(COLORS.ink),
      new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 })]);
  board.position.y = 0.25;
  g.add(board);
  for (const lx of [-0.65, 0.65]) {
    const leg = box(0.08, 0.9, 0.08, COLORS.ink, 0.02);
    leg.position.set(lx, -0.1, 0);
    g.add(leg);
  }
  const body = new CANNON.Body({ mass: 1, material: groundMat });
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.8, 0.45, 0.2)));
  body.position.set(x, 0.46, z);
  body.quaternion.setFromEuler(0, rotY, 0);
  body.sleepSpeedLimit = 0.3;
  body.sleep();
  sync(shadowed(g), body);
}

// Excavator, kept low on purpose: anything tall sits between the fixed
// overhead camera and the car and hides it.
function buildExcavator(x, z, rotY) {
  const g = new THREE.Group();
  for (const tz of [-0.75, 0.75]) {
    const track = box(2.6, 0.6, 0.5, COLORS.ink, 0.2);
    track.position.set(0, 0.3, tz);
    g.add(track);
  }
  const body = box(2, 0.8, 1.8, SITE_COLOR, 0.1);
  body.position.y = 1;
  const cab = box(0.9, 0.9, 0.8, COLORS.paper, 0.1);
  cab.position.set(-0.3, 1.85, 0.45);
  // boom angles up and out along +x, the stick drops the bucket back to the ground
  const boom = box(2.2, 0.3, 0.3, SITE_COLOR, 0.06);
  boom.position.set(1.6, 1.9, -0.3);
  boom.rotation.z = 0.5;
  const stick = box(0.25, 1.6, 0.25, SITE_COLOR, 0.06);
  stick.position.set(2.75, 1.75, -0.3);
  stick.rotation.z = 0.25;
  const bucket = box(0.7, 0.5, 0.8, COLORS.ink, 0.08);
  bucket.position.set(3, 0.8, -0.3);
  g.add(body, cab, boom, stick, bucket);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(shadowed(g));
  staticBody(new CANNON.Box(new CANNON.Vec3(1.3, 1.1, 1)), [x, 1.1, z], rotY);
}

export function buildConstruction() {
  const { x: cx, z: cz, w, d } = SITE;
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat('#bf9a74'));
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(cx, 0.012, cz);
  lot.receiveShadow = true;
  scene.add(lot);

  // Barriers round the edge, leaving a gap where the road comes in
  const STEP = 2.2;
  for (let a = -w / 2 + 1; a <= w / 2 - 1; a += STEP) {
    if (Math.abs(a) > GAP / 2) addBarrier(cx + a, cz - d / 2, 0);   // road side, either side of the gap
    addBarrier(cx + a, cz + d / 2, 0);                               // far side
    addBarrier(cx - w / 2, cz + a, Math.PI / 2);
    addBarrier(cx + w / 2, cz + a, Math.PI / 2);
  }

  buildExcavator(cx - 2, cz + 1, -0.4);   // bucket reaching for the dirt pile

  // Low dirt pile: the collider is a blunt cone, so the car bumps up and over it
  const pile = shadowed(new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 9), mat('#a8784f', { flatShading: true })));
  pile.position.set(cx + 3.5, 0.6, cz + 3.5);
  scene.add(pile);
  staticBody(new CANNON.Cylinder(0.3, 2.2, 1.2, 9), [cx + 3.5, 0.6, cz + 3.5]);

  // A pallet of concrete blocks to knock over
  const B = { w: 0.8, h: 0.4, d: 0.4 };
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 3 - row; i++) {
      const m = box(B.w, B.h, B.d, '#b5b0a8', 0.03);
      const body = new CANNON.Body({ mass: 0.8, material: groundMat });
      body.addShape(new CANNON.Box(new CANNON.Vec3(B.w / 2, B.h / 2, B.d / 2)));
      body.position.set(cx + 3, B.h / 2 + row * B.h + 0.01, cz - 2.5 + (i - (2 - row) / 2) * (B.d + 0.02));
      body.quaternion.setFromEuler(0, Math.PI / 2, 0);
      body.sleepSpeedLimit = 0.2;
      body.sleep();
      sync(shadowed(m), body);
    }
  }

  for (const [x, z] of [[-1.5, -4.5], [1.5, -4.5], [0, 1], [-2, 4]]) addCone(cx + x, cz + z);

  placeSign(makeSign('Under construction', [
    'Something new is being built here.',
    'Check back soon to see what it is.',
    'Feel free to move the barriers.'
  ], { accent: SITE_COLOR }), cx, cz + d / 2 + 2);
}
