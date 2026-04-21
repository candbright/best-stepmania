# Logging Contract

## Goals
- Make frontend/runtime failures searchable and correlated.
- Keep one stable event shape across console and file sinks.

## Event Fields
- `ts`: ISO timestamp.
- `namespace`: bounded domain (`App`, `Bootstrap`, `Settings`, etc.).
- `op`: operation name.
- `severity`: `debug | info | warn | error | fatal`.
- `recoverable`: whether user can continue safely.
- `context`: structured metadata object.
- `cause`: raw error payload (string/object/error).

## Rules
- Use `logEvent()` for reliability and lifecycle events.
- Keep `op` stable; dashboards/queries depend on it.
- `fatal` must include a user-facing fallback action.
- Never throw from log sinks.

## Minimum Startup Trace
1. `Bootstrap.router.ready`
2. `Bootstrap.app.mounted`
3. `Bootstrap.theme.bridge.installed`

## Redaction
- Do not emit secrets or full user filesystem dumps.
- When logging paths, prefer app-relative paths where possible.
