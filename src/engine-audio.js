export class EngineAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineGain = null;
    this.oscillators = [];
    this.noiseSource = null;
    this.noiseGain = null;
    this.enabled = true;
  }

  async start() {
    if (!this.enabled) return;
    if (this.context) {
      if (this.context.state === "suspended") await this.context.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0.34;
    master.connect(context.destination);

    const engineGain = context.createGain();
    engineGain.gain.value = 0.001;
    const lowPass = context.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = 1200;
    lowPass.Q.value = 1.4;
    engineGain.connect(lowPass);
    lowPass.connect(master);

    const oscillatorSettings = [
      { type: "sawtooth", ratio: 1, gain: 0.33 },
      { type: "square", ratio: 0.5, gain: 0.12 },
      { type: "triangle", ratio: 2, gain: 0.08 },
    ];
    const oscillators = oscillatorSettings.map((settings) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = settings.type;
      gain.gain.value = settings.gain;
      oscillator.connect(gain);
      gain.connect(engineGain);
      oscillator.start();
      return { oscillator, gain, ratio: settings.ratio };
    });

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = (Math.random() * 2 - 1) * (0.6 + Math.sin(index * 0.013) * 0.18);
    }
    const noiseSource = context.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1300;
    noiseFilter.Q.value = 0.9;
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0;
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noiseSource.start();

    this.context = context;
    this.master = master;
    this.engineGain = engineGain;
    this.lowPass = lowPass;
    this.oscillators = oscillators;
    this.noiseSource = noiseSource;
    this.noiseGain = noiseGain;
    await context.resume();
  }

  update(vehicle) {
    if (!this.context || this.context.state !== "running") return;
    const now = this.context.currentTime;
    const combustionFrequency = Math.max(32, vehicle.rpm / 60 * 4);
    this.oscillators.forEach(({ oscillator, ratio }) => {
      oscillator.frequency.setTargetAtTime(combustionFrequency * ratio, now, 0.035);
    });
    const load = 0.035 + vehicle.throttle * 0.19 + Math.min(vehicle.rpm / 7800, 1) * 0.065;
    this.engineGain.gain.setTargetAtTime(vehicle.shiftTimer > 0 ? load * 0.32 : load, now, 0.045);
    this.lowPass.frequency.setTargetAtTime(520 + vehicle.rpm * 0.29, now, 0.055);
    this.noiseGain.gain.setTargetAtTime(
      Math.min(0.12, vehicle.tractionSlip * 0.16 + vehicle.speed * 0.00035),
      now,
      0.08,
    );
  }

  setMuted(muted) {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.34, this.context.currentTime, 0.04);
  }

  dispose() {
    if (!this.context) return;
    this.oscillators.forEach(({ oscillator }) => oscillator.stop());
    this.noiseSource?.stop();
    this.context.close();
    this.context = null;
  }
}

