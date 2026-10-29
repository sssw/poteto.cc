export function inputScenarios(api, makeSurface, emit) {
  const results = [];
  const equal = (actual, expected, label) => {
    if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
  };
  const fixture = () => {
    const game = new api.Relay(() => 0);
    const root = makeSurface();
    const left = makeSurface();
    const right = makeSurface();
    const menu = makeSurface();
    api.bindMoveButton(left, () => game.move(1));
    api.bindMoveButton(right, () => game.move(2));
    api.bindGameGestures(root, [left, right]);
    return { game, root, left, right, menu };
  };
  const press = (surface, id, primary = true) => {
    emit(surface, 'pointerdown', { button: 0, pointerId: id, pointerType: 'touch', isPrimary: primary });
    equal(emit(surface, 'touchstart').defaultPrevented, true, 'Touch start reserves the play surface');
  };
  const release = (surface, id) => {
    emit(surface, 'pointerup', { button: 0, pointerId: id, pointerType: 'touch' });
    equal(emit(surface, 'touchend').defaultPrevented, true, 'Touch end cannot trigger zoom');
    emit(surface, 'click', { detail: 1, pointerType: 'touch' });
  };
  const check = (name, run) => {
    const f = fixture();
    run(f);
    results.push({ name, passed: true, moves: f.game.moves });
  };
  check('240 rapid presses have exactly 240 moves', ({ game, left }) => {
    for (let i = 0; i < 240; i++) { press(left, 1); release(left, 1); }
    equal(game.moves, 240, 'Rapid move count');
    equal(Math.max(...game.platforms.map(p => p.cell)), 241, 'Every one-space command reaches the model');
  });
  for (const reverse of [false, true]) {
    check(`Two overlapping contacts on one button, ${reverse ? 'reverse' : 'forward'} release`, ({ game, left }) => {
      press(left, 1);
      press(left, 2, false);
      equal(game.moves, 2, 'Both contacts act before either is released');
      equal(emit(left, 'touchmove').defaultPrevented, true, 'Dragging cannot start browser zoom');
      for (const id of reverse ? [2, 1] : [1, 2]) release(left, id);
      equal(game.moves, 2, 'Releases do not duplicate presses');
    });
    check(`128 overlapping left/right pairs, ${reverse ? 'right' : 'left'} first`, ({ game, left, right }) => {
      for (let i = 0; i < 128; i++) {
        const surfaces = reverse ? [right, left] : [left, right];
        press(surfaces[0], 1);
        press(surfaces[1], 2, false);
        release(surfaces[1], 2);
        release(surfaces[0], 1);
      }
      equal(game.moves, 256, 'Both sides are independent');
      equal(Math.max(...game.platforms.map(p => p.cell)), 385, 'One- and two-space commands retain their values');
    });
  }
  check('Cancellation and reused contact IDs never leave a stuck control', ({ game, left }) => {
    press(left, 7);
    emit(left, 'pointercancel', { pointerId: 7, pointerType: 'touch' });
    emit(left, 'touchcancel');
    press(left, 7);
    release(left, 7);
    equal(game.moves, 2, 'A cancelled press is not replayed and the next press works');
  });
  check('Non-cancelable events and accessibility clicks remain safe', ({ game, left }) => {
    emit(left, 'touchmove', { cancelable: false });
    emit(left, 'click', { detail: 0 });
    emit(left, 'click', { detail: 0, pointerType: '' });
    equal(game.moves, 2, 'Keyboard and assistive activation');
  });
  check('Menu scrolling and activation are outside touch cancellation', ({ menu, root }) => {
    for (const type of ['touchstart', 'touchmove', 'touchend', 'click']) {
      equal(emit(menu, type).defaultPrevented, false, `Menu ${type}`);
    }
    equal(emit(root, 'dblclick').defaultPrevented, true, 'Double-click default in the play area');
    equal(emit(root, 'click').defaultPrevented, false, 'Normal menu click inside the game');
  });
  return results;
}
