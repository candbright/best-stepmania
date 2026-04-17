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
- **Path alias**: `@/` → `src/`. Prefer `@/…` over long relative `../../` paths
- **Composition API only**: `<script setup lang="ts">`. Never Options API
- **File naming**:
  - `camelCase` for utilities, stores, composables
  - `PascalCase` for Vue components
  - `kebab-case` for screen subdirectories
- **API layer**: All IPC goes through `src/shared/api/`. Never call `invoke()` outside the API layer
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

## Frontend Architecture (FSD - Feature-Sliced Design)

This project uses **Feature-Sliced Design (FSD)** to organize frontend code. FSD ensures clear separation of concerns and makes the codebase scalable and maintainable.

### FSD Layer Structure
```
src/
├── app/                   # App bootstrap: main.ts, App.vue, router/, global styles
├── entities/              # Domain entities (SongRow, SongPackGroup, PlayModeStrip)
├── features/              # Business use-cases (non-generic feature slices)
├── pages/                 # Route pages + page-scoped modules
├── shared/                # Cross-app shared code
│   ├── api/               # Tauri IPC invoke wrappers (all commands)
│   ├── composables/       # Reusable composables
│   ├── constants/       # Shared constants (gradeColors, appMeta, etc.)
│   ├── i18n/              # i18n resources and helpers
│   ├── layout/            # Layout components (BackgroundVideo, CursorLayer)
│   ├── lib/               # Shared libraries (sfx, platform utils, defaultMusic, …)
│   │   └── engine/        # GameEngine, JudgmentSystem, render/, adapters/ (NOT Vue)
│   ├── providers/         # Shared injection keys/types (e.g. options panel context)
│   ├── services/          # Tauri window/audio helpers (`services/tauri/`)
│   ├── stores/            # Pinia stores (settings, library, player, etc.)
│   └── ui/                # Generic UI primitives + shared UI groups (`ui/settings`)
├── widgets/               # Reusable business blocks (NoteField, MusicPlayer, SongSelectDetailPanel)
└── assets/                # Global CSS, theme palettes (imported from app/styles)
```

### Layer Responsibilities
| Layer | Responsibility |
|-------|---------------|
| **shared/ui** | Generic UI primitives (BaseModal, BaseSelect, BaseTooltip) |
| **shared/layout** | Global layout components (BackgroundVideo, CursorLayer) |
| **shared/composables** | Reusable reactive logic (useConfirmDialog, useGlobalHotkeys) |
| **shared/stores** | Global Pinia state (settings, library, player, session) |
| **shared/services** | External service wrappers (Tauri IPC wrappers) |
| **shared/lib** | Cross-app libraries (sfx, platform helpers, procedural audio); **`shared/lib/engine`** holds GameEngine / JudgmentSystem |
| **shared/api** | IPC `invoke` wrappers only |
| **shared/providers** | Shared injection keys and provider contracts |
| **entities** | Business domain models (SongRow, PlayModeStrip, SongHero) |
| **widgets** | Reusable business blocks (NoteField, MusicPlayer, SettingsCard, PlayerSettingsPanel) |
| **features** | User-facing business use-cases (avoid putting pure UI primitives here) |
| **pages** | Route-level page composition (TitleScreen, GameplayScreen) |
| **app** | `main.ts`, root `App.vue`, Vue Router table, app-level CSS bridge |

### Key FSD Principles
- **Shared = truly shared**: Code used by 2+ unrelated layers goes in `shared/`
- **Entities = models**: Domain objects with no business logic (SongRow renders itself)
- **Widgets = composed entities**: Business blocks combining entities (MusicPlayer uses SongRow)
- **Features = user actions**: Keep pure UI primitives in `shared/ui`, not in `features`
- **Pages = routes**: Route composition that orchestrates widgets/features
- **Tauri calls = api + services**: All `invoke()` → `src/shared/api/`; window/audio helpers → `src/shared/services/tauri/`
- **Import direction is one-way**: `app → pages → widgets → features → entities → shared` (higher layers may depend on lower; not the reverse)
- **Boundary check command**: run `npm run check:fsd-boundaries` before merge when moving modules across layers
- **Boundary rule in repo**: enforces full layer ranks (`shared` < `entities` < `features` < `widgets` < `pages` < `app`); only `src/assets/` and `vite-env.d.ts` are exempt at `src/` root

### Naming Conventions
- **Components**: `PascalCase.vue` (BaseModal.vue, NoteField.vue)
- **Composables**: `camelCase.ts` (useConfirmDialog.ts)
- **Stores**: `camelCase.ts` (settings.ts, library.ts)
- **Page subdirs**: `kebab-case/` under `pages/` (select-music/, gameplay/, editor/)
- **Base components**: `Base*` prefix (BaseModal, BaseSelect, BaseConfirmModal)

