import { CONFIG } from "./config.js";
import { initDiscord } from "./discord.js";
import { PartyNetwork } from "./network.js";
import { SoundFX } from "./audio.js";
import { PlaneGame } from "./game.js";
import { PlaneRenderer3D } from "./renderer.js";

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function getQueryWsUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("ws") || "";
  } catch {
    return "";
  }
}

function loadSavedProfile() {
  const queryWs = getQueryWsUrl();
  try {
    const raw = localStorage.getItem("dpp_profile");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (queryWs) {
        parsed.serverUrl = queryWs;
      } else if (
        window.location.host.includes("github.io") &&
        typeof parsed.serverUrl === "string" &&
        parsed.serverUrl.startsWith("ws://localhost")
      ) {
        parsed.serverUrl = "";
      }
      return parsed;
    }
  } catch {}
  return {
    name: `Игрок-${Math.floor(100 + Math.random() * 900)}`,
    color: CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)],
    serverUrl: queryWs || CONFIG.DEFAULT_WS_URL
  };
}

function saveProfile(name, color, serverUrl) {
  try {
    localStorage.setItem("dpp_profile", JSON.stringify({ name, color, serverUrl }));
  } catch {}
}

async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function buildRoomInviteUrl(roomId) {
  if (window.location.protocol === "file:") {
    return `${CONFIG.SITE_URL}#${roomId}`;
  }
  return `${window.location.origin}${window.location.pathname}#${roomId}`;
}

