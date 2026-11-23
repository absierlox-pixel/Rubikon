import { CONFIG } from "./config.js";

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function resolvePillars(x, z, radius) {
  let rx = x;
  let rz = z;
  for (const p of CONFIG.PILLARS) {
    const dx = rx - p.x;
    const dz = rz - p.z;
    const dist = Math.hypot(dx, dz);
    const minD = p.r + radius;
    if (dist < minD) {
      if (dist < 0.0001) {
        rx += minD;
      } else {
        const push = (minD - dist) / dist;
        rx += dx * push;
        rz += dz * push;
      }
    }
  }
  return { x: rx, z: rz };
}

export class PlaneGame {
  constructor(localId, name, color) {
    this.localId = localId;
    this.players = new Map();
    this.bots = new Map();
    this.botsEnabled = false;
    this.soloMode = false;

    this.events = []; // Transient events consumed by renderer/audio/network
    this.kills = 0;

    const half = CONFIG.WORLD_SIZE / 2;
    this.worldHalf = half - CONFIG.PLAYER_RADIUS * 2;
    const spawn = this.pickSafeSpawn();

    this.localPlayer = {
      id: localId,
      name,
      color,
      x: spawn.x,
      y: 0,
      z: spawn.z,
      targetX: spawn.x,
      targetY: 0,
      targetZ: spawn.z,
      vx: 0,
      vy: 0,
      vz: 0,
      kx: 0,
      kz: 0,
      angle: 0,
      speedRatio: 0,
      emote: "",
      emoteUntil: 0,
      isHost: false,
      isBot: false,
      walkPhase: 0,
      hp: CONFIG.MAX_HP,
      maxHp: CONFIG.MAX_HP,
      alive: true,
      respawnTimer: 0,
      attackTimer: 0,
      attackDuration: 0.32,
      attackCombo: 0,
      attackSeq: 0,
      lastAttackTime: 0,
      hitFlash: 0
    };

    this.players.set(localId, this.localPlayer);

    this.keys = new Set();
    this.joyInput = { x: 0, y: 0 };
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.attackCooldown = 0;
    this.onNetworkHit = null;
  }

