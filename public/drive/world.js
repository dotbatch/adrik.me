// The world itself: ground, roads, edge walls and everything placed on them.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSoccer } from './soccer.js';
import {
  COLORS, FACE, scene, groundMat, sync, staticBody, mat, shadowed, box, canvasTexture
} from './core.js';
import { makeSign, placeSign, addSignpost, makeTree, addCone, labelTexture, floorText } from './props.js';
import { makePad } from './pads.js';
import { buildJump } from './jump.js';
import { buildCourt } from './hoops.js';

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

export function updateEdge(carPos) {
  edgeMat.uniforms.uCar.value.copy(carPos);
}

// ---------------------------------------------------------------------------
// Build the world (needs the font)
// ---------------------------------------------------------------------------
export let soccer = null;
export async function buildWorld() {
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

  // ---- Basketball court + shoot hoops (hoops.js) ----
  buildCourt(() => { if (soccer.active) soccer.stop(); });

  // ---- Soccer pitch + penalty challenge (soccer.js) ----
  soccer = createSoccer();

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

  // ---- Street signs at the junctions, each arrow aimed at its area ----
  const HOOPS = { text: 'Basketball', color: '#e8742c', to: [-14, -24] };   // court centre
  const SOCCER = { text: 'Soccer', color: '#3f9b4f', to: [-14, -46] };      // pitch centre
  const RAMP = { text: 'Ramp', color: COLORS.accent, to: [-19, 30] };       // take-off
  addSignpost(-2.5, 4.5, [RAMP, HOOPS, SOCCER]);
  addSignpost(-10, -4.5, [HOOPS, SOCCER]);
  addSignpost(-2.5, 26.5, [RAMP]);
  addSignpost(-46.5, -4.5, [{ text: 'Coming soon', color: COLORS.ink, to: [LOT.x, LOT.z] }]);

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
