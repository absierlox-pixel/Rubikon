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
      const length = Math.floor(this.ctx.sampleRate * 0.35);
      const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playTone(freq, duration, type = "sine", gainVal = 0.06, endFreq = null) {
    if (this.muted || !this.ctx) {
      return;
    }
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

  playNoise(duration, filterFreq, gainVal = 0.08, endFreq = null) {
    if (this.muted || !this.ctx || !this.noiseBuffer) {
      return;
    }
    try {
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(filterFreq, now);
      if (endFreq !== null) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(80, endFreq), now + duration);
      }
      filter.Q.value = 1.4;

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

  playSwing(combo = 0) {
    const startF = combo === 2 ? 900 : 1200;
    const endF = combo === 2 ? 220 : 380;
    this.playNoise(0.14, startF, 0.09, endF);
  }

  playHit(heavy = false) {
    this.playTone(heavy ? 120 : 165, heavy ? 0.18 : 0.12, "triangle", heavy ? 0.18 : 0.13, 38);
    this.playNoise(heavy ? 0.12 : 0.08, heavy ? 600 : 900, heavy ? 0.14 : 0.09, 180);
  }

  playDeath() {
    this.playTone(140, 0.35, "sawtooth", 0.12, 32);
    this.playNoise(0.24, 380, 0.13, 90);
  }

  playJump() {
    this.playTone(190, 0.11, "sine", 0.06, 360);
  }

  playDash() {
    this.playNoise(0.16, 750, 0.08, 240);
    this.playTone(300, 0.12, "triangle", 0.06, 150);
  }

  playEmote() {
    this.playTone(540, 0.09, "sine", 0.06, 680);
  }

  playJoin() {
    this.playTone(460, 0.14, "sine", 0.06, 620);
  }
}
