import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BIN_DIR = path.join(__dirname, "bin");
const URL_FILE = path.join(__dirname, "tunnel-url.txt");
const DEFAULT_PORT = Number(process.env.PORT || 3000);
const IS_WIN = process.platform === "win32";
const NULL_DEV = IS_WIN ? "NUL" : "/dev/null";

let serverProc = null;
let activeTunnelProc = null;
let shuttingDown = false;

function stripAnsi(str) {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function copyToClipboard(text) {
  if (IS_WIN) {
    const clip = spawnSync("clip", [], {
      input: text,
      encoding: "utf8",
      windowsHide: true
    });
    if (clip.status === 0 && !clip.error) {
      return true;
    }
    const ps = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"],
      { input: text, encoding: "utf8", windowsHide: true }
    );
    return ps.status === 0 && !ps.error;
  }

  if (process.platform === "darwin") {
    const pb = spawnSync("pbcopy", [], { input: text, encoding: "utf8" });
    return pb.status === 0 && !pb.error;
  }

  for (const [cmd, args] of [
    ["wl-copy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["xsel", ["--clipboard", "--input"]]
  ]) {
    const res = spawnSync(cmd, args, { input: text, encoding: "utf8" });
    if (res.status === 0 && !res.error) {
      return true;
    }
  }
  return false;
}

function announceUrl(fullUrl, providerName, port) {
  let domain = fullUrl;
  try {
    domain = new URL(fullUrl).host;
  } catch {}

  const copied = copyToClipboard(fullUrl);
  try {
    fs.writeFileSync(URL_FILE, `${fullUrl}\n`, "utf8");
  } catch {}

  console.log("");
  console.log("==================================================");
  console.log(`Туннель запущен (${providerName}) -> порт ${port}`);
  console.log(`ГОТОВАЯ ССЫЛКА: ${fullUrl}`);
  console.log(`ДОМЕН (Discord URL Mappings): ${domain}`);
  console.log(`ЛОКАЛЬНО: http://127.0.0.1:${port}`);
  console.log(
    copied
      ? "ССЫЛКА АВТОМАТИЧЕСКИ СКОПИРОВАНА В БУФЕР ОБМЕНА!"
      : "Не удалось скопировать автоматически — скопируй ссылку выше."
  );
  console.log("==================================================");
  console.log("Не закрывай это окно, пока играешь. Ctrl+C — остановить.");
  console.log("");
}

async function checkRubikonHealth(port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal
    });
    if (!res.ok) {
      return false;
    }
    const data = await res.json();
    return Boolean(data && data.ok && data.app === "rubikon");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, "0.0.0.0");
  });
}

async function findFreePort(startPort) {
  for (let p = startPort; p < startPort + 20; p++) {
    if (await isPortFree(p)) {
      return p;
    }
  }
  return startPort;
}

