/**
 * Synthesised V8. No audio files: a set of detuned oscillators track the firing
 * frequency, a noise bed gives induction roar, and a resonant filter opens with
 * the throttle. Cheap enough for a standalone headset and it responds instantly
 * to the sim, which sample-based loops never quite do.
 */
const CYLINDERS = 8;

export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  /** Must be called from a user gesture (button press or XR session start). */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    this.master = master;

    // Engine order oscillators.
    this.osc = [];
    this.oscGain = [];
    const shape = [
      { mult: 1.0, type: 'sawtooth', gain: 0.55 },
      { mult: 0.5, type: 'square', gain: 0.30 },   // half order, the V8 lope
      { mult: 2.0, type: 'sawtooth', gain: 0.18 },
      { mult: 3.0, type: 'triangle', gain: 0.10 },
    ];
    const bus = ctx.createGain();
    bus.gain.value = 0.9;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 700;
    this.filter.Q.value = 3.5;
    bus.connect(this.filter);
    this.filter.connect(master);

    for (const s of shape) {
      const o = ctx.createOscillator();
      o.type = s.type;
      const g = ctx.createGain();
      g.gain.value = s.gain;
      o.connect(g);
      g.connect(bus);
      o.start();
      this.osc.push({ node: o, mult: s.mult });
      this.oscGain.push(g);
    }

    // Supercharger whine.
    this.whine = ctx.createOscillator();
    this.whine.type = 'sawtooth';
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    const whineFilter = ctx.createBiquadFilter();
    whineFilter.type = 'bandpass';
    whineFilter.frequency.value = 2600;
    whineFilter.Q.value = 6;
    this.whine.connect(this.whineGain);
    this.whineGain.connect(whineFilter);
    whineFilter.connect(master);
    this.whine.start();

    // Noise bed, reused for induction roar and tyre squeal.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.noise = ctx.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 480;
    this.noiseFilter.Q.value = 0.9;
    this.noise.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(master);
    this.noise.start();

    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    const squealFilter = ctx.createBiquadFilter();
    squealFilter.type = 'bandpass';
    squealFilter.frequency.value = 1500;
    squealFilter.Q.value = 9;
    const squeal = ctx.createBufferSource();
    squeal.buffer = buffer;
    squeal.loop = true;
    squeal.connect(squealFilter);
    squealFilter.connect(this.squealGain);
    this.squealGain.connect(master);
    squeal.start();

    this.enabled = true;
    master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.6);
  }

  stop() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  /**
   * @param {object} s vehicle state
   */
  update(s) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const smooth = 0.06;

    // Firing frequency for a four-stroke V8.
    const f = Math.max(8, (s.rpm / 60) * (CYLINDERS / 2));
    for (const { node, mult } of this.osc) {
      node.frequency.setTargetAtTime(f * mult, t, smooth);
    }

    const load = Math.min(1, s.throttle * 0.8 + Math.min(0.4, s.rpm / 9000));
    this.filter.frequency.setTargetAtTime(420 + load * 2600 + f * 1.6, t, smooth);
    this.filter.Q.setTargetAtTime(2 + s.throttle * 4, t, smooth);

    this.whine.frequency.setTargetAtTime(Math.max(60, (s.rpm / 60) * 4.6), t, smooth);
    this.whineGain.gain.setTargetAtTime(0.02 + s.throttle * 0.075, t, smooth);

    this.noiseFilter.frequency.setTargetAtTime(300 + s.throttle * 900, t, smooth);
    this.noiseGain.gain.setTargetAtTime(0.03 + s.throttle * 0.10, t, smooth);

    // Tyre squeal / wheelspin scream.
    const slip = Math.min(1, Math.max(0, Math.abs(s.wheelSlip) - 0.16) * 1.4);
    this.squealGain.gain.setTargetAtTime(slip * 0.16, t, 0.05);

    this.master.gain.setTargetAtTime(0.5, t, 0.4);
  }

  /** Short bang used for the chute and the shift. */
  blip(frequency = 90, duration = 0.12, gain = 0.35) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(frequency, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(frequency * 0.4, ctx.currentTime + duration);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + duration + 0.02);
  }
}
