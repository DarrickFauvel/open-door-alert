---
name: dev
description: Start the Open Door Alert dev server in simulator mode, with tests and a smoke check. Use when the user wants to run, start, or try the app locally.
argument-hint: "[ENV=value ...]  e.g. ALERT_DELAY_S=10 PORT=3001"
disable-model-invocation: true
allowed-tools: Bash(npm install*), Bash(npm test*), Bash(npm run dev*), Bash(curl *), Bash(lsof *), Bash(ss *)
---

# /dev: run Open Door Alert locally

Current state:
- Dependencies installed: !`test -d node_modules && echo yes || echo no`
- Something already on port 3000: !`(curl -s -o /dev/null -w "%{http_code}" --max-time 1 http://localhost:3000/ || true) | grep -q 200 && echo yes || echo no`

Extra environment overrides from the user: `$ARGUMENTS`

## Steps

1. **Dependencies.** If `node_modules` is missing, run `npm install`.
2. **Tests.** Run `npm test`. If anything fails, show the failing test output, stop, and offer to fix it. Do not start the server.
3. **Port.** The default is `PORT=3000` unless the overrides set it. If that port is already serving the app, tell the user the server is probably already running (often from an earlier `/dev`) and ask whether to reuse it or start on another port. Don't kill processes you didn't start.
4. **Start.** Use the Bash tool with `run_in_background: true`. Default to simulator mode with a short alert delay so the flow is quick to try:
   ```sh
   MODE=mock ALERT_DELAY_S=5 REMIND_EVERY_S=20 <user overrides> npm run dev
   ```
   User overrides take precedence over these defaults. `npm run dev` uses `node --watch` and loads `.env` if one exists.
5. **Smoke check.** Poll until `curl -s http://localhost:<port>/` returns 200, for at most about 10 s. Then check that the Datastar stream works:
   `curl -sN --max-time 2 http://localhost:<port>/sse | head -3` should begin with `event: datastar-patch-signals`.
6. **Report.** Keep it short:
   - URL: `http://localhost:<port>`. In a Codespace, mention that the forwarded port appears in the Ports tab.
   - Mode, alert delay, and whether ntfy is live or dry-run (dry-run when `NTFY_TOPIC` is unset).
   - How to use it: click **Open door** or press **D**, and **Send test alert** to test the phone notification.
   - The server reloads on file changes, and it is still running in the background.
