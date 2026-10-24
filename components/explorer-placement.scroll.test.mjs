import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/sidebar.css", import.meta.url), "utf8");

function page(width, height) {
  const rows = Array.from({ length: 80 }, (_, index) => `<div class="row">file-${index}</div>`).join("");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${css}
    html, body { height: 100%; margin: 0; }
    .row { height: 28px; }
  </style>
</head>
<body>
  <div class="session-sidebar" id="sidebar" style="width:${width}px;height:${height}px">
    <div class="sidebar-panel" id="session-sidebar-panel-sessions"><div>Sessions</div></div>
    <div class="sidebar-files-home">
      <div class="sidebar-panel sidebar-files-panel" id="session-sidebar-panel-files">
        <div class="sidebar-files-scroll" id="scroll">${rows}</div>
      </div>
    </div>
  </div>
  <script>
    const scroll = document.getElementById("scroll");
    const sidebar = document.getElementById("sidebar");
    document.documentElement.dataset.metrics = JSON.stringify({
      client: scroll.clientHeight,
      scroll: scroll.scrollHeight,
      sidebar: sidebar.clientHeight,
    });
  </script>
</body>
</html>`;
}

function measure(html, windowSize) {
  const url = `data:text/html,${encodeURIComponent(html)}`;
  return new Promise((resolve, reject) => {
    const child = spawn("chromium-browser", [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      `--window-size=${windowSize}`,
      "--virtual-time-budget=2000",
      "--dump-dom",
      url,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err || `chromium exited ${code}`));
        return;
      }
      const match = out.match(/data-metrics="([^"]+)"/);
      if (!match) {
        reject(new Error(err || "no layout metrics"));
        return;
      }
      resolve(JSON.parse(match[1].replaceAll("&quot;", "\"")));
    });
  });
}

test("left separate-tab explorer scroll stays inside the sidebar on desktop and a narrow viewport", async () => {
  for (const [width, height, size] of [[260, 420, "260,420"], [280, 640, "390,700"]]) {
    const metrics = await measure(page(width, height), size);
    assert.ok(metrics.scroll > metrics.client, `tree should overflow, got ${JSON.stringify(metrics)}`);
    assert.ok(metrics.client > 0, `scroll box should have a height, got ${JSON.stringify(metrics)}`);
    assert.ok(metrics.client <= metrics.sidebar, `scroll box should stay in the sidebar, got ${JSON.stringify(metrics)}`);
  }
});
