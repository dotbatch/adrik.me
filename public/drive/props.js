// Things to place around the world: signs, balls, trees, cones, painted floor text.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  COLORS, FACE, scene, groundMat, sync, staticBody, mat, shadowed, box, canvasTexture,
  roundRect
} from './core.js';

export function makeSign(title, lines, { width = 6.4, accent = COLORS.accent } = {}) {
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

export function placeSign(sign, x, z) {
  sign.position.set(x, 0, z);
  sign.rotation.y = FACE;
  scene.add(sign);
  staticBody(new CANNON.Box(new CANNON.Vec3(3, 0.75, 0.15)), [x, 0.75, z], FACE);
}

// Basketball with seams
export function makeBall(r) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat('#e8742c')));
  const seam = new THREE.TorusGeometry(r * 1.005, r * 0.035, 6, 48);
  const s1 = new THREE.Mesh(seam, mat(COLORS.ink));
  const s2 = new THREE.Mesh(seam, mat(COLORS.ink)); s2.rotation.y = Math.PI / 2;
  const s3 = new THREE.Mesh(seam, mat(COLORS.ink)); s3.rotation.x = Math.PI / 2;
  g.add(s1, s2, s3);
  return shadowed(g);
}

export function makeTree(scale) {
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
export function addCone(x, z) {
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

export function labelTexture(text, bg, fg) {
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
export function floorText(text, x, z, size = 1, color = COLORS.path) {
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