  pickSafeSpawn() {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 5 + Math.random() * 18;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      const fixed = resolvePillars(x, z, CONFIG.PLAYER_RADIUS + 0.5);
      return fixed;
    }
    return { x: 0, z: 8 };
  }

  pushEvent(ev) {
    this.events.push(ev);
  }

  consumeEvents() {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  setLocalProfile(name, color) {
    this.localPlayer.name = name;
    this.localPlayer.color = color;
  }

  setHostFlag(isHost) {
    this.localPlayer.isHost = isHost;
  }

  triggerEmote(emote) {
    this.localPlayer.emote = emote;
    this.localPlayer.emoteUntil = Date.now() + CONFIG.EMOTE_DURATION_MS;
  }

  triggerJump() {
    const lp = this.localPlayer;
    if (!lp.alive || lp.y > 0.05) {
      return false;
    }
    lp.vy = CONFIG.JUMP_VELOCITY;
    this.pushEvent({ type: "jump", id: lp.id });
    return true;
  }

  triggerDash() {
    if (!this.localPlayer.alive) return false;
    if (this.dashCooldown <= 0) {
      this.dashTimer = CONFIG.DASH_DURATION;
      this.dashCooldown = CONFIG.DASH_COOLDOWN;
      return true;
    }
    return false;
  }

  triggerAttack() {
    const lp = this.localPlayer;
    if (!lp.alive || this.attackCooldown > 0) {
      return false;
    }

    const now = performance.now();
    if (now - lp.lastAttackTime < 900) {
      lp.attackCombo = (lp.attackCombo + 1) % 3;
    } else {
      lp.attackCombo = 0;
    }
    lp.lastAttackTime = now;
    lp.attackDuration = lp.attackCombo === 2 ? 0.40 : 0.30;
    lp.attackTimer = lp.attackDuration;
    lp.attackSeq = (lp.attackSeq || 0) + 1;
    this.attackCooldown = lp.attackCombo === 2 ? 0.46 : CONFIG.ATTACK_COOLDOWN;

    // Face camera forward direction when striking
    const forwardYaw = this.camYaw + Math.PI;
    lp.angle = forwardYaw;

    // Small forward lunge on strike
    const fx = Math.sin(lp.angle);
    const fz = Math.cos(lp.angle);
    lp.kx += fx * (lp.attackCombo === 2 ? 7.5 : 4.2);
    lp.kz += fz * (lp.attackCombo === 2 ? 7.5 : 4.2);

    this.pushEvent({
      type: "swing",
      id: lp.id,
      x: lp.x,
      y: lp.y + 1.45,
      z: lp.z,
      angle: lp.angle,
      combo: lp.attackCombo
    });

    // Check melee hits against bots & remote players
    const damage = CONFIG.ATTACK_DAMAGE[lp.attackCombo] || 22;
    const isHeavy = lp.attackCombo === 2;
    const knockPower = isHeavy ? 14.5 : 8.5;

    for (const [id, target] of this.players.entries()) {
      if (id === this.localId || !target.alive) {
        continue;
      }
      const dx = target.x - lp.x;
      const dz = target.z - lp.z;
      const dist = Math.hypot(dx, dz);
      if (dist > CONFIG.ATTACK_RANGE || dist < 0.001) {
        continue;
      }
      const dot = (dx * fx + dz * fz) / dist;
      if (dot < CONFIG.ATTACK_ARC_COS && dist > 1.35) {
        continue;
      }

      const dirX = dx / dist;
      const dirZ = dz / dist;
      const imp = {
        x: dirX * knockPower,
        y: isHeavy ? 6.5 : 3.2,
        z: dirZ * knockPower
      };

      if (target.isBot) {
        this.applyDamage(target, damage, imp, this.localId);
      } else {
        // Apply immediate local feedback + notify remote peer
        target.hitFlash = 0.2;
        this.pushEvent({
          type: "hit",
          x: target.x,
          y: target.y + 1.4,
          z: target.z,
          damage,
          heavy: isHeavy,
          color: lp.color
        });
        if (typeof this.onNetworkHit === "function") {
          this.onNetworkHit({
            targetId: target.id,
            attackerId: this.localId,
            damage,
            heavy: isHeavy,
            kx: imp.x,
            ky: imp.y,
            kz: imp.z
          });
        }
      }
    }

    return true;
  }

  receiveNetworkHit(msg) {
    if (!msg || msg.targetId !== this.localId) {
      return;
    }
    const imp = {
      x: Number(msg.kx) || 0,
      y: Number(msg.ky) || 3,
      z: Number(msg.kz) || 0
    };
    this.applyDamage(this.localPlayer, Number(msg.damage) || 20, imp, msg.attackerId || null);
  }

  applyDamage(target, damage, impulse, attackerId) {
    if (!target || !target.alive) {
      return;
    }
    target.hp = Math.max(0, target.hp - damage);
    target.hitFlash = 0.22;
    target.kx = (target.kx || 0) + impulse.x * 0.75;
    target.kz = (target.kz || 0) + impulse.z * 0.75;
    if (target.y <= 0.05) {
      target.vy = Math.min(6, impulse.y * 0.45);
    }

    const heavy = damage >= 34;
    this.pushEvent({
      type: "hit",
      x: target.x,
      y: target.y + 1.4,
      z: target.z,
      damage,
      heavy,
      targetIsLocal: target.id === this.localId
    });

    if (target.hp <= 0) {
      target.alive = false;
      target.respawnTimer = CONFIG.RESPAWN_TIME;
      if (attackerId === this.localId && target.id !== this.localId) {
        this.kills += 1;
      }
      this.pushEvent({
        type: "death",
        id: target.id,
        x: target.x,
        y: target.y,
        z: target.z,
        angle: target.angle,
        color: target.color,
        impulse
      });
    }
  }

  upsertRemotePlayer(data) {
    if (!data || data.id === this.localId) {
      return;
    }
    const rx = Number(data.x) || 0;
    const ry = Number(data.y) || 0;
    const rz = Number(data.z !== undefined ? data.z : data.y) || 0;
    const existing = this.players.get(data.id);
    if (existing) {
      const wasAlive = existing.alive !== false;
      const nowAlive = data.alive !== false;
      existing.name = data.name;
      existing.color = data.color;
      existing.targetX = rx;
      existing.targetY = ry;
      existing.targetZ = rz;
      existing.angle = data.angle || 0;
      existing.emote = data.emote || "";
      existing.emoteUntil = data.emoteUntil || 0;
      existing.isHost = Boolean(data.isHost);
      existing.hp = data.hp !== undefined ? data.hp : CONFIG.MAX_HP;
      existing.maxHp = data.maxHp || CONFIG.MAX_HP;
      existing.alive = nowAlive;
      existing.lastSeen = Date.now();

      if (data.attackSeq && data.attackSeq !== existing.attackSeq) {
        existing.attackSeq = data.attackSeq;
        existing.attackCombo = data.attackCombo || 0;
        existing.attackDuration = existing.attackCombo === 2 ? 0.4 : 0.3;
        existing.attackTimer = existing.attackDuration;
        this.pushEvent({
          type: "swing",
          id: existing.id,
          x: existing.x,
          y: existing.y + 1.45,
          z: existing.z,
          angle: existing.angle,
          combo: existing.attackCombo
        });
      }

      if (wasAlive && !nowAlive) {
        this.pushEvent({
          type: "death",
          id: existing.id,
          x: existing.x,
          y: existing.y,
          z: existing.z,
          angle: existing.angle,
          color: existing.color,
          impulse: { x: (Math.random() - 0.5) * 10, y: 5, z: (Math.random() - 0.5) * 10 }
        });
      }
    } else {
      this.players.set(data.id, {
        ...data,
        x: rx,
        y: ry,
        z: rz,
        targetX: rx,
        targetY: ry,
        targetZ: rz,
        walkPhase: 0,
        speedRatio: 0,
        hp: data.hp !== undefined ? data.hp : CONFIG.MAX_HP,
        maxHp: data.maxHp || CONFIG.MAX_HP,
        alive: data.alive !== false,
        attackTimer: 0,
        attackDuration: 0.3,
        attackCombo: 0,
        attackSeq: data.attackSeq || 0,
        hitFlash: 0,
        lastSeen: Date.now(),
        isBot: false
      });
    }
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  setBotsEnabled(enabled) {
    if (this.botsEnabled === enabled) {
      return this.botsEnabled;
    }
    return this.toggleBots();
  }

  toggleBots() {
    this.botsEnabled = !this.botsEnabled;
    if (this.botsEnabled) {
      CONFIG.BOT_NAMES.forEach((botName, idx) => {
        const id = `bot-${idx}`;
        const ang = (idx / CONFIG.BOT_NAMES.length) * Math.PI * 2;
        const dist = 10 + Math.random() * 14;
        const pos = resolvePillars(
          clamp(this.localPlayer.x + Math.cos(ang) * dist, -this.worldHalf, this.worldHalf),
          clamp(this.localPlayer.z + Math.sin(ang) * dist, -this.worldHalf, this.worldHalf),
          CONFIG.PLAYER_RADIUS
        );
        const bot = {
          id,
          name: botName,
          color: CONFIG.COLORS[(idx + 1) % CONFIG.COLORS.length],
          x: pos.x,
          y: 0,
          z: pos.z,
          vy: 0,
          kx: 0,
          kz: 0,
          angle: Math.atan2(this.localPlayer.x - pos.x, this.localPlayer.z - pos.z),
          speedRatio: 0,
          emote: "",
          emoteUntil: 0,
          isHost: false,
          isBot: true,
          walkPhase: Math.random() * 6,
          hp: CONFIG.MAX_HP,
          maxHp: CONFIG.MAX_HP,
          alive: true,
          respawnTimer: 0,
          attackTimer: 0,
          attackDuration: 0.32,
          attackCombo: 0,
          attackCooldown: 0.8 + Math.random() * 0.8,
          hitFlash: 0,
          wanderTimer: 0.6 + Math.random() * 1.6,
          goalX: pos.x,
          goalZ: pos.z
        };
        this.bots.set(id, bot);
        this.players.set(id, bot);
      });
    } else {
      for (const id of this.bots.keys()) {
        this.players.delete(id);
      }
      this.bots.clear();
    }
    return this.botsEnabled;
  }

  update(dt) {
    const lp = this.localPlayer;
    if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - dt);
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (lp.attackTimer > 0) lp.attackTimer = Math.max(0, lp.attackTimer - dt);
    if (lp.hitFlash > 0) lp.hitFlash = Math.max(0, lp.hitFlash - dt);

    if (!lp.alive) {
      lp.respawnTimer -= dt;
      if (lp.respawnTimer <= 0) {
        const sp = this.pickSafeSpawn();
        lp.x = sp.x;
        lp.y = 0;
        lp.z = sp.z;
        lp.vx = 0;
        lp.vy = 0;
        lp.vz = 0;
        lp.kx = 0;
        lp.kz = 0;
        lp.hp = CONFIG.MAX_HP;
        lp.alive = true;
      }
    } else {
      // Input in camera-local space
      let forward = 0;
      let right = 0;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) forward += 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) forward -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) right += 1;
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) right -= 1;

      forward -= this.joyInput.y;
      right += this.joyInput.x;

      let mx = 0;
      let mz = 0;
      const inputLen = Math.hypot(forward, right);
      if (inputLen > 0.05) {
        const nf = forward / Math.max(1, inputLen);
        const nr = right / Math.max(1, inputLen);
        // Camera looks along (-sin(camYaw), -cos(camYaw))
        const fwdX = -Math.sin(this.camYaw);
        const fwdZ = -Math.cos(this.camYaw);
        const rightX = Math.cos(this.camYaw);
        const rightZ = -Math.sin(this.camYaw);
        mx = fwdX * nf + rightX * nr;
        mz = fwdZ * nf + rightZ * nr;
      }

      const sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
      const speedMult = this.dashTimer > 0
        ? CONFIG.DASH_MULTIPLIER
        : (sprinting ? CONFIG.SPRINT_MULTIPLIER : 1);
      const speed = CONFIG.MOVE_SPEED * speedMult;

      lp.vx = mx * speed + lp.kx;
      lp.vz = mz * speed + lp.kz;
      lp.kx *= Math.exp(-8 * dt);
      lp.kz *= Math.exp(-8 * dt);

      // Vertical physics
      lp.vy -= CONFIG.GRAVITY * dt;
      lp.y += lp.vy * dt;
      if (lp.y < 0) {
        lp.y = 0;
        lp.vy = 0;
      }

      let nx = clamp(lp.x + lp.vx * dt, -this.worldHalf, this.worldHalf);
      let nz = clamp(lp.z + lp.vz * dt, -this.worldHalf, this.worldHalf);
      const col = resolvePillars(nx, nz, CONFIG.PLAYER_RADIUS);
      lp.x = col.x;
      lp.z = col.z;

      const moveSpeed = Math.hypot(mx * speed, mz * speed);
      lp.speedRatio = clamp(moveSpeed / (CONFIG.MOVE_SPEED * CONFIG.SPRINT_MULTIPLIER), 0, 1.3);

      if (moveSpeed > 0.4 && lp.attackTimer <= 0) {
        const desiredAngle = Math.atan2(mx, mz);
        lp.angle = lerpAngle(lp.angle, desiredAngle, Math.min(1, dt * 14));
      }
      if (moveSpeed > 0.4 && lp.y <= 0.05) {
        lp.walkPhase += dt * (7.5 + lp.speedRatio * 6.5);
      }
    }

    if (lp.emote && Date.now() > lp.emoteUntil) {
      lp.emote = "";
    }

    const now = Date.now();
    for (const [id, p] of this.players.entries()) {
      if (id === this.localId) continue;

      if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);
      if (p.attackTimer > 0) p.attackTimer = Math.max(0, p.attackTimer - dt);

      if (p.isBot) {
        this.updateBot(p, dt, now);
      } else {
        const dx = p.targetX - p.x;
        const dy = (p.targetY || 0) - (p.y || 0);
        const dz = p.targetZ - p.z;
        p.x += dx * Math.min(1, dt * 14);
        p.y = (p.y || 0) + dy * Math.min(1, dt * 14);
        p.z += dz * Math.min(1, dt * 14);
        const stepDist = Math.hypot(dx, dz);
        p.speedRatio = clamp(stepDist * 2.5, 0, 1);
        if (stepDist > 0.06) {
          p.walkPhase += dt * 11;
        }
        if (p.emote && now > p.emoteUntil) {
          p.emote = "";
        }
      }
    }
  }

  updateBot(p, dt, now) {
    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        const sp = this.pickSafeSpawn();
        p.x = sp.x;
        p.y = 0;
        p.z = sp.z;
        p.vy = 0;
        p.kx = 0;
        p.kz = 0;
        p.hp = CONFIG.MAX_HP;
        p.alive = true;
      }
      return;
    }

    if (p.attackCooldown > 0) p.attackCooldown = Math.max(0, p.attackCooldown - dt);

    // Find nearest living opponent (usually localPlayer or another bot)
    let target = this.localPlayer.alive ? this.localPlayer : null;
    let bestDist = target ? Math.hypot(target.x - p.x, target.z - p.z) : Infinity;

    for (const [oid, other] of this.players.entries()) {
      if (oid === p.id || !other.alive) continue;
      const d = Math.hypot(other.x - p.x, other.z - p.z);
      if (d < bestDist) {
        bestDist = d;
        target = other;
      }
    }

    let vx = 0;
    let vz = 0;

    if (target && bestDist < 24) {
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const desiredAngle = Math.atan2(dx, dz);
      p.angle = lerpAngle(p.angle, desiredAngle, Math.min(1, dt * 10));

      if (bestDist > 2.15) {
        const bSpeed = CONFIG.MOVE_SPEED * 0.72;
        vx = (dx / bestDist) * bSpeed;
        vz = (dz / bestDist) * bSpeed;
      } else if (p.attackCooldown <= 0) {
        p.attackCombo = (p.attackCombo + 1) % 3;
        p.attackDuration = 0.34;
        p.attackTimer = p.attackDuration;
        p.attackCooldown = 1.05 + Math.random() * 0.6;

        this.pushEvent({
          type: "swing",
          id: p.id,
          x: p.x,
          y: p.y + 1.45,
          z: p.z,
          angle: p.angle,
          combo: p.attackCombo
        });

        const dmg = p.attackCombo === 2 ? 16 : 11;
        const imp = {
          x: (dx / Math.max(0.01, bestDist)) * 7.5,
          y: 3.5,
          z: (dz / Math.max(0.01, bestDist)) * 7.5
        };
        this.applyDamage(target, dmg, imp, p.id);
      }
    } else {
      p.wanderTimer -= dt;
      if (p.wanderTimer <= 0) {
        p.wanderTimer = 1.6 + Math.random() * 2.4;
        p.goalX = clamp((Math.random() - 0.5) * 48, -this.worldHalf, this.worldHalf);
        p.goalZ = clamp((Math.random() - 0.5) * 48, -this.worldHalf, this.worldHalf);
      }
      const bdx = p.goalX - p.x;
      const bdz = p.goalZ - p.z;
      const bdist = Math.hypot(bdx, bdz);
      if (bdist > 1.0) {
        const bSpeed = CONFIG.MOVE_SPEED * 0.55;
        vx = (bdx / bdist) * bSpeed;
        vz = (bdz / bdist) * bSpeed;
        p.angle = lerpAngle(p.angle, Math.atan2(bdx, bdz), Math.min(1, dt * 8));
      }
    }

    // Apply knockback & gravity
    p.vy -= CONFIG.GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y < 0) {
      p.y = 0;
      p.vy = 0;
    }

    const totalVx = vx + (p.kx || 0);
    const totalVz = vz + (p.kz || 0);
    p.kx *= Math.exp(-8 * dt);
    p.kz *= Math.exp(-8 * dt);

    const nx = clamp(p.x + totalVx * dt, -this.worldHalf, this.worldHalf);
    const nz = clamp(p.z + totalVz * dt, -this.worldHalf, this.worldHalf);
    const col = resolvePillars(nx, nz, CONFIG.PLAYER_RADIUS);
    p.x = col.x;
    p.z = col.z;

    const spd = Math.hypot(vx, vz);
    p.speedRatio = clamp(spd / CONFIG.MOVE_SPEED, 0, 1);
    if (spd > 0.4) {
      p.walkPhase += dt * (7 + p.speedRatio * 5);
    }

    if (p.emote && now > p.emoteUntil) {
      p.emote = "";
    }
  }
}
