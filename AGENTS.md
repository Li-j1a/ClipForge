# AGENTS.md

Guidance for AI agents (and humans) working on ClipForge.

## Project map

| Path | Owns |
|---|---|
| `src/main/index.ts` | Window creation, security settings, app lifecycle |
| `src/main/ipc/handlers.ts` | IPC surface, validation, wiring of services |
| `src/main/services/ffmpegLocator.ts` | Resolve/verify FFmpeg & FFprobe paths |
| `src/main/services/mediaService.ts` | FFprobe invocation + pure JSON parser |
| `src/main/services/thumbnailService.ts` | Cached frame extraction (serialized) |
| `src/main/services/conversionService.ts` | argv building, spawn, progress, validation, temp-file commit |
| `src/main/services/taskManager.ts` | Serial queue + state machine (framework-free) |
| `src/main/services/store.ts` | settings.json / history.json persistence |
| `src/preload/index.ts` | contextBridge whitelist (`window.api`) |
| `src/shared/types.ts` | IPC contract shared by main/preload/renderer |
| `src/renderer/**` | Vue UI + Pinia store |
| `tests/**` | Vitest unit tests |
| `scripts/**` | Dev utilities and real-FFmpeg test harnesses |

## Rules

1. **No fake work.** Never simulate progress, thumbnails, or conversions. Progress comes from FFmpeg `-progress pipe:1`; a task is `completed` only after FFmpeg exits 0 *and* FFprobe validates the output (video stream + duration > 0).
2. **argv only.** Start FFmpeg/FFprobe with `spawn(path, args, { windowsHide: true })`. Never build a shell string, never use `exec`, never `shell: true`.
3. **Renderer stays sandboxed.** No Node APIs in renderer; add capabilities to the preload whitelist instead. Validate every IPC input in main (absolute path, enum values, string types).
4. **Temp files, then commit.** Convert to `.clipforge-<id>.part` inside the output directory, validate, then rename. Always clean up on failure/cancel.
5. **Never overwrite user files.** Use `uniqueOutputPath`; also avoid paths reserved by queued tasks (`isPathReserved`).
6. **Serial queue.** One running task; cancellation must abort the real child process and leave status `cancelled`.
7. **Unknown metadata is normal.** Any of duration/width/height/fps/codec/bitrate may be missing. Render `—`; do not crash or invent values.
8. **Keep the IPC contract in one place** (`src/shared/types.ts`). Update preload, handlers and renderer together.
9. **Do not hard-code machine paths.** Binaries resolve from `resources/bin` (packaged) → npm installer packages (dev) → PATH → user override.
10. **Tests are evidence.** When you change parsing, argv, queue semantics or validation, run `npm test` and the smoke harness, and update `docs/TEST_PLAN.md` with real results.

## Commands

```bash
npm run dev        # Vite + Electron
npm test           # Vitest
npm run build      # tsc main/preload + vite build
npm run dist       # NSIS installer into release/
node scripts/smoke-conversion.cjs D:\AIworkspace\clipforge-testdata
node scripts/e2e-app-check.mjs <dataDir> <outDir>   # app must run with --remote-debugging-port=9222
node scripts/screenshot.mjs <dataDir> docs/screenshots
```

## Code style

- TypeScript strict, no `any` in services; pure logic stays free of Electron imports so Vitest can load it.
- Comments explain *why*, not *what*; mark deliberate shortcuts with `ponytail:` and the ceiling.
- Chinese UI text, English identifiers/comments.
