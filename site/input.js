export function bindMoveButton(button, move) {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || button.disabled) return;
    event.preventDefault();
    move();
  });
  button.addEventListener('click', event => {
    // Pointer input already ran on press; retain keyboard and assistive activation.
    if (!button.disabled && event.detail === 0 && !event.pointerType) move();
  });
}

export function bindGameGestures(game, surfaces) {
  // Keep rapid play taps out of browser zoom recognition, including control gaps.
  game.addEventListener('dblclick', event => event.preventDefault());
  for (const surface of surfaces) {
    // Pointer presses own movement. Reserve touch gestures from their start,
    // before a second contact or a drag can hand control to browser zooming.
    const reserveTouch = event => {
      if (event.cancelable) event.preventDefault();
    };
    for (const type of ['touchstart', 'touchmove', 'touchend']) {
      surface.addEventListener(type, reserveTouch, { passive: false });
    }
  }
}
