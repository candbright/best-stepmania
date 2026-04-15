---
description: 
alwaysApply: true
---

# Best-StepMania Agent Guide

A StepMania-style rhythm game: **Tauri + Vue 3 + TypeScript** frontend, **Rust** engine (`src-tauri/` + `crates/`).

---

## Build, Lint & Test Commands

### Frontend
```bash
npm run dev              # Vite dev server (http://localhost:1420)
npm run build            # vue-tsc --noEmit && vite build (full type-check)
npm run preview          # Preview production build
```

### Tauri (full app)
```bash
npm run tauri dev        # Dev mode (run alongside web server)
npm run tauri build      # Release build
```

### Rust
```bash
cargo check              # Quick compile check
cargo build              # Build
cargo test               # Run all tests
cargo test -p sm-chart   # Run tests for single crate
cargo test -p sm-score   # Run scoring tests
cargo test -p sm-profile # Run profile/DB tests
cargo clippy             # Lint
cargo clippy --fix -W clippy::pedantic  # Auto-fix pedantic lints
```

---

## Code Style

### TypeScript / Vue 3

- **Strict mode** (`strict: true`) — no `any`, no implicit any/returns
- **Unused code**: `noUnusedLocals: true`, `noUnusedParameters: true`
- **Path alias**: `@/` → `src/`. Use `import Foo from "@/path/foo"` NOT relative paths
- **Composition API only**: `<script setup lang="ts">`. Never Options API
- **File naming**:
  - `camelCase` for utilities, stores, composables
  - `PascalCase` for Vue components
  - `kebab-case` for screen subdirectories
- **API layer**: All IPC goes through `src/api/`. Never call `invoke()` outside the API layer
- **Stores**: Pinia Composition API. Import specific sub-stores directly (not `game.ts` facade)
- **Error handling**: `try/catch` on all async API calls. User-facing errors via toast/status

### Rust

- **Edition 2021**. Use `async/await`, `.await?` chaining
- **Serialization**: All IPC structs use `#[serde(rename_all = "camelCase")]`
- **IPC errors**: Return `Result<T, String>`. Chain with `.map_err(|e| e.to_string())?`
- **No `unwrap()` / `expect()` on user data**: Only on internal invariants
- **Error types**: Prefer `thiserror` in library crates. Use `AppError` enum in `error.rs` for IPC boundary
- **Module structure**: `src-tauri/src/commands/` — one file per command group. `lib.rs` handles state + registration
- **Crate naming**: `sm-*` prefix (snake_case). `sm-noteskin`, not `sm-note-skin`
- **Mutex on state**: All `AppState` fields use `Mutex`. Prefer `parking_lot::Mutex` if contention occurs
- **No `clone()` on hot paths**: Pass references or `Arc<T>` instead

### General

- **No `console.log` in hot paths**: Use `console.warn` / `console.error`
- **No premature optimization**: Profile first. "Correct and slow" beats "fast and wrong"
- **Keep functions small**: Single responsibility. Split if a comment is needed to explain *what* it does
- **Null handling**: Use `??`, `?.`, `?.()` operators. Avoid `|| {}` traps
- **Comments**: Write code that explains itself. Comments on *why*, not *what*

---

## Frontend Architecture (Componentization)

### Layer Responsibilities
| Layer | Responsibility |
|-------|---------------|
| **Pages** (`src/screens/`) | Composition shell, route-level logic, minimal presentation |
| **Components** (`src/components/`) | Display, local interaction, props/emits |
| **Composables** (`src/composables/`, `src/screens/*/`) | Complex reusable logic, local state |
| **Stores** (`src/stores/`) | Global shared state only |
| **Services** (`src/services/`) | Business logic, data transformation |
| **Utils** (`src/utils/`) | Pure helper functions |
| **API** (`src/api/`) | Tauri IPC wrappers only |

### Key Principles
- **Pages = composition**: Pages should mostly assemble components, not contain business logic
- **Tauri calls unified**: All `invoke()`, events, window control, fs access → `src/api/` only. Never scatter in components
- **Global state → Pinia**: Only shared state across screens goes in stores
- **Local state → composables**: Page-specific state stays in page or its composables
- **No over-splitting**: Keep reasonable granularity. Extract when there's clear reuse or clarity benefit
- **Don't break contracts**: Never change existing Tauri IPC contracts or function signatures

### Code Smells to Avoid
- Giant pages with mixed responsibilities
- Duplicate templates, logic, or styles
- Store overloading (everything in one store)
- Components directly manipulating global state
- Tauri calls scattered in multiple components

---

## Architecture

