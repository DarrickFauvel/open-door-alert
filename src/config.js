// All settings come from environment variables (or a .env file, see .env.example).

const num = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number, got "${raw}"`);
  }
  return value;
};

const str = (name, fallback = '') => process.env[name]?.trim() || fallback;

const mode = str('MODE', 'mock').toLowerCase();
if (!['mock', 'gpio'].includes(mode)) {
  throw new Error(`MODE must be "mock" or "gpio", got "${mode}"`);
}

export const config = Object.freeze({
  port: num('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  mode,

  // Hardware (BCM numbering)
  gpioChip: str('GPIO_CHIP', 'gpiochip0'),
  doorPin: num('DOOR_PIN', 17),
  ledPin: num('LED_PIN', 27),
  debounceMs: num('DEBOUNCE_MS', 50),
  // "high" for a reed switch to GND with pull-up (open contact = HIGH). Use "low" if your sensor is inverted.
  doorOpenHigh: str('DOOR_OPEN_LEVEL', 'high').toLowerCase() !== 'low',

  // Alert timing
  alertDelayS: num('ALERT_DELAY_S', 30),
  remindEveryS: num('REMIND_EVERY_S', 300),

  // ntfy push notifications
  ntfyServer: str('NTFY_SERVER', 'https://ntfy.sh').replace(/\/+$/, ''),
  ntfyTopic: str('NTFY_TOPIC'),
  ntfyToken: str('NTFY_TOKEN'),

  doorName: str('DOOR_NAME', 'Front door'),

  // Weather shown outside the open door (Open-Meteo, no API key). Leave lat/lon empty to disable.
  weatherLat: process.env.WEATHER_LAT ? Number(process.env.WEATHER_LAT) : NaN,
  weatherLon: process.env.WEATHER_LON ? Number(process.env.WEATHER_LON) : NaN,
  weatherUnits: str('WEATHER_UNITS', 'fahrenheit').toLowerCase() === 'celsius' ? 'celsius' : 'fahrenheit',
  weatherRefreshMin: Math.max(1, num('WEATHER_REFRESH_MIN', 10)),
});
