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
    // Moves already happen on pointerdown. Cancel only the touch release default,
    // so WebKit cannot reinterpret a pair of play taps as a zoom gesture.
    surface.addEventListener('touchend', event => {
      if (event.cancelable) event.preventDefault();
    }, { passive: false });
  }
}
