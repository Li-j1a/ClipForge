# Changelog

## 1.0.0 — 2026-11-01

Initial release.

### Added

- Electron + Vue 3 desktop shell with dark UI, sidebar navigation and system dialogs.
- Multi-file import via file picker and drag & drop, with deduplication.
- FFprobe media metadata parsing (container, duration, resolution, codecs, frame rate, bitrate) tolerant of missing fields.
- Cached FFmpeg thumbnail extraction with duration-aware seek and placeholder fallback.
- MP4 / MKV / WebM output with compatibility / high-quality / small-size presets.
- Real progress from FFmpeg `-progress pipe:1` (out_time and speed) with unknown-duration handling.
- Serial task queue with pending / running / completed / failed / cancelled states.
- Cancel that terminates the real FFmpeg process and removes the temporary output.
- Temp-file → validate → commit output strategy; never overwrites existing files.
- Open output file / reveal in folder actions.
- Local conversion history with before/after size comparison.
- Settings page with FFmpeg status detection and custom binary paths.
- 32 unit tests, real-FFmpeg smoke harness, and app-level E2E harness.
- Windows NSIS installer via electron-builder with bundled FFmpeg/FFprobe.
