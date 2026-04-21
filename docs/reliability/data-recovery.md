# Data Recovery Runbook

## Scope
- `profiles.db` open failures during app startup.
- Corrupted SQLite file recovery and fallback behavior.

## Current Recovery Flow
1. Try open `profiles.db`.
2. If failed, rename to `profiles.db.corrupt.<timestamp>`.
3. Try recreate on disk.
4. If recreate fails, fallback to in-memory DB.
5. Append steps to `profile-recovery.log`.

## Operator Checks
- Confirm `profiles.db` exists and app can read/write `data_dir`.
- Inspect `profile-recovery.log` for `open_failed`, `recreate_on_disk_ok`, or fallback markers.
- If fallback happened repeatedly, collect diagnostics zip and attach to issue.

## User Impact
- Recreated DB means historical scores may be unavailable unless recoverable from backup.
- In-memory fallback is temporary for this launch and not durable.

## Escalation Package
- `profile-recovery.log`
- `profiles.db.corrupt.*`
- diagnostics zip from app (`export_diagnostics`)
