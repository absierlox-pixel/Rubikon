import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

const VENDOR_URLS = {
  "/vendor/three.min.js": [
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js",
    "https://unpkg.com/three@0.128.0/build/three.min.js"
  ],
  "/vendor/discord-sdk.mjs": [
    "https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2.0.0/+esm",
    "https://esm.sh/@discord/embedded-app-sdk@2.0.0"
  ]
};

const vendorCache = new Map();

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function serveVendor(reqPath, res) {
  if (vendorCache.has(reqPath)) {
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400"
    });
    res.end(vendorCache.get(reqPath));
    return;
  }

  const urls = VENDOR_URLS[reqPath];
  if (!urls || urls.length === 0) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  let lastError = "Unknown error";
  for (const targetUrl of urls) {
    try {
      const upstream = await fetchWithTimeout(targetUrl, 15000);
      if (!upstream.ok) {
        lastError = `HTTP ${upstream.status} (${targetUrl})`;
        continue;
      }
      const text = await upstream.text();
      vendorCache.set(reqPath, text);
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400"
      });
      res.end(text);
      return;
    } catch (err) {
      lastError = `${err.message} (${targetUrl})`;
    }
  }

  console.log(`Vendor fetch failed for ${reqPath}: ${lastError}`);
  res.writeHead(502);
  res.end("Fetch Error");
}

const server = http.createServer((req, res) => {
  const reqPath = (req.url || "/").split("?")[0];

  if (reqPath === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({ ok: true, app: "rubikon", port: PORT }));
    return;
  }

  if (reqPath === "/vendor/three.min.js" || reqPath === "/vendor/discord-sdk.mjs") {
    serveVendor(reqPath, res);
    return;
  }

  if (reqPath === "/server" || reqPath.startsWith("/server/")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const safeRel = reqPath === "/" ? "index.html" : reqPath.replace(/^\/+/, "");
  const filePath = path.resolve(CLIENT_ROOT, safeRel);
  const relToRoot = path.relative(CLIENT_ROOT, filePath);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(content);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  return rooms.get(roomId);
}

function assignHost(room) {
  let hasHost = false;
  for (const entry of room.values()) {
    if (entry.player && entry.player.isHost) {
      hasHost = true;
      break;
    }
  }
  if (!hasHost) {
    const first = room.values().next().value;
    if (first && first.player) {
      first.player.isHost = true;
    }
  }
}

function broadcastRoom(room, payload, excludeId = null) {
  const raw = JSON.stringify(payload);
  for (const [pid, entry] of room.entries()) {
    if (excludeId && pid === excludeId) continue;
    if (entry.ws.readyState === 1) {
      try {
        entry.ws.send(raw);
      } catch {}
    }
  }
}

wss.on("error", (err) => {
  console.error("WebSocket server error:", err.message);
});

wss.on("connection", (ws) => {
  let currentRoomId = null;
  let currentPlayerId = null;
  ws.isAlive = true;
  console.log("WS client connected");

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("error", (err) => {
    console.error("WS client error:", err.message);
  });

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!data || !data.roomId) {
      return;
    }

    const roomId = String(data.roomId);
    const room = getRoom(roomId);

    if (data.type === "join" && data.player) {
      currentRoomId = roomId;
      currentPlayerId = data.player.id;
      const isHost = room.size === 0;
      const player = { ...data.player, isHost };
      room.set(currentPlayerId, { ws, player });
      try {
        ws.send(JSON.stringify({ type: "welcome", isHost }));
      } catch {}
      console.log(`Player joined room ${roomId}: ${player.name}`);
      return;
    }

    if (data.type === "state" && data.player) {
      currentRoomId = roomId;
      currentPlayerId = data.player.id;
      const prev = room.get(currentPlayerId);
      const isHost = prev ? Boolean(prev.player.isHost) : room.size === 0;
      room.set(currentPlayerId, { ws, player: { ...data.player, isHost } });
      if (data.drivenVehicle) {
        broadcastRoom(room, { type: "vehicles", vehicles: [data.drivenVehicle] }, currentPlayerId);
      }
      return;
    }

    if (data.type === "vehicles" && Array.isArray(data.vehicles)) {
      broadcastRoom(room, { type: "vehicles", vehicles: data.vehicles }, currentPlayerId);
      return;
    }

    if (data.type === "hit" && data.hit) {
      broadcastRoom(room, { type: "hit", hit: data.hit }, currentPlayerId);
      return;
    }

    if (data.type === "leave" && data.id) {
      room.delete(data.id);
      assignHost(room);
      broadcastRoom(room, { type: "leave", id: data.id });
      if (room.size === 0) {
        rooms.delete(roomId);
      }
    }
  });

  ws.on("close", () => {
    if (currentRoomId && currentPlayerId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      room.delete(currentPlayerId);
      assignHost(room);
      broadcastRoom(room, { type: "leave", id: currentPlayerId });
      if (room.size === 0) {
        rooms.delete(currentRoomId);
      }
    }
  });
});

const snapshotTimer = setInterval(() => {
  for (const room of rooms.values()) {
    if (room.size === 0) {
      continue;
    }
    const players = Array.from(room.values()).map((entry) => entry.player);
    broadcastRoom(room, { type: "snapshot", players });
  }
}, 50);

const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  }
}, 25000);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Порт ${PORT} уже занят. Закрой другой сервер или укажи другой PORT.`);
  } else {
    console.error("Ошибка HTTP-сервера:", err.message);
  }
  process.exit(1);
});

function shutdown() {
  clearInterval(snapshotTimer);
  clearInterval(heartbeatTimer);
  wss.close(() => {
    server.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Rubikon server running on http://127.0.0.1:${PORT}`);
});
