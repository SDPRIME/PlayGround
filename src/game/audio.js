export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crowdGain = null;
    this.crowdFilter = null;
    this.enabled = true;
    this.excitement = 0.25;
    this.started = false;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.72 : 0;
      this.master.connect(this.ctx.destination);
      this.buildCrowd();
      this.buildDrone();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.started = true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.72 : 0, this.ctx.currentTime, 0.05);
  }

  buildCrowd() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c += 1) {
      const data = buffer.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i += 1) {
        const white = Math.random() * 2 - 1;
        last = last * 0.97 + white * 0.03;
        data[i] = last * 2.3 + white * 0.025;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.45;
    const gain = ctx.createGain();
    gain.gain.value = 0.1;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.crowdGain = gain;
    this.crowdFilter = filter;
  }

  buildDrone() {
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = 0.022;
    master.connect(this.master);
    [55, 82.5, 110].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 2 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      gain.gain.value = i === 2 ? 0.16 : 0.3;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.06 + i * 0.025;
      lfoGain.gain.value = 0.08;
      lfo.connect(lfoGain).connect(gain.gain);
      osc.connect(gain).connect(master);
      osc.start();
      lfo.start();
    });
  }

  setExcitement(value) {
    this.excitement = value;
    if (!this.ctx) return;
    this.crowdGain.gain.setTargetAtTime(0.055 + value * 0.17, this.ctx.currentTime, 0.5);
    this.crowdFilter.frequency.setTargetAtTime(400 + value * 650, this.ctx.currentTime, 0.7);
  }

  tone(freq, duration, { type = 'sine', volume = 0.1, slide = 0, delay = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  noise(duration, volume = 0.08, freq = 900, q = 0.8, delay = 0, type = 'bandpass') {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      const fade = Math.sin((i / len) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * fade;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  kick(power = 0.7) {
    this.tone(105, 0.12, { type: 'sine', volume: 0.14 + power * 0.1, slide: -60 });
    this.noise(0.08, 0.08 + power * 0.05, 1600, 1.1);
  }

  pass() {
    this.tone(145, 0.07, { type: 'triangle', volume: 0.08, slide: -45 });
    this.noise(0.045, 0.035, 1100, 1.3);
  }

  tackle() {
    this.noise(0.18, 0.11, 320, 0.8, 0, 'lowpass');
    this.tone(72, 0.16, { type: 'sine', volume: 0.08, slide: -25 });
  }

  post() {
    this.tone(720, 0.32, { type: 'triangle', volume: 0.12, slide: -80 });
    this.tone(1150, 0.18, { type: 'sine', volume: 0.05, slide: -140 });
  }

  save() {
    this.noise(0.15, 0.08, 500, 0.9);
    this.tone(220, 0.09, { type: 'square', volume: 0.035, slide: 60 });
  }

  whistle(long = false) {
    this.tone(2250, long ? 0.5 : 0.18, { type: 'square', volume: 0.035 });
    this.tone(2650, long ? 0.5 : 0.18, { type: 'sine', volume: 0.025 });
    if (long) {
      this.tone(2250, 0.16, { type: 'square', volume: 0.03, delay: 0.28 });
      this.tone(2250, 0.34, { type: 'square', volume: 0.03, delay: 0.52 });
    }
  }

  goal() {
    this.noise(2.8, 0.21, 700, 0.25, 0, 'lowpass');
    this.noise(1.6, 0.1, 2200, 0.6, 0.08);
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', volume: 0.05, delay: i * 0.07 }));
    this.tone(90, 0.6, { type: 'sine', volume: 0.13, slide: -25 });
  }

  click() {
    this.tone(660, 0.04, { type: 'sine', volume: 0.025 });
  }

  countdown(final = false) {
    this.tone(final ? 880 : 440, final ? 0.24 : 0.08, { type: 'triangle', volume: 0.05 });
  }

  fulltime() {
    this.whistle(true);
    this.noise(2.4, 0.13, 850, 0.3, 0.2, 'lowpass');
    [392, 523, 659].forEach((f, i) => this.tone(f, 0.6, { type: 'triangle', volume: 0.04, delay: 0.3 + i * 0.12 }));
  }

  halftime() {
    this.whistle(true);
    this.noise(1.4, 0.07, 900, 0.4);
  }
}
