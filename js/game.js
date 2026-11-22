import { CONFIG } from "./config.js";

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export class PlaneGame {
  constructor(localId, name, color) {
    this.localId = localId;
    this.players = new Map();
    this.bots = new Map();
    this.botsEnabled = false;

    const half = CONFIG.WORLD_SIZE / 2;
    const startX = (Math.random() - 0.5) * 18;
    const startZ = (Math.random() - 0.5) * 18;

    this.localPlayer = {
      id: localId,
      name,
      color,
      x: startX,
      z: startZ,
      targetX: startX,
      targetZ: startZ,
      vx: 0,
      vz: 0,
      angle: 0,
      emote: "",
      emoteUntil: 0,
      isHost: false,
      isBot: false,
      walkPhase: 0
    };

    this.players.set(localId, this.localPlayer);

    this.keys = new Set();
    this.joyInput = { x: 0, y: 0 };
    this.clickTarget = null;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.worldHalf = half - CONFIG.PLAYER_RADIUS * 1.5;
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

  triggerDash() {
    if (this.dashCooldown <= 0) {
      this.dashTimer = CONFIG.DASH_DURATION;
      this.dashCooldown = CONFIG.DASH_COOLDOWN;
      return true;
    }
    return false;
  }

  upsertRemotePlayer(data) {
    if (!data || data.id === this.localId) {
      return;
    }
    const rx = Number(data.x) || 0;
    const rz = Number(data.z !== undefined ? data.z : data.y) || 0;
    const existing = this.players.get(data.id);
    if (existing) {
      existing.name = data.name;
      existing.color = data.color;
      existing.targetX = rx;
      existing.targetZ = rz;
      existing.angle = data.angle || 0;
      existing.emote = data.emote || "";
      existing.emoteUntil = data.emoteUntil || 0;
      existing.isHost = Boolean(data.isHost);
      existing.lastSeen = Date.now();
    } else {
      this.players.set(data.id, {
        ...data,
        x: rx,
        z: rz,
        targetX: rx,
        targetZ: rz,
        walkPhase: 0,
        lastSeen: Date.now(),
        isBot: false
      });
    }
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  toggleBots() {
    this.botsEnabled = !this.botsEnabled;
    if (this.botsEnabled) {
      CONFIG.BOT_NAMES.forEach((botName, idx) => {
        const id = `bot-${idx}`;
        const bx = clamp(this.localPlayer.x + (Math.random() - 0.5) * 26, -this.worldHalf, this.worldHalf);
        const bz = clamp(this.localPlayer.z + (Math.random() - 0.5) * 26, -this.worldHalf, this.worldHalf);
        const bot = {
          id,
          name: botName,
          color: CONFIG.COLORS[(idx + 1) % CONFIG.COLORS.length],
          x: bx,
          z: bz,
          targetX: bx,
          targetZ: bz,
          angle: 0,
          emote: "",
          emoteUntil: 0,
          isHost: false,
          isBot: true,
          walkPhase: Math.random() * 6,
          wanderTimer: Math.random() * 2,
          goalX: bx,
          goalZ: bz
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
    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
    }
    if (this.dashCooldown > 0) {
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    }

    let ix = this.joyInput.x;
    let iz = this.joyInput.y;

    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) iz -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iz += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;

    if (ix !== 0 || iz !== 0) {
      this.clickTarget = null;
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
    } else if (this.clickTarget) {
      const dx = this.clickTarget.x - this.localPlayer.x;
      const dz = this.clickTarget.z - this.localPlayer.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.6) {
        ix = dx / dist;
        iz = dz / dist;
      } else {
        this.clickTarget = null;
      }
    }

    const speed = CONFIG.MOVE_SPEED * (this.dashTimer > 0 ? CONFIG.DASH_MULTIPLIER : 1);
    this.localPlayer.vx = ix * speed;
    this.localPlayer.vz = iz * speed;
    this.localPlayer.x = clamp(this.localPlayer.x + this.localPlayer.vx * dt, -this.worldHalf, this.worldHalf);
    this.localPlayer.z = clamp(this.localPlayer.z + this.localPlayer.vz * dt, -this.worldHalf, this.worldHalf);

    const moving = Math.hypot(this.localPlayer.vx, this.localPlayer.vz) > 0.5;
    if (moving) {
      this.localPlayer.angle = Math.atan2(ix, iz);
      this.localPlayer.walkPhase += dt * (this.dashTimer > 0 ? 18 : 11);
    }

    if (this.localPlayer.emote && Date.now() > this.localPlayer.emoteUntil) {
      this.localPlayer.emote = "";
    }

    const now = Date.now();
    for (const [id, p] of this.players.entries()) {
      if (id === this.localId) {
        continue;
      }
      if (p.isBot) {
        p.wanderTimer -= dt;
        if (p.wanderTimer <= 0) {
          p.wanderTimer = 1.5 + Math.random() * 2.5;
          p.goalX = clamp(this.localPlayer.x + (Math.random() - 0.5) * 36, -this.worldHalf, this.worldHalf);
          p.goalZ = clamp(this.localPlayer.z + (Math.random() - 0.5) * 36, -this.worldHalf, this.worldHalf);
          if (Math.random() < 0.25) {
            const emotes = ["👋", "🔥", "😂", "⭐"];
            p.emote = emotes[Math.floor(Math.random() * emotes.length)];
            p.emoteUntil = now + 1800;
          }
        }
        const bdx = p.goalX - p.x;
        const bdz = p.goalZ - p.z;
        const bdist = Math.hypot(bdx, bdz);
        if (bdist > 0.8) {
          const bSpeed = CONFIG.MOVE_SPEED * 0.65;
          p.x += (bdx / bdist) * bSpeed * dt;
          p.z += (bdz / bdist) * bSpeed * dt;
          p.angle = Math.atan2(bdx, bdz);
          p.walkPhase += dt * 9;
        }
        if (p.emote && now > p.emoteUntil) {
          p.emote = "";
        }
      } else {
        const dx = p.targetX - p.x;
        const dz = p.targetZ - p.z;
        p.x += dx * Math.min(1, dt * 14);
        p.z += dz * Math.min(1, dt * 14);
        if (Math.hypot(dx, dz) > 0.08) {
          p.walkPhase += dt * 10;
        }
        if (p.emote && now > p.emoteUntil) {
          p.emote = "";
        }
      }
    }
  }
}
