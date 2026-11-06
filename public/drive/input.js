// What the player is holding: keyboard state (set from drive.js) and the touch buttons.

export const input = { forward: false, back: false, left: false, right: false, brake: false };
export const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake'
};

export function clearInput() {
  for (const k in input) input[k] = false;
}
addEventListener('blur', clearInput);

document.querySelectorAll('.pad [data-key], .shoot__touch [data-key]').forEach((btn) => {
  const k = btn.dataset.key;
  const on = (e) => { e.preventDefault(); input[k] = true; btn.classList.add('is-down'); };
  const off = () => { input[k] = false; btn.classList.remove('is-down'); };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointerleave', off);
  btn.addEventListener('pointercancel', off);
});
