import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const baseUrl = process.env.MARKET_VISUAL_PROOF_BASE_URL ?? "http://127.0.0.1:3004";
const outputDir = process.env.MARKET_VISUAL_PROOF_OUTPUT_DIR ?? join(root, "market-visual-proof");
const shouldStartServer = process.env.MARKET_VISUAL_PROOF_START_SERVER !== "false";
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");

let serverProcess = null;

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => existsSync(candidate));
  if (!chrome) {
    throw new Error("Chrome not found. Set CHROME_BIN to a Chromium-compatible browser binary.");
  }
  return chrome;
}

function previewEnv() {
  return {
    ...process.env,
    MARKET_UI_PREVIEW: "true",
    NEXT_PUBLIC_APP_URL: baseUrl,
  };
}

function startPreviewServer() {
  const url = new URL(baseUrl);
  serverProcess = spawn(
    process.execPath,
    [nextBin, "dev", "--hostname", url.hostname, "--port", url.port || "3004"],
    {
      cwd: root,
      env: previewEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  serverProcess.stdout?.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  serverProcess.stderr?.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
  serverProcess.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`[next] exited with code ${code}\n`);
    }
    if (signal) process.stderr.write(`[next] exited with signal ${signal}\n`);
  });
}

function stopPreviewServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function routeReady(pathname) {
  try {
    const response = await fetch(new URL(pathname, baseUrl), { redirect: "manual" });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function waitForRoute(pathname) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await routeReady(pathname)) return;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${new URL(pathname, baseUrl).toString()}`);
}

function assertPng(path) {
  const stat = statSync(path);
  if (stat.size < 25_000) {
    throw new Error(`Screenshot ${path} is too small (${stat.size} bytes)`);
  }
  const header = readFileSync(path).subarray(0, 8).toString("hex");
  if (header !== "89504e470d0a1a0a") {
    throw new Error(`Screenshot ${path} is not a PNG`);
  }
}

function parseShotSize(size) {
  const [width, height] = size.split(",").map((value) => Number(value));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Invalid screenshot size: ${size}`);
  }
  return { width, height };
}

async function chromeJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) throw new Error(`Chrome ${path} HTTP ${response.status}`);
  return response.json();
}

async function waitForChromeTarget(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await chromeJson(port, "/json/list");
      const target = targets.find((item) => item.type === "page");
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error("Timed out waiting for Chrome debug target");
}

async function createCdpClient(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let commandId = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) reject(new Error(JSON.stringify(payload.error)));
      else resolve(payload.result);
    }
  });

  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

  return {
    close: () => ws.close(),
    send(method, params = {}) {
      const id = ++commandId;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
  };
}

async function captureMobileScreenshot(chrome, shot) {
  const { width, height } = parseShotSize(shot.size);
  const outputPath = join(outputDir, `${shot.name}.png`);
  const debugPort = 9300 + Math.floor(Math.random() * 500);
  const chromeProcess = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-application-cache",
      "--disable-background-networking",
      "--disable-extensions",
      "--disk-cache-size=1",
      "--hide-scrollbars",
      "--incognito",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${debugPort}`,
      "about:blank",
    ],
    { cwd: root, stdio: "ignore" },
  );

  let client = null;
  try {
    const target = await waitForChromeTarget(debugPort);
    client = await createCdpClient(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await client.send("Page.navigate", { url: new URL(shot.path, baseUrl).toString() });
    await sleep(3000);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
    assertPng(outputPath);
    return {
      name: shot.name,
      path: outputPath,
      sizeBytes: statSync(outputPath).size,
      url: new URL(shot.path, baseUrl).toString(),
    };
  } finally {
    client?.close();
    if (!chromeProcess.killed) chromeProcess.kill("SIGTERM");
  }
}

async function captureScreenshot(chrome, shot) {
  const { width } = parseShotSize(shot.size);
  if (width < 500) {
    return captureMobileScreenshot(chrome, shot);
  }

  const outputPath = join(outputDir, `${shot.name}.png`);
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(1000);
    await waitForRoute(shot.path);

    const result = spawnSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-application-cache",
        "--disable-background-networking",
        "--disable-extensions",
        "--disk-cache-size=1",
        "--force-device-scale-factor=1",
        "--hide-scrollbars",
        "--incognito",
        "--no-first-run",
        "--no-default-browser-check",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=2000",
        `--window-size=${shot.size}`,
        `--screenshot=${outputPath}`,
        new URL(shot.path, baseUrl).toString(),
      ],
      { cwd: root, encoding: "utf8", timeout: 60000 },
    );
    if (result.error) {
      lastError = result.error;
      continue;
    }
    if (result.status !== 0) {
      lastError = new Error(
        [
          `Chrome screenshot failed for ${shot.name}`,
          result.stdout.trim(),
          result.stderr.trim(),
        ].filter(Boolean).join("\n"),
      );
      continue;
    }
    try {
      assertPng(outputPath);
      return {
        name: shot.name,
        path: outputPath,
        sizeBytes: statSync(outputPath).size,
        url: new URL(shot.path, baseUrl).toString(),
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error(`Chrome screenshot failed for ${shot.name}`);
}

async function main() {
  mkdirSync(outputDir, { recursive: true });
  const chrome = findChrome();
  const shots = [
    { name: "admin-desktop", path: "/admin/markets/preview?marketUiPreview=true", size: "1440,1100" },
    { name: "market-desktop", path: "/market/preview?marketUiPreview=true", size: "1440,1100" },
    { name: "market-portfolio-desktop", path: "/market/preview?marketUiPreview=true&view=portfolio&tab=notes", size: "1440,1100" },
    { name: "market-mobile", path: "/market/preview?marketUiPreview=true", size: "390,1200" },
    { name: "market-detail-desktop", path: "/market/preview/btc-higher-21d?marketUiPreview=true", size: "1440,1100" },
    { name: "market-detail-mobile", path: "/market/preview/btc-higher-21d?marketUiPreview=true", size: "390,1200" },
  ];

  if (shouldStartServer && !(await routeReady("/market/preview?marketUiPreview=true"))) {
    startPreviewServer();
  }

  try {
    await waitForRoute("/market/preview?marketUiPreview=true");
    await waitForRoute("/market/preview/btc-higher-21d?marketUiPreview=true");
    await waitForRoute("/admin/markets/preview?marketUiPreview=true");
    const screenshots = [];
    for (const shot of shots) {
      screenshots.push(await captureScreenshot(chrome, shot));
    }
    const manifest = {
      createdAt: new Date().toISOString(),
      baseUrl,
      chrome,
      screenshots,
      previewGuard: "MARKET_UI_PREVIEW=true and NODE_ENV !== production",
    };
    const manifestPath = join(outputDir, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Market visual proof written to ${outputDir}`);
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    if (shouldStartServer) stopPreviewServer();
  }
}

await main();