async function ensureServerRunning() {
  if (await checkRubikonHealth(DEFAULT_PORT)) {
    console.log(`Сервер Rubikon уже работает на http://127.0.0.1:${DEFAULT_PORT}`);
    return DEFAULT_PORT;
  }

  const port = await findFreePort(DEFAULT_PORT);
  if (port !== DEFAULT_PORT) {
    console.log(`Порт ${DEFAULT_PORT} занят другим приложением, запускаю сервер на порту ${port}...`);
  } else {
    console.log(`Запускаю локальный сервер Rubikon на порту ${port}...`);
  }

  const serverScript = path.join(__dirname, "server.js");
  let exitedEarly = false;
  let exitCode = null;

  serverProc = spawn(process.execPath, [serverScript], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProc.stdout.on("data", (chunk) => {
    const lines = chunk.toString().trimEnd().split(/\r?\n/);
    for (const line of lines) {
      if (line) console.log(`[server] ${line}`);
    }
  });

  serverProc.stderr.on("data", (chunk) => {
    const lines = chunk.toString().trimEnd().split(/\r?\n/);
    for (const line of lines) {
      if (line) console.error(`[server] ${line}`);
    }
  });

  serverProc.on("exit", (code) => {
    exitedEarly = true;
    exitCode = code;
    serverProc = null;
    if (!shuttingDown) {
      console.error(`[server] Сервер завершился (код ${code}).`);
    }
  });

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (exitedEarly) {
      throw new Error(`Сервер не запустился (код выхода ${exitCode}). Проверь, что выполнен npm install.`);
    }
    if (await checkRubikonHealth(port)) {
      console.log(`Сервер готов: http://127.0.0.1:${port}`);
      return port;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  throw new Error(`Сервер не ответил на http://127.0.0.1:${port}/health за 15 секунд.`);
}

function getCloudflaredDownloadInfo() {
  const base = "https://github.com/cloudflare/cloudflared/releases/latest/download";
  if (IS_WIN) {
    const file = process.arch === "ia32"
      ? "cloudflared-windows-386.exe"
      : "cloudflared-windows-amd64.exe";
    return { url: `${base}/${file}`, localPath: path.join(BIN_DIR, "cloudflared.exe") };
  }
  if (process.platform === "linux") {
    const file = process.arch === "arm64"
      ? "cloudflared-linux-arm64"
      : "cloudflared-linux-amd64";
    return { url: `${base}/${file}`, localPath: path.join(BIN_DIR, "cloudflared") };
  }
  return null;
}

function commandWorks(cmd, args = ["--version"]) {
  const res = spawnSync(cmd, args, { stdio: "ignore", windowsHide: true });
  return res.status === 0 && !res.error;
}

async function resolveCloudflaredBinary() {
  if (commandWorks("cloudflared", ["--version"])) {
    return "cloudflared";
  }

  const info = getCloudflaredDownloadInfo();
  if (!info) {
    return null;
  }

  if (fs.existsSync(info.localPath) && commandWorks(info.localPath, ["--version"])) {
    return info.localPath;
  }

  console.log("Скачиваю cloudflared (один раз, для стабильного туннеля)...");
  try {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    const res = await fetch(info.url, { redirect: "follow", signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const tmpPath = `${info.localPath}.tmp`;
    fs.writeFileSync(tmpPath, buf);
    if (!IS_WIN) {
      fs.chmodSync(tmpPath, 0o755);
    }
    fs.renameSync(tmpPath, info.localPath);
    if (commandWorks(info.localPath, ["--version"])) {
      console.log("cloudflared успешно скачан.");
      return info.localPath;
    }
  } catch (err) {
    console.log(`Не удалось скачать cloudflared (${err.message}), пробую резервные туннели...`);
  }
  return null;
}

function runTunnelProvider({ name, cmd, args, urlRegex, timeoutMs, stdinInit, port }) {
  return new Promise((resolve) => {
    console.log(`Пробую открыть туннель через ${name}...`);
    let proc;
    try {
      proc = spawn(cmd, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (err) {
      console.log(`${name}: не удалось запустить (${err.message})`);
      resolve({ ok: false });
      return;
    }

    let settled = false;
    let buffer = "";

    const finishFail = (reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.log(`${name}: ${reason}`);
      try {
        proc.kill();
      } catch {}
      resolve({ ok: false });
    };

    const timer = setTimeout(() => {
      finishFail("таймаут ожидания ссылки");
    }, timeoutMs);

    if (stdinInit && proc.stdin && proc.stdin.writable) {
      setTimeout(() => {
        try {
          if (!settled && proc.stdin.writable) {
            proc.stdin.write(stdinInit);
          }
        } catch {}
      }, 1500);
    }

    const onChunk = (chunk) => {
      const clean = stripAnsi(chunk.toString());
      buffer = (buffer + clean).slice(-8192);

      if (!settled) {
        const match = buffer.match(urlRegex);
        if (match) {
          settled = true;
          clearTimeout(timer);
          activeTunnelProc = proc;
          const fullUrl = match[0].replace(/\/+$/, "");
          announceUrl(fullUrl, name, port);
          resolve({ ok: true, proc, url: fullUrl });
        }
      }
    };

    proc.stdout.on("data", onChunk);
    proc.stderr.on("data", onChunk);

    proc.on("error", (err) => {
      finishFail(`ошибка запуска (${err.code || err.message})`);
    });

    proc.on("exit", (code) => {
      if (!settled) {
        finishFail(`процесс завершился с кодом ${code}`);
      } else if (!shuttingDown) {
        console.log(`\nТуннель ${name} закрылся (код ${code}). Перезапусти run.bat при необходимости.`);
      }
    });
  });
}

async function startTunnelWithFallback(port) {
  const providers = [];

  const cfBin = await resolveCloudflaredBinary();
  if (cfBin) {
    providers.push({
      name: "Cloudflare Tunnel",
      cmd: cfBin,
      args: ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`],
      urlRegex: /https:\/\/(?!(?:api|www|admin)\.)[a-z0-9-]+\.trycloudflare\.com\b/i,
      timeoutMs: 25000
    });
  }

  const sshBaseArgs = [
    "-T",
    "-o", "StrictHostKeyChecking=no",
    "-o", `UserKnownHostsFile=${NULL_DEV}`,
    "-o", "ServerAliveInterval=30",
    "-o", "ConnectTimeout=10",
    "-o", "ExitOnForwardFailure=yes"
  ];

  providers.push(
    {
      name: "localhost.run",
      cmd: "ssh",
      args: [...sshBaseArgs, "-R", `80:127.0.0.1:${port}`, "nokey@localhost.run"],
      urlRegex: /https:\/\/(?!(?:www|admin|docs|status)\.)[a-z0-9-]+\.lhr\.life\b/i,
      timeoutMs: 15000
    },
    {
      name: "Serveo",
      cmd: "ssh",
      args: [...sshBaseArgs, "-R", `80:127.0.0.1:${port}`, "serveo.net"],
      urlRegex: /https:\/\/(?!(?:www|admin|docs|status)\.)[a-z0-9-]+\.(?:serveo\.net|serveousercontent\.com)\b/i,
      timeoutMs: 15000
    },
    {
      name: "Pinggy (порт 443)",
      cmd: "ssh",
      args: ["-p", "443", ...sshBaseArgs, "-R", `0:127.0.0.1:${port}`, "free.pinggy.io"],
      urlRegex: /https:\/\/(?!(?:www|dashboard|admin|docs|status)\.)[a-z0-9.-]+\.pinggy\.link\b/i,
      timeoutMs: 15000,
      stdinInit: "\n"
    }
  );

  for (const provider of providers) {
    const res = await runTunnelProvider({ ...provider, port });
    if (res.ok) {
      return res;
    }
  }

  return { ok: false };
}

function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nОстанавливаю туннель и сервер...");
  if (activeTunnelProc) {
    try {
      activeTunnelProc.kill();
    } catch {}
    activeTunnelProc = null;
  }
  if (serverProc) {
    try {
      serverProc.kill();
    } catch {}
    serverProc = null;
  }
  setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

async function main() {
  const port = await ensureServerRunning();
  const result = await startTunnelWithFallback(port);

  if (!result.ok) {
    console.error("");
    console.error("==================================================");
    console.error("Не удалось открыть публичный туннель ни через один сервис.");
    console.error(`Локальный сервер при этом работает: http://127.0.0.1:${port}`);
    console.error("Проверь интернет, фаервол/антивирус или попробуй с VPN.");
    console.error("==================================================");
    console.error("");
    cleanup();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n[ОШИБКА] ${err.message}`);
  cleanup();
  process.exit(1);
});
