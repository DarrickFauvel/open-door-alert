import { EventEmitter } from 'node:events';

/**
 * Door state machine.
 *
 * - `input(isOpen)` takes raw sensor readings and debounces them.
 * - On open: LED turns on (steady) right away ('change') and an alert timer starts.
 * - The LED pattern escalates: slow blink after the first alert, fast blink with reminders.
 * - After `alertDelayMs` an 'alert' is emitted, then again every `remindEveryMs`.
 * - On close: timers stop; if an alert already went out, a "closed" alert follows.
 *
 * Events: 'change' (snapshot), 'alert' ({ kind, title, message, priority, tags }),
 *         'log' ({ id, time, level, text })
 */
export class DoorMonitor extends EventEmitter {
  #state = 'closed';
  #openedAt = null;
  #alertsSent = 0;
  #debounceTimer = null;
  #alertTimer = null;
  #reminderTimer = null;
  #logId = 0;

  constructor({ alertDelayMs, remindEveryMs, debounceMs = 0, doorName = 'Front door', logSize = 50 }) {
    super();
    this.alertDelayMs = alertDelayMs;
    this.remindEveryMs = remindEveryMs;
    this.debounceMs = debounceMs;
    this.doorName = doorName;
    this.logSize = logSize;
    this.logEntries = [];
  }

  get state() {
    return this.#state;
  }

  /** Set the state at startup without firing alerts for a door that was already open. */
  init(isOpen) {
    this.#state = isOpen ? 'open' : 'closed';
    if (isOpen) {
      this.#openedAt = Date.now();
      this.#startAlertTimer();
    }
    this.log('info', `Monitoring started, ${this.doorName.toLowerCase()} is ${this.#state}`);
    this.emit('change', this.snapshot());
  }

  /** Raw sensor reading. Debounced so a bouncing reed contact counts as one event. */
  input(isOpen, source = 'sensor') {
    clearTimeout(this.#debounceTimer);
    if (this.debounceMs <= 0) return this.#apply(isOpen, source);
    this.#debounceTimer = setTimeout(() => this.#apply(isOpen, source), this.debounceMs);
  }

  snapshot() {
    const open = this.#state === 'open';
    const openMs = open ? Date.now() - this.#openedAt : 0;
    return {
      door: this.#state,
      led: open,
      // Escalates: steady until the phone alert, slow blink after it, fast once reminders start.
      ledPattern: !open ? 'off' : this.#alertsSent === 0 ? 'steady' : this.#alertsSent === 1 ? 'slow' : 'fast',
      openSeconds: Math.floor(openMs / 1000),
      alertIn: open && this.#alertsSent === 0 ? Math.max(0, Math.ceil((this.alertDelayMs - openMs) / 1000)) : 0,
      alertsSent: this.#alertsSent,
    };
  }

  log(level, text) {
    const entry = { id: ++this.#logId, time: new Date().toISOString(), level, text };
    this.logEntries.unshift(entry);
    this.logEntries.length = Math.min(this.logEntries.length, this.logSize);
    this.emit('log', entry);
    return entry;
  }

  stop() {
    clearTimeout(this.#debounceTimer);
    this.#clearAlertTimers();
  }

  #apply(isOpen, source) {
    const next = isOpen ? 'open' : 'closed';
    if (next === this.#state) return;
    this.#state = next;
    const via = source === 'sensor' ? '' : ` (${source})`;

    if (isOpen) {
      this.#openedAt = Date.now();
      this.#alertsSent = 0;
      this.log('warn', `${this.doorName} opened${via}, LED on`);
      this.#startAlertTimer();
    } else {
      const openFor = formatDuration(Date.now() - this.#openedAt);
      this.#clearAlertTimers();
      this.log('info', `${this.doorName} closed after ${openFor}${via}, LED off`);
      if (this.#alertsSent > 0) {
        this.#emitAlert({
          kind: 'closed',
          title: `${this.doorName} closed`,
          message: `${this.doorName} was closed after being open for ${openFor}.`,
          priority: 3,
          tags: ['white_check_mark', 'door'],
        });
      }
      this.#openedAt = null;
    }
    this.emit('change', this.snapshot());
  }

  #startAlertTimer() {
    this.#clearAlertTimers();
    this.#alertTimer = setTimeout(() => {
      this.#sendOpenAlert('open');
      if (this.remindEveryMs > 0) {
        this.#reminderTimer = setInterval(() => this.#sendOpenAlert('reminder'), this.remindEveryMs);
      }
    }, this.alertDelayMs);
  }

  #clearAlertTimers() {
    clearTimeout(this.#alertTimer);
    clearInterval(this.#reminderTimer);
    this.#alertTimer = this.#reminderTimer = null;
  }

  #sendOpenAlert(kind) {
    this.#alertsSent++;
    const openFor = formatDuration(Date.now() - this.#openedAt);
    this.#emitAlert({
      kind,
      title: kind === 'reminder' ? `Reminder: ${this.doorName} still open` : `${this.doorName} is open!`,
      message: `${this.doorName} has been open for ${openFor}.`,
      priority: kind === 'reminder' ? 5 : 4,
      tags: ['rotating_light', 'door'],
    });
    this.emit('change', this.snapshot());
  }

  #emitAlert(alert) {
    this.emit('alert', { ...alert, time: new Date().toISOString() });
  }
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
