const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" }
];

function sanitizeRoomId(raw) {
  return String(raw || "rubikon-party")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "rubikon-party";
}

function getHostPeerId(roomId) {
  return `rubikon-p2p-host-${sanitizeRoomId(roomId)}`;
}

export class PartyNetwork {
  constructor(options) {
    this.localId = options.localId;
    this.roomId = sanitizeRoomId(options.roomId);
    this.serverUrl = (options.serverUrl || "").trim();
    this.onState = options.onState;
    this.onStatus = options.onStatus;
    this.onPeerJoin = options.onPeerJoin;
    this.onPeerLeave = options.onPeerLeave;
    this.onHit = options.onHit || (() => {});
    this.getLocalPlayer = options.getLocalPlayer;

    this.mode = this.serverUrl ? "ws" : "p2p";
    this.isHost = false;
    this.ws = null;
    this.peer = null;
    this.hostConn = null;
    this.guestConns = new Map();
    this.channel = null;
    this.syncTimer = null;
    this.reconnectTimer = null;
    this.destroyed = false;
    this.peersSnapshot = new Map();
  }

  start() {
    this.setupBroadcastChannel();
    if (this.serverUrl) {
      this.mode = "ws";
      this.connectWebSocket();
    } else {
      this.mode = "p2p";
      this.connectP2P();
    }
    this.syncTimer = setInterval(() => this.broadcastTick(), 50);
  }

  setRoom(newRoomId, newServerUrl) {
    this.stop();
    this.destroyed = false;
    this.roomId = sanitizeRoomId(newRoomId);
    this.serverUrl = typeof newServerUrl === "string" ? newServerUrl.trim() : "";
    this.peersSnapshot.clear();
    this.start();
  }

  stop() {
    this.destroyed = true;
    this.isHost = false;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.cleanupP2P();
  }

  cleanupP2P() {
    if (this.hostConn) {
      try {
        this.hostConn.close();
      } catch {}
      this.hostConn = null;
    }
    for (const entry of this.guestConns.values()) {
      try {
        entry.conn.close();
      } catch {}
    }
    this.guestConns.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
  }

