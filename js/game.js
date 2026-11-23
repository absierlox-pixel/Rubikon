import { CONFIG, WEAPON_DEFS } from "./config.js";
import { resolveCityCollision, raycastCity } from "./city.js";

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function angleDiff(from, to) {
  let d = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function lerpAngle(a, b, t) {
  return a + angleDiff(a, b) * t;
}

function makeInitialAmmo() {
  const out = {};
  for (const w of Object.values(WEAPON_DEFS)) {
    if (w.magSize !== undefined) {
      out[w.id] = { mag: w.magSize, reserve: w.reserve };
    }
  }
  return out;
}

export class PlaneGame {
  constructor(localId, name, color) {
    this.localId = localId;
    this.players = new Map();
    this.bots = new Map();
    this.botsEnabled = false;
    this.soloMode = false;

    this.events = [];
    this.rockets = [];
    this.worldHalf = CONFIG.WORLD_SIZE / 2 - 2.0;

    this.weaponAmmo = makeInitialAmmo();
    this.viewMode = "tps"; // "tps" | "fps"
    this.scoped = false;

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
      angle: Math.PI,     // Pelvis / body facing
      aimYaw: Math.PI,    // Where head/upper body looks
      aimPitch: 0,
      turnVel: 0,         // Angular velocity for procedural leaning
      turnStepTimer: 0,   // Procedural turn-in-place stepping
      moveSpeed: 0,
      strafeLocal: 0,
      forwardLocal: 0,
      sprinting: false,
      weapon: "fists",
      reloadingTimer: 0,
      recoil: 0,
      barrelSpin: 0,
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
    this.camPitch = 0.20;
    this.attackCooldown = 0;
    this.onNetworkHit = null;
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === "tps" ? "fps" : "tps";
    if (this.viewMode === "tps" && this.localPlayer.weapon !== "awp") {
      this.scoped = false;
    }
    return this.viewMode;
  }

  getAmmoState(weaponId = this.localPlayer.weapon) {
    return this.weaponAmmo[weaponId] || null;
  }

  pickStreetSpawn() {
    const spots = [
      { x: 0, z: 0 }, { x: -12, z: 0 }, { x: 12, z: 0 },
      { x: 0, z: -12 }, { x: 0, z: 12 },
      { x: -42, z: 0 }, { x: 42, z: 0 },
      { x: 0, z: -42 }, { x: 0, z: 42 },
      { x: -42, z: -42 }, { x: 42, z: 42 }
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
    if (!WEAPON_DEFS[weaponId]) return;
    if (this.localPlayer.weapon === weaponId) return;
    this.localPlayer.weapon = weaponId;
    this.localPlayer.reloadingTimer = 0;
    this.localPlayer.attackTimer = 0;
    this.scoped = false;
  }

  startReload() {
    const lp = this.localPlayer;
    const def = WEAPON_DEFS[lp.weapon];
    if (!def || def.magSize === undefined || lp.reloadingTimer > 0) return;
    const state = this.weaponAmmo[lp.weapon];
    if (!state || state.mag >= def.magSize || state.reserve <= 0) return;
    lp.reloadingTimer = def.reloadTime;
    this.scoped = false;
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
    const def = WEAPON_DEFS[lp.weapon] || WEAPON_DEFS.fists;
    if (def.type === "melee") return this.performMelee(def);
    if (def.type === "gun") return this.fireHitscan(def);
    if (def.type === "projectile") return this.fireRPG(def);
    return false;
  }

  performMelee(def) {
    const lp = this.localPlayer;
    const now = performance.now();
    lp.attackCombo = now - lp.lastAttackTime < 750 ? (lp.attackCombo + 1) % 2 : 0;
    lp.lastAttackTime = now;
    lp.attackDuration = def.cooldown * 0.85;
    lp.attackTimer = lp.attackDuration;
    lp.attackSeq = (lp.attackSeq || 0) + 1;
    this.attackCooldown = def.cooldown;

    const fwdX = -Math.sin(this.camYaw);
    const fwdZ = -Math.cos(this.camYaw);
    lp.aimYaw = Math.atan2(fwdX, fwdZ);

    this.pushEvent({ type: "swing", id: lp.id, heavy: def.id === "knuckles" });

    for (const [id, target] of this.players.entries()) {
      if (id === this.localId || !target.alive) continue;
      const dx = target.x - lp.x;
      const dz = target.z - lp.z;
      const dist = Math.hypot(dx, dz);
      if (dist > def.range || dist < 0.001) continue;
      const dot = (dx * fwdX + dz * fwdZ) / dist;
      if (dot < 0.3 && dist > 1.15) continue;

      const dirX = dx / dist;
      const dirZ = dz / dist;
      const imp = { x: dirX * def.knockback, y: 3.4, z: dirZ * def.knockback };
      this.deliverHit(target, def.damage, imp, def.id === "knuckles");
    }
    return true;
  }

  getAimRay(spread = 0) {
    const lp = this.localPlayer;
    const cosP = Math.cos(this.camPitch);
    const s = this.scoped ? spread * 0.15 : spread;
    const dx = -Math.sin(this.camYaw) * cosP + (Math.random() - 0.5) * s;
    const dy = -Math.sin(this.camPitch) + (Math.random() - 0.5) * s;
    const dz = -Math.cos(this.camYaw) * cosP + (Math.random() - 0.5) * s;
    const len = Math.hypot(dx, dy, dz) || 1;
    const rdx = dx / len;
    const rdy = dy / len;
    const rdz = dz / len;

    const eyeY = (lp.y || 0) + (this.viewMode === "fps" ? 1.62 : 1.52);
    const shoulder = this.viewMode === "fps" ? 0 : 0.28;
    const ox = lp.x + Math.cos(this.camYaw) * shoulder + rdx * 0.55;
    const oy = eyeY;
    const oz = lp.z - Math.sin(this.camYaw) * shoulder + rdz * 0.55;
    return { ox, oy, oz, rdx, rdy, rdz };
  }

  fireHitscan(def) {
    const lp = this.localPlayer;
    if (lp.reloadingTimer > 0) return false;
    const state = this.weaponAmmo[def.id];
    if (!state || state.mag <= 0) {
      this.startReload();
      return false;
    }

    state.mag -= 1;
    lp.recoil = Math.min(1, lp.recoil + def.recoil);
    lp.attackSeq = (lp.attackSeq || 0) + 1;
    this.attackCooldown = def.cooldown;

    const { ox, oy, oz, rdx, rdy, rdz } = this.getAimRay(def.spread);
    lp.aimYaw = Math.atan2(rdx, rdz);

    let hitDist = raycastCity(ox, oy, oz, rdx, rdy, rdz, def.range, 0);
    let hitTarget = null;
    let isHeadshot = false;

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
      if (radialDist < 0.48 && py >= baseY && py <= baseY + 2.02) {
        hitDist = proj;
        hitTarget = target;
        isHeadshot = py >= baseY + 1.60;
      }
    }

    const ex = ox + rdx * hitDist;
    const ey = oy + rdy * hitDist;
    const ez = oz + rdz * hitDist;

    this.pushEvent({
      type: "shot",
      id: lp.id,
      weaponId: def.id,
      ox, oy, oz, ex, ey, ez,
      hitWall: !hitTarget && hitDist < def.range - 0.5
    });

    if (hitTarget) {
      const dmg = isHeadshot ? def.damage * 2 : def.damage;
      const imp = { x: rdx * def.knockback, y: 2.8, z: rdz * def.knockback };
      this.deliverHit(hitTarget, dmg, imp, isHeadshot || def.id === "awp");
    }

    this.camPitch = clamp(this.camPitch - def.camKick, -1.15, 1.15);

    if (state.mag <= 0 && state.reserve > 0) {
      this.startReload();
    }
    return true;
  }

  fireRPG(def) {
    const lp = this.localPlayer;
    if (lp.reloadingTimer > 0) return false;
    const state = this.weaponAmmo[def.id];
    if (!state || state.mag <= 0) {
      this.startReload();
      return false;
    }

    state.mag -= 1;
    lp.recoil = 1.0;
    lp.attackSeq = (lp.attackSeq || 0) + 1;
    this.attackCooldown = def.cooldown;

    const { ox, oy, oz, rdx, rdy, rdz } = this.getAimRay(0.008);
    lp.aimYaw = Math.atan2(rdx, rdz);

    const rocketId = `rkt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.rockets.push({
      id: rocketId,
      ownerId: this.localId,
      x: ox + rdx * 0.6,
      y: oy + rdy * 0.6,
      z: oz + rdz * 0.6,
      vx: rdx * def.projectileSpeed,
      vy: rdy * def.projectileSpeed,
      vz: rdz * def.projectileSpeed,
      age: 0,
      maxAge: 4.5,
      damage: def.damage,
      splashRadius: def.splashRadius,
      knockback: def.knockback
    });

    this.pushEvent({ type: "rpg_fire", id: lp.id, ox, oy, oz });
    this.camPitch = clamp(this.camPitch - def.camKick, -1.15, 1.15);

    if (state.mag <= 0 && state.reserve > 0) {
      this.startReload();
    }
    return true;
  }

  explodeRocket(r) {
    this.pushEvent({ type: "explosion", x: r.x, y: r.y, z: r.z, radius: r.splashRadius });
    for (const [id, target] of this.players.entries()) {
      if (!target.alive) continue;
      const dx = target.x - r.x;
      const dy = ((target.y || 0) + 1.0) - r.y;
      const dz = target.z - r.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > r.splashRadius) continue;

      const falloff = Math.max(0.2, 1 - dist / r.splashRadius);
      const dmg = Math.round(r.damage * falloff);
      const inv = 1 / Math.max(0.1, dist);
      const imp = {
        x: dx * inv * r.knockback * falloff,
        y: (6.5 + Math.max(0, dy * inv) * 6) * falloff,
        z: dz * inv * r.knockback * falloff
      };

      if (id === this.localId) {
        this.applyDamage(target, Math.round(dmg * 0.5), imp, r.ownerId, true);
      } else {
        this.deliverHit(target, dmg, imp, true);
      }
    }
  }

  deliverHit(target, damage, imp, heavy) {
    if (target.isBot) {
      this.applyDamage(target, damage, imp, this.localId, heavy);
    } else {
      target.hitFlash = 0.2;
      this.pushEvent({ type: "hit", x: target.x, y: (target.y || 0) + 1.35, z: target.z, heavy });
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
    const imp = { x: Number(msg.kx) || 0, y: Number(msg.ky) || 3, z: Number(msg.kz) || 0 };
    this.applyDamage(this.localPlayer, Number(msg.damage) || 20, imp, msg.attackerId || null, Boolean(msg.heavy));
  }

  applyDamage(target, damage, impulse, attackerId, heavy = false) {
    if (!target || !target.alive) return;
    target.hp = Math.max(0, target.hp - damage);
    target.hitFlash = 0.2;
    target.kx = (target.kx || 0) + impulse.x * 0.55;
    target.kz = (target.kz || 0) + impulse.z * 0.55;

    // Provoke peaceful NPC ONLY when attacked!
    if (target.isBot && attackerId === this.localId) {
      target.aggro = true;
    }

    this.pushEvent({ type: "hit", x: target.x, y: (target.y || 0) + 1.35, z: target.z, heavy });

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
      existing.aimYaw = data.aimYaw !== undefined ? data.aimYaw : existing.angle;
      existing.aimPitch = data.aimPitch || 0;
      existing.weapon = data.weapon || "fists";
      existing.sprinting = Boolean(data.sprinting);
      existing.isHost = Boolean(data.isHost);
      existing.hp = data.hp !== undefined ? data.hp : CONFIG.MAX_HP;
      existing.alive = nowAlive;

      if (data.attackSeq && data.attackSeq !== existing.attackSeq) {
        existing.attackSeq = data.attackSeq;
        if (existing.weapon === "fists" || existing.weapon === "knuckles") {
          existing.attackCombo = data.attackCombo || 0;
          existing.attackDuration = 0.34;
          existing.attackTimer = 0.34;
        } else {
          existing.recoil = 0.6;
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
        x: rx, y: ry, z: rz,
        targetX: rx, targetY: ry, targetZ: rz,
        walkPhase: 0,
        moveSpeed: 0,
        turnVel: 0,
        turnStepTimer: 0,
        aimYaw: data.angle || 0,
        aimPitch: 0,
        weapon: data.weapon || "fists",
        recoil: 0,
        barrelSpin: 0,
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
        const ang = Math.random() * Math.PI * 2;
        const bot = {
          id,
          name: botName,
          color: CONFIG.COLORS[idx % CONFIG.COLORS.length],
          x: sp.x, y: 0, z: sp.z,
          vx: 0, vy: 0, vz: 0,
          kx: 0, kz: 0,
          angle: ang,
          aimYaw: ang,
          aimPitch: 0,
          turnVel: 0,
          turnStepTimer: 0,
          moveSpeed: 0,
          sprinting: false,
          weapon: "fists",
          recoil: 0,
          barrelSpin: 0,
          isHost: false,
          isBot: true,
          aggro: false, // Peaceful by default!
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
    if (lp.turnStepTimer > 0) lp.turnStepTimer = Math.max(0, lp.turnStepTimer - dt);

    // Reload completion
    if (lp.reloadingTimer > 0) {
      lp.reloadingTimer -= dt;
      if (lp.reloadingTimer <= 0) {
        lp.reloadingTimer = 0;
        const def = WEAPON_DEFS[lp.weapon];
        const st = this.weaponAmmo[lp.weapon];
        if (def && st) {
          const needed = def.magSize - st.mag;
          const take = Math.min(needed, st.reserve);
          st.mag += take;
          st.reserve -= take;
        }
      }
    }

    // Hold LMB for full-auto weapons (AK-74, Minigun)
    const curDef = WEAPON_DEFS[lp.weapon] || WEAPON_DEFS.fists;
    if (this.mouseDown && !this.wheelOpen && lp.alive && curDef.auto && this.attackCooldown <= 0) {
      this.fireHitscan(curDef);
    }

    // Minigun barrel spin speed
    if (lp.weapon === "minigun" && this.mouseDown && lp.alive && !this.wheelOpen) {
      lp.barrelSpin = Math.min(28, lp.barrelSpin + dt * 55);
    } else {
      lp.barrelSpin = Math.max(0, lp.barrelSpin - dt * 18);
    }

    if (!lp.alive) {
      this.scoped = false;
      lp.respawnTimer -= dt;
      if (lp.respawnTimer <= 0) {
        const sp = this.pickStreetSpawn();
        lp.x = sp.x; lp.y = 0; lp.z = sp.z;
        lp.vx = 0; lp.vy = 0; lp.vz = 0;
        lp.kx = 0; lp.kz = 0;
        lp.hp = CONFIG.MAX_HP;
        lp.reloadingTimer = 0;
        this.weaponAmmo = makeInitialAmmo();
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

      let wishX = 0;
      let wishZ = 0;
      const inLen = Math.hypot(forward, right);
      if (inLen > 0.05) {
        const nf = forward / inLen;
        const nr = right / inLen;
        wishX = fwdX * nf + rightX * nr;
        wishZ = fwdZ * nf + rightZ * nr;
      }

      // Shift = Sprint
      const wantsSprint =
        (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) &&
        inLen > 0.05 &&
        !this.scoped &&
        lp.weapon !== "minigun";
      lp.sprinting = wantsSprint;

      const maxSpeed = lp.weapon === "minigun"
        ? CONFIG.WALK_SPEED * 0.78
        : (wantsSprint ? CONFIG.SPRINT_SPEED : CONFIG.WALK_SPEED);

      const targetVx = wishX * maxSpeed;
      const targetVz = wishZ * maxSpeed;

      // Smooth ground acceleration / deceleration (removes robotic binary stop/start)
      const accel = lp.y > 0.05
        ? CONFIG.ACCEL_AIR
        : (inLen > 0.05 ? CONFIG.ACCEL_GROUND : CONFIG.DECEL_GROUND);
      const blend = 1 - Math.exp(-accel * dt);
      lp.vx += (targetVx - lp.vx) * blend;
      lp.vz += (targetVz - lp.vz) * blend;

      const stepVx = lp.vx + lp.kx;
      const stepVz = lp.vz + lp.kz;
      lp.kx *= Math.exp(-9 * dt);
      lp.kz *= Math.exp(-9 * dt);

      lp.vy -= CONFIG.GRAVITY * dt;
      lp.y += lp.vy * dt;
      if (lp.y < 0) { lp.y = 0; lp.vy = 0; }

      const nx = clamp(lp.x + stepVx * dt, -this.worldHalf, this.worldHalf);
      const nz = clamp(lp.z + stepVz * dt, -this.worldHalf, this.worldHalf);
      const col = resolveCityCollision(nx, nz, CONFIG.PLAYER_RADIUS);
      lp.x = col.x;
      lp.z = col.z;

      lp.moveSpeed = Math.hypot(lp.vx, lp.vz);

      // Procedural bone orientation: aimYaw follows camera, pelvis follows smoothly with turn-in-place stepping!
      const lookYaw = Math.atan2(fwdX, fwdZ);
      lp.aimYaw = lookYaw;
      lp.aimPitch = clamp(-this.camPitch, -0.75, 0.75);

      const prevAngle = lp.angle;
      const hasGun = curDef.type !== "melee";

      if (lp.moveSpeed > 0.45) {
        const desiredPelvis = hasGun && !wantsSprint
          ? lookYaw
          : Math.atan2(lp.vx, lp.vz);
        lp.angle = lerpAngle(lp.angle, desiredPelvis, 1 - Math.exp(-10.5 * dt));
      } else {
        // Standing still: head & torso twist first; if diff > 50 deg, trigger procedural foot-step turn!
        const diff = angleDiff(lp.angle, lookYaw);
        if (Math.abs(diff) > 0.85) {
          lp.turnStepTimer = 0.28;
        }
        if (lp.turnStepTimer > 0) {
          lp.angle = lerpAngle(lp.angle, lookYaw, 1 - Math.exp(-9 * dt));
        }
      }

      // Compute smoothed angular velocity for leaning into turns
      const rawTurn = angleDiff(prevAngle, lp.angle) / Math.max(0.008, dt);
      lp.turnVel += (clamp(rawTurn, -6, 6) - lp.turnVel) * Math.min(1, dt * 10);

      // Local forward/strafe components for directional leg animations
      const bodySin = Math.sin(lp.angle);
      const bodyCos = Math.cos(lp.angle);
      lp.forwardLocal = (lp.vx * bodySin + lp.vz * bodyCos) / Math.max(1, maxSpeed);
      lp.strafeLocal = (lp.vx * bodyCos - lp.vz * bodySin) / Math.max(1, maxSpeed);

      if (lp.moveSpeed > 0.35 && lp.y <= 0.05) {
        lp.walkPhase += dt * (4.5 + lp.moveSpeed * 0.92);
      } else if (lp.turnStepTimer > 0 && lp.y <= 0.05) {
        lp.walkPhase += dt * 9.5;
      }
    }

    // Update flying RPG rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.age += dt;
      const stepX = r.vx * dt;
      const stepY = r.vy * dt;
      const stepZ = r.vz * dt;
      const stepLen = Math.hypot(stepX, stepY, stepZ);

      let exploded = false;
      if (stepLen > 0.001) {
        const hitT = raycastCity(r.x, r.y, r.z, stepX / stepLen, stepY / stepLen, stepZ / stepLen, stepLen, 0.1);
        if (hitT < stepLen) {
          r.x += (stepX / stepLen) * hitT;
          r.y += (stepY / stepLen) * hitT;
          r.z += (stepZ / stepLen) * hitT;
          exploded = true;
        } else {
          r.x += stepX;
          r.y += stepY;
          r.z += stepZ;
        }
      }

      if (!exploded) {
        for (const [id, target] of this.players.entries()) {
          if (id === r.ownerId || !target.alive) continue;
          const d = Math.hypot(target.x - r.x, ((target.y || 0) + 1.0) - r.y, target.z - r.z);
          if (d < 0.85) {
            exploded = true;
            break;
          }
        }
      }

      if (exploded || r.y <= 0.1 || r.age >= r.maxAge) {
        this.explodeRocket(r);
        this.rockets.splice(i, 1);
      }
    }

    // Update bots & remote players
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
        p.moveSpeed = Math.hypot(dx, dz) / Math.max(0.016, dt);
        if (p.moveSpeed > 0.3) p.walkPhase += dt * (4.5 + p.moveSpeed * 0.9);
      }
    }
  }

  updateBot(p, dt) {
    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        const sp = this.pickStreetSpawn();
        p.x = sp.x; p.y = 0; p.z = sp.z;
        p.vx = 0; p.vy = 0; p.vz = 0;
        p.kx = 0; p.kz = 0;
        p.hp = CONFIG.MAX_HP;
        p.aggro = false; // Respawn peaceful!
        p.alive = true;
      }
      return;
    }

    if (p.attackCooldown > 0) p.attackCooldown = Math.max(0, p.attackCooldown - dt);

    const lp = this.localPlayer;
    const dx = lp.x - p.x;
    const dz = lp.z - p.z;
    const dist = Math.hypot(dx, dz);

    // Drop aggro if player died or ran far away
    if (p.aggro && (!lp.alive || dist > 55)) {
      p.aggro = false;
    }

    let targetVx = 0;
    let targetVz = 0;
    p.sprinting = false;
    const prevAng = p.angle;

    if (p.aggro && lp.alive) {
      const desiredAngle = Math.atan2(dx, dz);
      p.aimYaw = desiredAngle;
      p.angle = lerpAngle(p.angle, desiredAngle, 1 - Math.exp(-8 * dt));
      if (dist > 1.85) {
        const spd = dist > 9 ? CONFIG.SPRINT_SPEED * 0.68 : CONFIG.WALK_SPEED * 0.92;
        p.sprinting = dist > 9;
        targetVx = (dx / dist) * spd;
        targetVz = (dz / dist) * spd;
      } else if (p.attackCooldown <= 0) {
        p.attackCombo = (p.attackCombo + 1) % 2;
        p.attackDuration = 0.34;
        p.attackTimer = 0.34;
        p.attackCooldown = 1.15 + Math.random() * 0.5;
        this.pushEvent({ type: "swing", id: p.id, heavy: false });
        const imp = { x: (dx / Math.max(0.01, dist)) * 6, y: 2.5, z: (dz / Math.max(0.01, dist)) * 6 };
        this.applyDamage(lp, 10, imp, p.id, false);
      }
    } else {
      // Calm pedestrian strolling around city streets
      p.wanderTimer -= dt;
      if (p.wanderTimer <= 0) {
        p.wanderTimer = 3.0 + Math.random() * 4.5;
        const sp = this.pickStreetSpawn();
        p.goalX = sp.x;
        p.goalZ = sp.z;
      }
      const gdx = p.goalX - p.x;
      const gdz = p.goalZ - p.z;
      const gdist = Math.hypot(gdx, gdz);
      if (gdist > 1.5) {
        const stroll = CONFIG.WALK_SPEED * 0.62;
        targetVx = (gdx / gdist) * stroll;
        targetVz = (gdz / gdist) * stroll;
        const walkAng = Math.atan2(gdx, gdz);
        p.aimYaw = walkAng;
        p.angle = lerpAngle(p.angle, walkAng, 1 - Math.exp(-6 * dt));
      }
    }

    const blend = 1 - Math.exp(-12 * dt);
    p.vx += (targetVx - p.vx) * blend;
    p.vz += (targetVz - p.vz) * blend;

    const rawTurn = angleDiff(prevAng, p.angle) / Math.max(0.008, dt);
    p.turnVel += (clamp(rawTurn, -5, 5) - p.turnVel) * Math.min(1, dt * 8);

    p.vy -= CONFIG.GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y < 0) { p.y = 0; p.vy = 0; }

    const nx = clamp(p.x + (p.vx + (p.kx || 0)) * dt, -this.worldHalf, this.worldHalf);
    const nz = clamp(p.z + (p.vz + (p.kz || 0)) * dt, -this.worldHalf, this.worldHalf);
    p.kx *= Math.exp(-9 * dt);
    p.kz *= Math.exp(-9 * dt);
    const col = resolveCityCollision(nx, nz, CONFIG.PLAYER_RADIUS);
    p.x = col.x;
    p.z = col.z;

    p.moveSpeed = Math.hypot(p.vx, p.vz);
    if (p.moveSpeed > 0.3) {
      p.walkPhase += dt * (4.5 + p.moveSpeed * 0.9);
    }
  }
}
