# Drive mode roadmap

Plans for the experimental drivable site at [adrik.me/drive](https://adrik.me/drive/)
(`public/drive/`). The main site is separate and isn't affected by anything here.

Status key: ✅ shipped · 🚧 in progress · 🔜 next · 💡 idea

---

## Shipped ✅

- Drivable car with smooth, stable handling (low centre of mass, eased throttle, anti-roll)
- Knock-over 3D "ADRIK" letters
- Signs: welcome, work, sports, life
- Tech-stack crate pyramid
- Basketball court with hoop and bouncy balls
- Ramp with a jump, traffic-cone slalom
- Family heart
- Link pads for LinkedIn and back to adrik.me
- Keyboard and touch controls, auto-flip, reset
- Linked from the main site's footer; `noindex` while experimental

---

## Phase 1: Soccer area 🔜

A small pitch next to the basketball court with a penalty / free-kick mini game.
The basketball court stays as it is.

### The pitch
- Grass rectangle with painted lines: penalty box, penalty spot, centre circle
- One full-size goal with posts, crossbar and a net (the net can be a thin
  physics wall behind the goal line, drawn as a mesh)
- A "Sports" sign variant or a small "Penalty challenge" sign that explains the game

### Penalty game
- **Start:** drive onto a start pad on the pitch. The ball spawns on the penalty
  spot and the HUD shows "5 shots".
- **Shoot:** drive into the ball to kick it. Shot power comes from the car's speed
  at impact, and direction from the angle of contact.
- **Keeper:** a simple goalkeeper block slides side to side across the goal line.
  It speeds up a little after each goal.
- **Scoring:** a goal counts when the ball fully crosses the goal line between the
  posts and under the bar. Show a "GOAL!" moment (net shake, confetti, ball resets).
- **Miss:** if the ball stops or leaves the box for ~3 seconds, count the shot as
  a miss and reset the ball to the spot.
- **End:** after 5 shots, show the score ("3 / 5") and the best score this visit,
  with buttons to play again or keep driving.

### Free-kick variant (stretch goal)
- The ball spawns at a random spot outside the box with a 3-4 block wall in front
- Same scoring rules; one shot per round

### Technical notes
- Ball: `CANNON.Sphere` with a bouncy contact material (the basketball setup works
  as a starting point). It needs a bit more mass so it doesn't rocket off the car.
- Goal detection: check the ball's position each frame against the goal mouth's
  box, not physics collisions, so it stays reliable at speed.
- Keeper: a kinematic body moved in code, so the ball bounces off it but it never
  gets knocked over.
- Best score: `localStorage`, wrapped in try/catch.
- Keep the game code in its own module (`soccer.js`) so `drive.js` doesn't keep
  growing.

### Done when
- You can play 5 penalties start to finish with a keyboard and on a phone
- Goals are never missed or double-counted
- The game resets cleanly if you drive away halfway through

---

## Phase 2: Ring of fire jump 🔜

A flaming hoop above a bigger ramp that you can launch the car through.

### Layout
- Replace or extend the current ramp: a longer take-off ramp, the ring floating in
  the air, and a landing ramp on the other side so the car lands smoothly
- A boost pad on the approach so the jump is reachable without a perfect run-up
- Floor markings ("SEND IT →") to show the line to take

### The ring
- Torus mesh with flames all around it: animated particles or a scrolling flame
  texture, plus an orange point light that flickers
- **Through the ring:** detect when the car crosses the ring's plane inside its
  radius. Trigger a celebration (flash, sparks, "Nice!" toast) and count
  successful jumps.
- **Clip the ring:** just bounce off it. No damage, so it stays fun.

### Technical notes
- Pass-through check: car position before and after each frame against the ring's
  plane (a segment-plane test), then the distance from the ring's centre
- Flames: one `THREE.Points` system with a custom shader or sprite texture. Keep
  the particle count low for phones.
- The ring has no physics body except optional thin "rim" colliders, so a slightly
  off jump doesn't stop dead
- Tune the ramp angle and boost strength so a full-throttle run from the boost pad
  goes through the ring about 80% of the time

### Done when
- The jump is fun and repeatable, and the car lands upright almost every time
- Flames look good and hold 60 fps on a mid-range laptop and a recent phone

---

## Phase 3: Polish 💡

Small things that make it feel like Bruno Simon's site.

- **Sound:** engine pitch that follows speed, tyre screech, thuds on impact, a crowd
  cheer on goals. Muted by default with a toggle.
- **Effects:** dust puffs behind the wheels, skid marks on hard turns, a little camera
  shake on big landings
- **Car:** a nicer custom car; brake lights that turn on when braking; headlights
  at dusk
- **Onboarding:** a short "drive here first" arrow and a tiny minimap
- **Mobile:** an on-screen joystick instead of four buttons, haptic buzz on goals
- **Loading:** a progress bar while the world builds

---

## Phase 4: More of the world 💡

- **Cars area:** a small showroom or garage of low-poly cars to drive between
- **Biking trail:** a winding path with a bike you can knock over, or a time trial
- **Movies corner:** a drive-in screen showing a looping trailer-style animation
- **Tech area:** stack the crates into something, or a "deploy" button that launches confetti
- **Day / night toggle**

---

## Housekeeping

- Split `drive.js` into modules (`car.js`, `world.js`, `soccer.js`, `fire-ring.js`) as it grows
- Pin versions and consider self-hosting three.js and cannon-es instead of relying on the CDN
- Basic performance budget: under 2 s to first frame on broadband, 60 fps on desktop
- When it feels finished: remove `noindex`, and add a link from the main hero, not just the footer
