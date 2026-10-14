import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DoorMonitor, formatDuration } from '../src/door-monitor.js';

describe('DoorMonitor', () => {
  let monitor;
  let alerts;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
    monitor = new DoorMonitor({ alertDelayMs: 30_000, remindEveryMs: 60_000, debounceMs: 50 });
    alerts = [];
    monitor.on('alert', (a) => alerts.push(a));
    monitor.init(false);
  });

  // Open/close and let the debounce settle (ticked separately: mock timers jump
  // Date to the end of a tick before running timers scheduled during it).
  const set = (isOpen) => {
    monitor.input(isOpen);
    mock.timers.tick(50);
  };
  const advance = (ms, step = 1000) => {
    for (let t = 0; t < ms; t += step) mock.timers.tick(Math.min(step, ms - t));
  };

  afterEach(() => {
    monitor.stop();
    mock.timers.reset();
  });

  it('debounces bouncing contacts into one state change', () => {
    const changes = [];
    monitor.on('change', (s) => changes.push(s.door));
    monitor.input(true);
    mock.timers.tick(10);
    monitor.input(false);
    mock.timers.tick(10);
    monitor.input(true);
    mock.timers.tick(49);
    assert.equal(monitor.state, 'closed');
    mock.timers.tick(1);
    assert.equal(monitor.state, 'open');
    assert.deepEqual(changes, ['open']);
  });

  it('turns the LED on immediately but delays the alert', () => {
    set(true);
    assert.equal(monitor.snapshot().led, true);
    mock.timers.tick(29_999);
    assert.equal(alerts.length, 0);
    mock.timers.tick(1);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].kind, 'open');
    assert.match(alerts[0].message, /open for 30s/);
  });

  it('sends reminders while the door stays open', () => {
    set(true);
    advance(30_000 + 60_000 * 2);
    assert.deepEqual(alerts.map((a) => a.kind), ['open', 'reminder', 'reminder']);
    assert.equal(monitor.snapshot().alertsSent, 3);
  });

  it('escalates the LED pattern: steady, slow blink after the alert, fast with reminders', () => {
    const pattern = () => monitor.snapshot().ledPattern;
    assert.equal(pattern(), 'off');
    set(true);
    assert.equal(pattern(), 'steady');
    advance(30_000);
    assert.equal(pattern(), 'slow');
    advance(60_000);
    assert.equal(pattern(), 'fast');
    set(false);
    assert.equal(pattern(), 'off');
  });

  it('closing before the delay cancels the alert silently', () => {
    set(true);
    advance(10_000);
    set(false);
    advance(120_000);
    assert.equal(alerts.length, 0);
    assert.equal(monitor.snapshot().led, false);
  });

  it('sends a "closed" alert if an open alert already went out', () => {
    set(true);
    advance(45_000);
    set(false);
    assert.deepEqual(alerts.map((a) => a.kind), ['open', 'closed']);
    assert.match(alerts[1].message, /45s/);
  });

  it('reports open seconds and countdown in snapshots', () => {
    set(true);
    advance(12_000);
    const s = monitor.snapshot();
    assert.equal(s.openSeconds, 12);
    assert.equal(s.alertIn, 18);
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    assert.equal(formatDuration(5_000), '5s');
    assert.equal(formatDuration(134_000), '2m 14s');
    assert.equal(formatDuration(3_780_000), '1h 3m');
  });
});
