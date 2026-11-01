# Test Plan & Executed Results

Test environment (all executed results below):

| Item | Value |
|---|---|
| OS | Windows 11 Home China 10.0.22621 |
| Node / npm | v24.14.1 / 11.11.0 |
| Electron | 33.4.11 |
| FFmpeg | N-92722-gf22fcd4483 (2018 build, bundled) |
| FFprobe | 2023-02-13-git-2296078397-essentials (bundled) |
| Test media | `D:\AIworkspace\clipforge-testdata` — 8 s 720p H.264/AAC (`sample 样本.mp4`), 0.8 s clip, 4 s no-audio clip, 40 s 1080p clip, truncated corrupt file |

Legend: **PASS** = executed with recorded evidence; **NOT RUN** = not executed (do not infer success).

## 1. Unit tests — `npm test`

Vitest 2.1.8, 4 files, **32 tests PASS** (latest run 2026-11-01 16:07).

| File | Covers |
|---|---|
| `tests/progressParser.test.ts` | timecode parsing, block framing across chunks, `out_time_us` fallback, field leakage between blocks, 0–99.9 clamp, unknown duration |
| `tests/mediaParser.test.ts` | fractional frame rates, container alias lists, missing audio, missing fields, cover-art streams |
| `tests/conversionArgs.test.ts` | argv shape (Chinese/space path as one entry), format/preset mapping, H.265 switch, unique output naming, error translation |
| `tests/taskManager.test.ts` | serial ordering, status transitions, progress, pending cancel, running cancel via abort, failure handling, clearFinished |

## 2. Functional tests

| ID | Test | Result | Evidence |
|---|---|---|---|
| T-001 | Import single MP4 | PASS | App E2E: `import sample 样本.mp4 — 8.00s 1280x720 h264/aac thumb=10KB` |
| T-002 | Drag & drop import | NOT RUN (real mouse drag) | Drop-zone code exists (`ConvertPage.vue`); programmatic import path verified. No human drag performed. |
| T-003 | Multi-file import | PASS | E2E imported 3 files in one call; all returned metadata + thumbnails |
| T-004 | Media info | PASS | Formats/duration/resolution/codec chips in screenshot 02; parser tests |
| T-005 | Thumbnail | PASS | Real JPEG thumbnails (10–11 KB data URLs) in screenshot 02; cached in userData/thumbnails |
| T-006 | MP4 conversion | PASS | Smoke + E2E: output `sample 样本.mp4`, h264/aac, 3,054,364 B, FFprobe readable |
| T-007 | MKV conversion | PASS | Smoke: `sample 样本 [high-quality].mkv`, h264/aac, 4,228,391 B |
| T-008 | WebM conversion | PASS | Smoke: VP9 output, 77,339 B, FFprobe readable |
| T-009 | Output directory | PASS | E2E: settings outputDir persisted to `D:\AIworkspace\clipforge-testdata\appout`; files written there |
| T-010 | Real-time progress | PASS | E2E events with speeds `14.4x/11.5x/27.6x`; screenshot 03 shows `14% 5.64x` from a 1080p conversion |
| T-011 | Cancel task | PASS | E2E: `status=cancelled outputExists=false tempFiles=0`; smoke: abort after ~450 ms, no temp file |
| T-012 | Queue execution | PASS | E2E serial check `maxRunning=1`; unit test ordering |
| T-013 | Open file / folder | NOT RUN (OS shell action) | Buttons wired to `shell.openPath` / `shell.showItemInFolder`; no human click verified |
| T-014 | History + before/after size | PASS | Screenshot 05 shows real size deltas; E2E `history records completed conversions` |

## 3. Exception tests

| ID | Scenario | Result | Evidence / notes |
|---|---|---|---|
| E-001 | Chinese path | PASS | `sample 样本.mp4` imported, thumbnailed and converted; output `sample 样本.mp4` |
| E-002 | Spaces in filename | PASS | Same file crosses probe/thumbnail/convert argv intact |
| E-003 | Corrupt input | PASS | Truncated file → `视频文件已损坏或数据不完整，无法转换。`; no final file, no temp file |
| E-004 | No audio track | PASS | Smoke + E2E convert `noaudio.mp4` → video-only MP4/MKV; unit tests for parser |
| E-005 | FFmpeg missing | NOT RUN | Bundled binaries always resolve on this machine; status UI exists |
| E-006 | Output file exists | PASS | Smoke auto-rename `(1)`; E2E seeded a user file and verified it was not overwritten |
| E-007 | Cancel cleans temp | PASS | E2E + smoke: no `.clipforge-*` leftovers |
| E-008 | Output directory no permission | NOT RUN | Error mapping covered by unit test only |
| E-009 | Disk full | NOT RUN | Error mapping covered by unit test only |
| E-010 | Unknown duration | PARTIAL | Unit test: progress stays 0 for null duration. No real container without duration tested. |
| E-011 | Very short video | PASS | 0.8 s clip: thumbnail at 0.4 s generated; WebM and H.265 conversions passed |
| E-012 | Encoder unavailable | NOT RUN | Bundled build has all required encoders; friendly message unit-tested |
| E-013 | Mid-file corruption | KNOWN LIMITATION | FFmpeg tolerates it; output passes container validation. Accepted in ADR-010. |
| E-014 | Concurrent output name race | PASS (fixed) | E2E conflict test exposed collision of recomputed names; fixed with `isPathReserved` (ADR-011), re-run passed |
| E-015 | Quit app during conversion | PASS | During: `.clipforge-<id>.part` present. After `window.close()`: temp file gone, no `ffmpeg.exe` running, app exited (grace-period abort in `main/index.ts`) |

