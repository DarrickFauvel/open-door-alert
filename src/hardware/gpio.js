import { EventEmitter } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LED_PATTERNS } from './led-patterns.js';

const run = promisify(execFile);

/**
 * Real hardware via the libgpiod command-line tools (`sudo apt install gpiod`).
 * No native Node modules to compile. Supports libgpiod v1 (Bookworm) and v2 (Trixie).
 *
 * Reed switch: GPIO -> switch -> GND with the internal pull-up.
 *   closed door (magnet near) = LOW, open door = HIGH (and a cut wire = HIGH = "open").
 */
export class GpioHardware extends EventEmitter {
  name = 'gpio';
  led = false;
  ledPattern = 'off';
  #monitor = null;
  #ledProc = null;
  #ledQueue = Promise.resolve();
  #blinkTimer = null;
  #stopped = false;
  #v2 = false;

  constructor({ chip, doorPin, ledPin, doorOpenHigh = true }) {
    super();
    Object.assign(this, { chip, doorPin, ledPin, doorOpenHigh });
  }

  async start() {
    const { stdout } = await run('gpioget', ['--version']);
    this.#v2 = /v2\./.test(stdout);
    const initial = await this.#read();
    this.#startMonitor();
    this.setLedPattern('off');
    return initial;
  }

  /** pattern: 'off' | 'steady' | 'slow' | 'fast' (see led-patterns.js) */
  setLedPattern(pattern) {
    const { on, blink } = LED_PATTERNS[pattern] ?? LED_PATTERNS.off;
    this.ledPattern = pattern;
    this.led = on;
    clearTimeout(this.#blinkTimer);

    if (!blink) return this.#hold(on ? 1 : 0);
    if (this.#v2) {
      // libgpiod v2 blinks by itself: gpioset -t on,off repeats until killed.
      return this.#hold(1, ['-t', `${blink[0]}ms,${blink[1]}ms`]);
    }
    // libgpiod v1 has no toggle option, so flip the line from here.
    const step = (value) => {
      this.#hold(value);
      this.#blinkTimer = setTimeout(() => step(value ? 0 : 1), blink[value ? 0 : 1]);
    };
    step(1);
  }

  /**
   * gpioset only holds a value while it runs, so keep one process alive per LED state.
   * The old process must exit (releasing the line) before a new one can claim it,
   * so changes are queued one after another.
   */
  #hold(value, extraArgs = []) {
    this.#ledQueue = this.#ledQueue.then(async () => {
      const old = this.#ledProc;
      if (old && old.exitCode === null && old.signalCode === null) {
        const exited = new Promise((resolve) => old.once('exit', resolve));
        old.kill();
        await exited;
      }
      if (this.#stopped && value) return;
      const line = `${this.ledPin}=${value}`;
      const args = this.#v2 ? [...extraArgs, '-c', this.chip, line] : ['--mode=signal', this.chip, line];
      this.#ledProc = spawn('gpioset', args, { stdio: 'ignore' });
      this.#ledProc.on('error', (err) => this.emit('error', err));
    });
    return this.#ledQueue;
  }

  /** Turns the LED off, then releases the GPIO lines. */
  async stop() {
    clearTimeout(this.#blinkTimer);
    await this.#hold(0);
    this.#stopped = true;
    this.#monitor?.kill();
    this.#ledProc?.kill();
  }

  #toOpen(high) {
    return high === this.doorOpenHigh;
  }

  async #read() {
    const args = this.#v2
      ? ['-b', 'pull-up', '-c', this.chip, String(this.doorPin)]
      : ['-B', 'pull-up', this.chip, String(this.doorPin)];
    const { stdout } = await run('gpioget', args);
    // v1 prints "1"/"0"; v2 prints "17"=active / "17"=inactive
    const high = /inactive/.test(stdout) ? false : /active/.test(stdout) || stdout.trim().endsWith('1');
    return this.#toOpen(high);
  }

  #startMonitor() {
    const args = this.#v2
      ? ['-b', 'pull-up', '--format=%E', '-c', this.chip, String(this.doorPin)]
      : ['-B', 'pull-up', '--format=%e', this.chip, String(this.doorPin)];
    const proc = spawn('gpiomon', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.#monitor = proc;

    let buffer = '';
    proc.stdout.setEncoding('utf8').on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const event = line.trim();
        if (!event) continue;
        const high = event === '1' || event === 'rising';
        this.emit('door', this.#toOpen(high));
      }
    });
    proc.stderr.setEncoding('utf8').on('data', (msg) => this.emit('error', new Error(`gpiomon: ${msg.trim()}`)));
    proc.on('error', (err) => this.emit('error', err));
    proc.on('exit', (code) => {
      if (this.#stopped) return;
      this.emit('error', new Error(`gpiomon exited (${code}), restarting in 2s`));
      setTimeout(async () => {
        if (this.#stopped) return;
        // Re-sync in case the door changed while we weren't watching.
        try {
          this.emit('door', await this.#read());
        } catch (err) {
          this.emit('error', err);
        }
        this.#startMonitor();
      }, 2000);
    });
  }
}
