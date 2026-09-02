import { copyFile, mkdir, writeFile } from "node:fs/promises";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("pages-export", `${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

async function render(pathname, assetPrefix) {
  const response = await worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  if (!response.ok) {
    throw new Error(`Static export for ${pathname} failed with HTTP ${response.status}`);
  }

  return (await response.text())
    .replaceAll("/assets/", `${assetPrefix}assets/`)
    .replaceAll("/favicon.svg", `${assetPrefix}favicon.svg`);
}

const html = await render("/", "./");
const organismHtml = (await render("/memory-palace", "../"))
  .replaceAll('href="/" aria-label="返回楼栋"', 'href="../" aria-label="返回楼栋"');

await writeFile(new URL("../dist/client/index.html", import.meta.url), html);
await mkdir(new URL("../dist/client/organism/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/client/organism/index.html", import.meta.url), organismHtml);
await copyFile(
  new URL("../dist/client/index.html", import.meta.url),
  new URL("../dist/client/404.html", import.meta.url),
);

console.log("GitHub Pages artifacts written to dist/client and dist/client/organism");
