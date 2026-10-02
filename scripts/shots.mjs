// Screenshots of the built app, offline. Usage: node scripts/shots.mjs [query ...]
// Each query (e.g. "demo=det-aa") is shot in light/dark at phone and desktop size into shots/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const queries = process.argv.slice(2).length ? process.argv.slice(2) : [''];
const port = 4173;
const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { shell: true, stdio: 'ignore' });
mkdirSync('shots', { recursive: true });
try {
  const browser = await chromium.launch();
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  for (const q of queries) {
    for (const scheme of ['light', 'dark']) {
      for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
        const page = await browser.newPage({ viewport, colorScheme: scheme });
        // Offline: anything not served by the local preview server is blocked.
        await page.route((url) => url.hostname !== '127.0.0.1', (route) => route.abort());
        await page.goto(`http://127.0.0.1:${port}/?${q}`);
        await page.waitForTimeout(800);
        const file = `shots/${q.replace(/[^a-z0-9-]+/gi, '_') || 'home'}-${scheme}-${name}.png`;
        await page.screenshot({ path: file });
        console.log(file);
        await page.close();
      }
    }
  }
  await browser.close();
} finally {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
  else server.kill();
}
