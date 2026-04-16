# Best-StepMania User Guide (Simplified)

This guide aligns with **v1.3.2**. Release notes: [changelog/bsm-v1.3.2.md](../changelog/bsm-v1.3.2.md).

## 1. What You Need

- A desktop machine (Windows-first release target).
- Node.js and Rust (for local dev/build).
- Song assets: audio files plus `*.sm` or `*.ssc` charts.

## 2. Quick Start

1. Install dependencies in project root: `npm install`
2. Run web UI dev server: `npm run dev`
3. Run desktop app in dev: `npm run tauri:dev`
4. Build installer: `npm run tauri:build`

Note: do not launch `target/debug/best-stepmania.exe` directly. It expects the `tauri:dev` local server.

## 3. Core Player Flow

### Song Select

- Browse songs, then use search/filter/sort.
- Favorite songs and filter by favorites only.
- After a library scan or import finishes, returning here refreshes the list automatically.
- Create song packs to organize your library.

### Gameplay

- Configure speed, display, and key options in Player Options.
- Hit notes in time with music; the judgment system evaluates timing.
- Check score, grade, and hit stats on the evaluation screen.

### Editor

- Open a song/chart from the editor entry; on the picker screen, drag the divider between the list and details to resize panes.
- Add, remove, and move notes on the canvas.
- Edit timing-related values and save back to chart files.

## 4. Common Settings

- Audio: master/SFX/preview volume.
- Visual: theme, window mode, render quality.
- Input: key mapping, shortcuts, player layout.
- Gameplay: judgment display, life behavior, play modifiers.

## 5. Common Issues

### No songs in list

- Verify import path.
- Confirm the folder includes audio and `*.sm`/`*.ssc`.
- Re-import and check import feedback.

### Audio feels off-sync

- Adjust audio offset first.
- Close heavy background apps.
- Test with stable FPS and lower render settings.

### Keyboard input not working

- Check key bindings and conflicts.
- Switch to English input mode and test again.
- Test keys in another screen to isolate hardware issues.

### Chart fails to load

- Validate chart encoding and tags.
- Check referenced audio file paths.
- Export diagnostics and inspect parse errors.

## 6. Help

- Chinese guide: `docs/zh/USER_GUIDE.md`
- English guide: `docs/en/USER_GUIDE.md`
- Release notes: `docs/changelog/bsm-v1.0.0.md`