## 4. App E2E harness — `scripts/e2e-app-check.mjs`

Latest run: **13/13 checks PASS** against the real Electron app (`--remote-debugging-port=9222`).

```
PASS  import sample 样本.mp4 — 8.00s 1280x720 h264/aac thumb=10KB
PASS  import short.mp4 — 0.80s 640x360 h264/none thumb=11KB
PASS  import noaudio.mp4 — 4.00s 640x360 h264/none thumb=10KB
PASS  settings outputDir persists
PASS  enqueue returns two pending tasks
PASS  convert sample 样本.mp4 -> mp4 — completed progress=100
PASS  convert noaudio.mp4 -> mkv — completed progress=100
PASS  progress events are real — speeds 13.9x, 11.1x, 27.9x
PASS  serial queue (max one running) — maxRunning=1
PASS  history records completed conversions
PASS  cancel running task — cancelled, no output, no temp
PASS  queued output paths do not collide
PASS  existing user file is not overwritten
```

## 5. Conversion smoke harness — `scripts/smoke-conversion.cjs`

Latest run: **15/15 checks PASS** (MP4, MKV, WebM, H.265, no-audio, conflict rename, corrupt input, cancel, argv hygiene).

## 6. Packaging acceptance

| Item | Result |
|---|---|
| `npm run dist` produces NSIS installer | PASS — `release/ClipForge Setup 1.0.0.exe` (118,746,485 bytes, SHA-256 `bba124493bf577127e0e45dac76a647197ffe6a538a392536dfd1fa7be4d4055`) |
| Install on this machine | PASS — silent `/S` install to `%LOCALAPPDATA%\Programs\ClipForge` |
| Launch installed app, bundled FFmpeg found | PASS — `resources\bin\ffmpeg.exe` / `ffprobe.exe`, version reported |
| Real conversion from installed app | PASS — full E2E 13/13 against `ClipForge.exe` |
| Clean/independent Windows environment | NOT RUN |
| Code signing / SmartScreen | NOT DONE (unsigned) |

## 7. Installer test record

Commands:

```powershell
npm run dist
Start-Process -FilePath 'G:\ClipForge\release\ClipForge Setup 1.0.0.exe' -ArgumentList '/S' -Wait
& "$env:LOCALAPPDATA\Programs\ClipForge\ClipForge.exe" --remote-debugging-port=9222
node scripts/e2e-app-check.mjs D:\AIworkspace\clipforge-testdata D:\AIworkspace\clipforge-testdata\installed-out
```

Observed:

- First `npm run dist` failed on a GitHub download timeout for `nsis-resources-3.4.1.7z`; the retry succeeded. Not an app defect.
- Installed layout contains `ClipForge.exe`, `resources\bin\ffmpeg.exe`, `resources\bin\ffprobe.exe`; the `@ffmpeg-installer` / `@ffprobe-installer` copies are no longer duplicated under `app.asar.unpacked` (installer 155,759,246 → 118,746,485 bytes).
- After that packaging change the smaller installer was silently installed again and the full E2E was re-run against the installed binary: 13/13 PASS.
- `window.api.getFfmpegStatus()` in the installed app returned:
  `ok: true`, `ffmpegPath: C:\Users\20972\AppData\Local\Programs\ClipForge\resources\bin\ffmpeg.exe`.
- Full E2E against the **installed** binary: 13/13 PASS (import, metadata, thumbnails, settings, two real conversions, real progress, serial queue, history, cancel, conflict handling, no overwrite).
- Outputs written to `D:\AIworkspace\clipforge-testdata\installed-out` and FFprobe-validated by the harness.
- The app was installed on the development machine, not a clean VM; see the remaining gap.

## 8. Not run — honest gaps

- Real mouse drag & drop and native dialog automation.
- Human verification of "open file"/"open folder" shell actions and player playback.
- FFmpeg-missing, permission-denied, disk-full scenarios on the machine.
- A truly clean Windows VM install.
- 30–60 s demo recording.
- Player playback of outputs (files were verified with FFprobe, not opened in a media player by a human).
