const midi = note => 440 * 2 ** ((note - 69) / 12);
const CHORDS = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 60, 62, 67]];
const MELODY = [0, -1, 2, 1, 3, -1, 2, -1, 1, -1, 0, 2, 1, -1, 0, -1];

/** A small, original musical loop with responsive, in-key game sounds. */
export class Soundtrack {
  constructor() {
    this.context = null;
    this.master = null;
    this.timer = null;
    this.voices = new Set();
    this.muted = false;
    this.paused = false;
    this.started = false;
    this.destroyed = false;
    this.step = 0;
    this.nextNote = 0;
    this.chord = CHORDS[0];
    this.eighth = 60 / 104 / 2;
  }

  async start() {
    if (this.destroyed) return false;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted || this.paused ? 0 : 0.32;
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -18;
        limiter.knee.value = 18;
        limiter.ratio.value = 4;
        limiter.attack.value = 0.005;
        limiter.release.value = 0.2;
        this.master.connect(limiter);
        limiter.connect(this.context.destination);
        this.limiter = limiter;
        this.noise = this.makeNoise();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      if (this.destroyed || this.context.state !== 'running') return false;
      this.started = true;
      this.schedule();
      return true;
    } catch {
      return false;
    }
  }

  makeNoise() {
    const length = Math.floor(this.context.sampleRate * 0.08);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let state = 17;
    for (let i = 0; i < length; i++) {
      state = (state * 16807) % 2147483647;
      data[i] = (state / 1073741824 - 1) * (1 - i / length) ** 2;
    }
    return buffer;
  }

  volume() {
    if (!this.master || this.context.state === 'closed') return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.muted || this.paused ? 0 : 0.32, now, 0.025);
  }

  setMuted(value) {
    this.muted = Boolean(value);
    this.volume();
  }

  setPaused(value) {
    this.paused = Boolean(value);
    this.volume();
    if (this.paused) {
      clearInterval(this.timer);
      this.timer = null;
      this.stopVoices();
    } else if (this.started) {
      this.schedule();
    }
  }

  schedule() {
    if (this.timer !== null || !this.started || this.paused || this.destroyed) return;
    this.nextNote = this.context.currentTime + 0.06;
    const tick = () => {
      if (this.context.state !== 'running' || this.paused) return;
      const now = this.context.currentTime;
      // Skip elapsed beats after an inactive tab rather than queueing a burst.
      if (this.nextNote < now - 0.1) this.nextNote = now + 0.03;
      while (this.nextNote < now + 0.12) {
        this.beat(this.step++, this.nextNote);
        this.nextNote += this.eighth;
      }
    };
    tick();
    this.timer = setInterval(tick, 25);
  }

  track(source, nodes, end) {
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
    source.stop(end);
  }

  tone(note, time, duration = 0.35, level = 0.14, type = 'sine') {
    const context = this.context;
    if (!context || context.state !== 'running' || this.destroyed) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = midi(note);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(time);
    this.track(oscillator, [gain], time + duration + 0.02);
  }

  pluck(note, time, level = 0.13, duration = 0.45) {
    this.tone(note, time, duration, level);
    this.tone(note + 19, time, duration * 0.27, level * 0.14);
  }

  brush(time, level) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    filter.type = 'highpass';
    filter.frequency.value = 4200;
    gain.gain.value = level;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(time);
    this.track(source, [filter, gain], time + 0.09);
  }

  beat(step, time) {
    const chord = CHORDS[Math.floor(step / 16) % CHORDS.length];
    this.chord = chord;
    const position = step % 16;
    const melody = MELODY[position];
    if (melody >= 0) this.pluck(chord[melody] + 12, time, 0.115, 0.48);
    if (position % 4 === 0) this.tone(chord[position % 8 === 0 ? 0 : 2] - 24, time, 0.65, 0.2);
    if (position === 0 || position === 8) {
      chord.slice(0, 3).forEach((note, i) => this.pluck(note, time + i * 0.018, 0.045, 0.8));
    }
    if (position % 2 === 1) this.brush(time, position % 4 === 3 ? 0.065 : 0.035);
  }

  canPlay() {
    return this.started && !this.paused && !this.muted && !this.destroyed && this.context?.state === 'running';
  }

  move(steps) {
    if (!this.canPlay()) return;
    const now = this.context.currentTime;
    this.pluck(this.chord[1] + 12, now, 0.2, 0.21);
    if (steps === 2) this.pluck(this.chord[3] + 12, now + 0.065, 0.18, 0.26);
  }

  land(combo = 0) {
    if (!this.canPlay()) return;
    const now = this.context.currentTime;
    this.pluck(this.chord[2] + 12, now, 0.13, 0.27);
    if (combo > 0 && combo % 5 === 0) {
      this.chord.forEach((note, i) => this.pluck(note + 12, now + i * 0.07, 0.14, 0.5));
    }
  }

  fail() {
    if (!this.canPlay()) return;
    const now = this.context.currentTime;
    [this.chord[2], this.chord[1], this.chord[0] - 12].forEach((note, i) => {
      this.pluck(note, now + i * 0.13, 0.16, 0.45);
    });
  }

  stopVoices() {
    if (!this.context) return;
    const end = this.context.currentTime + 0.06;
    for (const source of this.voices) {
      try { source.stop(end); } catch { /* Already ended. */ }
    }
  }

  destroy() {
    this.destroyed = true;
    this.started = false;
    clearInterval(this.timer);
    this.timer = null;
    this.stopVoices();
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.voices.clear();
  }
}
