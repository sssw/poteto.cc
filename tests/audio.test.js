import test from 'node:test';
import assert from 'node:assert/strict';
import { Soundtrack } from '../site/audio.js';

function harness(t) {
  const intervals = new Map();
  let nextTimer = 0;
  class Parameter {
    constructor() { this.value = 0; this.events = []; }
    cancelScheduledValues(time) { this.events.push(['cancel', time]); }
    setTargetAtTime(value, time, constant) { this.events.push(['target', value, time, constant]); }
    setValueAtTime(value, time) { this.events.push(['set', value, time]); }
    linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); }
    exponentialRampToValueAtTime(value, time) { this.events.push(['exponential', value, time]); }
  }
  class AudioNode {
    constructor(context, source = false) {
      this.context = context;
      this.connections = [];
      this.disconnected = false;
      this.ended = false;
      for (const name of ['gain', 'frequency', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[name] = new Parameter();
      if (source) context.sources.push(this);
    }
    connect(node) { this.connections.push(node); }
    disconnect() { this.disconnected = true; }
    start(time) { assert.ok(Number.isFinite(time) && time >= 0); this.startTime = time; }
    stop(time) { assert.ok(Number.isFinite(time) && time >= 0); this.stopTime = time; }
  }
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 48000; this.destination = {}; this.sources = []; }
    createGain() { return new AudioNode(this); }
    createDynamicsCompressor() { return new AudioNode(this); }
    createBiquadFilter() { return new AudioNode(this); }
    createOscillator() { return new AudioNode(this, true); }
    createBufferSource() { return new AudioNode(this, true); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
    advance(time) {
      this.currentTime = time;
      for (const source of this.sources) {
        if (!source.ended && source.stopTime <= time) { source.ended = true; source.onended?.(); }
      }
    }
  }
  t.mock.method(globalThis, 'setInterval', callback => { const id = ++nextTimer; intervals.set(id, callback); return id; });
  t.mock.method(globalThis, 'clearInterval', id => intervals.delete(id));
  const oldContext = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, writable: true, value: AudioContext });
  t.after(() => {
    if (oldContext) Object.defineProperty(globalThis, 'AudioContext', oldContext);
    else delete globalThis.AudioContext;
  });
  const sound = new Soundtrack();
  t.after(() => sound.destroy());
  return { sound, intervals, AudioContext, tick() { for (const callback of intervals.values()) callback(); } };
}

test('audio starts only on request and repeated starts retain one scheduler', async t => {
  const { sound, intervals } = harness(t);
  sound.move(1); sound.land(5); sound.reveal(2); sound.fail();
  assert.equal(sound.context, null);
  assert.equal(intervals.size, 0);
  assert.equal(await sound.start(), true);
  const context = sound.context;
  assert.equal(context.state, 'running');
  assert.equal(intervals.size, 1);
  assert.equal(await sound.start(), true);
  assert.equal(sound.context, context);
  assert.equal(intervals.size, 1);
});

test('rapid input and full musical energy stay bounded through a five-minute run', async t => {
  const { sound, tick } = harness(t);
  await sound.start();
  sound.setIntensity(1);
  for (let frame = 0; frame < 12000; frame++) {
    sound.context.advance(frame / 40);
    tick();
    if (frame % 6 === 0) sound.move(2);
    if (frame % 25 === 0) sound.land(frame / 25);
    if (frame % 107 === 0) sound.reveal(3);
    assert.ok(sound.voices.size < 40, 'Live audio nodes must remain bounded');
  }
  sound.setPaused(true);
  sound.context.advance(302);
  assert.equal(sound.voices.size, 0);
  assert.ok(sound.context.sources.every(source => source.ended && source.disconnected));
  assert.ok(sound.context.sources.every(source => source.connections.every(node => node.disconnected)));
});

test('mute persists through pause and resume, and muted input creates no cues', async t => {
  const { sound, intervals } = harness(t);
  sound.setMuted(true);
  await sound.start();
  assert.equal(sound.master.gain.value, 0);
  const before = sound.context.sources.length;
  sound.move(2); sound.land(5); sound.reveal(3); sound.fail();
  assert.equal(sound.context.sources.length, before);
  sound.setPaused(true);
  assert.equal(intervals.size, 0);
  sound.context.advance(2);
  assert.equal(sound.voices.size, 0);
  sound.setPaused(false);
  assert.equal(intervals.size, 1);
  assert.equal(sound.muted, true);
  assert.equal(sound.master.gain.events.at(-1)[1], 0);
  sound.setMuted(false);
  assert.equal(sound.master.gain.events.at(-1)[1], 0.32);
  const unmuted = sound.context.sources.length;
  sound.move(2);
  assert.ok(sound.context.sources.length > unmuted);
});

test('a long scheduler delay skips missed beats rather than creating a burst', async t => {
  const { sound, tick } = harness(t);
  await sound.start();
  sound.context.advance(600);
  const before = sound.context.sources.length;
  tick();
  assert.ok(sound.context.sources.length - before < 20);
  assert.ok(sound.nextNote > 600 && sound.nextNote < 600.5);
  assert.ok(sound.context.sources.slice(before).every(source => source.startTime >= 600));
});