async function bootstrap() {
  const canvas = document.getElementById("game-canvas");
  const overlayCanvas = document.getElementById("overlay-canvas");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const roleBadge = document.getElementById("role-badge");
  const roomLabel = document.getElementById("room-label");
  const partyList = document.getElementById("party-list");
  const partyCount = document.getElementById("party-count");
  const btnCopyLink = document.getElementById("btn-copy-link");
  const btnRoom = document.getElementById("btn-room");
  const btnBots = document.getElementById("btn-bots");
  const btnSound = document.getElementById("btn-sound");
  const soundIcon = document.getElementById("sound-icon");
  const roomModal = document.getElementById("room-modal");
  const inputName = document.getElementById("input-name");
  const inputServer = document.getElementById("input-server");
  const inputRoom = document.getElementById("input-room");
  const colorPicker = document.getElementById("color-picker");
  const btnCopyRoom = document.getElementById("btn-copy-room");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const btnApplyRoom = document.getElementById("btn-apply-room");
  const toastEl = document.getElementById("toast");
  const joystickZone = document.getElementById("joystick-zone");
  const joystickKnob = document.getElementById("joystick-knob");
  const hpFill = document.getElementById("hp-fill");
  const hpText = document.getElementById("hp-text");
  const killsText = document.getElementById("kills-text");
  const deathOverlay = document.getElementById("death-overlay");
  const respawnTimerEl = document.getElementById("respawn-timer");

  const localId = randomId();
  const profile = loadSavedProfile();
  let selectedColor = profile.color;

  const game = new PlaneGame(localId, profile.name, profile.color);
  const renderer = new PlaneRenderer3D(canvas, overlayCanvas);
  const sound = new SoundFX();

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toastEl.classList.add("hidden"), 2200);
  }

  function renderPartyList() {
    partyCount.textContent = String(game.players.size);
    partyList.innerHTML = "";
    for (const p of game.players.values()) {
      const li = document.createElement("li");
      li.className = "party-item" + (p.alive === false ? " dead" : "");

      const swatch = document.createElement("span");
      swatch.className = "party-swatch";
      swatch.style.background = p.color;

      const nameSpan = document.createElement("span");
      nameSpan.className = "party-name";
      nameSpan.textContent = p.name;

      const tag = document.createElement("span");
      tag.className = "party-tag";
      if (p.alive === false) {
        tag.textContent = "💀";
      } else if (p.id === localId) {
        tag.textContent = game.soloMode ? "вы" : (p.isHost ? "вы · хост" : "вы");
      } else if (p.isBot) {
        tag.textContent = "бот";
      } else if (p.isHost) {
        tag.textContent = "хост";
      }

      li.append(swatch, nameSpan, tag);
      partyList.appendChild(li);
    }
  }

  function renderColorPicker() {
    colorPicker.innerHTML = "";
    for (const c of CONFIG.COLORS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "color-option" + (c === selectedColor ? " selected" : "");
      btn.style.background = c;
      btn.addEventListener("click", () => {
        selectedColor = c;
        renderColorPicker();
      });
      colorPicker.appendChild(btn);
    }
  }

  const discord = await initDiscord();
  let network = null;

  if (discord.isDiscord) {
    // Discord Activity -> Automatic Solo Mode with AI opponents (zero server needed)
    game.soloMode = true;
    statusDot.className = "status-dot online";
    statusText.textContent = "Одиночка (Discord)";
    roleBadge.textContent = "SOLO";
    roomLabel.textContent = "Одиночка";
    if (btnCopyLink) btnCopyLink.style.display = "none";

    game.setBotsEnabled(true);
    btnBots.classList.add("active");
  } else {
    if (!window.location.hash) {
      window.history.replaceState(null, "", `#${discord.roomId}`);
    }
    roomLabel.textContent = `Комната: ${discord.roomId.slice(0, 10)}`;

    network = new PartyNetwork({
      localId,
      roomId: discord.roomId,
      serverUrl: profile.serverUrl || CONFIG.DEFAULT_WS_URL,
      getLocalPlayer: () => game.localPlayer,
      onState: (player) => {
        game.upsertRemotePlayer(player);
      },
      onHit: (hitData) => {
        game.receiveNetworkHit(hitData);
      },
      onPeerJoin: () => {
        sound.playJoin();
        renderPartyList();
      },
      onPeerLeave: (id) => {
        game.removePlayer(id);
        renderPartyList();
      },
      onStatus: (state, label) => {
        statusDot.className = "status-dot" + (state === "online" ? " online" : state === "error" ? " error" : "");
        statusText.textContent = label;
        game.setHostFlag(network.isHost);
        roleBadge.textContent = network.isHost ? "HOST" : network.mode === "p2p" ? "P2P" : "WS";
        renderPartyList();
      }
    });

    game.onNetworkHit = (hitData) => {
      if (network) network.sendHit(hitData);
    };

    network.start();
  }

  renderPartyList();
  renderColorPicker();

  window.addEventListener("resize", () => renderer.resize());
  window.addEventListener("beforeunload", () => {
    if (network) network.sendLeave();
  });

  // Keyboard controls (WASD, Space jump, Shift dash/sprint, 1-4 emotes)
  window.addEventListener("keydown", (e) => {
    if (document.activeElement && document.activeElement.tagName === "INPUT") {
      return;
    }
    sound.unlock();
    game.keys.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
      game.triggerJump();
    }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      if (!e.repeat && game.triggerDash()) {
        sound.playDash();
      }
    }
    if (e.key === "1") { game.triggerEmote("👋"); sound.playEmote(); }
    if (e.key === "2") { game.triggerEmote("🔥"); sound.playEmote(); }
    if (e.key === "3") { game.triggerEmote("😂"); sound.playEmote(); }
    if (e.key === "4") { game.triggerEmote("⭐"); sound.playEmote(); }
  });

  window.addEventListener("keyup", (e) => {
    game.keys.delete(e.code);
  });

  // Mouse camera orbit (Pointer Lock + Right-drag fallback) & LMB Melee Attack
  let rmbDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("mousedown", (e) => {
    if (!roomModal.classList.contains("hidden")) {
      return;
    }
    sound.unlock();
    if (e.button === 0) {
      // LMB: lock pointer for smooth mouse look AND attack right away
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        try {
          canvas.requestPointerLock();
        } catch {}
      }
      game.triggerAttack();
    } else if (e.button === 2) {
      rmbDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button === 2) {
      rmbDragging = false;
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!roomModal.classList.contains("hidden")) {
      return;
    }
    const sens = 0.0028;
    if (document.pointerLockElement === canvas) {
      game.camYaw -= e.movementX * sens;
      game.camPitch = Math.max(-0.22, Math.min(1.05, game.camPitch + e.movementY * sens));
    } else if (rmbDragging) {
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      game.camYaw -= dx * sens * 1.4;
      game.camPitch = Math.max(-0.22, Math.min(1.05, game.camPitch + dy * sens * 1.4));
    }
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    renderer.adjustZoom(e.deltaY > 0 ? 0.1 : -0.1);
  }, { passive: false });

  document.querySelectorAll(".emote-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      sound.unlock();
      game.triggerEmote(btn.dataset.emote);
      sound.playEmote();
    });
  });

  if (btnCopyLink) {
    btnCopyLink.addEventListener("click", async () => {
      const roomId = network ? network.roomId : discord.roomId;
      const inviteUrl = buildRoomInviteUrl(roomId);
      const ok = await copyText(inviteUrl);
      showToast(ok ? "Ссылка на комнату скопирована!" : inviteUrl);
    });
  }

  btnBots.addEventListener("click", () => {
    sound.unlock();
    const active = game.toggleBots();
    btnBots.classList.toggle("active", active);
    renderPartyList();
    showToast(active ? "Боты добавлены" : "Боты убраны");
  });

  btnSound.addEventListener("click", () => {
    sound.unlock();
    const muted = sound.toggleMute();
    soundIcon.textContent = muted ? "🔇" : "🔊";
  });

  btnRoom.addEventListener("click", () => {
    if (document.pointerLockElement && document.exitPointerLock) {
      try { document.exitPointerLock(); } catch {}
    }
    inputName.value = game.localPlayer.name;
    inputServer.value = network ? network.serverUrl : "";
    inputRoom.value = network ? network.roomId : discord.roomId;
    selectedColor = game.localPlayer.color;
    renderColorPicker();
    roomModal.classList.remove("hidden");
  });

  btnCloseModal.addEventListener("click", () => {
    roomModal.classList.add("hidden");
  });

  btnCopyRoom.addEventListener("click", async () => {
    const val = inputRoom.value.trim() || (network ? network.roomId : discord.roomId);
    const inviteUrl = buildRoomInviteUrl(val);
    const ok = await copyText(inviteUrl);
    showToast(ok ? "Ссылка на комнату скопирована!" : inviteUrl);
  });

  btnApplyRoom.addEventListener("click", () => {
    const nextName = inputName.value.trim() || game.localPlayer.name;
    const nextServer = inputServer.value.trim();
    const nextRoom = inputRoom.value.trim() || (network ? network.roomId : discord.roomId);
    game.setLocalProfile(nextName, selectedColor);
    saveProfile(nextName, selectedColor, nextServer);
    if (network && (nextRoom !== network.roomId || nextServer !== network.serverUrl)) {
      network.setRoom(nextRoom, nextServer);
      window.location.hash = network.roomId;
      roomLabel.textContent = `Комната: ${network.roomId.slice(0, 10)}`;
    }
    renderPartyList();
    roomModal.classList.add("hidden");
    showToast("Сохранено");
  });

  // Mobile joystick
  let joyActive = false;
  joystickZone.addEventListener("pointerdown", (e) => {
    sound.unlock();
    joyActive = true;
    joystickZone.setPointerCapture(e.pointerId);
  });

  joystickZone.addEventListener("pointermove", (e) => {
    if (!joyActive) return;
    const rect = joystickZone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width / 2 - 18;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxR);
    const ang = Math.atan2(dy, dx);
    const kx = Math.cos(ang) * clamped;
    const ky = Math.sin(ang) * clamped;
    joystickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
    game.joyInput.x = dist > 6 ? kx / maxR : 0;
    game.joyInput.y = dist > 6 ? ky / maxR : 0;
  });

  function resetJoy() {
    joyActive = false;
    joystickKnob.style.transform = "translate(0px, 0px)";
    game.joyInput.x = 0;
    game.joyInput.y = 0;
  }

  joystickZone.addEventListener("pointerup", resetJoy);
  joystickZone.addEventListener("pointercancel", resetJoy);

  let lastTime = performance.now();
  let uiSyncCounter = 0;

  function updateCombatHud() {
    const lp = game.localPlayer;
    const pct = Math.max(0, Math.min(100, Math.round((lp.hp / lp.maxHp) * 100)));
    if (hpFill) {
      hpFill.style.width = `${pct}%`;
      hpFill.style.background = pct > 50 ? "#23a55a" : pct > 25 ? "#f0b232" : "#f23f43";
    }
    if (hpText) hpText.textContent = `${Math.ceil(lp.hp)} / ${lp.maxHp}`;
    if (killsText) killsText.textContent = `⚔ ${game.kills}`;

    if (deathOverlay) {
      if (!lp.alive) {
        deathOverlay.classList.remove("hidden");
        if (respawnTimerEl) {
          respawnTimerEl.textContent = Math.max(0, lp.respawnTimer).toFixed(1);
        }
      } else {
        deathOverlay.classList.add("hidden");
      }
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    game.update(dt);
    renderer.render(game, dt, sound);
    updateCombatHud();

    uiSyncCounter += dt;
    if (uiSyncCounter > 0.45) {
      uiSyncCounter = 0;
      renderPartyList();
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

if (document.readyState === "complete") {
  bootstrap();
} else {
  window.addEventListener("load", bootstrap);
}
