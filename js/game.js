import { CONFIG } from "./config.js";
import { resolveCityCollision, raycastCity } from "./city.js";

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class PlaneGame {
  constructor(localId, name, color) {
    this.localId = localId;
    this.players = new Map();
    this.bots = new Map();
    this.botsEnabled = false;
    this.soloMode = false;

    this.events = [];
    this.worldHalf = CONFIG.WORLD_SIZE / 2 - 2.0;

    this.localPlayer = {
      id: localId,
      name,
      color,
      x: 0,
      y: 0,
      z: 6,
      targetX: 0,
      targetY: 0,
      targetZ: 6,
      vx: 0,
      vy: 0,
      vz: 0,
      kx: 0,
      kz: 0,
      angle: Math.PI,
      moveSpeed: 0,
      sprinting: false,
      weapon: "fists", // "fists" | "ak74"
      ammo: CONFIG.AK74_MAG_SIZE,
      reloadingTimer: 0,
      recoil: 0,
      isHost: false,
      isBot: false,
      walkPhase: 0,
      hp: CONFIG.MAX_HP,
      maxHp: CONFIG.MAX_HP,
      alive: true,
      respawnTimer: 0,
      attackTimer: 0,
      attackDuration: 0.34,
      attackCombo: 0,
      attackSeq: 0,
      lastAttackTime: 0,
      hitFlash: 0
    };

    this.players.set(localId, this.localPlayer);

    this.keys = new Set();
    this.mouseDown = false;
    this.wheelOpen = false;
    this.camYaw = 0;
    this.camPitch = 0.22;
    this.attackCooldown = 0;
    this.onNetworkHit = null;
  }

  pickStreetSpawn() {
    // Spawn on clear main avenues or central square
    const spots = [
      { x: 0, z: 0 },
      { x: -12, z: 0 },
      { x: 12, z: 0 },
      { x: 0, z: -12 },
      { x: 0, z: 12 },
      { x: -42, z: 0 },
      { x: 42, z: 0 },
      { x: 0, z: -42 },
      { x: 0, z: 42 }
    ];
    const base = spots[Math.floor(Math.random() * spots.length)];
    return resolveCityCollision(
      base.x + (Math.random() - 0.5) * 6,
      base.z + (Math.random() - 0.5) * 6,
      CONFIG.PLAYER_RADIUS
    );
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

  setHostFlag(isHost) {
    this.localPlayer.isHost = isHost;
  }

  equipWeapon(weaponId) {
    if (weaponId !== "fists" && weaponId !== "ak74") return;
    if (this.localPlayer.weapon === weaponId) return;
    this.localPlayer.weapon = weaponId;
    this.localPlayer.reloadingTimer = 0;
    this.localPlayer.attackTimer = 0;
  }

  startReload() {
    const lp = this.localPlayer;
    if (lp.weapon !== "ak74" || lp.reloadingTimer > 0 || lp.ammo >= CONFIG.AK74_MAG_SIZE) {
      return;
    }
    lp.reloadingTimer = CONFIG.AK74_RELOAD_TIME;
    this.pushEvent({ type: "reload" });
  }

  triggerJump() {
    const lp = this.localPlayer;
    if (!lp.alive || lp.y > 0.05) return false;
    lp.vy = CONFIG.JUMP_VELOCITY;
    this.pushEvent({ type: "jump", id: lp.id });
    return true;
  }

  triggerPrimaryAction() {
    const lp = this.localPlayer;
    if (!lp.alive || this.wheelOpen || this.attackCooldown > 0) return false;

    if (lp.weapon === "ak74") {
      return this.fireAK74();
    }
    return this.performMelee();
  }

  performMelee() {
    const lp = this.localPlayer;
    const now = performance.now();
    lp.attackCombo = now - lp.lastAttackTime < 750 ? (lp.attackCombo + 1) % 2 : 0;
    lp.lastAttackTime = now;
    lp.attackDuration = 0.34;
    lp.attackTimer = lp.attackDuration;
    lp.attackSeq = (lp.attackSeq || 0) + 1;
    this.attackCooldown = CONFIG.MELEE_COOLDOWN;

    // Face camera forward direction
    const fwdX = -Math.sin(this.camYaw);
    const fwdZ = -Math.cos(this.camYaw);
    lp.angle = Math.atan2(fwdX, fwdZ);

    this.pushEvent({ type: "swing", id: lp.id });

    const damage = CONFIG.MELEE_DAMAGE[lp.attackCombo] || 22;
    const knockPower = lp.attackCombo === 1 ? 8.5 : 6.0;

    for (const [id, target] of this.players.entries()) {
      if (id === this.localId || !target.alive) continue;
      const dx = target.x - lp.x;
      const dz = target.z - lp.z;
      const dist = Math.hypot(dx, dz);
      if (dist > CONFIG.MELEE_RANGE || dist < 0.001) continue;
      const dot = (dx * fwdX + dz * fwdZ) / dist;
      if (dot < CONFIG.MELEE_ARC_COS && dist > 1.15) continue;

      const dirX = dx / dist;
      const dirZ = dz / dist;
      const imp = { x: dirX * knockPower, y: 3.2, z: dirZ * knockPower };
      this.deliverHit(target, damage, imp, false);
    }

    return true;
  }

  fireAK74() {
    const lp = this.localPlayer;
    if (lp.reloadingTimer > 0) return false;
    if (lp.ammo <= 0) {
      this.startReload();
      return false;
    }

    lp.ammo -= 1;
    lp.recoil = Math.min(1, lp.recoil + 0.55);
    lp.attackSeq = (lp.attackSeq || 0) + 1;
    this.attackCooldown = CONFIG.AK74_FIRE_RATE;

    // Camera forward ray (with slight realistic vertical spread)
    const cosP = Math.cos(this.camPitch);
    const spreadX = (Math.random() - 0.5) * 0.022;
    const spreadY = (Math.random() - 0.5) * 0.022;
    const dirX = -Math.sin(this.camYaw) * cosP + spreadX;
    const dirY = -Math.sin(this.camPitch) + spreadY;
    const dirZ = -Math.cos(this.camYaw) * cosP;
    const dLen = Math.hypot(dirX, dirY, dirZ) || 1;
    const rdx = dirX / dLen;
    const rdy = dirY / dLen;
    const rdz = dirZ / dLen;

    // Align character facing with aim direction
    lp.angle = Math.atan2(rdx, rdz);

    // Ray origin from player's right shoulder / rifle height
    const ox = lp.x + Math.cos(this.camYaw) * 0.25 + rdx * 0.7;
    const oy = (lp.y || 0) + 1.48;
    const oz = lp.z - Math.sin(this.camYaw) * 0.25 + rdz * 0.7;

    // 1. Check city buildings / cars first
    let hitDist = raycastCity(ox, oy, oz, rdx, rdy, rdz, CONFIG.AK74_RANGE);
    let hitTarget = null;
    let isHeadshot = false;

    // 2. Check all living enemies along ray
    for (const [id, target] of this.players.entries()) {
      if (id === this.localId || !target.alive) continue;
      const tx = target.x - ox;
      const tz = target.z - oz;
      const proj = tx * rdx + tz * rdz;
      if (proj < 0.2 || proj > hitDist) continue;

      const px = ox + rdx * proj;
      const py = oy + rdy * proj;
      const pz = oz + rdz * proj;
      const radialDist = Math.hypot(px - target.x, pz - target.z);

      const baseY = target.y || 0;
      if (radialDist < 0.48 && py >= baseY && py <= baseY + 2.05) {
        hitDist = proj;
        hitTarget = target;
        isHeadshot = py >= baseY + 1.62;
      }
    }

    const endX = ox + rdx * hitDist;
    const endY = oy + rdy * hitDist;
    const endZ = oz + rdz * hitDist;

    this.pushEvent({
      type: "shot",
      id: lp.id,
      ox, oy, oz,
      ex: endX, ey: endY, ez: endZ,
      angle: lp.angle,
      hitWall: !hitTarget && hitDist < CONFIG.AK74_RANGE - 0.5
    });

    if (hitTarget) {
      const dmg = isHeadshot ? CONFIG.AK74_DAMAGE * 2 : CONFIG.AK74_DAMAGE;
      const imp = { x: rdx * 9.5, y: 2.6, z: rdz * 9.5 };
      this.deliverHit(hitTarget, dmg, imp, isHeadshot);
    }

    // Slight upward camera recoil kick
    this.camPitch = clamp(this.camPitch - 0.011, -0.25, 0.95);

    if (lp.ammo <= 0) {
      this.startReload();
    }
    return true;
  }

  deliverHit(target, damage, imp, heavy) {
    if (target.isBot) {
      this.applyDamage(target, damage, imp, this.localId, heavy);
    } else {
      target.hitFlash = 0.2;
      this.pushEvent({
        type: "hit",
        x: target.x,
        y: (target.y || 0) + 1.35,
        z: target.z,
        heavy
      });
      if (typeof this.onNetworkHit === "function") {
        this.onNetworkHit({
          targetId: target.id,
          attackerId: this.localId,
          damage,
          heavy,
          kx: imp.x,
          ky: imp.y,
          kz: imp.z
        });
      }
    }
  }

  receiveNetworkHit(msg) {
    if (!msg || msg.targetId !== this.localId) return;
    const imp = {
      x: Number(msg.kx) || 0,
      y: Number(msg.ky) || 3,
      z: Number(msg.kz) || 0
    };
    this.applyDamage(this.localPlayer, Number(msg.damage) || 20, imp, msg.attackerId || null, Boolean(msg.heavy));
  }

  applyDamage(target, damage, impulse, attackerId, heavy = false) {
    if (!target || !target.alive) return;
    target.hp = Math.max(0, target.hp - damage);
    target.hitFlash = 0.2;
    target.kx = (target.kx || 0) + impulse.x * 0.55;
    target.kz = (target.kz || 0) + impulse.z * 0.55;

    this.pushEvent({
      type: "hit",
      x: target.x,
      y: (target.y || 0) + 1.35,
      z: target.z,
      heavy
    });

    if (target.hp <= 0) {
      target.alive = false;
      target.respawnTimer = CONFIG.RESPAWN_TIME;
      this.pushEvent({
        type: "death",
        id: target.id,
        x: target.x,
        y: target.y || 0,
        z: target.z,
        angle: target.angle,
        color: target.color,
        impulse
      });
    }
  }

  upsertRemotePlayer(data) {
    if (!data || data.id === this.localId) return;
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
      existing.weapon = data.weapon || "fists";
      existing.sprinting = Boolean(data.sprinting);
      existing.isHost = Boolean(data.isHost);
      existing.hp = data.hp !== undefined ? data.hp : CONFIG.MAX_HP;
      existing.alive = nowAlive;

      if (data.attackSeq && data.attackSeq !== existing.attackSeq) {
        existing.attackSeq = data.attackSeq;
        if (existing.weapon === "ak74") {
          existing.recoil = 0.6;
        } else {
          existing.attackCombo = data.attackCombo || 0;
          existing.attackDuration = 0.34;
          existing.attackTimer = 0.34;
        }
      }
      if (wasAlive && !nowAlive) {
        this.pushEvent({
          type: "death",
          id: existing.id,
          x: existing.x,
          y: existing.y || 0,
          z: existing.z,
          angle: existing.angle,
          color: existing.color,
          impulse: { x: (Math.random() - 0.5) * 8, y: 4, z: (Math.random() - 0.5) * 8 }
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
        moveSpeed: 0,
        weapon: data.weapon || "fists",
        recoil: 0,
        hp: data.hp !== undefined ? data.hp : CONFIG.MAX_HP,
        maxHp: CONFIG.MAX_HP,
        alive: data.alive !== false,
        attackTimer: 0,
        attackDuration: 0.34,
        attackCombo: 0,
        attackSeq: data.attackSeq || 0,
        hitFlash: 0,
        isBot: false
      });
    }
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  setBotsEnabled(enabled) {
    if (this.botsEnabled === enabled) return this.botsEnabled;
    this.botsEnabled = enabled;
    if (enabled) {
      CONFIG.BOT_NAMES.forEach((botName, idx) => {
        const id = `bot-${idx}`;
        const sp = this.pickStreetSpawn();
        const bot = {
          id,
          name: botName,
          color: CONFIG.COLORS[idx % CONFIG.COLORS.length],
          x: sp.x,
          y: 0,
          z: sp.z,
          vy: 0,
          kx: 0,
          kz: 0,
          angle: Math.random() * Math.PI * 2,
          moveSpeed: 0,
          sprinting: false,
          weapon: "fists",
          recoil: 0,
          isHost: false,
          isBot: true,
          walkPhase: Math.random() * 6,
          hp: CONFIG.MAX_HP,
          maxHp: CONFIG.MAX_HP,
          alive: true,
          respawnTimer: 0,
          attackTimer: 0,
          attackDuration: 0.34,
          attackCombo: 0,
          attackCooldown: 1.0,
          hitFlash: 0,
          wanderTimer: 0.5 + Math.random() * 2,
          goalX: sp.x,
          goalZ: sp.z
        };
        this.bots.set(id, bot);
        this.players.set(id, bot);
      });
    } else {
      for (const id of this.bots.keys()) this.players.delete(id);
      this.bots.clear();
    }
    return this.botsEnabled;
  }

  update(dt) {
    const lp = this.localPlayer;
    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (lp.attackTimer > 0) lp.attackTimer = Math.max(0, lp.attackTimer - dt);
    if (lp.hitFlash > 0) lp.hitFlash = Math.max(0, lp.hitFlash - dt);
    if (lp.recoil > 0) lp.recoil = Math.max(0, lp.recoil - dt * 6.5);

    if (lp.reloadingTimer > 0) {
      lp.reloadingTimer -= dt;
      if (lp.reloadingTimer <= 0) {
        lp.reloadingTimer = 0;
        lp.ammo = CONFIG.AK74_MAG_SIZE;
      }
    }

    // Hold LMB for full-auto AK-74
    if (this.mouseDown && !this.wheelOpen && lp.alive && lp.weapon === "ak74" && this.attackCooldown <= 0) {
      this.fireAK74();
    }

    if (!lp.alive) {
      lp.respawnTimer -= dt;
      if (lp.respawnTimer <= 0) {
        const sp = this.pickStreetSpawn();
        lp.x = sp.x;
        lp.y = 0;
        lp.z = sp.z;
        lp.vx = 0; lp.vy = 0; lp.vz = 0;
        lp.kx = 0; lp.kz = 0;
        lp.hp = CONFIG.MAX_HP;
        lp.ammo = CONFIG.AK74_MAG_SIZE;
        lp.reloadingTimer = 0;
        lp.alive = true;
      }
    } else {
      let forward = 0;
      let right = 0;
      if (!this.wheelOpen) {
        if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) forward += 1;
        if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) forward -= 1;
        if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) right += 1;
        if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) right -= 1;
      }

      const fwdX = -Math.sin(this.camYaw);
      const fwdZ = -Math.cos(this.camYaw);
      const rightX = Math.cos(this.camYaw);
      const rightZ = -Math.sin(this.camYaw);

      let mx = 0;
      let mz = 0;
      const inLen = Math.hypot(forward, right);
      if (inLen > 0.05) {
        const nf = forward / inLen;
        const nr = right / inLen;
        mx = fwdX * nf + rightX * nr;
        mz = fwdZ * nf + rightZ * nr;
      }

      // Shift = Sprint (no dash!)
      const wantsSprint = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && inLen > 0.05;
      lp.sprinting = wantsSprint;
      const speed = wantsSprint ? CONFIG.SPRINT_SPEED : CONFIG.WALK_SPEED;

      lp.vx = mx * speed + lp.kx;
      lp.vz = mz * speed + lp.kz;
      lp.kx *= Math.exp(-9 * dt);
      lp.kz *= Math.exp(-9 * dt);

      lp.vy -= CONFIG.GRAVITY * dt;
      lp.y += lp.vy * dt;
      if (lp.y < 0) {
        lp.y = 0;
        lp.vy = 0;
      }

      const nx = clamp(lp.x + lp.vx * dt, -this.worldHalf, this.worldHalf);
      const nz = clamp(lp.z + lp.vz * dt, -this.worldHalf, this.worldHalf);
      const col = resolveCityCollision(nx, nz, CONFIG.PLAYER_RADIUS);
      lp.x = col.x;
      lp.z = col.z;

      lp.moveSpeed = inLen > 0.05 ? speed : 0;

      if (lp.weapon === "ak74" && !wantsSprint) {
        // Aim smoothly along camera forward when carrying AK-74
        const aimAngle = Math.atan2(fwdX, fwdZ);
        lp.angle = lerpAngle(lp.angle, aimAngle, Math.min(1, dt * 16));
      } else if (inLen > 0.05 && lp.attackTimer <= 0) {
        const moveAngle = Math.atan2(mx, mz);
        lp.angle = lerpAngle(lp.angle, moveAngle, Math.min(1, dt * 13));
      }

      if (lp.moveSpeed > 0.3 && lp.y <= 0.05) {
        lp.walkPhase += dt * (wantsSprint ? 13.5 : 8.2);
      }
    }

    for (const [id, p] of this.players.entries()) {
      if (id === this.localId) continue;
      if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);
      if (p.attackTimer > 0) p.attackTimer = Math.max(0, p.attackTimer - dt);
      if (p.recoil > 0) p.recoil = Math.max(0, p.recoil - dt * 6.5);

      if (p.isBot) {
        this.updateBot(p, dt);
      } else {
        const dx = p.targetX - p.x;
        const dy = (p.targetY || 0) - (p.y || 0);
        const dz = p.targetZ - p.z;
        p.x += dx * Math.min(1, dt * 14);
        p.y = (p.y || 0) + dy * Math.min(1, dt * 14);
        p.z += dz * Math.min(1, dt * 14);
        const stepDist = Math.hypot(dx, dz);
        p.moveSpeed = stepDist / Math.max(0.016, dt);
        if (stepDist > 0.04) {
          p.walkPhase += dt * (p.sprinting ? 13 : 8.5);
        }
      }
    }
  }

  updateBot(p, dt) {
    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        const sp = this.pickStreetSpawn();
        p.x = sp.x; p.y = 0; p.z = sp.z;
        p.vy = 0; p.kx = 0; p.kz = 0;
        p.hp = CONFIG.MAX_HP;
        p.alive = true;
      }
      return;
    }

    if (p.attackCooldown > 0) p.attackCooldown = Math.max(0, p.attackCooldown - dt);

    const lp = this.localPlayer;
    const dx = lp.x - p.x;
    const dz = lp.z - p.z;
    const dist = Math.hypot(dx, dz);

    let vx = 0;
    let vz = 0;
    p.sprinting = false;

    if (lp.alive && dist < 28) {
      const desiredAngle = Math.atan2(dx, dz);
      p.angle = lerpAngle(p.angle, desiredAngle, Math.min(1, dt * 9));
      if (dist > 1.85) {
        const spd = dist > 10 ? CONFIG.SPRINT_SPEED * 0.68 : CONFIG.WALK_SPEED * 0.95;
        p.sprinting = dist > 10;
        vx = (dx / dist) * spd;
        vz = (dz / dist) * spd;
      } else if (p.attackCooldown <= 0) {
        p.attackCombo = (p.attackCombo + 1) % 2;
        p.attackDuration = 0.34;
        p.attackTimer = 0.34;
        p.attackCooldown = 1.15 + Math.random() * 0.5;
        this.pushEvent({ type: "swing", id: p.id });
        const imp = { x: (dx / Math.max(0.01, dist)) * 6, y: 2.5, z: (dz / Math.max(0.01, dist)) * 6 };
        this.applyDamage(lp, 10, imp, p.id, false);
      }
    } else {
      p.wanderTimer -= dt;
      if (p.wanderTimer <= 0) {
        p.wanderTimer = 2.0 + Math.random() * 3.0;
        const sp = this.pickStreetSpawn();
        p.goalX = sp.x;
        p.goalZ = sp.z;
      }
      const gdx = p.goalX - p.x;
      const gdz = p.goalZ - p.z;
      const gdist = Math.hypot(gdx, gdz);
      if (gdist > 1.2) {
        vx = (gdx / gdist) * CONFIG.WALK_SPEED * 0.78;
        vz = (gdz / gdist) * CONFIG.WALK_SPEED * 0.78;
        p.angle = lerpAngle(p.angle, Math.atan2(gdx, gdz), Math.min(1, dt * 7));
      }
    }

    p.vy -= CONFIG.GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y < 0) { p.y = 0; p.vy = 0; }

    const totalVx = vx + (p.kx || 0);
    const totalVz = vz + (p.kz || 0);
    p.kx *= Math.exp(-9 * dt);
    p.kz *= Math.exp(-9 * dt);

    const nx = clamp(p.x + totalVx * dt, -this.worldHalf, this.worldHalf);
    const nz = clamp(p.z + totalVz * dt, -this.worldHalf, this.worldHalf);
    const col = resolveCityCollision(nx, nz, CONFIG.PLAYER_RADIUS);
    p.x = col.x;
    p.z = col.z;

    p.moveSpeed = Math.hypot(vx, vz);
    if (p.moveSpeed > 0.3) {
      p.walkPhase += dt * (p.sprinting ? 12 : 7.8);
    }
  }
}
