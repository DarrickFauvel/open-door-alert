import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';

import { config } from './config.js';
import { DoorMonitor } from './door-monitor.js';
import { createHardware } from './hardware/index.js';
import { createNtfy } from './notify/ntfy.js';
import { Weather, SCENES } from './weather.js';
import * as sse from './sse.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const eta = new Eta({ views: path.join(root, 'views'), cache: process.env.NODE_ENV === 'production' });

const hardware = createHardware(config);
const ntfy = createNtfy({ server: config.ntfyServer, topic: config.ntfyTopic, token: config.ntfyToken });
const weather = new Weather({
  lat: config.weatherLat,
  lon: config.weatherLon,
  units: config.weatherUnits,
  refreshMin: config.weatherRefreshMin,
});
const monitor = new DoorMonitor({
  alertDelayMs: config.alertDelayS * 1000,
  remindEveryMs: config.remindEveryS * 1000,
  debounceMs: config.debounceMs,
  doorName: config.doorName,
});

/** Notifications shown on the simulated phone (newest first). */
const notifications = [];
let notificationId = 0;

// ---------- view helpers ----------

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const viewData = () => ({
  config,
  ntfyConfigured: ntfy.configured,
  log: monitor.logEntries,
  notifications,
  fmtTime,
  scenes: SCENES,
});

const render = (name, data = viewData()) => eta.render(name, data);

const signals = (snapshot = monitor.snapshot()) => ({
  ...snapshot,
  alertDelay: config.alertDelayS,
  mode: hardware.name,
  ntfy: ntfy.configured,
  ...weather.state,
});

const logPatch = () => sse.patchElements(render('./partials/log'));
const phonePatch = () => sse.patchElements(render('./partials/notifications'));

// ---------- wiring: sensor -> monitor -> LED / dashboards / phone ----------

hardware.on('door', (isOpen) => monitor.input(isOpen, 'sensor'));
hardware.on('error', (err) => monitor.log('error', err.message));

monitor.on('change', (snapshot) => {
  hardware.setLedPattern(snapshot.ledPattern);
  sse.broadcast(sse.patchSignals(signals(snapshot)));
});
monitor.on('log', () => sse.broadcast(logPatch()));
monitor.on('alert', (alert) => deliver(alert));

weather.on('change', (state) => sse.broadcast(sse.patchSignals(state)));
weather.on('log', (level, text) => monitor.log(level, text));

async function deliver(alert) {
  const note = { id: ++notificationId, ...alert, status: 'sending' };
  notifications.unshift(note);
  notifications.length = Math.min(notifications.length, 6);
  sse.broadcast(phonePatch());

  const result = await ntfy.send(alert);
  note.status = result.status;
  if (result.status === 'failed') monitor.log('error', `Push failed: ${result.error}`);
  else monitor.log(alert.kind === 'closed' ? 'info' : 'alert', `Phone alert ${result.status}: ${alert.title}`);
  sse.broadcast(phonePatch());
}

// Keep the open-door timer ticking on dashboards.
setInterval(() => {
  if (monitor.state === 'open' && sse.clientCount() > 0) {
    const { openSeconds, alertIn } = monitor.snapshot();
    sse.broadcast(sse.patchSignals({ openSeconds, alertIn }));
  }
}, 1000).unref();

// ---------- HTTP ----------

function simulate(isOpen) {
  if (hardware.name === 'mock') hardware.simulateDoor(isOpen);
  else monitor.input(isOpen, 'manual override');
}

const routes = {
  'GET /': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(render('./index', { ...viewData(), signals: signals() }));
  },

  'GET /sse': (req, res) => {
    sse.openStream(req, res);
    sse.send(res, sse.patchSignals(signals()), logPatch(), phonePatch());
  },

  'POST /api/door/open': () => simulate(true),
  'POST /api/door/close': () => simulate(false),
  'POST /api/door/toggle': () => simulate(monitor.state !== 'open'),

  'POST /api/alert/test': () => {
    monitor.log('info', 'Test alert requested');
    deliver({
      kind: 'test',
      title: 'Test alert',
      message: `Open Door Alert is working. You'll be notified if the ${config.doorName.toLowerCase()} stays open.`,
      priority: 3,
      tags: ['test_tube'],
      time: new Date().toISOString(),
    });
  },
};

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

async function serveStatic(pathname, res) {
  const file = path.join(publicDir, path.normalize(pathname.slice('/public'.length)));
  if (!file.startsWith(publicDir + path.sep)) return false;
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    const route = routes[`${req.method} ${pathname}`];
    if (route) {
      if (req.method === 'POST') {
        req.resume(); // Datastar sends signals as the body; we don't need them.
        await route(req, res);
        if (!res.headersSent) res.writeHead(204).end();
      } else {
        await route(req, res);
      }
      return;
    }
    if (req.method === 'GET' && pathname.startsWith('/public/') && (await serveStatic(pathname, res))) return;
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Server error');
  }
});

// ---------- startup / shutdown ----------

monitor.on('log', (e) => console.log(`[${e.level}] ${e.text}`));

try {
  monitor.init(await hardware.start());
} catch (err) {
  console.error(`Failed to start ${hardware.name} hardware: ${err.message}`);
  if (hardware.name === 'gpio') console.error('Is libgpiod installed? sudo apt install gpiod');
  process.exit(1);
}

weather.start();
if (!weather.configured) monitor.log('info', 'WEATHER_LAT/WEATHER_LON not set, outside shows day/night only');
if (!ntfy.configured) monitor.log('warn', 'NTFY_TOPIC not set, phone alerts run in dry-run mode');

server.listen(config.port, config.host, () => {
  console.log(`Open Door Alert (${hardware.name} mode) on http://localhost:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    monitor.stop();
    weather.stop();
    hardware.setLedPattern('off');
    await hardware.stop();
    server.close();
    process.exit(0);
  });
}
