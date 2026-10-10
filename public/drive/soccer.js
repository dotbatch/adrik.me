// Penalty challenge: a small pitch with a goal and a keeper.
// Park on the green pad, then drive into the ball to shoot. Five shots per round.
//
// drive.js owns the renderer, physics world and car; it hands what this module
// needs in `ctx` and calls update() once per frame after the physics step.

const PITCH = { x: -14, z: -46, len: 26, wid: 18 };   // centre and size, metres
const GOAL_X = PITCH.x - PITCH.len / 2;                // goal line (x = -27)
const GOAL = { halfW: 3.2, h: 2.3, depth: 1.8 };
const SPOT_X = GOAL_X + 8.5;                           // penalty spot
const START = { x: GOAL_X + 17, z: PITCH.z };          // where the car lines up
const BALL_R = 0.42;
const SHOTS = 5;
const BEST_KEY = 'drive.penalties.best';

export function createSoccer(ctx) {
  const { THREE, CANNON, scene, world, mat, box, shadowed, canvasTexture, staticBody, sync,
    floorText, makePad, makeSign, placeSign, chassisBody, groundMat, placeCar, COLORS } = ctx;

  const ui = {
    root: document.getElementById('penalty'),
    shots: document.getElementById('penalty-shots'),
    goals: document.getElementById('penalty-goals'),
    best: document.getElementById('penalty-best'),
    msg: document.getElementById('penalty-msg')
  };

  // ---------------------------------------------------------------------------
  // Pitch
  // ---------------------------------------------------------------------------
  const PX = 40; // canvas pixels per metre
  const tex = canvasTexture(PITCH.len * PX, PITCH.wid * PX, (c, w, h) => {
    // mown stripes
    for (let i = 0; i < 13; i++) {
      c.fillStyle = i % 2 ? '#6fa95a' : '#79b464';
      c.fillRect((i * w) / 13, 0, w / 13 + 1, h);
    }
    c.strokeStyle = 'rgba(255,255,255,.9)';
    c.lineWidth = 0.12 * PX;
    const m = (v) => v * PX;
    const cy = h / 2;
    c.strokeRect(m(0.1), m(0.1), w - m(0.2), h - m(0.2));                 // touchlines
    c.strokeRect(m(0.1), cy - m(6.5), m(10.5), m(13));                     // penalty box
    c.strokeRect(m(0.1), cy - m(4.2), m(4), m(8.4));                       // six-yard box
    c.beginPath(); c.arc(m(SPOT_X - GOAL_X), cy, m(0.2), 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    c.beginPath(); c.arc(m(SPOT_X - GOAL_X), cy, m(4.5), -0.93, 0.93); c.stroke();   // the D
    c.beginPath(); c.moveTo(w - m(0.1), 0); c.lineTo(w - m(0.1), h); c.stroke();       // halfway line
    c.beginPath(); c.arc(w, cy, m(4.5), Math.PI / 2, Math.PI * 1.5); c.stroke();       // centre circle
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.len, PITCH.wid), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.set(PITCH.x, 0.018, PITCH.z);
  pitch.receiveShadow = true;
  scene.add(pitch);

  // ---------------------------------------------------------------------------
  // Goal: posts, bar and a net that catches the ball
  // ---------------------------------------------------------------------------
  const netPhys = new CANNON.Material('net');
  const ballPhys = new CANNON.Material('soccer');
  const keeperPhys = new CANNON.Material('keeper');
  world.addContactMaterial(new CANNON.ContactMaterial(ballPhys, groundMat, { friction: 0.4, restitution: 0.45 }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballPhys, netPhys, { friction: 0.9, restitution: 0.05 }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballPhys, keeperPhys, { friction: 0.3, restitution: 0.5 }));

  const goal = new THREE.Group();
  const white = mat('#ffffff');
  const post = (x, z, h) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, h, 12), white);
    p.position.set(x, h / 2, z);
    goal.add(p);
  };
  post(GOAL_X, PITCH.z - GOAL.halfW, GOAL.h);
  post(GOAL_X, PITCH.z + GOAL.halfW, GOAL.h);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, GOAL.halfW * 2 + 0.18, 12), white);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(GOAL_X, GOAL.h, PITCH.z);
  goal.add(bar);
  // back frame
  const backX = GOAL_X - GOAL.depth;
  for (const z of [PITCH.z - GOAL.halfW, PITCH.z + GOAL.halfW]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, GOAL.h, 8), mat('#d9d9d9'));
    b.position.set(backX, GOAL.h / 2, z);
    goal.add(b);
  }

  const netTex = canvasTexture(128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,.85)';
    c.lineWidth = 3;
    for (let i = 0; i <= 8; i++) {
      c.beginPath(); c.moveTo((i * w) / 8, 0); c.lineTo((i * w) / 8, h); c.stroke();
      c.beginPath(); c.moveTo(0, (i * h) / 8); c.lineTo(w, (i * h) / 8); c.stroke();
    }
  });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  const netMat = (rx, ry) => {
    const t = netTex.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  };
  const net = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL.halfW * 2, GOAL.h), netMat(6, 2.3));
  back.rotation.y = Math.PI / 2;
  back.position.set(backX, GOAL.h / 2, PITCH.z);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL.depth, GOAL.halfW * 2), netMat(1.8, 6));
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(GOAL_X - GOAL.depth / 2, GOAL.h, PITCH.z);
  net.add(back, roof);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(GOAL.depth, GOAL.h), netMat(1.8, 2.3));
    side.position.set(GOAL_X - GOAL.depth / 2, GOAL.h / 2, PITCH.z + s * GOAL.halfW);
    net.add(side);
  }
  goal.add(net);
  scene.add(shadowed(goal));
  net.traverse((o) => { o.castShadow = false; });

  // physics: posts and bar, then thin walls for the net
  const wall = (hx, hy, hz, x, y, z) => {
    const b = staticBody(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), [x, y, z]);
    b.material = netPhys;
    return b;
  };
  for (const z of [PITCH.z - GOAL.halfW, PITCH.z + GOAL.halfW]) {
    staticBody(new CANNON.Cylinder(0.09, 0.09, GOAL.h, 8), [GOAL_X, GOAL.h / 2, z]);
  }
  staticBody(new CANNON.Box(new CANNON.Vec3(0.09, 0.09, GOAL.halfW)), [GOAL_X, GOAL.h, PITCH.z]);
  wall(0.05, GOAL.h / 2, GOAL.halfW, backX - 0.05, GOAL.h / 2, PITCH.z);
  wall(GOAL.depth / 2, 0.05, GOAL.halfW, GOAL_X - GOAL.depth / 2, GOAL.h + 0.05, PITCH.z);
  wall(GOAL.depth / 2, GOAL.h / 2, 0.05, GOAL_X - GOAL.depth / 2, GOAL.h / 2, PITCH.z - GOAL.halfW - 0.05);
  wall(GOAL.depth / 2, GOAL.h / 2, 0.05, GOAL_X - GOAL.depth / 2, GOAL.h / 2, PITCH.z + GOAL.halfW + 0.05);

  // ---------------------------------------------------------------------------
  // Keeper: kinematic, so the ball bounces off but it can't be knocked over
  // ---------------------------------------------------------------------------
  const keeperMesh = new THREE.Group();
  const kit = '#7b61ff';
  const torso = box(0.45, 0.8, 0.7, kit, 0.15); torso.position.y = 1.05;
  const shorts = box(0.42, 0.35, 0.66, COLORS.ink, 0.1); shorts.position.y = 0.5;
  const legs = box(0.3, 0.45, 0.5, '#f1d2b6', 0.08); legs.position.y = 0.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), mat('#e8bf9a')); head.position.y = 1.7;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(COLORS.ink)); hair.position.y = 1.73;
  keeperMesh.add(torso, shorts, legs, head, hair);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    const sleeve = box(0.18, 0.18, 0.6, kit, 0.08); sleeve.position.z = s * 0.3;
    const glove = box(0.22, 0.24, 0.2, '#ffd23f', 0.08); glove.position.z = s * 0.66;
    arm.add(sleeve, glove);
    arm.position.set(0, 1.3, s * 0.32);
    keeperMesh.add(arm);
    arms.push({ arm, s });
  }
  shadowed(keeperMesh);

  const KEEPER_X = GOAL_X + 0.45;
  const keeper = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: keeperPhys });
  keeper.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.9, 0.72)), new CANNON.Vec3(0, 0.9, 0)); // arm span
  keeper.position.set(KEEPER_X, 0, PITCH.z);
  sync(keeperMesh, keeper);

  // ---------------------------------------------------------------------------
  // Ball: white with 12 dark patches
  // ---------------------------------------------------------------------------
  const ballMesh = new THREE.Group();
  ballMesh.add(new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), mat('#ffffff')));
  const ico = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
  const seen = new Set();
  const patchGeo = new THREE.CircleGeometry(BALL_R * 0.34, 5);
  for (let i = 0; i < ico.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(ico, i).normalize();
    const key = v.toArray().map((n) => n.toFixed(3)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const patch = new THREE.Mesh(patchGeo, mat(COLORS.ink, { side: THREE.DoubleSide }));
    patch.position.copy(v).multiplyScalar(BALL_R * 1.004);
    patch.lookAt(v.clone().multiplyScalar(2));
    ballMesh.add(patch);
  }
  shadowed(ballMesh);

  const ball = new CANNON.Body({ mass: 0.9, material: ballPhys, linearDamping: 0.28, angularDamping: 0.45 });
  ball.addShape(new CANNON.Sphere(BALL_R));
  ball.allowSleep = false;
  sync(ballMesh, ball);

  function resetBall() {
    ball.position.set(SPOT_X, BALL_R + 0.02, PITCH.z);
    ball.velocity.setZero();
    ball.angularVelocity.setZero();
    ball.quaternion.set(0, 0, 0, 1);
  }
  resetBall();

  // Driving into the ball gives it a proper kick: away from the car, faster than
  // a plain bounce, with a little lift so shots can rise.
  let pendingKick = null;
  let kickCooldown = 0;
  let keeperTouched = false;
  ball.addEventListener('collide', (e) => {
    if (e.body === chassisBody && kickCooldown <= 0) {
      pendingKick = Math.hypot(chassisBody.velocity.x, chassisBody.velocity.z);
    }
    if (e.body === keeper) keeperTouched = true;
  });

  function applyKick(carSpeed) {
    kickCooldown = 0.35;
    if (carSpeed < 1) return;
    let dx = ball.position.x - chassisBody.position.x;
    let dz = ball.position.z - chassisBody.position.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const v = ball.velocity;
    // a proper strike even from a short run-up, capped so it stays catchable
    const speed = Math.max(Math.hypot(v.x, v.z), Math.min(Math.max(carSpeed * 1.6, 11), 22));
    v.x = dx * speed;
    v.z = dz * speed;
    v.y = Math.max(v.y, carSpeed * 0.22);
  }

  // ---------------------------------------------------------------------------
  // Signs + start pad
  // ---------------------------------------------------------------------------
  placeSign(makeSign('Penalties', [
    'I play soccer too.',
    'Park on the green pad, then drive',
    'into the ball. Five shots. Beat the keeper.'
  ], { accent: '#3f9b4f' }), PITCH.x + 10.5, PITCH.z + 8);

  const game = { active: false, state: 'idle', shots: 0, goals: 0, timer: 0, best: 0 };
  try { game.best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { /* storage blocked */ }

  makePad('Penalties', START.x, START.z, '#3f9b4f', start, 'Take penalties ↵', () => !game.active);
  floorText('⚽', SPOT_X + 2.2, PITCH.z, 0.35, '#ffffff');

  // ---------------------------------------------------------------------------
  // Game
  // ---------------------------------------------------------------------------
  function render() {
    ui.shots.textContent = `${game.shots}/${SHOTS}`;
    ui.goals.textContent = game.goals;
    ui.best.textContent = game.best;
  }

  function flash(text, cls = '') {
    ui.msg.textContent = text;
    ui.msg.className = 'penalty__msg';
    void ui.msg.offsetWidth; // restart the animation
    ui.msg.className = `penalty__msg pop ${cls}`;
  }

  function lineUp() {
    resetBall();
    placeCar(START.x, START.z, 0);
    keeperTouched = false;
    game.state = 'ready';
    game.timer = 0;
  }

  function start() {
    game.active = true;
    game.shots = 0;
    game.goals = 0;
    document.body.classList.add('is-penalty');
    render();
    lineUp();
    flash('Drive into the ball');
  }

  function stop() {
    game.active = false;
    game.state = 'idle';
    document.body.classList.remove('is-penalty');
  }

  function finishShot(result) {
    game.state = 'result';
    game.timer = 0;
    if (result === 'goal') {
      game.goals++;
      flash('GOAL!', 'is-goal');
      celebrate();
      shakeNet = 1;
    } else {
      flash({ saved: 'Saved!', wide: 'Wide', over: 'Over the bar', short: 'Not enough' }[result]);
    }
    render();
  }

  function endRound() {
    game.state = 'over';
    game.timer = 0;
    if (game.goals > game.best) {
      game.best = game.goals;
      try { localStorage.setItem(BEST_KEY, game.best); } catch (e) { /* ignore */ }
      flash(`${game.goals}/${SHOTS} · new best!`, 'is-goal');
    } else {
      flash(`${game.goals}/${SHOTS}`);
    }
    render();
  }

  // ---- Confetti on goals ----
  const confetti = [];
  const confettiGeo = new THREE.PlaneGeometry(0.16, 0.1);
  const confettiColors = ['#ff6a2b', '#7b61ff', '#2ec4b6', '#ffd23f', '#ffffff'];
  function celebrate() {
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: confettiColors[i % 5], side: THREE.DoubleSide }));
      m.position.set(GOAL_X + 0.5, GOAL.h + 0.3, PITCH.z + (Math.random() - 0.5) * GOAL.halfW * 2);
      m.userData.v = new THREE.Vector3(2 + Math.random() * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 6);
      m.userData.spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0);
      m.userData.life = 2.2;
      scene.add(m);
      confetti.push(m);
    }
  }

  let shakeNet = 0;
  let diveError = 0;
  const REACTION = 0.3; // seconds before the keeper reacts to a shot

  // Where the camera should look while playing: between the car and the goal
  const focus = new THREE.Vector3();
  const goalCentre = new THREE.Vector3(GOAL_X, 0, PITCH.z);

  function update(dt, t, carPos) {
    if (pendingKick !== null) { applyKick(pendingKick); pendingKick = null; }
    kickCooldown -= dt;

    const p = ball.position;
    const v = ball.velocity;
    const speed = v.length();

    // ---- Keeper: shuffles across the line, then reacts once the ball is struck ----
    const level = game.active ? game.goals : 0;
    // After a short reaction delay it dives to where it *guesses* the ball will
    // cross the line. The guess is a little off, so well-placed shots beat it.
    let targetZ;
    const diving = game.state === 'flight' && game.timer > REACTION && v.x < -0.5;
    if (diving) {
      const zAtLine = p.z + v.z * ((GOAL_X - p.x) / v.x);
      targetZ = zAtLine + diveError;
    } else {
      targetZ = PITCH.z + Math.sin(t * (1.1 + level * 0.18)) * 2.1;
    }
    targetZ = Math.max(PITCH.z - 2.3, Math.min(PITCH.z + 2.3, targetZ));
    const maxV = diving ? 1.9 + level * 0.25 : 2.4;
    keeper.velocity.set(0, 0, Math.max(-maxV, Math.min(maxV, (targetZ - keeper.position.z) * 6)));
    keeper.position.x = KEEPER_X;
    // arms go up when the ball is coming
    const reach = game.state === 'flight' ? 1 : 0.25;
    for (const { arm, s } of arms) arm.rotation.x += ((-s * reach * 0.9) - arm.rotation.x) * Math.min(1, dt * 8);
    keeperMesh.rotation.x = keeper.velocity.z * -0.04;

    // ---- Net shake ----
    if (shakeNet > 0) {
      shakeNet = Math.max(0, shakeNet - dt * 1.5);
      net.position.x = -Math.sin(t * 40) * 0.08 * shakeNet;
    }

    // ---- Confetti ----
    for (let i = confetti.length - 1; i >= 0; i--) {
      const m = confetti[i];
      const u = m.userData;
      u.life -= dt;
      u.v.y -= 9.8 * dt * 0.5;
      u.v.multiplyScalar(0.985);
      m.position.addScaledVector(u.v, dt);
      m.rotation.x += u.spin.x * dt;
      m.rotation.y += u.spin.y * dt;
      if (u.life <= 0 || m.position.y < 0) {
        scene.remove(m);
        m.material.dispose();
        confetti.splice(i, 1);
      }
    }

    // ---- Free play: bring the ball back if it wanders off or sits in the net ----
    if (!game.active) {
      const away = Math.hypot(p.x - SPOT_X, p.z - PITCH.z);
      const inNet = p.x < GOAL_X && Math.abs(p.z - PITCH.z) < GOAL.halfW;
      game.timer = (away > 30 || inNet || p.y < -2) && speed < 0.5 ? game.timer + dt : 0;
      if (game.timer > 2.5) { resetBall(); game.timer = 0; }
      return null;
    }

    // ---- Penalty round ----
    game.timer += dt;

    // walked away from it: call the round off
    if (carPos && Math.hypot(carPos.x - SPOT_X, carPos.z - PITCH.z) > 40) { stop(); return null; }

    if (game.state === 'ready') {
      if (speed > 1.2) {
        game.state = 'flight';
        game.timer = 0;
        diveError = (Math.random() - 0.5) * 1.6;
        game.shots++;
        render();
      }
    } else if (game.state === 'flight') {
      const inMouth = Math.abs(p.z - PITCH.z) < GOAL.halfW - BALL_R * 0.5;
      if (p.x < GOAL_X - BALL_R && inMouth && p.y < GOAL.h) finishShot('goal');
      else if (p.x < GOAL_X - BALL_R) finishShot(p.y >= GOAL.h ? 'over' : 'wide');
      else if (game.timer > 5 || (game.timer > 1 && speed < 0.4)) finishShot(keeperTouched ? 'saved' : 'short');
      else if (keeperTouched && v.x > 0.5 && game.timer > 0.4) finishShot('saved');
    } else if (game.state === 'result' && game.timer > 1.8) {
      if (game.shots >= SHOTS) endRound();
      else lineUp();
    } else if (game.state === 'over' && game.timer > 3.5) {
      stop();
      resetBall();
    }

    // camera frames the car and the goal together
    return carPos ? focus.copy(carPos).lerp(goalCentre, 0.5) : null;
  }

  render();
  return {
    update,
    ball,
    get active() { return game.active; },
    stop,
    clear: (x, z) => x > PITCH.x - PITCH.len / 2 - 6 && x < PITCH.x + PITCH.len / 2 + 6 &&
      z > PITCH.z - PITCH.wid / 2 - 5 && z < PITCH.z + PITCH.wid / 2 + 5
  };
}
