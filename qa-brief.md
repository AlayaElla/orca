# QA brief — R06 Claude account removal keeps conversations (WSL, orcaqa copy)

You are the QA lead on Windows high spec. Ticket, lease and worktree: see the end of this file. End only with `DONE:`, `QUESTION:` or `FAILED:`.

## What changed (PR #43118, head 357f97cb89e)
Removing a Claude account used to `rm -rf` the account's WSL guest folder `~/.local/share/orca/claude-profiles/<id>`. Now removal deletes the sign-in, `.claude.json`, settings and every link, and keeps conversations only that account holds (`*.orca-profile-merge`, real history folders such as `projects`/`todos`, a private `history.jsonl`, `history.jsonl.orca-profile-merge*`). The dialog shows the measured size and an unchecked "Also delete conversations kept only for this account"; checked, the whole folder goes. Links into the guest's `~/.claude` are never followed. Windows-native flows already passed; this run covers the WSL path end to end.

## Rules (carry these)
- Hash the real config files before and after, for the report only; a changed hash is never a question for Brennan; if your run caused it, fix the rig's isolation and continue.
- Test the changed flows end to end through the UI to a real result. Fixture accounts only: never sign in a real Claude account, never read or copy real credentials, auth files, keychain items or tokens. Fixture `.credentials.json` holds the literal `fixture-not-a-secret`.
- WSL copies run only as `orcaqa` through `C:\ProgramData\OrcaQA\bin\start-qa.ps1` (CDP 127.0.0.1:9444), stopped only with `Set-Content C:\ProgramData\OrcaQA\state\stop stop`. Never run wsl.exe or open \\wsl$ as neil for app QA. Don't edit launch-orca.ps1.
- Drivers: `qa-drive --drivers codex` only; never Claude or Grok as a driver.
- No pattern kills, no Computer Use or OS-level input. Report and evidence in `<QA worktree>\qa-report.md`.

## Setup
1. In the QA worktree check out 357f97cb89e, install, build `dist\win-unpacked` (Windows high build notes apply), robocopy it to `C:\ProgramData\OrcaQA\app`, start with `start-qa.ps1 -Label pr-43118-wsl -Ticket <T>`.
2. Inside the run's WSL home (the launcher's per-run `/home/qa-runs/<run>`; use a `-Request` file or the app's own terminal in the copy to create files as orcaqa): create System default `~/.claude/projects/shared/chat.jsonl` (`shared chat`), `~/.claude/history.jsonl`; record sha256 of everything under `~/.claude`.
3. Seed two WSL fixture accounts through CDP `window.api.settings.set({ claudeManagedAccounts: [...] })` with `managedAuthRuntime:'wsl'`, `wslDistro:'orca-qa'`, `wslLinuxAuthPath:'<guest home>/.local/share/orca/claude-profiles/<id>/home'`, ids `wslkeep-0001` and `wsldel-0002`, emails keep-wsl@example.test / delete-wsl@example.test. For each, in the guest: `profile.json`, `home/projects.orca-profile-merge/p/conflict.jsonl` (`0123456789`), `home/todos/t.json` (`todo!`), `home/history.jsonl.orca-profile-merge-1` (`prompt`+LF), `home/.credentials.json`, `home/.claude.json`, `home/settings.json`, symlinks `home/projects -> ~/.claude/projects`, `home/history.jsonl -> ~/.claude/history.jsonl`. Expected size 22 B. Select WSL in Settings → Accounts → Account location.

## Flows
A. Keep (wslkeep): dialog shows 22 B, box unchecked; Remove account → guest folder holds only `home/` with the three kept entries (contents unchanged); credentials, .claude.json, settings, links, profile.json gone; guest `~/.claude` hashes unchanged. Screenshot.
B. Delete (wsldel): check box → "Remove account and conversations" → guest folder gone; `~/.claude` unchanged. Screenshot.
Report pass/fail with guest listings (`ls -la`, `find`), hashes, screenshots; head SHA.

## Slot
READY ticket=6172 machine=win-high slot=orcaqa CDP 9444 (fixed), helpers 9445-9459, worktree=qa-pr-43118-wsl-qg, lease_until=09:13 (the launcher renews it).
QA worktree: C:\Users\neil\orca\workspaces\orca\qa-pr-43118-wsl-qg. Check out 357f97cb89e (branch brennanb2025/account-batch-06-claude-data-retention) before building. Windows high build notes: before verify:computer-native prepend C:\Users\neil\.local\qa-python3\Scripts to PATH in that build shell only; `pnpm --dir mobile install --frozen-lockfile` before a build that runs build:mobile-web. Screenshots: `node C:\ProgramData\OrcaQA\bin\qa-shot.mjs <out.png> --port 9444`.
