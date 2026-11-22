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
      li.className = "party-item";

      const swatch = document.createElement("span");
      swatch.className = "party-swatch";
      swatch.style.background = p.color;

      const nameSpan = document.createElement("span");
      nameSpan.className = "party-name";
      nameSpan.textContent = p.name;

      const tag = document.createElement("span");
      tag.className = "party-tag";
      if (p.id === localId) {
        tag.textContent = p.isHost ? "вы · хост" : "вы";
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
  if (!discord.isDiscord && !window.location.hash) {
    window.history.replaceState(null, "", `#${discord.roomId}`);
  }
  roomLabel.textContent = discord.isDiscord ? "Rubikon Discord" : `Комната: ${discord.roomId.slice(0, 10)}`;

  const network = new PartyNetwork({
    localId,
    roomId: discord.roomId,
    serverUrl: profile.serverUrl || CONFIG.DEFAULT_WS_URL,
    getLocalPlayer: () => game.localPlayer,
    onState: (player) => {
      game.upsertRemotePlayer(player);
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

  network.start();
  renderPartyList();
  renderColorPicker();

  window.addEventListener("resize", () => renderer.resize());
  window.addEventListener("beforeunload", () => network.sendLeave());

  window.addEventListener("keydown", (e) => {
    if (document.activeElement && document.activeElement.tagName === "INPUT") {
      return;
    }
    sound.unlock();
    game.keys.add(e.code);
    if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "Space") {
      if (game.triggerDash()) {
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

  canvas.addEventListener("pointerdown", (e) => {
    sound.unlock();
    const rect = canvas.getBoundingClientRect();
    const hit = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) {
      game.clickTarget = hit;
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
      const inviteUrl = buildRoomInviteUrl(network.roomId);
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
    inputName.value = game.localPlayer.name;
    inputServer.value = network.serverUrl;
    inputRoom.value = network.roomId;
    selectedColor = game.localPlayer.color;
    renderColorPicker();
    roomModal.classList.remove("hidden");
  });

  btnCloseModal.addEventListener("click", () => {
    roomModal.classList.add("hidden");
  });

  btnCopyRoom.addEventListener("click", async () => {
    const val = inputRoom.value.trim() || network.roomId;
    const inviteUrl = buildRoomInviteUrl(val);
    const ok = await copyText(inviteUrl);
    showToast(ok ? "Ссылка на комнату скопирована!" : inviteUrl);
  });

  btnApplyRoom.addEventListener("click", () => {
    const nextName = inputName.value.trim() || game.localPlayer.name;
    const nextServer = inputServer.value.trim();
    const nextRoom = inputRoom.value.trim() || network.roomId;
    game.setLocalProfile(nextName, selectedColor);
    saveProfile(nextName, selectedColor, nextServer);
    if (nextRoom !== network.roomId || nextServer !== network.serverUrl) {
      network.setRoom(nextRoom, nextServer);
      if (!discord.isDiscord) {
        window.location.hash = network.roomId;
        roomLabel.textContent = `Комната: ${network.roomId.slice(0, 10)}`;
      }
    }
    renderPartyList();
    roomModal.classList.add("hidden");
    showToast("Сохранено");
  });

  let joyActive = false;
  joystickZone.addEventListener("pointerdown", (e) => {
    sound.unlock();
    joyActive = true;
    joystickZone.setPointerCapture(e.pointerId);
  });

  joystickZone.addEventListener("pointermove", (e) => {
    if (!joyActive) {
      return;
    }
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
  let partySyncCounter = 0;

  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    game.update(dt);
    renderer.render(game);

    partySyncCounter += dt;
    if (partySyncCounter > 0.6) {
      partySyncCounter = 0;
      renderPartyList();
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

window.addEventListener("load", bootstrap);
