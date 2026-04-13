---
description: 
alwaysApply: true
---

# Best-StepMania Agent Guide

A StepMania-like rhythm game built with **Tauri + Vue 3 + TypeScript** (frontend) and **Rust** (backend via `src-tauri/` and `crates/`).

---

## Project Structure

```
best-stepmania/
├── Cargo.toml                 # Workspace root (members: src-tauri + all crates)
├── src/                      # Vue 3 frontend (TypeScript)
│   ├── api/                  # IPC wrappers (one file per command group)
│   ├── components/           # Reusable Vue components
│   │   ├── NoteField.vue    # Core canvas rendering (~1200 lines)
│   │   └── MusicPlayer.vue   # Persistent audio player bar
│   ├── engine/              # Game logic (GameEngine, JudgmentSystem, types, ports)
│   │   ├── GameEngine.ts    # Chart loading, audio sync, input handling
│   │   ├── JudgmentSystem.ts # Timing windows, DP, grade calculation
│   │   ├── types.ts         # Shared TypeScript interfaces
│   │   └── adapters/        # Audio port implementations
│   ├── i18n/                # Translations (en.ts, zh.ts)
│   ├── screens/             # Page-level Vue components
│   │   ├── editor/          # useEditorState, useEditorCanvas, useEditorActions
│   │   ├── gameplay/       # Pause menu, result overlay
│   │   └── song-packs/     # Song pack modals
│   ├── stores/             # Pinia stores (settings, player, session, library, game)
│   │   ├── noteskin.ts     # NoteSkin composable + color helpers
│   │   └── game.ts         # Facade over sub-stores
│   └── utils/             # api re-exports, platform detection, sfx
├── src-tauri/             # Tauri app (Rust)
│   └── src/
│       ├── commands/       # One file per IPC group (audio, chart, config, import, noteskin, profile, scoring, song)
│       ├── error.rs        # AppError enum for structured IPC errors
│       ├── lib.rs         # AppState, plugin setup, command registration
│       └── main.rs        # Binary entry (thin wrapper around lib::run)
└── crates/               # Rust library crates (workspace members)
    ├── sm-core/           # Base types (NoteData, StepsType, Difficulty, PlayMode)
    ├── sm-timing/         # BPM changes, stops, warps
    ├── sm-chart/          # SM/SSC file parsing
    ├── sm-song/           # Song scanning, metadata
    ├── sm-score/          # Scoring system (single source of truth for timing windows)
    ├── sm-profile/        # Player profiles + SQLite high scores
    ├── sm-audio/          # Audio playback (cpal + symphonia)
    └── sm-noteskin/       # NoteSkin config and manager
```

---

## Build, Lint & Test Commands

### Frontend (Node.js)

```bash
npm run dev              # Vite dev server
npm run build            # vue-tsc --noEmit && vite build  (full type-check + bundle)
npm run preview          # Preview production build
```

### Tauri (full app)

```bash
npm run tauri dev       # Run app in dev mode
npm run tauri build      # Build for release
```

### Rust backend

```bash
cargo check             # Quick compile check (no binary output)
cargo build             # Build
cargo test              # Run all tests (all crates)
cargo test -p sm-chart  # Run tests for a single crate
cargo test -p sm-score  # Run scoring tests
cargo test -p sm-profile # Run profile/DB tests
cargo clippy            # Lint (warnings as errors recommended)
cargo clippy --fix -W clippy::pedantic  # Auto-fix pedantic lints
```

---

## Code Style

### TypeScript / Vue 3

- **Strict mode**: `strict: true` in `tsconfig.json` — no `any`, no implicit any, no implicit returns
- **Unused code**: `noUnusedLocals: true`, `noUnusedParameters: true` — always enabled
- **Path alias**: `@/` → `src/`. Use `import Foo from "@/path/foo"` NOT relative paths
- **Composition API only**: `<script setup lang="ts">`. Never Options API.
- **File naming**:
  - `camelCase` for utilities, stores, composables: `gameStore.ts`, `useEditorState.ts`
  - `PascalCase` for Vue components: `NoteField.vue`
  - `kebab-case` for screen subdirs: `src/screens/editor/`
- **API layer**: All IPC goes through `src/api/`. Import via `import * as api from "@/utils/api"` or `import { specificFn } from "@/api"`. Never call `invoke()` outside the API layer.
- **Stores**: Pinia Composition API. `game.ts` is a facade — new code should import specific sub-stores directly.
- **Error handling**: `try/catch` on all async API calls. User-facing errors via toast/status.
- **Composables**: Screen-specific logic in `screens/<name>/` composables. Shared logic in `stores/` or `engine/`.

### Rust

