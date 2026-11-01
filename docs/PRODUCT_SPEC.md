# ClipForge Product Spec

## 1. Target user

Ordinary Windows users who need to change a video's format (for a phone, a TV, a website, or to save disk space) but do not know what CRF, bitrate or pixel format means. They expect: drop file → pick a sensible option → press start → find the result.

## 2. Problems we deliberately solve

| User pain | Product answer |
|---|---|
| "Which format should I pick?" | Three formats with plain-language labels (MP4 通用格式 / MKV 本地存储 / WebM 网页格式) |
| "What quality setting?" | Three presets with one-line explanations; no encoder jargon on the main screen |
| "Did it actually work?" | Real per-second progress, speed, before/after size, and a verified output file |
| "Where did my file go?" | Explicit output path + 打开文件 / 打开文件夹 buttons |
| "It failed, now what?" | Human-readable Chinese error with cause and next step |
| "Did it overwrite my video?" | Never: unique file names, temp file committed only after validation |

## 3. Core flow

1. Open ClipForge → empty state explains how to add videos.
2. Drag files in, or click to open the system picker (multi-select).
3. Files appear with thumbnail and metadata as soon as FFprobe/FFmpeg finish (loading state while probing).
4. Choose output format, quality preset, and optionally another folder.
5. Press 开始转换 → tasks enter the queue; one runs at a time.
6. Watch real percent and speed; cancel if needed.
7. On completion: 打开文件 / 打开文件夹; the record is added to 转换历史 with size comparison.
8. On failure: status 失败 + plain-language reason; no fake output file.

## 4. Scope

### P0 (shipped)

- Local multi-file import (picker + drag & drop), no upload.
- FFprobe metadata: duration, resolution, container, video/audio codec, frame rate, bitrate, size.
- Real thumbnails with placeholder fallback.
- MP4 / MKV / WebM output; presets compatibility / high-quality / small-size.
- Output directory selection, automatic conflict-free naming.
- Serial queue with pending/running/completed/failed/cancelled.
- Real progress from FFmpeg; cancel that kills the process.
- Open output file / folder; clear error messages; temp-file safety.
- Settings: FFmpeg status, custom binary paths, default format/preset/output directory.

### P1 (shipped)

- Batch conversion through the queue.
- Before/after size comparison in tasks and history.
- Local history (max 200 entries).
- Smart preset naming and descriptions.

### Not included (P2)

Accounts/cloud, AI parameter selection, editing/subtitles/watermarks, GPU encoding, concurrent workers, downloads, macOS/Linux.

## 5. UI states (all implemented)

| State | Where |
|---|---|
| Empty / first run | Convert page drop zone + hint |
| Importing | Spinner + “正在读取媒体信息…” |
| Import failure | Per-file error row with reason, removable |
| Thumbnail failure | Neutral placeholder block |
| FFmpeg unavailable | Sidebar indicator red + link to Settings; start blocked with notice |
| Pending / running / completed / failed / cancelled | Task queue badges |
| Conversion progress | Progress bar + percentage + speed (no fake %) |
| Output conflict | Automatic “(1)” naming, never silent overwrite |
| History empty | History page hint |

## 6. Acceptance criteria

The product is acceptable only when all of the following are true:

1. Installer starts on Windows without developer tools or PATH changes.
2. A real local video is imported, showing real FFprobe metadata and a real frame thumbnail.
3. At least MP4 conversion produces a playable file; MKV and WebM likewise.
4. Progress comes from FFmpeg output; cancelling stops the actual process.
5. Failed/cancelled conversions leave no file that could be mistaken for success.
6. Existing files are never overwritten.
7. Chinese paths and spaces work end to end.
8. Errors are understandable without reading logs.
9. Documentation, screenshots, tests and AI/decision records match reality.
