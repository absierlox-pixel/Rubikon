import { CONFIG } from "./config.js";
import { CITY_LAYOUT } from "./city.js";
import {
  createCarPaintTexture,
  createCarbonFiberTexture,
  createCrackedGlassTexture,
  createTireTreadTexture
} from "./textures.js";

export const VEHICLE_TYPES = {
  sport: {
    id: "sport",
    name: "Comet GT",
    width: 1.98,
    length: 4.35,
    height: 1.24,
    wheelBase: 2.72,
    trackWidth: 1.74,
    wheelRadius: 0.34,
    wheelWidth: 0.25,
    mass: 1350,
    maxHp: 480,
    accel: 24.0,
    reverseAccel: 13.0,
    maxSpeed: 34.0,
    brakeDecel: 34.0,
    steerSpeed: 2.5,
    maxSteer: 0.54,
    driftGrip: 3.4,
    normalGrip: 9.2,
    colors: ["#c9242b", "#e06c1f", "#1e6eb8", "#d9b426"]
  },
  muscle: {
    id: "muscle",
    name: "Dominator V8",
    width: 2.04,
    length: 4.65,
    height: 1.32,
    wheelBase: 2.86,
    trackWidth: 1.80,
    wheelRadius: 0.36,
    wheelWidth: 0.27,
    mass: 1620,
    maxHp: 560,
    accel: 22.5,
    reverseAccel: 12.0,
    maxSpeed: 31.5,
    brakeDecel: 30.0,
    steerSpeed: 2.3,
    maxSteer: 0.52,
    driftGrip: 2.8,
    normalGrip: 7.8,
    colors: ["#1f3e70", "#22252a", "#9c2323", "#2b5e42"],
    stripe: "#f0f2f5"
  },
  sedan: {
    id: "sedan",
    name: "Schafter",
    width: 1.94,
    length: 4.62,
    height: 1.38,
    wheelBase: 2.88,
    trackWidth: 1.72,
    wheelRadius: 0.34,
    wheelWidth: 0.23,
    mass: 1580,
    maxHp: 600,
    accel: 18.5,
    reverseAccel: 11.0,
    maxSpeed: 27.5,
    brakeDecel: 31.0,
    steerSpeed: 2.4,
    maxSteer: 0.50,
    driftGrip: 3.8,
    normalGrip: 9.6,
    colors: ["#2d323b", "#4b525e", "#263647", "#5c4a3e"]
  },
  suv: {
    id: "suv",
    name: "Patriot 4x4",
    width: 2.14,
    length: 4.82,
    height: 1.78,
    wheelBase: 2.98,
    trackWidth: 1.88,
    wheelRadius: 0.43,
    wheelWidth: 0.29,
    mass: 2350,
    maxHp: 820,
    accel: 16.5,
    reverseAccel: 10.5,
    maxSpeed: 24.5,
    brakeDecel: 27.0,
    steerSpeed: 2.1,
    maxSteer: 0.48,
    driftGrip: 4.2,
    normalGrip: 8.8,
    colors: ["#3b4a38", "#23262b", "#7a6849", "#4f5661"]
  },
  van: {
    id: "van",
    name: "Бусик ТЦК",
    width: 2.12,
    length: 5.05,
    height: 2.05,
    wheelBase: 3.15,
    trackWidth: 1.84,
    wheelRadius: 0.39,
    wheelWidth: 0.26,
    mass: 2450,
    maxHp: 580,
    accel: 17.5,
    reverseAccel: 11.0,
    maxSpeed: 26.0,
    brakeDecel: 28.0,
    steerSpeed: 2.2,
    maxSteer: 0.50,
    driftGrip: 4.5,
    normalGrip: 9.0,
    colors: ["#3f4a32"]
  }
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function angleDiff(from, to) {
  let d = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createVehicleState(id, typeId, x, z, angle, colorIdx = 0) {
  const def = VEHICLE_TYPES[typeId] || VEHICLE_TYPES.sport;
  const color = def.colors[colorIdx % def.colors.length];
  return {
    id,
    typeId: def.id,
    name: def.name,
    spawnX: x,
    spawnZ: z,
    spawnAngle: angle,
    x,
    y: 0,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    angle,
    angVel: 0,
    steerAngle: 0,
    steerBias: 0,
    wheelSpin: 0,
    speed: 0,
    forwardSpeed: 0,
    braking: false,
    reversing: false,
    handbrake: false,
    pitch: 0,
    roll: 0,
    driverId: null,
    hp: def.maxHp,
    maxHp: def.maxHp,
    exploded: false,
    wreckTimer: 0,
    color,
    stripe: def.stripe || null,
    // Damage state
    zones: { front: 0, rear: 0, left: 0, right: 0 },
    appliedZones: { front: 0, rear: 0, left: 0, right: 0 },
    impacts: [],
    glassHealth: 1.0,
    lightsBroken: { fl: false, fr: false, rl: false, rr: false },
    hoodPop: 0,
    hoodDetached: false,
    frontBumperDetached: false,
    rearBumperDetached: false,
    wheelDamage: [0, 0, 0, 0], // FL, FR, RL, RR
    wheelsDetached: [false, false, false, false],
    smokeTimer: 0
  };
}

export function createInitialVehicles() {
  const spawns = [
    ["car-1", "sport", -6, -14, 0, 0],
    ["car-2", "muscle", 6, 18, Math.PI, 0],
    ["car-3", "sedan", -42, -16, 0, 0],
    ["car-4", "suv", 42, 14, Math.PI, 0],
    ["car-5", "sport", 18, -42, Math.PI * 0.5, 2],
    ["car-6", "muscle", -18, 42, -Math.PI * 0.5, 2],
    ["car-7", "sedan", -42, 54, 0, 2],
    ["car-8", "suv", 42, -52, Math.PI, 2],
    ["car-9", "sport", 84, 8, Math.PI, 1],
    ["car-10", "muscle", -84, -10, 0, 1],
    ["car-11", "sedan", 12, 84, -Math.PI * 0.5, 1],
    ["car-12", "suv", -14, -84, Math.PI * 0.5, 1]
  ];
  return spawns.map(([id, typeId, x, z, ang, ci]) => createVehicleState(id, typeId, x, z, ang, ci));
}

function getVehicleCorners(v) {
  const def = VEHICLE_TYPES[v.typeId];
  const hw = def.width * 0.48;
  const hl = def.length * 0.48;
  const sinA = Math.sin(v.angle);
  const cosA = Math.cos(v.angle);
  const pts = [
    [-hw, hl],  // FL
    [hw, hl],   // FR
    [-hw, -hl], // RL
    [hw, -hl],  // RR
    [0, hl],    // Front center
    [0, -hl],   // Rear center
    [-hw, 0],   // Left center
    [hw, 0]     // Right center
  ];
  return pts.map(([lx, lz]) => ({
    lx,
    lz,
    x: v.x + lx * cosA + lz * sinA,
    z: v.z - lx * sinA + lz * cosA
  }));
}

export function applyZoneDamage(v, localX, localZ, amount, game, hitWorldPos = null) {
  if (v.exploded) return;
  const def = VEHICLE_TYPES[v.typeId];
  const normX = localX / (def.width * 0.5);
  const normZ = localZ / (def.length * 0.5);

  const prevHp = v.hp;
  v.hp = Math.max(0, v.hp - amount);
  const dmgNorm = clamp(amount / (def.maxHp * 0.18), 0.15, 1.0);

  // Queue localized soft-body impact for BeamNG-style vertex deformation
  const impLen = Math.hypot(localX, localZ) || 1;
  const hitY = hitWorldPos ? clamp(hitWorldPos.y - v.y, 0.25, def.height) : 0.68;
  v.impacts.push({
    lx: clamp(localX, -def.width * 0.50, def.width * 0.50),
    ly: hitY,
    lz: clamp(localZ, -def.length * 0.50, def.length * 0.50),
    dx: -localX / impLen,
    dy: 0.16,
    dz: -localZ / impLen,
    radius: clamp(1.35 + dmgNorm * 1.15, 1.35, 2.5),
    strength: clamp(0.28 + dmgNorm * 0.52, 0.28, 0.78)
  });
  if (v.impacts.length > 24) v.impacts.shift();

  if (Math.abs(normZ) >= Math.abs(normX) * 0.85) {
    if (normZ >= 0) {
      v.zones.front = clamp(v.zones.front + dmgNorm * 1.9, 0, 1);
      if (v.zones.front > 0.25) v.hoodPop = clamp(v.hoodPop + dmgNorm * 1.4, 0, 1);
      if (localX < 0 && v.zones.front > 0.35) v.lightsBroken.fl = true;
      if (localX >= 0 && v.zones.front > 0.35) v.lightsBroken.fr = true;
      if (v.zones.front > 0.65 && !v.frontBumperDetached) {
        v.frontBumperDetached = true;
        if (game) game.pushEvent({ type: "car_part", x: v.x, y: v.y + 0.5, z: v.z, color: v.color });
      }
      if (v.zones.front > 0.88 && !v.hoodDetached) {
        v.hoodDetached = true;
        if (game) game.pushEvent({ type: "car_part", x: v.x, y: v.y + 1.0, z: v.z, color: v.color });
      }
    } else {
      v.zones.rear = clamp(v.zones.rear + dmgNorm * 1.9, 0, 1);
      if (localX < 0 && v.zones.rear > 0.35) v.lightsBroken.rl = true;
      if (localX >= 0 && v.zones.rear > 0.35) v.lightsBroken.rr = true;
      if (v.zones.rear > 0.68 && !v.rearBumperDetached) {
        v.rearBumperDetached = true;
        if (game) game.pushEvent({ type: "car_part", x: v.x, y: v.y + 0.5, z: v.z, color: v.color });
      }
    }
  } else {
    if (normX < 0) {
      v.zones.left = clamp(v.zones.left + dmgNorm * 1.8, 0, 1);
    } else {
      v.zones.right = clamp(v.zones.right + dmgNorm * 1.8, 0, 1);
    }
  }

  // Wheel / suspension alignment damage on corner hits
  if (Math.abs(normZ) > 0.40 && Math.abs(normX) > 0.40) {
    const wIdx = (normZ > 0 ? 0 : 2) + (normX > 0 ? 0 : 1);
    v.wheelDamage[wIdx] = clamp(v.wheelDamage[wIdx] + dmgNorm * 1.6, 0, 1);
    if (normZ > 0) {
      v.steerBias = clamp(v.steerBias + (normX > 0 ? 0.08 : -0.08) * dmgNorm, -0.22, 0.22);
    }
    if (v.wheelDamage[wIdx] >= 0.94 && !v.wheelsDetached[wIdx]) {
      v.wheelsDetached[wIdx] = true;
      if (game) game.pushEvent({ type: "car_part", x: v.x, y: v.y + 0.4, z: v.z, color: "#191b1e" });
    }
  }

  // Glass cracking/shattering
  if (amount > 12) {
    const prevGlass = v.glassHealth;
    v.glassHealth = Math.max(0, v.glassHealth - dmgNorm * 1.4);
    if (prevGlass > 0 && v.glassHealth <= 0 && game) {
      game.pushEvent({
        type: "glass_shatter",
        x: hitWorldPos ? hitWorldPos.x : v.x,
        y: v.y + 1.15,
        z: hitWorldPos ? hitWorldPos.z : v.z
      });
    }
  }

  if (prevHp > 0 && v.hp <= 0) {
    explodeVehicle(v, game);
  }
}

export function explodeVehicle(v, game) {
  if (v.exploded) return;
  v.exploded = true;
  v.hp = 0;
  v.vy += 6.5;
  v.angVel += (Math.random() - 0.5) * 3.5;
  v.hoodDetached = true;
  v.frontBumperDetached = true;
  v.rearBumperDetached = true;
  v.glassHealth = 0;
  v.lightsBroken = { fl: true, fr: true, rl: true, rr: true };

  if (game) {
    game.pushEvent({ type: "explosion", x: v.x, y: v.y + 0.9, z: v.z });
    for (let i = 0; i < 3; i++) {
      game.pushEvent({ type: "car_part", x: v.x, y: v.y + 1.1, z: v.z, color: v.color });
    }
    // Splash damage to nearby players
    for (const [, p] of game.players.entries()) {
      if (!p.alive) continue;
      const dx = p.x - v.x;
      const dz = p.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d < 8.5) {
        if (p.drivingVehicleId === v.id) {
          p.drivingVehicleId = null;
        }
        const falloff = 1 - d / 8.5;
        const dmg = Math.round(115 * falloff);
        const nx = dx / Math.max(0.1, d);
        const nz = dz / Math.max(0.1, d);
        game.applyDamage(p, dmg, { x: nx * 18 * falloff, y: 8 * falloff, z: nz * 18 * falloff }, null, true);
      }
    }
  }
}

export function damageVehicleFromHit(v, hitX, hitY, hitZ, damage, impulse, game) {
  const sinA = Math.sin(v.angle);
  const cosA = Math.cos(v.angle);
  const dx = hitX - v.x;
  const dz = hitZ - v.z;
  const lx = dx * cosA - dz * sinA;
  const lz = dx * sinA + dz * cosA;

  if (impulse) {
    const def = VEHICLE_TYPES[v.typeId];
    const invMass = 1500 / def.mass;
    v.vx += (impulse.x || 0) * 0.28 * invMass;
    v.vy += (impulse.y || 0) * 0.16 * invMass;
    v.vz += (impulse.z || 0) * 0.28 * invMass;
  }

  applyZoneDamage(v, lx, lz, damage, game, { x: hitX, y: hitY, z: hitZ });
}

export function updateVehicles(vehicles, players, game, dt) {
  const worldHalf = CONFIG.WORLD_SIZE / 2 - 2.6;

  for (const v of vehicles) {
    const def = VEHICLE_TYPES[v.typeId];
    if (v.exploded) {
      v.wreckTimer = (v.wreckTimer || 0) + dt;
      if (v.wreckTimer > 22) {
        const fresh = createVehicleState(v.id, v.typeId, v.spawnX, v.spawnZ, v.spawnAngle, 0);
        fresh.color = v.color;
        fresh.stripe = v.stripe;
        Object.assign(v, fresh);
        continue;
      }
    }
    const driver = v.driverId ? players.get(v.driverId) : null;
    if (v.driverId && (!driver || !driver.alive || driver.drivingVehicleId !== v.id)) {
      v.driverId = null;
    }

    const sinA = Math.sin(v.angle);
    const cosA = Math.cos(v.angle);
    // Forward unit vector in world: (+sinA, +cosA), Right unit vector: (+cosA, -sinA)
    const fwdX = sinA;
    const fwdZ = cosA;
    const rightX = cosA;
    const rightZ = -sinA;

    let fwdSpeed = v.vx * fwdX + v.vz * fwdZ;
    let latSpeed = v.vx * rightX + v.vz * rightZ;

    v.braking = false;
    v.reversing = false;
    v.handbrake = false;

    if (driver && !v.exploded && (driver.isBot || !game.wheelOpen)) {
      let throttle = 0;
      let steerIn = 0;
      if (driver.isBot && driver.driveInput) {
        throttle = driver.driveInput.throttle || 0;
        steerIn = driver.driveInput.steer || 0;
        v.handbrake = Boolean(driver.driveInput.handbrake);
      } else if (!driver.isBot) {
        if (game.keys.has("KeyW") || game.keys.has("ArrowUp")) throttle += 1;
        if (game.keys.has("KeyS") || game.keys.has("ArrowDown")) throttle -= 1;
        if (game.keys.has("KeyA") || game.keys.has("ArrowLeft")) steerIn += 1;
        if (game.keys.has("KeyD") || game.keys.has("ArrowRight")) steerIn -= 1;
        v.handbrake = game.keys.has("Space");
      }

      // Smooth steering angle (speed-sensitive)
      const speedFactor = clamp(1 - Math.abs(fwdSpeed) / (def.maxSpeed * 1.45), 0.36, 1.0);
      const targetSteer = steerIn * def.maxSteer * speedFactor;
      v.steerAngle += (targetSteer - v.steerAngle) * Math.min(1, dt * (steerIn !== 0 ? 8.5 : 11));

      // Engine health factor
      const hpRatio = v.hp / def.maxHp;
      const enginePower = hpRatio < 0.25 ? 0.58 : hpRatio < 0.55 ? 0.82 : 1.0;

      if (throttle > 0) {
        if (fwdSpeed < -1.0) {
          v.braking = true;
          fwdSpeed += def.brakeDecel * dt;
        } else {
          fwdSpeed = Math.min(def.maxSpeed * enginePower, fwdSpeed + def.accel * enginePower * dt);
        }
      } else if (throttle < 0) {
        if (fwdSpeed > 1.0) {
          v.braking = true;
          fwdSpeed -= def.brakeDecel * dt;
        } else {
          v.reversing = true;
          fwdSpeed = Math.max(-def.maxSpeed * 0.42, fwdSpeed - def.reverseAccel * dt);
        }
      } else {
        // Rolling drag
        fwdSpeed *= Math.exp(-1.35 * dt);
      }

      if (v.handbrake) {
        v.braking = true;
        fwdSpeed *= Math.exp(-3.4 * dt);
      }

      // Ackermann-like yaw rate + alignment pull from suspension damage
      if (Math.abs(fwdSpeed) > 0.25) {
        const turnDir = fwdSpeed >= 0 ? 1 : -1;
        const speedNorm = clamp(Math.abs(fwdSpeed) / 10, 0.2, 1.25);
        const effSteer = v.steerAngle + (v.steerBias || 0);
        const targetYawRate = effSteer * def.steerSpeed * speedNorm * turnDir * (v.handbrake ? 1.35 : 1.0);
        v.angVel += (targetYawRate - v.angVel) * Math.min(1, dt * 11);
      } else {
        v.angVel *= Math.exp(-8 * dt);
      }

      // Lateral tire grip (drifting when handbrake or high speed turn)
      const grip = v.handbrake ? def.driftGrip : def.normalGrip;
      latSpeed *= Math.exp(-grip * dt);

      // Drift smoke & screech
      if ((Math.abs(latSpeed) > 4.2 || (v.handbrake && Math.abs(fwdSpeed) > 7)) && v.y <= 0.05) {
        if (Math.random() < 0.65) {
          game.pushEvent({
            type: "tire_smoke",
            x: v.x - fwdX * (def.length * 0.34),
            y: 0.12,
            z: v.z - fwdZ * (def.length * 0.34)
          });
        }
      }

      // Body pitch & roll suspension feel
      const targetPitch = (throttle !== 0 && !v.braking ? -throttle * 0.032 : (v.braking ? 0.045 : 0));
      const targetRoll = clamp(v.angVel * fwdSpeed * 0.0022, -0.09, 0.09);
      v.pitch += (targetPitch - v.pitch) * Math.min(1, dt * 8);
      v.roll += (targetRoll - v.roll) * Math.min(1, dt * 9);
    } else {
      // Unoccupied / wrecked car coasts to stop
      v.steerAngle *= Math.exp(-5 * dt);
      fwdSpeed *= Math.exp((v.exploded ? -4.5 : -2.6) * dt);
      latSpeed *= Math.exp(-7.5 * dt);
      v.angVel *= Math.exp(-6 * dt);
      v.pitch *= Math.exp(-6 * dt);
      v.roll *= Math.exp(-6 * dt);
    }

    v.vx = fwdX * fwdSpeed + rightX * latSpeed;
    v.vz = fwdZ * fwdSpeed + rightZ * latSpeed;
    v.forwardSpeed = fwdSpeed;
    v.speed = Math.hypot(v.vx, v.vz);

    // Gravity / air bounce (or TCK abduction upward flight!)
    if (v.flyingUp) {
      v.vy = 13.5;
      v.y += v.vy * dt;
      v.angle += 1.6 * dt;
      v.roll = Math.sin(performance.now() * 0.008) * 0.14;
      v.pitch = -0.18;
    } else {
      v.vy -= CONFIG.GRAVITY * dt;
      v.y += v.vy * dt;
      if (v.y < 0) {
        if (v.vy < -4.5) {
          applyZoneDamage(v, 0, def.length * 0.3, Math.abs(v.vy) * 2.5, game);
        }
        v.y = 0;
        v.vy = 0;
      }
    }

    // Integrate position & heading
    v.x = clamp(v.x + v.vx * dt, -worldHalf, worldHalf);
    v.z = clamp(v.z + v.vz * dt, -worldHalf, worldHalf);
    v.angle += v.angVel * dt;
    v.wheelSpin += (fwdSpeed / def.wheelRadius) * dt;

    // Collisions vs City Buildings (corner points)
    const corners = getVehicleCorners(v);
    for (const box of CITY_LAYOUT.colliders) {
      let deepest = 0;
      let pushX = 0;
      let pushZ = 0;
      let hitCorner = null;

      for (const c of corners) {
        if (c.x > box.minX && c.x < box.maxX && c.z > box.minZ && c.z < box.maxZ) {
          const dL = c.x - box.minX;
          const dR = box.maxX - c.x;
          const dT = c.z - box.minZ;
          const dB = box.maxZ - c.z;
          const m = Math.min(dL, dR, dT, dB);
          if (m > deepest) {
            deepest = m;
            hitCorner = c;
            if (m === dL) { pushX = -m; pushZ = 0; }
            else if (m === dR) { pushX = m; pushZ = 0; }
            else if (m === dT) { pushX = 0; pushZ = -m; }
            else { pushX = 0; pushZ = m; }
          }
        }
      }

      if (deepest > 0 && hitCorner) {
        v.x += pushX;
        v.z += pushZ;
        const nLen = Math.hypot(pushX, pushZ) || 1;
        const nx = pushX / nLen;
        const nz = pushZ / nLen;
        const vn = v.vx * nx + v.vz * nz;
        if (vn < 0) {
          const impactSpeed = -vn;
          v.vx -= 1.32 * vn * nx;
          v.vz -= 1.32 * vn * nz;
          v.vx *= 0.86;
          v.vz *= 0.86;

          // Spin torque on corner hits
          const lever = hitCorner.lx * nz - hitCorner.lz * nx;
          v.angVel += clamp(lever * impactSpeed * 0.06, -3.5, 3.5);

          if (impactSpeed > 2.8) {
            const dmg = (impactSpeed - 2.4) * 5.2;
            applyZoneDamage(v, hitCorner.lx, hitCorner.lz, dmg, game, hitCorner);
            v.pitch += (hitCorner.lz > 0 ? 0.06 : -0.06) * clamp(impactSpeed / 18, 0.2, 1.2);
            game.pushEvent({
              type: "car_crash",
              x: hitCorner.x,
              y: 0.65,
              z: hitCorner.z,
              intensity: clamp(impactSpeed / 22, 0.2, 1.0)
            });
          }
        }
      }
    }

    // Engine smoke / fire particles for damaged vehicles
    if (!v.exploded && v.hp < v.maxHp * 0.55) {
      v.smokeTimer -= dt;
      if (v.smokeTimer <= 0) {
        const dark = v.hp < v.maxHp * 0.25;
        v.smokeTimer = dark ? 0.06 : 0.14;
        game.pushEvent({
          type: "car_smoke",
          x: v.x + fwdX * (def.length * 0.36),
          y: v.y + 0.95,
          z: v.z + fwdZ * (def.length * 0.36),
          dark
        });
      }
    }

    // Keep driver synced with Left-Hand Drive (LHD) driver seat position
    if (driver && driver.alive) {
      const seatLx = 0.40;
      const seatLz = 0.12;
      driver.x = v.x + seatLx * cosA + seatLz * sinA;
      driver.y = v.y + 0.02;
      driver.z = v.z - seatLx * sinA + seatLz * cosA;
      driver.angle = v.angle;
      driver.aimYaw = v.angle;
      driver.vx = v.vx;
      driver.vz = v.vz;
      driver.moveSpeed = 0;
    }

    // Car vs Pedestrians / Bots
    if (v.speed > 4.2) {
      for (const [, p] of players.entries()) {
        if (!p.alive || p.drivingVehicleId === v.id) continue;
        const dx = p.x - v.x;
        const dz = p.z - v.z;
        const lx = dx * cosA - dz * sinA;
        const lz = dx * sinA + dz * cosA;
        if (Math.abs(lx) < def.width * 0.55 + CONFIG.PLAYER_RADIUS && Math.abs(lz) < def.length * 0.52 + CONFIG.PLAYER_RADIUS) {
          const hitDmg = Math.round(clamp((v.speed - 3.5) * 4.8, 12, 110));
          const nx = dx / Math.max(0.1, Math.hypot(dx, dz));
          const nz = dz / Math.max(0.1, Math.hypot(dx, dz));
          const imp = {
            x: v.vx * 0.85 + nx * 5,
            y: 3.5 + clamp(v.speed * 0.22, 0, 5),
            z: v.vz * 0.85 + nz * 5
          };
          game.applyDamage(p, hitDmg, imp, v.driverId, v.speed > 12);
          applyZoneDamage(v, lx, lz, 4, game, { x: p.x, y: 0.8, z: p.z });
          if (v.driverId === game.localId && typeof game.maybeTriggerTckEvent === "function") {
            game.maybeTriggerTckEvent();
          }
        }
      }
    }
  }

  // Car vs Car collisions
  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      const a = vehicles[i];
      const b = vehicles[j];
      const da = VEHICLE_TYPES[a.typeId];
      const db = VEHICLE_TYPES[b.typeId];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const minDist = (da.width + db.width) * 0.42 + (da.length + db.length) * 0.16;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001 && dist < minDist) {
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDist - dist;
        const totalMass = da.mass + db.mass;
        a.x -= nx * overlap * (db.mass / totalMass);
        a.z -= nz * overlap * (db.mass / totalMass);
        b.x += nx * overlap * (da.mass / totalMass);
        b.z += nz * overlap * (da.mass / totalMass);

        const rvx = b.vx - a.vx;
        const rvz = b.vz - a.vz;
        const velAlongNormal = rvx * nx + rvz * nz;
        if (velAlongNormal < 0) {
          const restitution = 0.42;
          const impulseMag = -(1 + restitution) * velAlongNormal / (1 / da.mass + 1 / db.mass);
          a.vx -= (impulseMag / da.mass) * nx;
          a.vz -= (impulseMag / da.mass) * nz;
          b.vx += (impulseMag / db.mass) * nx;
          b.vz += (impulseMag / db.mass) * nz;

          const impactSpeed = -velAlongNormal;
          if (impactSpeed > 3.5) {
            const dmg = (impactSpeed - 2.5) * 3.2;
            const sinA = Math.sin(a.angle), cosA = Math.cos(a.angle);
            const alx = (dx * cosA - dz * sinA) * 0.5;
            const alz = (dx * sinA + dz * cosA) * 0.5;
            applyZoneDamage(a, alx, alz, dmg * (db.mass / totalMass) * 1.6, game);

            const sinB = Math.sin(b.angle), cosB = Math.cos(b.angle);
            const blx = (-dx * cosB + dz * sinB) * 0.5;
            const blz = (-dx * sinB - dz * cosB) * 0.5;
            applyZoneDamage(b, blx, blz, dmg * (da.mass / totalMass) * 1.6, game);

            game.pushEvent({
              type: "car_crash",
              x: (a.x + b.x) * 0.5,
              y: 0.7,
              z: (a.z + b.z) * 0.5,
              intensity: clamp(impactSpeed / 20, 0.25, 1.0)
            });
          }
        }
      }
    }
  }
}

