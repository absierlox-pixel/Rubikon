import { CONFIG, WEAPON_DEFS, WEAPON_LIST } from "./config.js";
import { initDiscord } from "./discord.js";
import { PartyNetwork } from "./network.js";
import { SoundFX } from "./audio.js";
import { PlaneGame } from "./game.js";
import { PlaneRenderer3D } from "./renderer.js";

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

// Crisp SVG weapon silhouettes for the GTA 5 radial wheel
const WEAPON_ICONS = {
  fists: `<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor"><path d="M18 26c-3 0-5 2-5 5v12c0 7 6 13 14 13h11c8 0 14-6 14-14V25c0-3-2-5-5-5s-5 2-5 5v-4c0-3-2-5-5-5s-5 2-5 5v-2c0-3-2-5-5-5s-5 2-5 5v2c0-3-2-5-5-5s-4 2-4 5z"/></svg>`,
  knuckles: `<svg viewBox="0 0 76 44" width="48" height="28" fill="none" stroke="currentColor" stroke-width="4.5"><circle cx="15" cy="18" r="7"/><circle cx="30" cy="15" r="7"/><circle cx="46" cy="15" r="7"/><circle cx="61" cy="18" r="7"/><path d="M10 26c8 10 48 10 56 0" stroke-linecap="round"/></svg>`,
  glock: `<svg viewBox="0 0 84 52" width="52" height="32" fill="currentColor"><path d="M12 12h58v12H44l-2 6h-8l-6 16H14l7-20h-9V12z"/></svg>`,
  ak74: `<svg viewBox="0 0 120 44" width="70" height="28" fill="currentColor"><path d="M4 22l16-4h8v-3h26v-3h8v3h30v2h18v-3h4v7h-4v-1H92v3H76v-2H68l4 15-8 2-5-14H46l-4 11-7-1 3-10H24l-14 6-6-2z"/></svg>`,
  awp: `<svg viewBox="0 0 130 40" width="76" height="26" fill="currentColor"><path d="M4 20l22-3h18v-6h26v6h56v4H72v4H62l-2 9h-8l1-9H38l-6 9H18l2-8H4v-6z"/></svg>`,
  minigun: `<svg viewBox="0 0 120 48" width="72" height="30" fill="currentColor"><path d="M10 18h14v-6h18v4h14v-6h18v6h38v4H74v2h38v4H74v2h38v4H74v4H54v-4H36v8H20v-8H10V18z"/></svg>`,
  rpg: `<svg viewBox="0 0 126 38" width="74" height="24" fill="currentColor"><path d="M4 13l12 3h64v-3h10l12-4 20 8-20 8-12-4H80v-3H64l-4 12h-8l3-12H44l-3 10h-7l2-10H16l-12 3V13z"/></svg>`
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
  const scopeOverlay = document.getElementById("scope-overlay");
  const ammoHud = document.getElementById("ammo-hud");
  const carPrompt = document.getElementById("car-prompt");
  const speedHud = document.getElementById("speed-hud");
  const speedVal = document.getElementById("speed-val");
  const carHpFill = document.getElementById("car-hp-fill");
  const hpText = document.getElementById("hp-text");
  const hpFill = document.getElementById("hp-fill");
  const copyLogsBtn = document.getElementById("copy-logs-btn");
  const lobbyModal = document.getElementById("lobby-modal");
  const lobbyCloseBtn = document.getElementById("lobby-close-btn");
  const lobbyStatusEl = document.getElementById("lobby-status");
  const lobbyRoomInput = document.getElementById("lobby-room-input");
  const lobbyWsInput = document.getElementById("lobby-ws-input");
  const lobbyConnectBtn = document.getElementById("lobby-connect-btn");
  const lobbyCopyLinkBtn = document.getElementById("lobby-copy-link-btn");
  const lobbyBotsBtn = document.getElementById("lobby-bots-btn");
  const lobbyPlayersList = document.getElementById("lobby-players-list");

  const localId = randomId();
  const color = CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)];

  const game = new PlaneGame(localId, `Игрок-${Math.floor(100 + Math.random() * 900)}`, color);
  const renderer = new PlaneRenderer3D(canvas);
  const sound = new SoundFX();

  const discord = await initDiscord();
  let network = null;

  if (discord.isDiscord) {
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
      getVehicles: () => game.getCompactVehicles(),
      onVehicles: (list, fromGuest) => game.syncRemoteVehicles(list, fromGuest),
      onState: (player) => game.upsertRemotePlayer(player),
      onHit: (hitData) => game.receiveNetworkHit(hitData),
      onPeerJoin: () => {},
      onPeerLeave: (id) => game.removePlayer(id),
      onStatus: (state, text) => {
        if (network) game.setHostFlag(network.isHost);
        if (lobbyStatusEl) {
          lobbyStatusEl.textContent = `Статус: ${text || state}`;
        }
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
    const cx = 195;
    const cy = 195;
    const rOuter = 182;
    const rInner = 82;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 390 390");
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

      const midA = ((startDeg + endDeg) / 2) * (Math.PI / 180);
      const rMid = (rOuter + rInner) / 2;
      const weapon = WEAPON_LIST.find((w) => w.slot === i) || null;

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
      const st = game.getAmmoState(w.id);
      wheelAmmo.textContent = st ? `${st.mag} / ${st.reserve}` : "Ближний бой";
      statDmg.style.width = `${w.statDmg}%`;
      statRate.style.width = `${w.statRate}%`;
      statRange.style.width = `${w.statRange}%`;
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
    game.scoped = false;
    wheelEl.classList.remove("hidden");
    crosshair.classList.add("hidden");
    const curWeapon = WEAPON_DEFS[game.localPlayer.weapon];
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
      if (w) game.equipWeapon(w.id);
    }
    if (canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch {}
    }
  }

  buildWeaponWheel();

  wheelEl.addEventListener("mousemove", (e) => {
    if (!game.wheelOpen) return;
    const rect = wheelRing.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < 42) return;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90 + 22.5;
    deg = ((deg % 360) + 360) % 360;
    const idx = Math.floor(deg / 45) % NUM_SLOTS;
    if (idx !== hoveredSlot) selectWheelSlot(idx);
  });

  // ==================== F3 Lobby & Copy Logs ====================
  let lobbyOpen = false;

  function renderLobbyPlayers() {
    if (!lobbyPlayersList) return;
    lobbyPlayersList.innerHTML = "";
    for (const [id, p] of game.players.entries()) {
      const li = document.createElement("li");
      const tag = id === game.localId ? "Вы" : (p.isBot ? "NPC" : (p.isHost ? "Хост" : "Игрок"));
      li.innerHTML = `<span>${p.name || id}</span><span>${tag} · ${Math.max(0, Math.round(p.hp))} HP</span>`;
      lobbyPlayersList.appendChild(li);
    }
  }

  function setLobbyOpen(open) {
    lobbyOpen = open;
    lobbyModal.classList.toggle("hidden", !open);
    if (open) {
      game.keys.clear();
      game.mouseDown = false;
      game.scoped = false;
      lobbyRoomInput.value = network ? network.roomId : discord.roomId;
      lobbyWsInput.value = network ? network.serverUrl : "";
      lobbyBotsBtn.textContent = `Боты: ${game.botsEnabled ? "ВКЛ" : "ВЫКЛ"}`;
      if (network && lobbyStatusEl) {
        lobbyStatusEl.textContent = `Статус: ${network.lastStatusText} (${network.mode.toUpperCase()})`;
      }
      renderLobbyPlayers();
      if (document.pointerLockElement && document.exitPointerLock) {
        try { document.exitPointerLock(); } catch {}
      }
    } else if (!game.wheelOpen && canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch {}
    }
  }

  lobbyCloseBtn.addEventListener("click", () => setLobbyOpen(false));
  lobbyConnectBtn.addEventListener("click", () => {
    const newRoom = lobbyRoomInput.value.trim() || "rubikon-party";
    const newWs = lobbyWsInput.value.trim();
    if (network) {
      network.setRoom(newRoom, newWs);
      window.history.replaceState(null, "", `#${network.roomId}`);
    }
  });
  lobbyCopyLinkBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      lobbyCopyLinkBtn.textContent = "Ссылка скопирована!";
      setTimeout(() => { lobbyCopyLinkBtn.textContent = "Копировать ссылку"; }, 1400);
    } catch {}
  });
  lobbyBotsBtn.addEventListener("click", () => {
    game.setBotsEnabled(!game.botsEnabled);
    lobbyBotsBtn.textContent = `Боты: ${game.botsEnabled ? "ВКЛ" : "ВЫКЛ"}`;
    renderLobbyPlayers();
  });

  copyLogsBtn.addEventListener("click", async () => {
    const text = network
      ? network.getLogsText()
      : `Mode: ${game.soloMode ? "Discord/Solo" : "Local"} | Players: ${game.players.size}`;
    try {
      await navigator.clipboard.writeText(text);
      copyLogsBtn.textContent = "Скопировано!";
      setTimeout(() => { copyLogsBtn.textContent = "Логи"; }, 1400);
    } catch {
      copyLogsBtn.textContent = "Ошибка";
      setTimeout(() => { copyLogsBtn.textContent = "Логи"; }, 1400);
    }
  });

  // ==================== Controls ====================
  window.addEventListener("resize", () => renderer.resize());
  window.addEventListener("beforeunload", () => {
    if (network) network.sendLeave();
  });

  window.addEventListener("keydown", (e) => {
    sound.unlock();
    if (e.code === "F3") {
      e.preventDefault();
      if (game.wheelOpen) closeWeaponWheel(false);
      setLobbyOpen(!lobbyOpen);
      return;
    }
    if (lobbyOpen) {
      if (e.code === "Escape") setLobbyOpen(false);
      return;
    }
    if (e.code === "KeyB" && !e.repeat) {
      if (game.wheelOpen) closeWeaponWheel(true);
      else openWeaponWheel();
      return;
    }
    if (e.code === "KeyV" && !e.repeat && !game.wheelOpen) {
      game.toggleViewMode();
      return;
    }
    if (e.code === "KeyF" && !e.repeat && !game.wheelOpen) {
      game.toggleEnterExitVehicle();
      return;
    }
    if (e.code === "KeyH" && !e.repeat && !game.wheelOpen && game.localPlayer.drivingVehicleId) {
      game.pushEvent({ type: "car_horn" });
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
      const def = WEAPON_DEFS[game.localPlayer.weapon];
      if (def && def.canScope && game.localPlayer.reloadingTimer <= 0) {
        game.scoped = !game.scoped;
      } else {
        rmbDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) game.mouseDown = false;
    if (e.button === 2) rmbDragging = false;
  });

  window.addEventListener("mousemove", (e) => {
    if (game.wheelOpen) return;
    const sens = game.scoped ? 0.0007 : 0.0022;
    if (document.pointerLockElement === canvas) {
      game.camYaw -= e.movementX * sens;
      game.camPitch = Math.max(-1.15, Math.min(1.15, game.camPitch + e.movementY * sens));
    } else if (rmbDragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      game.camYaw -= dx * sens * 1.4;
      game.camPitch = Math.max(-1.15, Math.min(1.15, game.camPitch + dy * sens * 1.4));
    }
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    renderer.adjustZoom(e.deltaY > 0 ? 0.1 : -0.1);
  }, { passive: false });

  function updateAmmoHud() {
    const lp = game.localPlayer;
    const hpVal = Math.max(0, Math.round(lp.hp || 0));
    const hpPct = Math.max(0, Math.min(100, (hpVal / (lp.maxHp || 100)) * 100));
    if (hpText) hpText.textContent = String(hpVal);
    if (hpFill) hpFill.style.width = `${hpPct}%`;

    if (lobbyOpen) renderLobbyPlayers();

    const drivingCar = lp.drivingVehicleId
      ? game.vehicles.find((v) => v.id === lp.drivingVehicleId)
      : null;

    if (drivingCar) {
      ammoHud.classList.add("hidden");
      carPrompt.classList.add("hidden");
      speedHud.classList.remove("hidden");
      const kmh = Math.round((drivingCar.speed || 0) * 3.6);
      speedVal.innerHTML = `${kmh} <span class="speed-unit">КМ/Ч</span>`;
      const pct = Math.max(0, Math.min(100, (drivingCar.hp / drivingCar.maxHp) * 100));
      carHpFill.style.width = `${pct}%`;
    } else {
      speedHud.classList.add("hidden");
      const near = game.getNearestEnterableVehicle();
      if (near) {
        carPrompt.textContent = `[F] Сесть в ${near.name}`;
        carPrompt.classList.remove("hidden");
      } else {
        carPrompt.classList.add("hidden");
      }

      const st = game.getAmmoState(lp.weapon);
      if (!st) {
        ammoHud.classList.add("hidden");
      } else {
        ammoHud.classList.remove("hidden");
        ammoHud.textContent = lp.reloadingTimer > 0
          ? `.../${st.reserve}`
          : `${st.mag}/${st.reserve}`;
      }
    }

    if (game.scoped) {
      scopeOverlay.classList.remove("hidden");
      crosshair.classList.add("hidden");
    } else {
      scopeOverlay.classList.add("hidden");
      if (!game.wheelOpen) crosshair.classList.remove("hidden");
    }
  }

  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    game.update(dt);
    renderer.render(game, dt, sound);
    updateAmmoHud();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

if (document.readyState === "complete") {
  bootstrap();
} else {
  window.addEventListener("load", bootstrap);
}
