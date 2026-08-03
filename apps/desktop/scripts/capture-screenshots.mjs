import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

import { chromium } from "@playwright/test";
import { createServer } from "vite";

const desktopRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const imageDirectory = path.resolve(desktopRoot, "../../docs/images");

await mkdir(imageDirectory, { recursive: true });

const server = await createServer({
  root: desktopRoot,
  mode: "preview",
  logLevel: "error",
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
});

await server.listen();
const browser = await chromium.launch();

try {
  const page = await browser.newPage({
    colorScheme: "dark",
    deviceScaleFactor: 1,
    viewport: { width: 1440, height: 1000 },
  });

  await page.goto("http://127.0.0.1:1420/?mode=browser-preview&fixture=returning");
  await page.getByRole("heading", { name: /welcome back/i }).waitFor();
  await page.screenshot({
    animations: "disabled",
    path: path.join(imageDirectory, "dashboard.png"),
  });

  await page.getByRole("button", { name: "Quest planner", exact: true }).click();
  await page.getByLabel("Search quests").fill("plague");
  await page.getByRole("button", { name: "Run quest search" }).click();
  await page.getByRole("button", { name: /plague's end/i }).click();
  await page.getByRole("tab", { name: "Dependency route" }).waitFor();
  await page.screenshot({
    animations: "disabled",
    path: path.join(imageDirectory, "quest-route.png"),
  });

  await page.goto("http://127.0.0.1:1420/?mode=browser-preview&fixture=returning");
  await page.getByRole("button", { name: "Grand Exchange" }).click();
  await page.getByLabel("Search Grand Exchange items").fill("whip");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: /abyssal whip/i }).click();
  await page.getByRole("img", { name: /abyssal whip guide-price history/i }).waitFor();
  await page.screenshot({
    animations: "disabled",
    path: path.join(imageDirectory, "grand-exchange.png"),
  });
} finally {
  await browser.close();
  await server.close();
}
