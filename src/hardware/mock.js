import { EventEmitter } from 'node:events';
import { LED_PATTERNS } from './led-patterns.js';

/** In-memory door sensor + LED for running anywhere without a Pi. */
export class MockHardware extends EventEmitter {
  name = 'mock';
  #doorOpen = false;
  led = false;
  ledPattern = 'off';

  async start() {
    return this.#doorOpen;
  }

  /** Simulates the reed switch changing. Emits 'door' like the real driver. */
  simulateDoor(isOpen) {
    this.#doorOpen = isOpen;
    this.emit('door', isOpen);
  }

  setLedPattern(pattern) {
    this.ledPattern = pattern;
    this.led = (LED_PATTERNS[pattern] ?? LED_PATTERNS.off).on;
  }

  async stop() {}
}
