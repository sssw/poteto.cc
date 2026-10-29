export const TIMING = Object.freeze({
  shortJump: 0.62,
  longJump: 0.78,
  tripleSpeed: 0.8,
  platformPerCell: 0.18,
  platformLift: 0.16,
  jumpHeight: 0.82,
  extraJumpHeight: 0.16,
  maxFrame: 1 / 15,
  revealHeight: 1.2,
  revealLead: 1 / 120,
});

const smoothStep = value => value * value * (3 - 2 * value);

export function platformHeight(cell) {
  return Math.min(48, Math.max(30, cell * 0.34));
}

export class Relay {
  constructor(random = Math.random) {
    this.random = random;
    this.cellWidth = 96;
    this.verticalScale = 1;
    this.reset();
  }

  reset() {
    this.platforms = [
      { id: 0, cell: 0, from: 0, fromLift: 0, number: 1, motion: 1, duration: 0 },
      { id: 1, cell: 1, from: 1, fromLift: 0, number: 1, motion: 1, duration: 0 },
    ];
    this.course = new Map([[0, 1], [1, 1]]);
    this.generatedThrough = 1;
    this.status = 'ready';
    this.phase = 'jump';
    this.revealNumber = 0;
    this.score = 0;
    this.landings = 0;
    this.moves = 0;
    this.position = 1;
    this.start = 1;
    this.target = 2;
    this.progress = 0;
    this.flightElapsed = 0;
    this.distance = 1;
    this.elapsed = 0;
  }

  numberAt(cell) {
    // Keep a cell's number stable when platforms alternate across it.
    while (this.generatedThrough < cell) {
      const roll = this.random() * 11;
      this.course.set(++this.generatedThrough, roll < 4 ? 1 : roll < 8 ? 2 : roll < 10 ? 3 : 0);
    }
    return this.course.get(cell) ?? 1;
  }

  duration() {
    if (this.phase === 'reveal') return TIMING.shortJump;
    const base = TIMING.shortJump + (this.distance - 1) * (TIMING.longJump - TIMING.shortJump);
    return this.distance >= 3 ? base / TIMING.tripleSpeed : base;
  }

  begin(platform) {
    if (platform.number === 0) {
      this.beginReveal(platform);
      return;
    }
    this.phase = 'jump';
    this.revealNumber = 0;
    this.start = platform.cell;
    this.distance = platform.number;
    this.target = this.start + this.distance;
    this.flightElapsed = 0;
    this.progress = 0;
  }

  beginReveal(platform) {
    const known = this.numberAt(platform.cell);
    const resolved = known || Math.min(3, 1 + Math.floor(this.random() * 3));
    this.course.set(platform.cell, resolved);
    platform.number = resolved;
    this.phase = 'reveal';
    this.revealNumber = resolved;
    this.start = this.target = platform.cell;
    this.distance = 0;
    this.flightElapsed = TIMING.revealLead;
    this.progress = this.flightElapsed / TIMING.shortJump;
  }

  move(steps) {
    if (![1, 2].includes(steps) || !['ready', 'playing'].includes(this.status)) return false;
    const [rear, front] = [...this.platforms].sort((a, b) => a.cell - b.cell);
    const from = this.visualCell(rear);
    const fromLift = this.visualLift(rear);
    rear.from = from;
    rear.fromLift = fromLift;
    rear.cell = front.cell + steps;
    rear.duration = TIMING.platformPerCell * Math.max(1, Math.abs(rear.cell - from));
    rear.motion = 0;
    rear.number = this.numberAt(rear.cell);
    this.moves++;
    if (this.status === 'ready') {
      this.status = 'playing';
      this.begin(front);
    }
    return true;
  }

  visualCell(platform) {
    const eased = smoothStep(platform.motion);
    return platform.from + (platform.cell - platform.from) * eased;
  }

  visualLift(platform) {
    const eased = smoothStep(platform.motion);
    return platform.fromLift * (1 - eased) + Math.sin(Math.PI * eased) * TIMING.platformLift;
  }

  supportivePlatform() {
    const width = this.cellWidth;
    const height = platformHeight(width);
    const toleranceX = Math.max(8 / width, 0.78 * 0.26);
    const toleranceY = Math.max(8, height * 0.24) / width;
    return [...this.platforms]
      .filter(p => Math.abs(this.visualCell(p) - this.target) <= toleranceX && this.visualLift(p) * this.verticalScale <= toleranceY)
      .sort((a, b) => Number(b.cell === this.target) - Number(a.cell === this.target)
        || Math.abs(this.visualCell(a) - this.target) - Math.abs(this.visualCell(b) - this.target))[0];
  }

  tick(rawDelta) {
    if (this.status !== 'playing' || !Number.isFinite(rawDelta) || rawDelta <= 0) return null;
    let remaining = Math.min(rawDelta, TIMING.maxFrame);
    let event = null;
    while (remaining > 1e-10 && this.status === 'playing') {
      const duration = this.duration();
      const step = Math.min(remaining, duration - this.flightElapsed);
      for (const p of this.platforms) {
        if (p.motion < 1) p.motion = Math.min(1, p.motion + step / p.duration);
      }
      this.elapsed += step;
      this.flightElapsed += step;
      this.progress = Math.min(1, this.flightElapsed / duration);
      this.position = this.start + this.distance * this.progress;
      remaining -= step;
      if (this.flightElapsed < duration - 1e-10) break;
      const landing = this.supportivePlatform();
      if (!landing) {
        this.status = 'over';
        return 'miss';
      }
      landing.cell = this.target;
      landing.number = this.numberAt(this.target);
      landing.from = this.target;
      landing.fromLift = 0;
      landing.motion = 1;
      const wasReveal = this.phase === 'reveal';
      if (!wasReveal) {
        this.landings++;
        this.score += 1 + (this.landings % 5 === 0 ? 1 : 0);
      }
      this.begin(landing);
      event = wasReveal ? 'reveal' : 'land';
      for (const cell of this.course.keys()) {
        if (cell < this.start - 4) this.course.delete(cell);
      }
      // Carry the remaining frame into the next bounce to avoid a frame-rate-dependent pause.
    }
    return event;
  }
}

export function shareText(score) {
  return `I bounced to ${score} on Poteto! Can you go further?`;
}
