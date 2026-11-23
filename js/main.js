import { CONFIG } from "./config.js";
import { initDiscord } from "./discord.js";
import { PartyNetwork } from "./network.js";
import { SoundFX } from "./audio.js";
import { PlaneGame } from "./game.js";
import { PlaneRenderer3D } from "./renderer.js";
import { WEAPONS } from "./weapons.js";

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

// Crisp SVG weapon icons for the GTA 5 radial wheel
const WEAPON_ICONS = {
  fists: `<svg viewBox="0 0 64 64" width="44" height="44" fill="currentColor"><path d="M18 26c-3 0-5 2-5 5v12c0 7 6 13 14 13h11c8 0 14-6 14-14V25c0-3-2-5-5-5s-5 2-5 5v-4c0-3-2-5-5-5s-5 2-5 5v-2c0-3-2-5-5-5s-5 2-5 5v2c0-3-2-5-5-5s-4 2-4 5z"/></svg>`,
  ak74: `<svg viewBox="0 0 120 44" width="76" height="30" fill="currentColor"><path d="M4 22l16-4h8v-3h26v-3h8v3h30v2h18v-3h4v7h-4v-1H92v3H76v-2H68l4 15-8 2-5-14H46l-4 11-7-1 3-10H24l-14 6-6-2z"/></svg>`
};

