# ClipForge Architecture

## 1. Process model

```
┌──────────────────────── Renderer (sandboxed, no Node) ────────────────────────┐
│ Vue 3 + Pinia                                                                 │
│  pages: ConvertPage / HistoryPage / SettingsPage                              │
│  components: VideoList / SettingsPanel / TaskPanel                            │
│  store/app.ts: videos, settings, tasks, history, ffmpeg status                │
└───────────────▲──────────────────────────────────────────┬───────────────────┘
                │ window.api (ClipForgeApi)                 │ task:update events
┌───────────────┴──────────────────────────────────────────▼───────────────────┐
│ Preload (contextBridge whitelist; no raw ipcRenderer, no fs, no child_process)│
└───────────────▲──────────────────────────────────────────┬───────────────────┘
                │ ipcRenderer.invoke                        │ webContents.send
┌───────────────┴──────────────────────────────────────────▼───────────────────┐
│ Main process                                                                  │
│  index.ts            window, CSP/navigation lockdown, lifecycle               │
│  ipc/handlers.ts     input validation, orchestration, broadcasting            │
│  services/ffmpegLocator.ts  resolve + verify both binaries                    │
│  services/mediaService.ts   ffprobe spawn + parseProbeJson (pure)             │
│  services/thumbnailService.ts ffmpeg frame grab, serialized, cached           │
│  services/conversionService.ts argv, spawn, progress, validation, commit      │
│  services/taskManager.ts    serial queue + state machine                      │
│  services/store.ts          settings.json / history.json in userData          │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ spawn(bin, string[], {windowsHide:true})
                                       ▼
                              FFmpeg CLI / FFprobe CLI
```

Security settings: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP in `index.html`, `setWindowOpenHandler` denies popups, `will-navigate` restricted to the app origin. No remote content is loaded.

## 2. IPC contract

All channels are request/response except `task:update` (main → renderer).

| Channel | Request | Response |
|---|---|---|
| `dialog:open-videos` | — | `string[]` |
| `dialog:open-dir` | — | `string \| null` |
| `media:import` | `string[]` | `ImportResult[]` (per-path ok/error, includes thumbnail data URL) |
| `ffmpeg:status` | — | `FfmpegStatus` |
| `ffmpeg:set-paths` | `{ ffmpegPath?, ffprobePath? }` | `FfmpegStatus` |
| `settings:get` / `settings:update` | `Partial<Settings>` | `Settings` |
| `task:enqueue` | `EnqueueItem[]` | `ConversionTask[]` |
| `task:list` / `task:cancel` / `task:clear-finished` | — / `id` / — | — |
| `shell:open-path` / `shell:show-item` | `string` | — |
| `history:list` / `history:clear` | — | `HistoryEntry[]` |
| `task:update` (event) | — | `ConversionTask` |

Validation in `ipc/handlers.ts`: strings must be non-empty and contain no NUL; file paths must be absolute; format/preset must be enum members; enqueue items whose source file no longer exists are dropped.

## 3. Task state machine

```
pending ──▶ running ──▶ completed
              │  ├──▶ failed
              │  └──▶ cancelled   (user cancel, real child killed)
pending ──▶ cancelled             (cancelled before it starts)
completed / failed / cancelled are terminal; late progress events are ignored.
```

`TaskManager` is framework-free (takes an injected `TaskRunner`), emits `update` on every mutation and `completed` only after the runner resolves with a verified output. The pump loop starts the next pending task in `finally`, guaranteeing one running task.

Cancellation uses one `AbortController` per running task. `cancel(id)` marks status `cancelled` immediately for UI feedback and aborts; `runConversion` kills the FFmpeg child, removes the temp file and rejects with `ConversionCancelledError`. A success racing a cancel cannot resurrect the task.

## 4. Conversion pipeline

1. `enqueue` validates items, creates the output directory, computes a unique `outputPath` (existing files **and** paths reserved by queued tasks), creates a `ConversionTask`.
2. Runner resolves tools from settings (override → bundled `resources/bin` → npm installer → PATH), then `runConversion`.
3. FFmpeg writes to `<outputDir>/.clipforge-<id>.part`. `-f mp4|matroska|webm` makes the extension irrelevant.
4. Progress: `-progress pipe:1 -nostats`, parse `out_time` (HH:MM:SS.ffffff) → `percent = clamp(out_time / duration * 100, 0, 99.9)`; `speed` forwarded as-is. Unknown duration → progress stays 0, UI shows the running state without a fake percentage.
5. Exit code 0 → validate with FFprobe: exit 0, parseable JSON, at least one video stream, duration > 0. Then check file size > 0.
6. Commit: if the final path exists or is reserved by another task, append ` (n)`; rename temp → final. On failure/cancel: delete temp.
7. `TaskManager` marks completed and emits `completed`; handlers append a history entry.

FFmpeg argv is built by `buildConversionArgs` from preset tables — never a shell string. Stream selection is `-map 0:v:0 -map 0:a:0?` so sources without audio convert cleanly; `-sn -dn` drop subtitles/data.

### Presets

| Preset | MP4/MKV video | MP4/MKV audio | WebM video | WebM audio |
|---|---|---|---|---|
| compatibility | libx264 medium crf 23 yuv420p | aac 192k | libvpx-vp9 crf 32 -b:v 0 | libopus 128k |
| high-quality | libx264 slow crf 18 yuv420p | aac 256k | libvpx-vp9 crf 24 -b:v 0 | libopus 160k |
| small-size | libx265 medium crf 28 (+`hvc1` tag for MP4) | aac 128k | libvpx-vp9 crf 38 -b:v 0 | libopus 96k |

MP4 outputs add `-movflags +faststart`.

## 5. Thumbnails

- Seek time `max(0.1, min(3, duration / 2))`, `-ss` before `-i` (fast seek; fractional values work).
- Output `scale=320:-2` JPEG in `userData/thumbnails/<sha1(path|size|mtime)>.jpg`.
- Extraction is serialized (one FFmpeg process at a time) to avoid a process storm on bulk import.
- A seek past EOF exits 0 with **no file**, so the service checks existence **and** size; missing/empty → delete and return `null` (UI placeholder).
- Returned to the renderer as a data URL — the sandboxed renderer never reads the filesystem.

## 6. Media probing

`ffprobe -v error -show_format -show_streams -of json <file>`; `parseProbeJson` is pure and unit-tested:

- Skips `attached_pic` cover art when choosing the video stream.
- Duration from `format.duration`, falling back to the video stream duration.
- Frame rate from `avg_frame_rate` → `r_frame_rate`, parsing `30000/1001` form.
- Container label from the comma list (`mov,mp4,...` → MP4, `matroska,webm` → WebM).
- Missing codec/streams ⇒ import error ("不包含可识别的视频流") rather than a crash.

## 7. Error mapping

`friendlyError` translates FFmpeg stderr into user-facing Chinese for disk-full, permission, missing input, corrupt data, unknown encoder and unknown input format; otherwise the last stderr line is shown with the exit code. FFprobe probe failures are classified similarly.

## 8. Packaging

- `electron-builder` builds an NSIS installer into `release/`.
- `extraResources` copies `@ffmpeg-installer/win32-x64/ffmpeg.exe` and `@ffprobe-installer/win32-x64/ffprobe.exe` to `<install>/resources/bin/`.
- `ffmpegLocator` prefers `process.resourcesPath/bin/*.exe` when `app.isPackaged`, so the app does not depend on PATH or developer tools.
- Main/preload are compiled by `tsc` to CommonJS (`dist-electron/`); renderer by Vite to `dist/renderer/` with relative `base: './'` for `file://` loading.
