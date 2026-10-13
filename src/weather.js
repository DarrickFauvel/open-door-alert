import { EventEmitter } from 'node:events';

/**
 * Current weather from Open-Meteo (free, no API key): https://open-meteo.com
 * Emits 'change' with { weather, isDay, weatherLabel, weatherIcon, temp, weatherLive }.
 * Without coordinates it only tracks day/night from the local clock.
 */

// WMO weather codes -> scene + label. https://open-meteo.com/en/docs (WMO Weather interpretation codes)
const CODES = [
  [[0], 'clear', 'Clear', '☀️'],
  [[1], 'clear', 'Mainly clear', '🌤️'],
  [[2], 'partly', 'Partly cloudy', '⛅'],
  [[3], 'cloudy', 'Overcast', '☁️'],
  [[45, 48], 'fog', 'Fog', '🌫️'],
  [[51, 53, 55, 56, 57], 'drizzle', 'Drizzle', '🌦️'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'rain', 'Rain', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'snow', 'Snow', '🌨️'],
  [[95, 96, 99], 'storm', 'Thunderstorm', '⛈️'],
];

export const SCENES = ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'storm'];

export function describeWeather(code) {
  const match = CODES.find(([codes]) => codes.includes(code));
  const [, weather, weatherLabel, weatherIcon] = match ?? [null, 'cloudy', 'Unknown', '🌡️'];
  return { weather, weatherLabel, weatherIcon };
}

const localIsDay = () => {
  const h = new Date().getHours();
  return h >= 7 && h < 19;
};

export class Weather extends EventEmitter {
  #timer = null;
  #failed = false;

  constructor({ lat, lon, units = 'celsius', refreshMin = 10 }) {
    super();
    Object.assign(this, { lat, lon, units, refreshMin });
    this.configured = Number.isFinite(lat) && Number.isFinite(lon);
    this.state = {
      weather: 'clear',
      isDay: localIsDay(),
      weatherLabel: this.configured ? 'Loading weather…' : 'Weather not configured',
      weatherIcon: '🌡️',
      temp: '',
      weatherLive: false,
    };
  }

  start() {
    this.refresh();
    this.#timer = setInterval(() => this.refresh(), this.refreshMin * 60_000);
    this.#timer.unref();
  }

  stop() {
    clearInterval(this.#timer);
  }

  async refresh() {
    if (!this.configured) return this.#update({ isDay: localIsDay() });

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: this.lat,
      longitude: this.lon,
      current: 'temperature_2m,weather_code,is_day',
      temperature_unit: this.units,
    });
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { current } = await res.json();
      if (this.#failed) this.emit('log', 'info', 'Weather updates restored');
      this.#failed = false;
      this.#update({
        ...describeWeather(current.weather_code),
        isDay: current.is_day === 1,
        temp: `${Math.round(current.temperature_2m)}°${this.units === 'fahrenheit' ? 'F' : 'C'}`,
        weatherLive: true,
      });
    } catch (err) {
      // Keep the last known weather; only log the first failure in a row.
      if (!this.#failed) this.emit('log', 'warn', `Weather update failed: ${err.message}`);
      this.#failed = true;
    }
  }

  #update(patch) {
    const next = { ...this.state, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.state)) return;
    this.state = next;
    this.emit('change', next);
  }
}