// ==================== 3D DETAILED VEHICLE MESH & DEFORMATION ====================
let sharedCarMats = null;
function getSharedCarMats() {
  if (!sharedCarMats) {
    sharedCarMats = {
      carbon: new THREE.MeshStandardMaterial({ map: createCarbonFiberTexture(), roughness: 0.35, metalness: 0.35 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xdce2ea, roughness: 0.14, metalness: 0.94 }),
      darkTrim: new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.72, metalness: 0.18 }),
      interior: new THREE.MeshStandardMaterial({ color: 0x1e2026, roughness: 0.85, metalness: 0.05 }),
      tire: new THREE.MeshStandardMaterial({ map: createTireTreadTexture(), roughness: 0.86, metalness: 0.05 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xc8cfd8, roughness: 0.22, metalness: 0.88 }),
      caliper: new THREE.MeshStandardMaterial({ color: 0xc92228, roughness: 0.35, metalness: 0.55 }),
      glassIntact: new THREE.MeshStandardMaterial({
        color: 0x1a2c3d,
        roughness: 0.08,
        metalness: 0.85,
        transparent: true,
        opacity: 0.62
      }),
      glassCracked: new THREE.MeshStandardMaterial({
        map: createCrackedGlassTexture(),
        color: 0x9ec4db,
        roughness: 0.28,
        metalness: 0.45,
        transparent: true,
        opacity: 0.78
      }),
      charred: new THREE.MeshStandardMaterial({ color: 0x181716, roughness: 0.96, metalness: 0.05 })
    };
  }
  return sharedCarMats;
}