  setupBroadcastChannel() {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }
    try {
      this.channel = new BroadcastChannel(`dpp-local-${this.roomId}`);
      this.channel.onmessage = (event) => {
        const msg = event.data;
        if (!msg || msg.sender === this.localId) {
          return;
        }
        if (msg.type === "player" && msg.player) {
          this.handleRemotePlayer(msg.player);
        } else if (msg.type === "leave" && msg.id) {
          this.removeRemotePlayer(msg.id);
        } else if (msg.type === "hit" && msg.hit) {
          this.onHit(msg.hit);
        }
      };
    } catch {}
  }

  sendHit(hitData) {
    if (this.channel) {
      try {
        this.channel.postMessage({ type: "hit", sender: this.localId, hit: hitData });
      } catch {}
    }
    if (this.mode === "p2p") {
      const payload = { type: "hit", hit: hitData };
      if (this.isHost) {
        this.broadcastToGuests(payload);
      } else if (this.hostConn && this.hostConn.open) {
        try {
          this.hostConn.send(payload);
        } catch {}
      }
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "hit", roomId: this.roomId, hit: hitData }));
      } catch {}
    }
  }

  // ==================== WebRTC P2P (Auto-Host) ====================

  connectP2P() {
    if (this.destroyed) {
      return;
    }
    if (typeof window === "undefined" || typeof window.Peer !== "function") {
      this.onStatus("error", "PeerJS не загрузился");
      return;
    }

    this.cleanupP2P();
    this.isHost = false;
    const hostPeerId = getHostPeerId(this.roomId);
    this.onStatus("connecting", "Подключение P2P...");

    const peer = new window.Peer(hostPeerId, {
      debug: 0,
      config: { iceServers: STUN_SERVERS }
    });
    this.peer = peer;

    peer.on("open", () => {
      if (this.destroyed || this.peer !== peer) {
        return;
      }
      this.isHost = true;
      this.onStatus("online", "Вы хост (P2P)");
    });

    peer.on("connection", (conn) => {
      if (this.destroyed || this.peer !== peer) {
        try { conn.close(); } catch {}
        return;
      }
      this.attachGuestConnection(conn);
    });

    peer.on("error", (err) => {
      if (this.destroyed || this.peer !== peer) {
        return;
      }
      if (err && err.type === "unavailable-id") {
        this.cleanupP2P();
        this.connectAsGuest(hostPeerId);
        return;
      }
      this.onStatus("local", "Переподключение P2P...");
      this.scheduleP2PReconnect(2000);
    });

    peer.on("disconnected", () => {
      if (this.destroyed || this.peer !== peer) {
        return;
      }
      try {
        peer.reconnect();
      } catch {
        this.scheduleP2PReconnect(2000);
      }
    });
  }

  attachGuestConnection(conn) {
    const entry = { conn, playerId: null };
    this.guestConns.set(conn.peer, entry);

    conn.on("open", () => {
      if (this.destroyed) {
        try { conn.close(); } catch {}
        return;
      }
      try {
        conn.send({ type: "welcome", isHost: false });
      } catch {}
    });

    conn.on("data", (data) => {
      if (!data || typeof data !== "object") {
        return;
      }
      if ((data.type === "join" || data.type === "state") && data.player && data.player.id) {
        entry.playerId = data.player.id;
        this.handleRemotePlayer({ ...data.player, isHost: false });
      } else if (data.type === "leave" && data.id) {
        this.removeRemotePlayer(data.id);
        this.broadcastToGuests({ type: "leave", id: data.id }, conn.peer);
      } else if (data.type === "hit" && data.hit) {
        if (data.hit.targetId === this.localId) {
          this.onHit(data.hit);
        } else {
          this.broadcastToGuests({ type: "hit", hit: data.hit }, conn.peer);
        }
      }
    });

    const handleDisconnect = () => {
      this.guestConns.delete(conn.peer);
      if (entry.playerId) {
        const leftId = entry.playerId;
        entry.playerId = null;
        this.removeRemotePlayer(leftId);
        this.broadcastToGuests({ type: "leave", id: leftId });
      }
    };

    conn.on("close", handleDisconnect);
    conn.on("error", handleDisconnect);
  }

  connectAsGuest(hostPeerId) {
    if (this.destroyed) {
      return;
    }
    this.isHost = false;
    this.onStatus("connecting", "Подключение к хосту...");

    const peer = new window.Peer(undefined, {
      debug: 0,
      config: { iceServers: STUN_SERVERS }
    });
    this.peer = peer;

    peer.on("open", () => {
      if (this.destroyed || this.peer !== peer) {
        return;
      }
      const conn = peer.connect(hostPeerId, { reliable: true });
      this.hostConn = conn;

      const connectTimeout = setTimeout(() => {
        if (!this.destroyed && this.hostConn === conn && !conn.open) {
          this.onStatus("local", "Хост не отвечает, пробую стать хостом...");
          this.scheduleP2PReconnect(800 + Math.random() * 1200);
        }
      }, 8000);

      conn.on("open", () => {
        clearTimeout(connectTimeout);
        if (this.destroyed || this.hostConn !== conn) {
          try { conn.close(); } catch {}
          return;
        }
        this.onStatus("online", "В партии (P2P)");
        const local = this.getLocalPlayer();
        if (local) {
          try {
            conn.send({ type: "join", roomId: this.roomId, player: local });
          } catch {}
        }
      });

      conn.on("data", (data) => {
        if (!data || typeof data !== "object") {
          return;
        }
        if (data.type === "welcome") {
          this.isHost = false;
          this.onStatus("online", "В партии (P2P)");
        } else if (data.type === "snapshot" && Array.isArray(data.players)) {
          const activeIds = new Set();
          for (const p of data.players) {
            if (!p || !p.id || p.id === this.localId) {
              continue;
            }
            activeIds.add(p.id);
            this.handleRemotePlayer(p);
          }
          for (const knownId of Array.from(this.peersSnapshot.keys())) {
            if (!activeIds.has(knownId)) {
              this.removeRemotePlayer(knownId);
            }
          }
        } else if (data.type === "leave" && data.id) {
          this.removeRemotePlayer(data.id);
        } else if (data.type === "hit" && data.hit) {
          this.onHit(data.hit);
        }
      });

      const onHostLost = () => {
        clearTimeout(connectTimeout);
        if (this.destroyed || this.hostConn !== conn) {
          return;
        }
        this.hostConn = null;
        for (const id of Array.from(this.peersSnapshot.keys())) {
          this.removeRemotePlayer(id);
        }
        this.onStatus("connecting", "Хост вышел, выбор нового хоста...");
        this.scheduleP2PReconnect(600 + Math.random() * 1400);
      };

      conn.on("close", onHostLost);
      conn.on("error", onHostLost);
    });

    peer.on("error", (err) => {
      if (this.destroyed || this.peer !== peer) {
        return;
      }
      if (err && err.type === "peer-unavailable") {
        this.onStatus("connecting", "Переход в режим хоста...");
        this.scheduleP2PReconnect(500 + Math.random() * 800);
        return;
      }
      this.onStatus("local", "Нет связи P2P, повтор...");
      this.scheduleP2PReconnect(2000);
    });
  }

  scheduleP2PReconnect(delayMs) {
    if (this.destroyed) {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed && this.mode === "p2p") {
        this.connectP2P();
      }
    }, delayMs);
  }

  broadcastToGuests(payload, excludePeerId = null) {
    for (const [peerId, entry] of this.guestConns.entries()) {
      if (peerId === excludePeerId) {
        continue;
      }
      if (entry.conn && entry.conn.open) {
        try {
          entry.conn.send(payload);
        } catch {}
      }
    }
  }

  // ==================== Optional WebSocket Mode ====================

  connectWebSocket() {
    if (this.destroyed || !this.serverUrl) {
      this.onStatus("local", "Локальный режим");
      return;
    }

    const isHttps = window.location.protocol === "https:";
    if (
      isHttps &&
      this.serverUrl.startsWith("ws://") &&
      !this.serverUrl.includes("localhost") &&
      !this.serverUrl.includes("127.0.0.1")
    ) {
      this.onStatus("error", "Нужен wss:// для HTTPS");
      return;
    }

    this.onStatus("connecting", "Подключение к серверу...");

    try {
      const ws = new WebSocket(this.serverUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.destroyed) {
          ws.close();
          return;
        }
        this.onStatus("online", "Сервер подключен");
        ws.send(JSON.stringify({
          type: "join",
          roomId: this.roomId,
          player: this.getLocalPlayer()
        }));
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!data) {
          return;
        }
        if (data.type === "welcome") {
          this.isHost = Boolean(data.isHost);
          this.onStatus("online", "В партии");
        } else if (data.type === "snapshot" && Array.isArray(data.players)) {
          for (const p of data.players) {
            if (p.id === this.localId) {
              if (this.isHost !== Boolean(p.isHost)) {
                this.isHost = Boolean(p.isHost);
                this.onStatus("online", "В партии");
              }
            } else {
              this.handleRemotePlayer(p);
            }
          }
        } else if (data.type === "leave" && data.id) {
          this.removeRemotePlayer(data.id);
        } else if (data.type === "hit" && data.hit) {
          this.onHit(data.hit);
        }
      };

      ws.onerror = () => {
        if (!this.destroyed) {
          this.onStatus("local", "Сервер недоступен");
        }
      };

      ws.onclose = () => {
        this.ws = null;
        if (!this.destroyed) {
          this.onStatus("local", "Нет связи с сервером");
          this.reconnectTimer = setTimeout(() => {
            if (!this.destroyed && this.mode === "ws") {
              this.connectWebSocket();
            }
          }, 2500);
        }
      };
    } catch {
      this.onStatus("local", "Локальный режим");
    }
  }

  // ==================== Shared State Sync ====================

  handleRemotePlayer(player) {
    const existed = this.peersSnapshot.has(player.id);
    this.peersSnapshot.set(player.id, player);
    this.onState(player);
    if (!existed) {
      this.onPeerJoin(player);
    }
  }

  removeRemotePlayer(id) {
    if (this.peersSnapshot.has(id)) {
      this.peersSnapshot.delete(id);
      this.onPeerLeave(id);
    }
  }

  broadcastTick() {
    const local = this.getLocalPlayer();
    if (!local) {
      return;
    }
    if (this.channel) {
      try {
        this.channel.postMessage({
          type: "player",
          sender: this.localId,
          player: local
        });
      } catch {}
    }

    if (this.mode === "p2p") {
      if (this.isHost) {
        if (this.guestConns.size > 0) {
          const players = [
            { ...local, isHost: true },
            ...Array.from(this.peersSnapshot.values())
          ];
          this.broadcastToGuests({ type: "snapshot", players });
        }
      } else if (this.hostConn && this.hostConn.open) {
        try {
          this.hostConn.send({
            type: "state",
            roomId: this.roomId,
            player: local
          });
        } catch {}
      }
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: "state",
          roomId: this.roomId,
          player: local
        }));
      } catch {}
    }
  }

  sendLeave() {
    if (this.channel) {
      try {
        this.channel.postMessage({
          type: "leave",
          sender: this.localId,
          id: this.localId
        });
      } catch {}
    }
    if (this.mode === "p2p") {
      if (this.isHost) {
        this.broadcastToGuests({ type: "leave", id: this.localId });
      } else if (this.hostConn && this.hostConn.open) {
        try {
          this.hostConn.send({ type: "leave", roomId: this.roomId, id: this.localId });
        } catch {}
      }
      this.cleanupP2P();
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: "leave",
          roomId: this.roomId,
          id: this.localId
        }));
      } catch {}
    }
  }
}
