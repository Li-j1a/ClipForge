# Architecture Decision Records

## ADR-001: Desktop framework
- Status: Accepted
- Context: Need a real installable Windows desktop app with system file pickers, folder picker, shell integration and process control, delivered in three days.
- Options: Electron + Vue 3; Tauri + Vue; PySide6; plain web app.
- Decision: Electron 33 + Vue 3 + TypeScript + Vite.
- Rationale: Mature Vue ecosystem, straightforward child-process management from the main process, electron-builder produces an NSIS installer with one command. A web app cannot satisfy "desktop client"; PySide6 would mean a second UI stack for a Vue-fluent project.
- Trade-offs: Larger installer and higher memory use than Tauri; mitigated by bundling only what is needed.
- Date: 2026-11-01

## ADR-002: FFmpeg integration style
- Status: Accepted
- Context: Real transcoding, progress and cancellation are required; commands must be injection-safe.
- Options: FFmpeg C API bindings; prebuilt Node wrapper libraries; CLI via `child_process.spawn`.
- Decision: CLI invoked with `spawn(bin, argsArray)`; no shell, no string concatenation. Paths, Chinese characters and spaces travel as single argv entries.
- Rationale: Matches the task requirements, easy to debug by rerunning the same argv by hand, no native module rebuilds for each Electron version. The FFmpeg lab agent confirmed argv-style handling works for Chinese and spaces.
- Trade-offs: We own progress parsing, cancellation and binary distribution. Managed by dedicated services and tests.
- Date: 2026-11-01

## ADR-003: Serial task queue instead of concurrency
- Status: Accepted
- Context: Three-day scope, ordinary-user laptop hardware, one shared FFmpeg binary.
- Options: Concurrent worker pool; serial queue; user-selectable concurrency.
- Decision: Exactly one running task; pending tasks wait in insertion order.
- Rationale: Predictable resource usage and a much smaller state machine. Batch conversion still works — it is just serialized.
- Trade-offs: Lower aggregate throughput on many small files. Upgrade path: a worker pool with per-task AbortController (already in place) if throughput matters.
- Date: 2026-11-01

## ADR-004: Preset-first configuration
- Status: Accepted
- Context: Target users do not know CRF, pixel formats or encoders.
- Options: Fully open encoder settings; presets only; presets plus advanced panel.
- Decision: Three user-facing presets (兼容性优先 / 高清画质 / 节省空间) mapped to fixed FFmpeg argument tables; format is a separate top-level choice.
- Rationale: Keeps the happy path to two clicks; the mapping is testable with pure functions.
- Trade-offs: No fine control for power users. Advanced options can be added later behind a collapsed panel.
- Date: 2026-11-01

## ADR-005: Temp file then commit
- Status: Accepted
- Context: A failed or cancelled conversion must never leave a file that looks successful.
- Options: Write directly to the final path; write to a temp file and rename after validation.
- Decision: Convert to `<outputDir>/.clipforge-<id>.part`, require FFmpeg exit 0, non-zero size and FFprobe validation, then rename to the final path; always delete the temp file on failure or cancel.
- Rationale: The final name only appears when the output is verified. Same-directory temp keeps the rename atomic.
- Trade-offs: Requires cleanup discipline (`finally`/catch paths) and output-directory write permission. Verified by smoke and E2E tests.
- Date: 2026-11-01

## ADR-006: Page navigation without vue-router
- Status: Accepted (proposed by the UI/renderer agent)
- Context: Three top-level pages; no deep links, no URL history.
- Decision: A `page` field in the Pinia store with `v-if` page switching.
- Rationale: Avoids an unnecessary dependency; task state lives in the store, so unmounting pages loses nothing.
- Trade-offs: No browser-style back navigation — not needed for a desktop tool.
- Date: 2026-11-01

## ADR-007: Bundling FFmpeg binaries
- Status: Accepted with a documented caveat
- Context: The installer must work on machines without FFmpeg on PATH; binaries must come from a verifiable source.
- Options: Require the user to install FFmpeg; download binaries at runtime; bundle binaries from npm installer packages; commit binaries to the repo.
- Decision: Depend on `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe`, and copy them into `resources/bin` via electron-builder `extraResources`. Allow a user override in settings.
- Rationale: No runtime network dependency, no large binaries in git, deterministic build, and the underlying builds are public distribution packages.
- Trade-offs: The two npm packages currently ship **mismatched** versions (FFmpeg 4.1-era 2018 build vs FFprobe 2023 build). The FFmpeg lab agent verified they cooperate; README/notices disclose both versions. A future release can replace them with a matched build (a package-preparation script is not implemented).
- Date: 2026-11-01

