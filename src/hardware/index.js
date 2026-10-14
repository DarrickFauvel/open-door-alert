import { MockHardware } from './mock.js';
import { GpioHardware } from './gpio.js';

export function createHardware(config) {
  if (config.mode === 'gpio') {
    return new GpioHardware({
      chip: config.gpioChip,
      doorPin: config.doorPin,
      ledPin: config.ledPin,
      doorOpenHigh: config.doorOpenHigh,
    });
  }
  return new MockHardware();
}