function makeDeformableBox(w, h, d, segW, segH, segD, mat, zoneName, deformables, parentOffset = null) {
  const geo = new THREE.BoxGeometry(w, h, d, Math.max(segW, 4), Math.max(segH, 3), Math.max(segD, 4));
  const posAttr = geo.attributes.position;
  const basePos = new Float32Array(posAttr.array.length);
  basePos.set(posAttr.array);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  deformables.push({ mesh, geo, basePos, zone: zoneName, parentOffset });
  return mesh;
}

function applySoftBodyImpact(vm, imp) {
  for (const entry of vm.deformables) {
    const pos = entry.geo.attributes.position;
    const ox = entry.mesh.position.x + (entry.parentOffset ? entry.parentOffset.x : 0);
    const oy = entry.mesh.position.y + (entry.parentOffset ? entry.parentOffset.y : 0);
    const oz = entry.mesh.position.z + (entry.parentOffset ? entry.parentOffset.z : 0);
    let dirty = false;

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const wx = vx + ox;
      const wy = vy + oy;
      const wz = vz + oz;

      const d = Math.hypot(wx - imp.lx, wy - imp.ly, wz - imp.lz);
      if (d < imp.radius) {
        const t = 1 - d / imp.radius;
        const falloff = Math.sqrt(t);
        // Sheet-metal crumple fold + rim bulge
        const crease = Math.sin(wx * 12.2 + wy * 16.7 + wz * 13.3) * 0.34;
        const push = imp.strength * falloff * (1 + crease);
        const nx = vx + imp.dx * push;
        const ny = vy + imp.dy * push + Math.abs(crease) * imp.strength * falloff * 0.52;
        const nz = vz + imp.dz * push;
        pos.setXYZ(i, nx, ny, nz);
        dirty = true;
      }
    }
    if (dirty) {
      pos.needsUpdate = true;
      entry.geo.computeVertexNormals();
    }
  }
}