- **Edition 2021**. Use `async/await`, `.await?` chaining.
- **Serialization**: All IPC structs use `#[serde(rename_all = "camelCase")]`
- **IPC errors**: Return `Result<T, String>`. Chain with `.map_err(|e| e.to_string())?`
- **No `unwrap()` / `expect()` on user data**: Only on internal invariants (e.g., "default noteskin must exist")
- **Error types**: Prefer `thiserror` for structured errors in library crates. Use the `AppError` enum in `error.rs` for IPC boundary.
- **Module structure**: `src-tauri/src/commands/` — one file per command group. `lib.rs` handles state + registration.
- **Crate naming**: `sm-*` prefix (snake_case). `sm-noteskin`, not `sm-note-skin`.
- **Mutex on state**: All `AppState` fields use `Mutex` (single-threaded blocking). Prefer `parking_lot::Mutex` if lock contention becomes an issue.
- **No `clone()` on hot paths**: Pass references or `Arc<T>` instead.

### General

- **No `console.log` in hot paths**: Use `console.warn` / `console.error`
- **No premature optimization**: Profile first. "Correct and slow" beats "fast and wrong."
- **Keep functions small**: Single responsibility. If a function needs a comment to explain *what* it does, split it.
- **Null handling**: Use `??`, `?.`, `?.()` operators. Avoid `|| {}` traps.
- **Comments**: Write code that explains itself. Comments on *why*, not *what*. No BDD-style `// When / Then` in implementation files.

---

## Architecture Notes

### Frontend → Backend Communication

```
invoke<T>("command_name", {...})   →   src-tauri/src/lib.rs   →   src-tauri/src/commands/<group>.rs
```

Never call Tauri APIs (`invoke`, `State`, etc.) outside the `src/api/` layer or `src-tauri/src/commands/` directory.

### Game Engine Flow

```
TitleScreen → SelectMusicScreen → PlayerOptionsScreen → GameplayScreen
                                                              ↓
                                                    JudgmentSystem (scoring)
                                                              ↓
                                                   EvaluationScreen
```

- `GameEngine` (`src/engine/GameEngine.ts`) manages chart loading, audio sync, and input
- `JudgmentSystem` handles timing windows, DP calculation, and grade
- `NoteField.vue` handles all canvas rendering — it is a pure rendering component
- Audio routes through `sm-audio` → `tauriAudioPort.ts` → `GameEngine`

### Pinia Stores

| Store | Responsibility |
|-------|---------------|
| `settings` | Persisted config (volume, theme, keybindings) |
| `player` | Audio playback queue, progress polling, abortId race protection |
| `session` | Current game session (selected song/chart) |
| `library` | Song catalog, search, sorting |
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

`sm-score` is the single source of truth for timing windows, loaded at startup via `get_scoring_config`.

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

## Adding New Features

1. **New screen**: Create `src/screens/NewScreen.vue` + composables in `src/screens/new-screen/`. Add route in `src/router.ts`
2. **New IPC command**: Add handler in `src-tauri/src/commands/<group>.rs`, register in `lib.rs`, add wrapper in `src/api/<group>.ts`, export from `src/api/index.ts`
3. **New Rust crate**: Add to workspace root `Cargo.toml` `[workspace.members]` AND to `src-tauri/Cargo.toml` `[dependencies]`
4. **New game mechanic**: Extend `JudgmentSystem` or `GameEngine` in `src/engine/`, NOT in screen components
5. **New NoteSkin**: Add `NoteSkinConfig` to `sm-noteskin`, add `set_current` / `load_from_directory` commands, frontend loads via `useNoteSkin()` composable

---

## Known Patterns

- **Audio preview**: Use `player.playSongAt(idx)` which handles abortId race protection automatically
- **Config persistence**: `config.rs` reads/writes `config.toml` via `AppState.data_dir`
- **i18n**: Keys in `src/i18n/en.ts` / `zh.ts`; reference with `t('ns.key')`; never hardcode strings
- **SFX**: `src/utils/sfx.ts` wraps Web Audio API — menu feedback, judgment sounds, countdown
- **NoteSkin pipeline**: `sm-noteskin` manages skin registry → IPC commands expose skins → `useNoteSkin()` composable caches configs → `NoteField.vue` uses `trackColorForSkin()` and `config.noteStyle`
- **Chart cache**: `ChartCache` in `lib.rs` is LRU with `DEFAULT_CHART_CACHE_SIZE` (8), configurable via `chart_cache_size` in `AppConfig`
- **AppError**: `src-tauri/src/error.rs` defines `AppError` enum for structured IPC errors. Use `From<T>` impls to convert from io/parse errors.

---

## Explicit Constraints

- **Do not commit** unless explicitly asked
- **Maintain low coupling**: Backend crates should not know about Tauri. Tauri commands are the adapter layer.
- **Frontend component-based**: All rendering logic in `NoteField.vue` or `engine/` — NOT in screen components
- **`as any` / `@ts-ignore`**: Never in production code. Only acceptable for browser API polyfills (e.g., `window.__TAURI_INTERNALS__`)
- **No `expect()` on user data**: Only on internal invariants with clear panic messages
