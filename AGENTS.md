# 云伴 — independent application

Application source in src/ is independently authored; do not copy VutronMusic application code.
Only the third-party API adapter and ordinary framework/runtime dependencies are reused.
Keep cookies in the main process. Expose allowlisted IPC with validated arguments, never arbitrary network or filesystem access.
Use official-account playback rights. No alternate sources or unlock calls.
Escape all API content as text. Audio loading must ignore stale requests; remote room updates must never echo as local commands.
Validate with core tests, desktop mock integration, anonymous real API checks, and packaged application smoke tests.
Never represent mock account/room checks as official two-account acceptance.
