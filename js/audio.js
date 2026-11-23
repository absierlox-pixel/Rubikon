export class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.noiseBuffer = null;
  }

  unlock() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.noiseBuffer) {
      const length = Math.floor(this.ctx.sampleRate * 0.4);
      const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
  }

  playTone(freq, duration, type = "sine", gainVal = 0.06, endFreq = null) {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      }
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {}
  }

  playNoise(duration, filterFreq, gainVal = 0.08, endFreq = null, filterType = "bandpass") {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    try {
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq, now);
      if (endFreq !== null) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(80, endFreq), now + duration);
      }
      filter.Q.value = 1.1;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(now);
      src.stop(now + duration);
    } catch {}
  }

  playGunshot() {
    // Crisp AK-74 crack + low punch + bolt clack
    this.playNoise(0.14, 1750, 0.22, 260, "lowpass");
    this.playTone(155, 0.09, "sawtooth", 0.14, 42);
    this.playNoise(0.045, 3400, 0.10, 1200, "highpass");
  }

  playReload() {
    this.playNoise(0.06, 2200, 0.06, 900);
    setTimeout(() => this.playTone(320, 0.05, "square", 0.04, 180), 260);
  }

  playSwing() {
    this.playNoise(0.11, 950, 0.06, 320);
  }

  playHit(heavy = false) {
    this.playTone(heavy ? 115 : 155, 0.12, "triangle", heavy ? 0.16 : 0.11, 40);
    this.playNoise(0.07, 750, 0.09, 200);
  }

  playDeath() {
    this.playTone(125, 0.30, "triangle", 0.12, 34);
    this.playNoise(0.20, 340, 0.11, 90);
  }

  playJump() {
    this.playTone(170, 0.09, "sine", 0.04, 290);
  }
}
