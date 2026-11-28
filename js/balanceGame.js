// Mouse-controlled inverted-pendulum balancing mini-game (toggled with F5)

export class BalanceMiniGame {
  constructor(modalEl, canvasEl, scoreEl, bestEl, hintEl) {
    this.modal = modalEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    this.scoreEl = scoreEl;
    this.bestEl = bestEl;
    this.hintEl = hintEl;

    this.active = false;
    this.rafId = null;
    this.lastTime = 0;

    this.width = 720;
    this.height = 460;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.bestScore = Number(localStorage.getItem("rubikon_balance_best") || 0);
    this.bestEl.textContent = this.bestScore.toFixed(1);

    this.mouseX = this.width * 0.5;
    this.windParticles = [];

    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0) {
        this.mouseX = ((e.clientX - rect.left) / rect.width) * this.width;
      }
    });

    this.canvas.addEventListener("mousedown", () => {
      if (this.gameOver) this.reset();
    });

    this.reset();
  }

  reset() {
    this.baseX = this.width * 0.5;
    this.baseVx = 0;
    this.prevBaseVx = 0;
    this.baseY = this.height - 74;

    this.poleLen = 195;
    // Slight initial nudge so the player has to balance immediately
    this.angle = (Math.random() > 0.5 ? 1 : -1) * 0.045;
    this.angVel = 0;

    this.score = 0;
    this.wind = 0;
    this.windTimer = 2.5;
    this.gameOver = false;
    this.hintEl.textContent = "Двигай мышкой влево/вправо, чтобы удержать шест!";
    this.scoreEl.textContent = "0.0";
  }

  open() {
    if (this.active) return;
    this.active = true;
    this.modal.classList.remove("hidden");
    this.reset();
    this.lastTime = performance.now();
    const tick = (now) => {
      if (!this.active) return;
      const dt = Math.min(0.033, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.update(dt);
      this.draw();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.modal.classList.add("hidden");
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  update(dt) {
    if (this.gameOver) return;

    this.score += dt;
    this.scoreEl.textContent = this.score.toFixed(1);
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.bestEl.textContent = this.bestScore.toFixed(1);
      try {
        localStorage.setItem("rubikon_balance_best", String(this.bestScore.toFixed(1)));
      } catch {}
    }

    // Gentle wind gusts after 4 seconds, scaling with survival time
    this.windTimer -= dt;
    if (this.windTimer <= 0) {
      this.windTimer = 1.8 + Math.random() * 2.2;
      const strength = Math.min(2.6, 0.5 + this.score * 0.05);
      this.wind = this.score > 3.5 ? (Math.random() * 2 - 1) * strength : 0;
    }

    // Sub-stepped physics for crisp inverted pendulum feel
    const steps = 4;
    const h = dt / steps;
    const gravity = 15.5;
    const damping = 0.28;

    for (let i = 0; i < steps; i++) {
      const targetX = Math.max(48, Math.min(this.width - 48, this.mouseX));
      const newX = this.baseX + (targetX - this.baseX) * Math.min(1, h * 24);
      const newVx = (newX - this.baseX) / Math.max(0.0005, h);
      const accelX = Math.max(-2400, Math.min(2400, (newVx - this.baseVx) / Math.max(0.0005, h)));

      this.baseX = newX;
      this.baseVx = newVx;

      // Inverted pendulum angular acceleration
      const gravityTorque = (gravity / (this.poleLen / 100)) * Math.sin(this.angle);
      const cartTorque = -(accelX / 150) * Math.cos(this.angle);
      const windTorque = (this.wind * Math.cos(this.angle));
      const angAcc = gravityTorque + cartTorque + windTorque - this.angVel * damping;

      this.angVel += angAcc * h;
      this.angle += this.angVel * h;

      if (Math.abs(this.angle) >= Math.PI * 0.48) {
        this.angle = Math.sign(this.angle) * Math.PI * 0.48;
        this.gameOver = true;
        this.hintEl.textContent = "Упал! Кликни по полю или нажми Пробел для рестарта";
        break;
      }
    }

    // Spawn wind streaks
    if (Math.abs(this.wind) > 0.25 && Math.random() < 0.35) {
      this.windParticles.push({
        x: this.wind > 0 ? 0 : this.width,
        y: 40 + Math.random() * (this.height - 130),
        vx: this.wind * 180,
        life: 1.0
      });
    }
    for (let i = this.windParticles.length - 1; i >= 0; i--) {
      const wp = this.windParticles[i];
      wp.x += wp.vx * dt;
      wp.life -= dt * 1.1;
      if (wp.life <= 0) this.windParticles.splice(i, 1);
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#101622");
    bg.addColorStop(1, "#1b2434");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    // Wind streaks
    for (const wp of this.windParticles) {
      ctx.strokeStyle = `rgba(140, 210, 255, ${wp.life * 0.35})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wp.x, wp.y);
      ctx.lineTo(wp.x - wp.vx * 0.08, wp.y);
      ctx.stroke();
    }

    // Rail
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(36, this.baseY);
    ctx.lineTo(w - 36, this.baseY);
    ctx.stroke();

    // Angle danger indicator
    const danger = Math.min(1, Math.abs(this.angle) / (Math.PI * 0.45));
    const tipX = this.baseX + Math.sin(this.angle) * this.poleLen;
    const tipY = this.baseY - Math.cos(this.angle) * this.poleLen;

    // Pole shadow/glow
    ctx.strokeStyle = this.gameOver
      ? "#ff4d4d"
      : `rgb(${Math.round(80 + danger * 175)}, ${Math.round(220 - danger * 150)}, 110)`;
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.baseX, this.baseY - 8);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Balancing orb on top
    ctx.fillStyle = this.gameOver ? "#ff5c5c" : "#ffd166";
    ctx.beginPath();
    ctx.arc(tipX, tipY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cart / Hand platform
    ctx.fillStyle = "#2f7df6";
    ctx.beginPath();
    ctx.roundRect(this.baseX - 38, this.baseY - 10, 76, 20, 8);
    ctx.fill();
    ctx.strokeStyle = "#8fc0ff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Wind arrow indicator at top
    if (Math.abs(this.wind) > 0.25) {
      const dir = this.wind > 0 ? "→" : "←";
      ctx.fillStyle = "rgba(155, 220, 255, 0.85)";
      ctx.font = "bold 15px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Ветер ${dir} ${Math.abs(this.wind).toFixed(1)}`, w * 0.5, 30);
    }
  }
}