### Key Principles
- **Pages = composition**: Route pages should mostly assemble widgets/features, not contain business logic
- **Tauri calls unified**: All `invoke()` → `src/shared/api/`; events/window helpers → `src/shared/services/tauri/` where applicable
- **Global state → Pinia**: Only shared state across pages goes in `shared/stores/`
- **Local state → composables**: Page-specific state in `pages/[name]/` or `shared/composables/`
- **No over-splitting**: Keep reasonable granularity. Extract when there's clear reuse or clarity benefit
- **Don't break contracts**: Never change existing Tauri IPC contracts or function signatures

### Code Smells to Avoid
- Giant pages with mixed responsibilities
- Duplicate templates, logic, or styles
- Store overloading (everything in one store)
- Components directly manipulating global state
- Tauri calls scattered in components (should be in `shared/api/` or `shared/services/tauri/`)
- Putting business logic in `shared/` (only generic/shared code belongs there)

---

## Architecture

### Frontend → Backend Communication
```
invoke<T>("command_name", {...})  →  src-tauri/src/lib.rs  →  src-tauri/src/commands/<group>.rs
```
Never call Tauri APIs (`invoke`, `State`, etc.) outside `src/shared/api/` or `src-tauri/src/commands/`.

### Game Engine Flow
```
TitleScreen → SelectMusicScreen → PlayerOptionsScreen → GameplayScreen → EvaluationScreen
                                                              ↓
                                                    JudgmentSystem (scoring)
```

- `GameEngine` (`src/shared/lib/engine/GameEngine.ts`) — chart loading, audio sync, input
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

> **Location**: All stores are in `src/shared/stores/` (Pinia Composition API)

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
// src/shared/api/<group>.ts
export async function myCommand(arg: string): Promise<MyResponse> {
  return invoke<MyResponse>("my_command", { arg });
}
```

---

## Known Patterns

- **Audio preview**: `player.playSongAt(idx)` handles abortId race protection automatically
- **Config persistence**: `config.rs` reads/writes `config.toml` via `AppState.data_dir`
- **i18n**: Keys/resources in `src/shared/i18n/`; use `t('ns.key')`; never hardcode strings
- **SFX**: `src/shared/lib/sfx.ts` wraps Web Audio API
- **NoteSkin pipeline**: `sm-noteskin` → IPC commands → `useNoteSkin()` composable → `NoteField.vue`
- **Chart cache**: `ChartCache` in `lib.rs` is LRU (default 8 entries), configurable via `chart_cache_size`
- **AppError**: `src-tauri/src/error.rs` defines `AppError` enum with `From<T>` impls for io/parse errors
- **Song favorites**: `library` store (`src/shared/stores/library.ts`) manages favorites state; IPC commands `toggle_favorite`, `is_favorite`, `get_favorites`, `cleanup_orphaned_favorites` in `profile` command group
- **Cursor position**: `src/shared/lib/platform.ts` wraps Tauri `get_cursor_position` command — exception to "all IPC through `shared/api`" since it's a platform utility

---

## Adding New Features

1. **New page**: Create `src/pages/NewScreen.vue` + page-scoped modules in `src/pages/new-screen/`. Register route in `src/app/router/index.ts`
2. **New IPC command**: Add handler in `src-tauri/src/commands/<group>.rs`, register in `lib.rs`, add wrapper in `src/shared/api/<group>.ts`, export from `src/shared/api/index.ts`
3. **New Rust crate**: Add to workspace root `Cargo.toml` `[workspace.members]` AND to `src-tauri/Cargo.toml` `[dependencies]`
4. **New game mechanic**: Extend `JudgmentSystem` or `GameEngine` in `src/shared/lib/engine/`, NOT in page components
5. **New NoteSkin**: Add `NoteSkinConfig` to `sm-noteskin`, add commands, frontend loads via `useNoteSkin()`
6. **New widget**: Add to `src/widgets/` if reusable across pages (NoteField, MusicPlayer pattern)
7. **New entity**: Add to `src/entities/` if domain model with no business logic (SongRow pattern)
8. **New feature**: Add to `src/features/<name>/` for business use-cases (not pure styling wrappers)
9. **New base UI**: Add to `src/shared/ui/` if generic primitive (BaseModal, BaseSelect pattern). Put settings-like generic rows in `src/shared/ui/settings/`
10. **New shared composable**: Add to `src/shared/composables/` if reusable across multiple features

---

## Release Notes

- **Version source of truth**: Keep `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and `src/shared/constants/appMeta.ts` on the same semver string (no `v` prefix)
- **Changelog**: Maintain `docs/changelog/bsm-vX.Y.Z.md` matching git tag `vX.Y.Z`

---

## Explicit Constraints

- **Do not commit** unless explicitly asked
- **Maintain low coupling**: Backend crates should not know about Tauri. Tauri commands are the adapter layer
- **Frontend component-based**: All rendering logic in `NoteField.vue` or `shared/lib/engine/` — NOT in page components
- **`as any` / `@ts-ignore`**: Never in production code. Only acceptable for browser API polyfills (e.g., `window.__TAURI_INTERNALS__`)
- **No `expect()` on user data**: Only on internal invariants with clear panic messages
