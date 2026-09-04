# Server access

Who may connect to the Lightsail box that runs Coolify, how, and the rules that apply every time. This
supersedes the original ADR-001 position ("no agent ever holds SSH access to the server") — see the 2026-09-04
Revisions block in `docs/decisions/ADR-001-stack-and-structure.md` for the decision, the advisor's dissent, and
the six mitigations this file implements.

## Who

- **Soroush**: full access — AWS console, Lightsail SSH key, Coolify admin UI, the Coolify API token, DNS,
  secrets.
- **Claude Code**: may connect over SSH and the Coolify API, from Soroush's machine, under the rules below. It
  never holds the Lightsail key, never holds the Coolify API token value beyond reading it from
  `~/.41prompts/staging.env` at call time, and never sets a secret.

## Rules

1. Connect only through the `~/.ssh/config` alias `41p-box` and the values in `~/.41prompts/staging.env`
   (`COOLIFY_URL`, `COOLIFY_API_TOKEN`). Never read `~/.ssh/lightsail/` directly, never copy either file, never
   print a value from them.
2. Read-only by default: `docker ps/logs/inspect/stats`, `free`, `df`, `journalctl`, `cat` of files under
   `/data/coolify/applications/`, and `GET` calls to the Coolify API.
3. Any command that changes the box (`rm`, `docker rm/volume/exec/restart/compose`, editing a file, `apt`,
   `systemctl`, any Coolify API call other than `GET`) is shown in chat with a one-line reason and run only after
   Soroush says yes. Batch approvals are not a thing; one command, one yes.
4. Never touch `coolify`, `coolify-db`, `coolify-redis`, `coolify-realtime`, `coolify-proxy`, `coolify-sentinel`,
   or anything under `/data/coolify/` except read.
5. Every change made on the box is also made in `infra/` in the same session, or reverted before the session
   ends. Every mutating command and its approval is logged in the session file.
6. Never allow-list `ssh`, `scp`, or `curl` against the Coolify URL in Claude Code's permissions; they stay on
   per-command approval.

## Human setup (Soroush runs this once)

1. **SSH alias.** Add to `~/.ssh/config`:
   ```
   Host 41p-box
     HostName <static-ip>
     User ubuntu
     IdentityFile ~/.ssh/lightsail/LightsailDefaultKey-ca-central-1.pem
     IdentitiesOnly yes
   ```
2. **Coolify API token.** In the Coolify UI: **Keys & Tokens → API tokens** → create one with the narrowest
   permission set the UI offers (read + deploy). Never a token with root/write/sensitive scope.
3. **`~/.41prompts/staging.env`**, mode `600`, outside the repo:
   ```
   COOLIFY_URL=https://coolify.41prompts.ai
   COOLIFY_API_TOKEN=<the token from step 2>
   ```
   ```
   mkdir -p ~/.41prompts && chmod 700 ~/.41prompts
   # write the file, then:
   chmod 600 ~/.41prompts/staging.env
   ```

Claude Code reads `~/.ssh/config`'s `41p-box` entry and `~/.41prompts/staging.env`'s two values to connect; it
never asks you to paste either into chat.
