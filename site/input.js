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