async function bootstrap() {
  const canvas = document.getElementById("game-canvas");
  const wheelEl = document.getElementById("weapon-wheel");
  const wheelRing = document.getElementById("wheel-ring");
  const wheelName = document.getElementById("wheel-weapon-name");
  const wheelAmmo = document.getElementById("wheel-weapon-ammo");
  const statDmg = document.getElementById("stat-damage");
  const statRate = document.getElementById("stat-rate");
  const statRange = document.getElementById("stat-range");
  const crosshair = document.getElementById("crosshair");

  const localId = randomId();
  const color = CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)];

  const game = new PlaneGame(localId, `Игрок-${Math.floor(100 + Math.random() * 900)}`, color);
  const renderer = new PlaneRenderer3D(canvas);
  const sound = new SoundFX();

  const discord = await initDiscord();
  let network = null;

  if (discord.isDiscord) {
    // Discord Activity -> Automatic Solo Mode
    game.soloMode = true;
    game.setBotsEnabled(true);
  } else {
    if (!window.location.hash) {
      window.history.replaceState(null, "", `#${discord.roomId}`);
    }
    game.setBotsEnabled(true);
    network = new PartyNetwork({
      localId,
      roomId: discord.roomId,
      serverUrl: "",
      getLocalPlayer: () => game.localPlayer,
      onState: (player) => game.upsertRemotePlayer(player),
      onHit: (hitData) => game.receiveNetworkHit(hitData),
      onPeerJoin: () => {},
      onPeerLeave: (id) => game.removePlayer(id),
      onStatus: () => {
        if (network) game.setHostFlag(network.isHost);
      }
    });
    game.onNetworkHit = (hitData) => {
      if (network) network.sendHit(hitData);
    };
    network.start();
  }

  // ==================== GTA 5 Radial Weapon Wheel (Key B) ====================
  const NUM_SLOTS = 8;
  const slotEls = [];
  let hoveredSlot = 0;

  function buildWeaponWheel() {
    wheelRing.innerHTML = "";
    const cx = 190;
    const cy = 190;
    const rOuter = 175;
    const rInner = 78;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 380 380");
    svg.setAttribute("class", "wheel-svg");

    for (let i = 0; i < NUM_SLOTS; i++) {
      const startDeg = i * (360 / NUM_SLOTS) - 90 - 22.5;
      const endDeg = startDeg + 45;
      const gap = 1.6;
      const a1 = ((startDeg + gap) * Math.PI) / 180;
      const a2 = ((endDeg - gap) * Math.PI) / 180;

      const x1o = cx + Math.cos(a1) * rOuter;
      const y1o = cy + Math.sin(a1) * rOuter;
      const x2o = cx + Math.cos(a2) * rOuter;
      const y2o = cy + Math.sin(a2) * rOuter;
      const x2i = cx + Math.cos(a2) * rInner;
      const y2i = cy + Math.sin(a2) * rInner;
      const x1i = cx + Math.cos(a1) * rInner;
      const y1i = cy + Math.sin(a1) * rInner;

      const d = [
        `M ${x1o} ${y1o}`,
        `A ${rOuter} ${rOuter} 0 0 1 ${x2o} ${y2o}`,
        `L ${x2i} ${y2i}`,
        `A ${rInner} ${rInner} 0 0 0 ${x1i} ${y1i}`,
        "Z"
      ].join(" ");

      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "wheel-wedge");
      path.dataset.slot = String(i);
      svg.appendChild(path);

      // Icon container positioned at wedge midpoint
      const midA = ((startDeg + endDeg) / 2) * (Math.PI / 180);
      const rMid = (rOuter + rInner) / 2;
      const weapon = WEAPONS.find((w) => w.slot === i) || null;

      const labelDiv = document.createElement("div");
      labelDiv.className = "wheel-slot-icon" + (weapon ? "" : " empty");
      labelDiv.style.left = `${cx + Math.cos(midA) * rMid}px`;
      labelDiv.style.top = `${cy + Math.sin(midA) * rMid}px`;
      if (weapon) {
        labelDiv.innerHTML = WEAPON_ICONS[weapon.id] || "";
      }

      path.addEventListener("mouseenter", () => selectWheelSlot(i));
      path.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        selectWheelSlot(i);
        closeWeaponWheel(true);
      });

      slotEls.push({ path, labelDiv, weapon });
      wheelRing.appendChild(labelDiv);
    }

    wheelRing.prepend(svg);
  }

  function selectWheelSlot(slotIdx) {
    hoveredSlot = slotIdx;
    for (let i = 0; i < slotEls.length; i++) {
      const active = i === slotIdx;
      slotEls[i].path.classList.toggle("active", active);
      slotEls[i].labelDiv.classList.toggle("active", active);
    }
    const w = slotEls[slotIdx]?.weapon || null;
    if (w) {
      wheelName.textContent = w.name;
      if (w.id === "ak74") {
        wheelAmmo.textContent = game.localPlayer.reloadingTimer > 0
          ? "Перезарядка..."
          : `${game.localPlayer.ammo} / ∞`;
      } else {
        wheelAmmo.textContent = "Ближний бой";
      }
      statDmg.style.width = `${w.damage}%`;
      statRate.style.width = `${w.fireRate}%`;
      statRange.style.width = `${w.range}%`;
    } else {
      wheelName.textContent = "Пусто";
      wheelAmmo.textContent = "—";
      statDmg.style.width = "0%";
      statRate.style.width = "0%";
      statRange.style.width = "0%";
    }
  }

  function openWeaponWheel() {
    if (game.wheelOpen) return;
    game.wheelOpen = true;
    game.mouseDown = false;
    wheelEl.classList.remove("hidden");
    crosshair.classList.add("hidden");
    const curWeapon = WEAPONS.find((w) => w.id === game.localPlayer.weapon);
    selectWheelSlot(curWeapon ? curWeapon.slot : 0);
    if (document.pointerLockElement && document.exitPointerLock) {
      try { document.exitPointerLock(); } catch {}
    }
  }

  function closeWeaponWheel(applySelection = true) {
    if (!game.wheelOpen) return;
    game.wheelOpen = false;
    wheelEl.classList.add("hidden");
    crosshair.classList.remove("hidden");
    if (applySelection) {
      const w = slotEls[hoveredSlot]?.weapon;
      if (w) {
        game.equipWeapon(w.id);
      }
    }
    if (canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch {}
    }
  }

  buildWeaponWheel();

  // Select wedge by mouse angle relative to screen center while wheel is open
  wheelEl.addEventListener("mousemove", (e) => {
    if (!game.wheelOpen) return;
    const rect = wheelRing.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < 42) return;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90 + 22.5;
    deg = ((deg % 360) + 360) % 360;
    const idx = Math.floor(deg / 45) % NUM_SLOTS;
    if (idx !== hoveredSlot) {
      selectWheelSlot(idx);
    }
  });

  // ==================== Controls ====================
  window.addEventListener("resize", () => renderer.resize());
  window.addEventListener("beforeunload", () => {
    if (network) network.sendLeave();
  });

  window.addEventListener("keydown", (e) => {
    sound.unlock();
    if (e.code === "KeyB" && !e.repeat) {
      if (game.wheelOpen) {
        closeWeaponWheel(true);
      } else {
        openWeaponWheel();
      }
      return;
    }
    if (e.code === "Escape" && game.wheelOpen) {
      closeWeaponWheel(false);
      return;
    }
    game.keys.add(e.code);
    if (e.code === "Space" && !game.wheelOpen) {
      e.preventDefault();
      game.triggerJump();
    }
    if (e.code === "KeyR" && !game.wheelOpen) {
      game.startReload();
    }
  });

  window.addEventListener("keyup", (e) => {
    game.keys.delete(e.code);
  });

  let rmbDragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("mousedown", (e) => {
    if (game.wheelOpen) return;
    sound.unlock();
    if (e.button === 0) {
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch {}
      }
      game.mouseDown = true;
      game.triggerPrimaryAction();
    } else if (e.button === 2) {
      rmbDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) game.mouseDown = false;
    if (e.button === 2) rmbDragging = false;
  });

  window.addEventListener("mousemove", (e) => {
    if (game.wheelOpen) return;
    const sens = 0.0022;
    if (document.pointerLockElement === canvas) {
      game.camYaw -= e.movementX * sens;
      game.camPitch = Math.max(-0.25, Math.min(0.95, game.camPitch + e.movementY * sens));
    } else if (rmbDragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      game.camYaw -= dx * sens * 1.4;
      game.camPitch = Math.max(-0.25, Math.min(0.95, game.camPitch + dy * sens * 1.4));
    }
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    renderer.adjustZoom(e.deltaY > 0 ? 0.1 : -0.1);
  }, { passive: false });

  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    game.update(dt);
    renderer.render(game, dt, sound);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

if (document.readyState === "complete") {
  bootstrap();
} else {
  window.addEventListener("load", bootstrap);
}