test('starting while paused stays silent until resumed; destruction cannot restart', async t => {
  const { sound, intervals } = harness(t);
  sound.setPaused(true);
  assert.equal(await sound.start(), true);
  assert.equal(intervals.size, 0);
  assert.equal(sound.context.sources.length, 0);
  sound.setPaused(false);
  assert.equal(intervals.size, 1);
  sound.destroy();
  assert.equal(intervals.size, 0);
  assert.equal(sound.voices.size, 0);
  assert.equal(sound.context.state, 'closed');
  assert.equal(await sound.start(), false);
});

test('unsupported audio is a safe no-op', async t => {
  const { sound } = harness(t);
  globalThis.AudioContext = undefined;
  const oldWebkit = Object.getOwnPropertyDescriptor(globalThis, 'webkitAudioContext');
  Object.defineProperty(globalThis, 'webkitAudioContext', { configurable: true, writable: true, value: undefined });
  t.after(() => {
    if (oldWebkit) Object.defineProperty(globalThis, 'webkitAudioContext', oldWebkit);
    else delete globalThis.webkitAudioContext;
  });
  assert.equal(await sound.start(), false);
  sound.setMuted(true); sound.setPaused(true); sound.move(1); sound.land(5); sound.reveal(2); sound.fail();
  assert.equal(sound.context, null);
});


test('music runs at 120 BPM with four two-second bars', async t => {
  const { sound } = harness(t);
  sound.setPaused(true);
  await sound.start();
  const expectedChords = [
    [60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67],
  ];
  assert.equal(sound.eighth, 0.25);
  assert.equal(sound.eighth * 32, 8);
  for (let step = 0; step <= 32; step++) {
    sound.context.advance(step * 0.25);
    sound.beat(step, step * 0.25);
    assert.deepEqual(sound.chord, expectedChords[Math.floor(step / 8) % 4]);
  }
});

test('intensity adds a restrained offbeat layer and resets for a fresh run', async t => {
  const { sound } = harness(t);
  sound.setPaused(true);
  await sound.start();
  const base = sound.context.sources.length;
  sound.beat(2, 0);
  const quietCount = sound.context.sources.length - base;
  const quietPeak = sound.context.sources.slice(base).flatMap(source => source.connections)
    .flatMap(node => node.gain.events).filter(event => event[0] === 'linear')
    .map(event => event[1]);
  sound.context.advance(2);
  sound.setIntensity(1);
  const energetic = sound.context.sources.length;
  sound.beat(2, 2);
  assert.ok(sound.context.sources.length - energetic > quietCount);
  const extraPeak = sound.context.sources.slice(energetic).flatMap(source => source.connections)
    .flatMap(node => node.gain.events).filter(event => event[0] === 'linear')
    .map(event => event[1]);
  assert.ok(Math.max(...extraPeak) <= Math.max(...quietPeak));
  assert.ok(sound.energy > 0 && sound.energy < 1);
  sound.setIntensity(0);
  assert.equal(sound.energy, 0);
  assert.equal(sound.intensity, 0);
  for (const value of [-1, NaN, Infinity, undefined]) {
    sound.setIntensity(value);
    assert.equal(sound.intensity, 0);
  }
  sound.setIntensity(10);
  assert.equal(sound.intensity, 1);
});

test('one and two move cues start immediately and decay before the next short jump', async t => {
  const { sound } = harness(t);
  await sound.start();
  sound.context.advance(1);
  for (const steps of [1, 2]) {
    const before = sound.context.sources.length;
    sound.move(steps);
    const voices = sound.context.sources.slice(before);
    assert.equal(voices.length, steps * 2);
    assert.equal(voices[0].startTime, 1);
    assert.ok(voices.every(voice => voice.stopTime < 1.62));
    if (steps === 2) assert.equal(voices[2].startTime, 1.05);
  }
});


test('mystery reveals sound immediately, remain within the hop, and stop cleanly', async t => {
  const { sound } = harness(t);
  await sound.start();
  for (const number of [1, 2, 3]) {
    sound.context.advance(number);
    const before = sound.context.sources.length;
    sound.reveal(number);
    const notes = sound.context.sources.slice(before);
    assert.equal(notes.length, number * 2 + 1);
    assert.equal(notes[0].startTime, number);
    assert.ok(notes.every(note => note.stopTime < number + 0.62));
    sound.context.advance(number + 0.62);
    assert.ok(notes.every(note => note.ended && note.disconnected));
  }
  const before = sound.context.sources.length;
  for (const number of [0, 4, 1.5, NaN, undefined]) sound.reveal(number);
  assert.equal(sound.context.sources.length, before);
  sound.setPaused(true);
  sound.reveal(3);
  assert.equal(sound.context.sources.length, before);
  sound.setPaused(false);
  sound.context.advance(5);
  sound.reveal(3);
  sound.setPaused(true);
  sound.context.advance(6);
  assert.equal(sound.voices.size, 0);
});
