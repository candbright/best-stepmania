# Release Gate

## Required Before Release
- All unit/contract/e2e tests pass (`npm run test:reliability`).
- Rust tests pass (`cargo test`).
- No new fatal startup errors in smoke test logs.
- Critical path check completed: startup -> select -> preview -> gameplay -> save.

## Performance Budgets (warning in CI)
- Startup to app mount: <= 4000ms
- Song scan on baseline fixture: <= 8000ms
- Audio preview first response: <= 600ms

## Blocking Conditions
- Crash on startup with default config.
- Config migration fails or drops required fields.
- IPC contract drift in core command names.

## Artifacts
- Attach diagnostics zip for failed CI smoke runs.
- Include `frontend.log` and `profile-recovery.log` when relevant.
