import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeWeather, SCENES } from '../src/weather.js';

describe('describeWeather', () => {
  it('maps WMO codes to scenes', () => {
    assert.equal(describeWeather(0).weather, 'clear');
    assert.equal(describeWeather(2).weather, 'partly');
    assert.equal(describeWeather(45).weather, 'fog');
    assert.equal(describeWeather(53).weather, 'drizzle');
    assert.equal(describeWeather(81).weather, 'rain');
    assert.equal(describeWeather(75).weather, 'snow');
    assert.equal(describeWeather(95).weather, 'storm');
  });

  it('falls back for unknown codes', () => {
    assert.deepEqual(describeWeather(1234), { weather: 'cloudy', weatherLabel: 'Unknown', weatherIcon: '🌡️' });
  });

  it('only produces known scenes', () => {
    for (let code = 0; code < 100; code++) assert.ok(SCENES.includes(describeWeather(code).weather));
  });
});