function resetAllDeformables(vm) {
  for (const entry of vm.deformables) {
    const pos = entry.geo.attributes.position;
    pos.array.set(entry.basePos);
    pos.needsUpdate = true;
    entry.geo.computeVertexNormals();
  }
}

function buildWheelMesh(radius, width, sm) {
  const wheelPivot = new THREE.Group();
  const spinGroup = new THREE.Group();
  wheelPivot.add(spinGroup);

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 20), sm.tire);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  spinGroup.add(tire);

  const rimR = radius * 0.64;
  const rimBarrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, width + 0.01, 16), sm.darkTrim);
  rimBarrel.rotation.z = Math.PI / 2;
  spinGroup.add(rimBarrel);

  // 5-spoke alloy rim
  for (let s = 0; s < 5; s++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(width + 0.025, rimR * 1.85, 0.042), sm.rim);
    spoke.rotation.x = (s / 5) * Math.PI;
    spinGroup.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.28, rimR * 0.28, width + 0.035, 10), sm.chrome);
  hub.rotation.z = Math.PI / 2;
  spinGroup.add(hub);

  // Brake disc + caliper (non-spinning)
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.08, radius * 0.34, radius * 0.22), sm.caliper);
  caliper.position.set(0, radius * 0.22, -radius * 0.26);
  wheelPivot.add(caliper);

  return { wheelPivot, spinGroup };
}