## ADR-008: Thumbnails as data URLs
- Status: Accepted
- Context: The renderer is sandboxed and has no filesystem access; thumbnails live in the user data cache.
- Options: Custom protocol handler; `file://` URLs with webSecurity disabled (rejected); data URLs returned by IPC.
- Decision: `getThumbnail` returns `data:image/jpeg;base64,...` (≈8–15 KB at 320 px).
- Rationale: No new protocol registration, no weakened security, works identically in dev (http origin) and production (file origin).
- Trade-offs: Base64 overhead and IPC payload size; negligible at list scale (tens of videos). Switch to a custom protocol if lists grow to hundreds.
- Date: 2026-11-01

## ADR-009: Output validation requires a duration
- Status: Accepted (updated after the FFmpeg agent report)
- Context: FFprobe can exit 0 with `{}` for truncated files (missing moov atom), so "no error" is not proof of a valid output.
- Decision: Require FFprobe exit 0, parseable JSON, ≥1 video stream **and** duration > 0 before committing.
- Rationale: Catches truncated/zero-duration artifacts cheaply.
- Trade-offs: Some exotic containers may omit duration; the three supported outputs always report one (verified).
- Date: 2026-11-01

## ADR-010: No strict decode validation (`-xerror`)
- Status: Rejected
- Context: The lab agent showed a file with a zeroed `mdat` region decodes with warnings but FFmpeg still exits 0, producing output that passes container checks.
- Options: Add `-xerror` so decode errors abort; do a full decode pass and scan stderr; accept FFmpeg's tolerance.
- Decision: Accept FFmpeg's tolerance for mid-file corruption; document the limitation.
- Rationale: `-xerror` would make slightly damaged but recoverable personal videos fail entirely, which is worse for the target user. Structural damage (truncation, missing moov) is still caught by FFprobe.
- Trade-offs: A corrupt source may produce a partially glitched output marked completed. Documented in Known Limitations.
- Date: 2026-11-01

## ADR-011: Reservation-aware commit naming
- Status: Accepted (found by the app E2E test)
- Context: If a user creates a file at the output path while a conversion runs, the commit step renames to `name (1)`. Two tasks could independently choose the same `(1)` path and one would overwrite the other.
- Decision: `TaskManager` exposes `isPathReserved(path)` to the runner; commit picks the first free name that is neither on disk nor reserved by another non-cancelled task.
- Rationale: Small, framework-free addition; the serial queue means commits never overlap.
- Trade-offs: A task's final filename may differ from the enqueued path; the UI is updated from the returned result.
- Date: 2026-11-01

## ADR-012: GPU encoders
- Status: Rejected for v1
- Context: NVENC/QSV/AMF could accelerate conversion, but availability varies by hardware and driver.
- Decision: CPU encoders only (libx264/libx265/libvpx-vp9).
- Rationale: Three-day scope; predictable output quality; no hardware-specific failure modes. The FFmpeg build does include NVENC/QSV support if added later.
- Date: 2026-11-01

## ADR-013: Release built by GitHub Actions on tag push
- Status: Accepted (publishing constraint)
- Context: The source could be pushed through the existing Git credential helper, but no GitHub API token was available locally (no `gh`, no stored token) to create a Release or upload an asset. The helper deliberately does not expose its token.
- Options: install `gh` and ask the user to sign in; upload a local asset with a user-supplied PAT; build and publish from a tag-triggered GitHub Actions run using the repository's `GITHUB_TOKEN`.
- Decision: Add `.github/workflows/release.yml`: on `v*` tags, `windows-latest` runs `npm ci`, `npm test`, `npm run dist`, then `gh release create` with the token, publishing the installer and a SHA-256 in the notes. The build step retries once on a transient download failure.
- Rationale: Requires no additional local credential handling; the release is reproducible from the tagged source.
- Trade-offs: The release asset is a CI rebuild, not the locally tested installer. This is disclosed in the Release notes and the session summary. A failed run must be diagnosed from check annotations because unauthenticated users cannot download Actions logs.
- Date: 2026-11-01