### Frontend → Backend Communication
```
invoke<T>("command_name", {...})  →  src-tauri/src/lib.rs  →  src-tauri/src/commands/<group>.rs
```
Never call Tauri APIs (`invoke`, `State`, etc.) outside `src/api/` or `src-tauri/src/commands/`.

### Game Engine Flow
```
TitleScreen → SelectMusicScreen → PlayerOptionsScreen → GameplayScreen → EvaluationScreen
                                                              ↓
                                                    JudgmentSystem (scoring)
```

- `GameEngine` (`src/engine/GameEngine.ts`) — chart loading, audio sync, input
- `JudgmentSystem` — timing windows, DP calculation, grade
- `NoteField.vue` — pure rendering component (all canvas rendering)

### Pinia Stores
| Store | Responsibility |
|-------|---------------|
| `settings` | Persisted config (volume, theme, keybindings) |
| `player` | Audio playback queue, progress polling, abortId race protection |
| `session` | Current game session (selected song/chart) |
| `library` | Song catalog, search, sorting, favorites |
| `game` | Facade (backwards compat) — prefer sub-stores in new code |

### Rust Crate Dependencies
```
sm-core (base)
  ├── sm-timing
  ├── sm-score
  ├── sm-chart ────── sm-song
  ├── sm-profile
  └── sm-audio

sm-noteskin  (standalone — loads from disk, manages skin registry)
```
`sm-score` is the single source of truth for timing windows.

### IPC Command Pattern
```rust
// src-tauri/src/commands/<group>.rs
#[tauri::command]
pub async fn my_command(state: State<'_, AppState>, arg: String) -> Result<MyResponse, String> {
    let data = state.my_manager.lock().map_err(|e| e.to_string())?;
    Ok(MyResponse { ... })
}
```
```typescript
// src/api/<group>.ts
export async function myCommand(arg: string): Promise<MyResponse> {
  return invoke<MyResponse>("my_command", { arg });
}
```

---

## Known Patterns

- **Audio preview**: `player.playSongAt(idx)` handles abortId race protection automatically
- **Config persistence**: `config.rs` reads/writes `config.toml` via `AppState.data_dir`
- **i18n**: Keys in `src/i18n/en.ts` / `zh.ts`; use `t('ns.key')`; never hardcode strings
- **SFX**: `src/utils/sfx.ts` wraps Web Audio API
- **NoteSkin pipeline**: `sm-noteskin` → IPC commands → `useNoteSkin()` composable → `NoteField.vue`
- **Chart cache**: `ChartCache` in `lib.rs` is LRU (default 8 entries), configurable via `chart_cache_size`
- **AppError**: `src-tauri/src/error.rs` defines `AppError` enum with `From<T>` impls for io/parse errors
- **Song favorites**: `library` store (`src/stores/library.ts`) manages favorites state; IPC commands `toggle_favorite`, `is_favorite`, `get_favorites`, `cleanup_orphaned_favorites` in `profile` command group
- **Cursor position**: `src/utils/platform.ts` wraps Tauri `get_cursor_position` command — exception to "all IPC through `src/api/`" since it's a platform utility

---

## Adding New Features

1. **New screen**: Create `src/screens/NewScreen.vue` + composables in `src/screens/new-screen/`. Add route in `src/router.ts`
2. **New IPC command**: Add handler in `src-tauri/src/commands/<group>.rs`, register in `lib.rs`, add wrapper in `src/api/<group>.ts`, export from `src/api/index.ts`
3. **New Rust crate**: Add to workspace root `Cargo.toml` `[workspace.members]` AND to `src-tauri/Cargo.toml` `[dependencies]`
4. **New game mechanic**: Extend `JudgmentSystem` or `GameEngine` in `src/engine/`, NOT in screen components
5. **New NoteSkin**: Add `NoteSkinConfig` to `sm-noteskin`, add commands, frontend loads via `useNoteSkin()`

---

## Release Notes

- **Version source of truth**: Keep `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and `src/constants/appMeta.ts` on the same semver string (no `v` prefix)
- **Changelog**: Maintain `docs/changelog/bsm-vX.Y.Z.md` matching git tag `vX.Y.Z`

---

## Explicit Constraints

- **Do not commit** unless explicitly asked
- **Maintain low coupling**: Backend crates should not know about Tauri. Tauri commands are the adapter layer
- **Frontend component-based**: All rendering logic in `NoteField.vue` or `engine/` — NOT in screen components
- **`as any` / `@ts-ignore`**: Never in production code. Only acceptable for browser API polyfills (e.g., `window.__TAURI_INTERNALS__`)
- **No `expect()` on user data**: Only on internal invariants with clear panic messages