export function createVehicleMesh(v) {
  const def = VEHICLE_TYPES[v.typeId];
  const sm = getSharedCarMats();
  const root = new THREE.Group();
  const bodyTilt = new THREE.Group();
  root.add(bodyTilt);

  const paintTex = createCarPaintTexture(v.color, v.stripe);
  const paintMat = new THREE.MeshStandardMaterial({
    map: paintTex,
    roughness: 0.24,
    metalness: 0.58
  });

  const headlightMatL = new THREE.MeshStandardMaterial({ color: 0xfff8e2, emissive: 0xfff2c6, emissiveIntensity: 0.85, roughness: 0.1 });
  const headlightMatR = headlightMatL.clone();
  const taillightMatL = new THREE.MeshStandardMaterial({ color: 0xb5181e, emissive: 0x80080c, emissiveIntensity: 0.65, roughness: 0.2 });
  const taillightMatR = taillightMatL.clone();

  const deformables = [];
  const W = def.width;
  const L = def.length;
  const isSuv = v.typeId === "suv" || v.typeId === "van";
  const isVan = v.typeId === "van";
  const isSport = v.typeId === "sport";
  const isMuscle = v.typeId === "muscle";

  const baseH = isSuv ? 0.50 : 0.36;
  const bodyH = isVan ? 0.82 : (isSuv ? 0.66 : 0.48);

  // Underbody chassis frame
  const underbody = new THREE.Mesh(new THREE.BoxGeometry(W * 0.88, 0.14, L * 0.90), sm.darkTrim);
  underbody.position.y = baseH - 0.06;
  bodyTilt.add(underbody);

  // Left (+X) & Right (-X) side body panels (deformable)
  const sideW = 0.24;
  const sideL = L * 0.58;
  const sideLMesh = makeDeformableBox(sideW, bodyH, sideL, 2, 3, 5, paintMat, "left", deformables);
  sideLMesh.position.set(W * 0.5 - sideW * 0.5, baseH + bodyH * 0.5, 0);
  bodyTilt.add(sideLMesh);

  const sideRMesh = makeDeformableBox(sideW, bodyH, sideL, 2, 3, 5, paintMat, "right", deformables);
  sideRMesh.position.set(-W * 0.5 + sideW * 0.5, baseH + bodyH * 0.5, 0);
  bodyTilt.add(sideRMesh);

  // Side skirts & mirrors
  for (const s of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, L * 0.56), isSport ? sm.carbon : sm.darkTrim);
    skirt.position.set(s * (W * 0.5 - 0.02), baseH + 0.04, 0);
    bodyTilt.add(skirt);

    const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.08), paintMat);
    mirrorArm.position.set(s * (W * 0.5 + 0.06), baseH + bodyH + 0.06, L * 0.16);
    bodyTilt.add(mirrorArm);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.15), sm.chrome);
    handle.position.set(s * (W * 0.5 + 0.01), baseH + bodyH * 0.72, -0.05);
    bodyTilt.add(handle);
  }

  // Center tub & interior cabin
  const cabinFloor = new THREE.Mesh(new THREE.BoxGeometry(W * 0.76, 0.12, L * 0.48), sm.interior);
  cabinFloor.position.set(0, baseH + 0.06, -0.05);
  bodyTilt.add(cabinFloor);

  // Seats + Dashboard + Steering Wheel
  for (const sx of [-0.40, 0.40]) {
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.48), sm.interior);
    seatBase.position.set(sx, baseH + 0.18, -0.05);
    bodyTilt.add(seatBase);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.54, 0.14), sm.interior);
    seatBack.position.set(sx, baseH + 0.44, -0.26);
    seatBack.rotation.x = -0.18;
    bodyTilt.add(seatBack);
  }
  const dash = new THREE.Mesh(new THREE.BoxGeometry(W * 0.74, 0.24, 0.34), sm.interior);
  dash.position.set(0, baseH + bodyH * 0.78, L * 0.19);
  bodyTilt.add(dash);

  const steerPivot = new THREE.Group();
  steerPivot.position.set(0.40, baseH + bodyH * 0.88, L * 0.08);
  steerPivot.rotation.x = -0.45;
  const steerRing = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.024, 8, 16), sm.darkTrim);
  steerPivot.add(steerRing);
  const steerSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.02), sm.chrome);
  steerPivot.add(steerSpoke);
  bodyTilt.add(steerPivot);

  // Front nose & deformable hood + front bumper
  const noseBlock = makeDeformableBox(W * 0.94, bodyH * 0.86, L * 0.26, 3, 2, 2, paintMat, "front", deformables);
  noseBlock.position.set(0, baseH + bodyH * 0.43, L * 0.35);
  bodyTilt.add(noseBlock);

  const hoodPivot = new THREE.Group();
  hoodPivot.position.set(0, baseH + bodyH * 0.88, L * 0.21);
  const hoodMesh = makeDeformableBox(W * 0.82, 0.07, L * 0.29, 5, 2, 5, paintMat, "front", deformables, hoodPivot.position);
  hoodMesh.position.set(0, 0, L * 0.145);
  hoodMesh.rotation.x = isSport ? 0.08 : 0.03;
  hoodPivot.add(hoodMesh);
  if (isMuscle) {
    const blower = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.48), sm.chrome);
    blower.position.set(0, 0.09, L * 0.13);
    hoodPivot.add(blower);
  } else if (isSport) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.26), sm.carbon);
    vent.position.set(0, 0.03, L * 0.15);
    hoodPivot.add(vent);
  }
  bodyTilt.add(hoodPivot);

  const frontBumper = makeDeformableBox(W * 0.98, 0.20, 0.18, 3, 1, 1, isMuscle ? sm.chrome : (isSport ? sm.carbon : sm.darkTrim), "front", deformables);
  frontBumper.position.set(0, baseH + 0.12, L * 0.49);
  bodyTilt.add(frontBumper);

  // Grille
  const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.52, 0.18, 0.05), isMuscle || !isSport ? sm.chrome : sm.darkTrim);
  grille.position.set(0, baseH + bodyH * 0.46, L * 0.485);
  bodyTilt.add(grille);

  if (isSuv) {
    const bullbar = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 12, Math.PI), sm.darkTrim);
    bullbar.position.set(0, baseH + 0.26, L * 0.52);
    bodyTilt.add(bullbar);
  }

  // Headlights
  const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.11, 0.06), headlightMatL);
  hlL.position.set(-W * 0.34, baseH + bodyH * 0.58, L * 0.475);
  bodyTilt.add(hlL);
  const hlR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.11, 0.06), headlightMatR);
  hlR.position.set(W * 0.34, baseH + bodyH * 0.58, L * 0.475);
  bodyTilt.add(hlR);

  // Rear deck & bumper
  const rearBlock = makeDeformableBox(W * 0.94, bodyH * 0.92, L * 0.24, 3, 2, 2, paintMat, "rear", deformables);
  rearBlock.position.set(0, baseH + bodyH * 0.46, -L * 0.36);
  bodyTilt.add(rearBlock);

  const rearBumper = makeDeformableBox(W * 0.98, 0.20, 0.18, 3, 1, 1, isMuscle ? sm.chrome : sm.darkTrim, "rear", deformables);
  rearBumper.position.set(0, baseH + 0.12, -L * 0.49);
  bodyTilt.add(rearBumper);

  // Taillights & Exhausts
  const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.06), taillightMatL);
  tlL.position.set(-W * 0.33, baseH + bodyH * 0.62, -L * 0.48);
  bodyTilt.add(tlL);
  const tlR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.06), taillightMatR);
  tlR.position.set(W * 0.33, baseH + bodyH * 0.62, -L * 0.48);
  bodyTilt.add(tlR);

  for (const ex of [-0.55, 0.55]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10), sm.chrome);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(ex, baseH + 0.04, -L * 0.50);
    bodyTilt.add(pipe);
  }

  // Sport Spoiler
  if (isSport) {
    for (const sx of [-0.58, 0.58]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.12), sm.carbon);
      strut.position.set(sx, baseH + bodyH + 0.06, -L * 0.42);
      bodyTilt.add(strut);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.04, 0.24), sm.carbon);
    wing.position.set(0, baseH + bodyH + 0.16, -L * 0.44);
    wing.rotation.x = 0.12;
    wing.castShadow = true;
    bodyTilt.add(wing);
  }

  // Roof & Pillars & Glass (generous headroom so driver's head stays inside cabin)
  const roofH = isSuv ? 0.66 : 0.56;
  const roofY = baseH + bodyH + roofH;
  const roof = makeDeformableBox(W * 0.78, 0.07, L * (isSuv ? 0.58 : 0.40), 4, 1, 4, paintMat, "roof", deformables);
  roof.position.set(0, roofY, isSuv ? -0.18 : -0.06);
  roof.castShadow = true;
  bodyTilt.add(roof);

  if (isSuv) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(W * 0.72, 0.06, L * 0.46), sm.darkTrim);
    rack.position.set(0, roofY + 0.06, -0.18);
    bodyTilt.add(rack);
  }

  // A/B/C Pillars
  for (const sx of [-W * 0.37, W * 0.37]) {
    const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, roofH + 0.08, 0.07), sm.darkTrim);
    aPillar.position.set(sx, baseH + bodyH + roofH * 0.46, L * 0.14);
    aPillar.rotation.x = -0.45;
    bodyTilt.add(aPillar);

    const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, roofH + 0.08, 0.10), paintMat);
    cPillar.position.set(sx, baseH + bodyH + roofH * 0.46, isSuv ? -L * 0.42 : -L * 0.25);
    cPillar.rotation.x = isSuv ? 0.12 : 0.45;
    bodyTilt.add(cPillar);
  }

  // Glass panels (windshield + rear + sides)
  const glassMeshes = [];
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.72, roofH * 1.15), sm.glassIntact);
  ws.position.set(0, baseH + bodyH + roofH * 0.48, L * 0.15);
  ws.rotation.x = -0.92;
  bodyTilt.add(ws);
  glassMeshes.push(ws);

  const rw = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.70, roofH * 1.1), sm.glassIntact);
  rw.position.set(0, baseH + bodyH + roofH * 0.48, isSuv ? -L * 0.44 : -L * 0.26);
  rw.rotation.y = Math.PI;
  rw.rotation.x = isSuv ? 0.18 : 0.92;
  bodyTilt.add(rw);
  glassMeshes.push(rw);

  for (const s of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.36, roofH * 0.82), sm.glassIntact);
    sw.position.set(s * W * 0.38, baseH + bodyH + roofH * 0.46, -0.04);
    sw.rotation.y = s * Math.PI * 0.5;
    bodyTilt.add(sw);
    glassMeshes.push(sw);
  }

  // 4 Wheels (FL, FR, RL, RR)
  const wheels = [];
  const halfTrack = def.trackWidth * 0.5;
  const halfWB = def.wheelBase * 0.5;
  const wheelCoords = [
    [-halfTrack, def.wheelRadius, halfWB],   // FL
    [halfTrack, def.wheelRadius, halfWB],    // FR
    [-halfTrack, def.wheelRadius, -halfWB],  // RL
    [halfTrack, def.wheelRadius, -halfWB]    // RR
  ];
  for (const [wx, wy, wz] of wheelCoords) {
    const wObj = buildWheelMesh(def.wheelRadius, def.wheelWidth, sm);
    wObj.wheelPivot.position.set(wx, wy, wz);
    root.add(wObj.wheelPivot);
    wheels.push(wObj);
  }

  return {
    root,
    bodyTilt,
    paintMat,
    hoodPivot,
    frontBumper,
    rearBumper,
    steerPivot,
    wheels,
    glassMeshes,
    deformables,
    headlightMatL,
    headlightMatR,
    taillightMatL,
    taillightMatR,
    wasExploded: false,
    lastGlassState: "intact"
  };
}

