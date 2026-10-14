# open-door-alert

A Raspberry Pi 3 watches the front door with a magnetic reed switch. When the door opens, a **red LED by the door** lights up right away. If the door stays open longer than `ALERT_DELAY_S`, a **push notification goes to your phone** through [ntfy](https://ntfy.sh), with reminders until the door closes.

The LED escalates the longer the door stays open:

| Stage | LED |
|---|---|
| Door opens | steady |
| Phone alert sent | slow blink (0.6 s on / 0.6 s off) |
| Reminders | fast blink (0.15 s) |

The timings are in `src/hardware/led-patterns.js`.

The web dashboard (Node + Eta + [Datastar](https://data-star.dev) v1.0.4) shows the door, the LED, a simulated phone, and a live wiring diagram. In `mock` mode the dashboard also simulates the door, so you can run everything on a laptop with no hardware.

```
reed switch ──► gpiomon ──► DoorMonitor ──► LED (gpioset)
                 (debounce, timers)        ├─► ntfy push ─► phone
                                           └─► SSE ─► dashboard(s)
```

## Quick start (any computer, simulator)

```sh
npm install
cp .env.example .env        # optional
ALERT_DELAY_S=5 npm run dev # http://localhost:3000
```

Click **Open door**, or press <kbd>D</kbd>. The LED and circuit react immediately, and after 5 s the simulated phone gets an alert. `npm test` runs the state-machine tests.

## Phone alerts (ntfy)

1. Install the **ntfy** app (Android / iOS).
2. Pick a hard-to-guess topic: `openssl rand -hex 12`. Topics on ntfy.sh are public, so anyone who knows the name can read it.
3. In the app, subscribe to that topic, then set `NTFY_TOPIC=<topic>` in `.env`.
4. Press **Send test alert** on the dashboard.

Open-door alerts are sent at high priority (4). Reminders are sent at max priority (5), which breaks through Do Not Disturb if you allow it in the app.

## Wiring (Raspberry Pi 3, BCM numbering)

| Part | From | To |
|---|---|---|
| Magnetic reed switch (frame) + magnet (door) | Pin 11 · GPIO17 | Pin 9 · GND |
| 330 Ω resistor → red 5 mm LED (long leg = +) | Pin 13 · GPIO27 | LED short leg → Pin 14 · GND |

```
GPIO17 ──────/ ─────── GND     internal pull-up: door closed = LOW, open = HIGH
GPIO27 ──[330Ω]──▶|─── GND     ≈ 4 mA, safe for a GPIO pin
```

A broken or cut sensor wire reads HIGH, which counts as "open", so a wiring fault raises an alert instead of going unnoticed. If your sensor works the other way round, set `DOOR_OPEN_LEVEL=low`.

## Running on the Pi

```sh
sudo apt install gpiod nodejs npm     # Node >= 22.9 (or install from NodeSource)
sudo usermod -aG gpio $USER           # access to /dev/gpiochip0 without sudo
git clone <this repo> ~/open-door-alert && cd ~/open-door-alert
npm ci --omit=dev
cp .env.example .env && nano .env     # MODE=gpio, NTFY_TOPIC=...
npm start                             # http://<pi-ip>:3000
```

GPIO is driven with the libgpiod command-line tools (`gpioget`, `gpiomon`, `gpioset`), so there are no native Node modules to compile. libgpiod v1 (Bookworm) and v2 (Trixie) are both supported. To run it as a service on boot, use `deploy/door-alert.service`; edit `User` and `WorkingDirectory` to match your setup.

## Configuration

See [`.env.example`](.env.example): `MODE`, `PORT`, `DOOR_PIN`, `LED_PIN`, `DOOR_OPEN_LEVEL`, `DEBOUNCE_MS`, `ALERT_DELAY_S`, `REMIND_EVERY_S` (0 = no reminders), `NTFY_SERVER`, `NTFY_TOPIC`, `NTFY_TOKEN`, `DOOR_NAME`, `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_UNITS`, `WEATHER_REFRESH_MIN`.

## Live weather outside the door

The door's top half is glass, and opening it shows the current weather outside: clear, partly cloudy, overcast, fog, drizzle, rain, snow or thunderstorm, by day or night. The data comes from [Open-Meteo](https://open-meteo.com), which is free and needs no API key; it refreshes every 10 minutes. Set `WEATHER_LAT` / `WEATHER_LON` to your house's coordinates. Without them the scene only follows day and night. Use the **Preview weather** dropdown on the dashboard to try every scene.

## Project layout

```
src/server.js          HTTP routes, SSE, wiring
src/door-monitor.js    debounce + alert/reminder state machine
src/hardware/          mock.js (simulator), gpio.js (libgpiod)
src/notify/ntfy.js     push notifications
src/weather.js         Open-Meteo current weather -> scene
src/sse.js             Datastar SSE event helpers
views/                 Eta templates (dashboard, circuit SVG, log, phone)
public/                CSS, favicon, tiny clock script
```

## Ideas / next steps

- **Heartbeat:** ping [healthchecks.io](https://healthchecks.io) every minute, so you get an alert if the Pi loses power or Wi-Fi. Without one, a dead Pi looks the same as a closed door.
- **Arm / disarm and quiet hours**, so the door can stay open while you're in the garden.
- **Piezo buzzer** on another GPIO, for a local beep after N seconds.
- **Security:** the dashboard has no login. Keep it LAN-only or reach it over Tailscale/WireGuard, and use a self-hosted ntfy server or an access token.
- **History:** log open/close events to SQLite and chart how often and how long the door is open.
- **Home Assistant / MQTT** bridge; support for more doors and windows.
- **Hardware:** a wired, surface-mount reed sensor with twisted-pair cable for long runs; a small UPS HAT.
