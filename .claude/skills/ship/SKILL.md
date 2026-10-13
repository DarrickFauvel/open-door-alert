---
name: ship
description: Verify, commit, push and open/update a GitHub PR for Open Door Alert; optionally deploy to the Raspberry Pi with "pi".
argument-hint: "[pi] [commit/PR summary]"
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *), Bash(npm test*), Bash(npm ci*), Bash(node *), Bash(curl *), Bash(rsync *), Bash(ssh *)
---

# /ship: verify, commit, push, PR (and optionally deploy to the Pi)

Arguments: `$ARGUMENTS`
- If the arguments contain the word `pi`, also run the **Deploy to Pi** section.
- Any other text is the user's summary of the change. Use it for the commit message and PR title.

Current state:
- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Ahead of origin: !`git log --oneline @{u}..HEAD 2>/dev/null || echo "(no upstream)"`
- Open PR for this branch: !`gh pr view --json number,url,state -q '"#\(.number) \(.state) \(.url)"' 2>/dev/null || echo none`

## 1. Verify. Stop on any failure.

1. Run `npm test`. If it fails, show the failures and stop. Never ship red.
2. Smoke-test the real server on a spare port:
   ```sh
   MODE=mock PORT=3999 node src/server.js &  # background
   ```
   - Wait until `curl -s http://localhost:3999/` returns 200 and contains `datastar`.
   - `curl -sN --max-time 2 http://localhost:3999/sse` must contain `datastar-patch-signals`.
   - `curl -s -X POST -o /dev/null -w "%{http_code}" http://localhost:3999/api/door/toggle` must return `204`.
   - Stop the smoke-test server afterwards: kill the process you started, not other node processes.
3. Read `git diff` and `git status`, including untracked files.
   - Make sure no secrets get committed: `.env`, ntfy topics or tokens, keys. `.env` must stay gitignored.
   - Make sure `node_modules/` isn't staged.
   - If you find anything suspicious, stop and ask.

## 2. Commit

- If there is nothing to commit and nothing to push, say so and skip to step 3 (or straight to deploy if `pi` was given).
- If the current branch is `main`, create a branch first: `git switch -c <type>/<short-kebab-summary>` (for example `feat/quiet-hours`).
- Stage the relevant files by name rather than `git add -A`, so that stray files aren't committed.
- Write a conventional-commit style message (`feat:`, `fix:`, `docs:`, `chore:` …):
  - A summary line under 72 characters.
  - A short body saying what changed and why.
  - Follow the session's commit attribution guidance.

## 3. Push and PR

- `git push -u origin <branch>`.
- If this branch has no PR, run `gh pr create --base main` with:
  - a title (the user's summary if given);
  - a body with **Summary** (bullets), **Testing** (what you ran in step 1, with results), and, for hardware changes, **Hardware notes** (pins and wiring affected; whether it was tested on a real Pi);
  - the session's PR attribution guidance.
- If a PR already exists, just push. Mention the PR URL and add a comment only if the change is significant.
- Never force-push and never push directly to `main` unless the user explicitly asks.

## 4. Deploy to Pi (only when `pi` is in the arguments)

Settings, read from the environment or from `.env` (`grep` it, and never print token values):
- `PI_HOST`, default `pi@raspberrypi.local`
- `PI_DIR`, default `~/open-door-alert`

1. Check connectivity: `ssh -o ConnectTimeout=5 -o BatchMode=yes $PI_HOST true`. If it fails, report it and explain how to set up key auth (`ssh-copy-id $PI_HOST`). Don't prompt for passwords.
2. Sync the code. This excludes local-only files, and the Pi keeps its own `.env`:
   ```sh
   rsync -az --delete --exclude node_modules --exclude .git --exclude .env --exclude .claude ./ $PI_HOST:$PI_DIR/
   ```
3. Install dependencies and restart:
   ```sh
   ssh $PI_HOST "cd $PI_DIR && npm ci --omit=dev && sudo systemctl restart door-alert"
   ```
   - If the `door-alert` unit doesn't exist yet, show the install steps from `deploy/door-alert.service` and ask before running anything with `sudo` beyond the restart.
4. Health check:
   - `ssh $PI_HOST "systemctl is-active door-alert && journalctl -u door-alert -n 15 --no-pager"`
   - `curl -s -o /dev/null -w "%{http_code}" http://<pi-host>:3000/` should return 200.
5. Remind the user to physically check the door: open it, confirm the LED lights, and confirm the phone alert arrives after `ALERT_DELAY_S`.

## 5. Report

Give a short summary:
- the test and smoke results;
- the commit hash and branch;
- the PR URL;
- deploy status, if `pi` was given;
- anything skipped and why.
