import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the building route interface", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>楼栋路径复刻器 · AV Interactive<\/title>/i);
  assert.match(html, /完整行进记录/);
  assert.match(html, /44<\/b> 轨迹事件/);
  assert.match(html, /4<\/b> 硬阻隔/);
  assert.match(html, /锁闭条件已强制启用/);
  assert.match(html, /2F 无电梯点位 · 原路折返/);
  assert.match(html, /找到正确房门/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("keeps the spatial graph separate from rendering and playback UI", async () => {
  const [data, scene, interfaceSource, packageJson] = await Promise.all([
    readFile(new URL("../app/spatial-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/BuildingScene.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/InteractiveModel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(data, /SPATIAL_NODES/);
  assert.match(data, /SPATIAL_CONNECTIONS/);
  assert.match(data, /ROUTE_EVENTS/);
  assert.match(data, /traversable:\s*bridgeOpen/);
  assert.match(scene, /from "three"/);
  assert.match(scene, /OrbitControls/);
  assert.match(interfaceSource, /floorFocus/);
  assert.match(interfaceSource, /STRICT ROUTE SEQUENCE/);
  assert.match(packageJson, /"three": "\^0\.185\.1"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