export function updateVehicleMesh(vm, v) {
  const sm = getSharedCarMats();
  vm.root.position.set(v.x, v.y, v.z);
  vm.root.rotation.y = v.angle;
  vm.bodyTilt.rotation.x = v.pitch;
  vm.bodyTilt.rotation.z = v.roll;

  // Steering wheel
  vm.steerPivot.rotation.z = -v.steerAngle * 2.4;

  // Wheels: spin, steer front, detachment, and damage camber/wobble
  for (let i = 0; i < 4; i++) {
    const w = vm.wheels[i];
    w.wheelPivot.visible = !(v.wheelsDetached && v.wheelsDetached[i]);
    const isFront = i < 2;
    w.wheelPivot.rotation.y = isFront ? v.steerAngle : 0;
    w.spinGroup.rotation.x = v.wheelSpin;
    const wd = v.wheelDamage[i] || 0;
    w.wheelPivot.rotation.z = wd * (i % 2 === 0 ? 0.28 : -0.28) + Math.sin(v.wheelSpin) * wd * 0.14;
  }

  // Hood pop & detached/bent parts
  vm.hoodPivot.visible = !v.hoodDetached;
  vm.hoodPivot.rotation.x = -v.hoodPop * 0.48 - (v.speed > 8 ? v.hoodPop * Math.sin(performance.now() * 0.025) * 0.10 : 0);
  vm.frontBumper.visible = !v.frontBumperDetached;
  vm.frontBumper.rotation.x = v.zones.front * 0.22;
  vm.frontBumper.rotation.z = v.zones.front * 0.12;
  vm.rearBumper.visible = !v.rearBumperDetached;
  vm.rearBumper.rotation.x = -v.zones.rear * 0.22;
  vm.rearBumper.rotation.z = -v.zones.rear * 0.12;

  // Headlights & Taillights
  vm.headlightMatL.emissiveIntensity = v.lightsBroken.fl || v.exploded ? 0 : (v.driverId ? 1.2 : 0.35);
  vm.headlightMatR.emissiveIntensity = v.lightsBroken.fr || v.exploded ? 0 : (v.driverId ? 1.2 : 0.35);
  const brakeBoost = v.braking ? 2.2 : (v.driverId ? 0.7 : 0.15);
  vm.taillightMatL.emissiveIntensity = v.lightsBroken.rl || v.exploded ? 0 : brakeBoost;
  vm.taillightMatR.emissiveIntensity = v.lightsBroken.rr || v.exploded ? 0 : brakeBoost;

  // Glass state
  const gState = v.glassHealth <= 0 ? "shattered" : v.glassHealth < 0.75 ? "cracked" : "intact";
  if (gState !== vm.lastGlassState) {
    vm.lastGlassState = gState;
    for (const gm of vm.glassMeshes) {
      gm.visible = gState !== "shattered";
      if (gState === "cracked") gm.material = sm.glassCracked;
    }
  }

  // Exploded charred look & respawn restore
  if (v.exploded && !vm.wasExploded) {
    vm.wasExploded = true;
    vm.paintMat.map = null;
    vm.paintMat.color.setHex(0x1b1a18);
    vm.paintMat.roughness = 0.95;
    vm.paintMat.metalness = 0.08;
    vm.paintMat.needsUpdate = true;
  } else if (!v.exploded && vm.wasExploded) {
    vm.wasExploded = false;
    vm.paintMat.map = createCarPaintTexture(v.color, v.stripe);
    vm.paintMat.color.setHex(0xffffff);
    vm.paintMat.roughness = 0.24;
    vm.paintMat.metalness = 0.58;
    vm.paintMat.needsUpdate = true;
    for (const gm of vm.glassMeshes) {
      gm.visible = true;
      gm.material = sm.glassIntact;
    }
    resetAllDeformables(vm);
  }

  // BeamNG-style localized soft-body impact deformation
  if (v.impacts && v.impacts.length > 0) {
    while (v.impacts.length > 0) {
      const imp = v.impacts.shift();
      applySoftBodyImpact(vm, imp);
    }
  }
}
