/**
 * Minimal Datastar v1 server-sent-events helpers.
 * https://data-star.dev/reference/sse_events
 */

const clients = new Set();

export function openStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
  return res;
}

export const clientCount = () => clients.size;

function event(type, lines) {
  return `event: ${type}\n${lines.map((l) => `data: ${l}`).join('\n')}\n\n`;
}

export function patchSignals(signals) {
  return event('datastar-patch-signals', [`signals ${JSON.stringify(signals)}`]);
}

/** Patch HTML. Default mode "outer" morphs elements matched by their id. */
export function patchElements(html, { selector, mode } = {}) {
  const lines = [];
  if (selector) lines.push(`selector ${selector}`);
  if (mode) lines.push(`mode ${mode}`);
  for (const line of html.trim().split('\n')) lines.push(`elements ${line}`);
  return event('datastar-patch-elements', lines);
}

export function send(res, ...events) {
  res.write(events.join(''));
}

export function broadcast(...events) {
  const payload = events.join('');
  for (const res of clients) res.write(payload);
}
