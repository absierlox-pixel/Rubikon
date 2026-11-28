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
      const length = Math.floor(this.ctx.sampleRate * 0.6);
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
        osc.frequency.exponentialRampToValueAtTime(Math.max(18, endFreq), now + duration);
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
        filter.frequency.exponentialRampToValueAtTime(Math.max(50, endFreq), now + duration);
      }
      filter.Q.value = 1.0;

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

  playWeaponFire(weaponId) {
    if (weaponId === "glock") {
      this.playNoise(0.09, 2200, 0.16, 420, "lowpass");
      this.playTone(230, 0.06, "triangle", 0.11, 65);
    } else if (weaponId === "ak74") {
      this.playNoise(0.14, 1750, 0.22, 260, "lowpass");
      this.playTone(155, 0.09, "sawtooth", 0.14, 42);
      this.playNoise(0.04, 3400, 0.09, 1200, "highpass");
    } else if (weaponId === "awp") {
      this.playNoise(0.32, 1300, 0.30, 120, "lowpass");
      this.playTone(110, 0.26, "sawtooth", 0.22, 26);
      this.playNoise(0.08, 3800, 0.12, 900, "highpass");
    } else if (weaponId === "minigun") {
      this.playNoise(0.06, 1500, 0.15, 320, "lowpass");
      this.playTone(135, 0.05, "square", 0.09, 55);
    } else if (weaponId === "rpg") {
      this.playNoise(0.45, 780, 0.24, 180, "bandpass");
      this.playTone(120, 0.35, "sawtooth", 0.14, 45);
    }
  }

  playExplosion() {
    this.playNoise(0.58, 420, 0.36, 55, "lowpass");
    this.playTone(95, 0.50, "sawtooth", 0.28, 20);
    this.playTone(58, 0.55, "sine", 0.24, 18);
  }

  playReload() {
    this.playNoise(0.06, 2200, 0.06, 900);
    setTimeout(() => this.playTone(320, 0.05, "square", 0.04, 180), 240);
  }

  playSwing(heavy = false) {
    this.playNoise(0.10, heavy ? 750 : 1050, 0.06, 280);
  }

  playHit(heavy = false) {
    this.playTone(heavy ? 110 : 160, 0.12, "triangle", heavy ? 0.17 : 0.11, 38);
    this.playNoise(0.07, 750, 0.09, 200);
  }

  playDeath() {
    this.playTone(125, 0.28, "triangle", 0.11, 34);
    this.playNoise(0.18, 340, 0.10, 90);
  }

  playJump() {
    this.playTone(170, 0.08, "sine", 0.04, 290);
  }

  playCarCrash(intensity = 0.6) {
    const g = Math.min(0.4, 0.14 + intensity * 0.24);
    this.playNoise(0.24, 580, g, 95, "lowpass");
    this.playTone(92, 0.18, "sawtooth", g * 0.7, 32);
  }

  playGlassShatter() {
    this.playNoise(0.16, 4800, 0.16, 2200, "highpass");
    this.playTone(2600, 0.06, "triangle", 0.06, 1400);
  }

  playHorn() {
    this.playTone(340, 0.24, "sawtooth", 0.08, 336);
    this.playTone(425, 0.24, "sawtooth", 0.07, 420);
  }
}
