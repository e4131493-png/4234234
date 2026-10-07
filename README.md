# Dropzone Optimizer

A local Windows desktop app for reversible Fortnite settings, built around an Intel Core i5-10600K, AMD Radeon RX 6600 8 GB, 16 GB RAM, and a 1920 × 1080 / 280 Hz display. The dark dashboard is inspired by the supplied reference, with original branding and interface assets.

## Run the Windows download

1. Download `Dropzone-Optimizer-1.0.0-Windows-x64.zip` from `dist` and extract **the entire ZIP** to a folder.
2. Open **Dropzone Optimizer.exe** inside that folder. Keep the supporting files beside it. Node.js is not needed.
3. Launch Fortnite once to create its settings, then close the game. Choose **Scan PC** in Dropzone.
4. Start with **Competitive**. In **Game settings**, review the 280 FPS cap, 100% resolution scale, and optional Windows changes. Select **Review & apply** to see every selected change before applying.
5. Follow **Input latency** for display refresh, Fortnite rendering mode, AMD Anti-Lag, FreeSync, and mouse settings. Those checklist items are manual, not automatic optimizations.
6. Close Dropzone before playing; the applied settings persist. To undo applied settings, close Fortnite and use **Backup & restore → Restore backup**.

The Windows ZIP is an unsigned x64 build. It does not request administrator access. Some managed PCs may restrict registry writes or power-plan selection; failures are reported and a recovery record is retained. Do not disable antivirus or Windows security to run it.

## What changes

| Option | Actual action |
| --- | --- |
| Competitive | Low quality, medium view distance, 100% rendering scale |
| Balanced | Medium textures and view distance, low effects, 100% scale |
| Maximum FPS | Low quality and view distance, 70% scale; visibly softer image |
| Fortnite video settings | Selected quality values; custom 3D scale; FPS cap; V-Sync, motion blur, and dynamic resolution off; FPS display on |
| Windows Game Mode | Set current-user `Software\Microsoft\GameBar\AutoGameModeEnabled` to DWORD 1 |
| Disable game capture | Set current-user `Software\Microsoft\Windows\CurrentVersion\GameDVR\AppCaptureEnabled` and `System\GameConfigStore\GameDVR_Enabled` to DWORD 0; this disables Windows game recording |
| High performance (off by default) | Select the existing standard Windows High performance power plan, if available; can increase heat and power use |

Fortnite changes target `%LOCALAPPDATA%\FortniteGame\Saved\Config\WindowsClient\GameUserSettings.ini`. The app preserves unknown keys, comments, UTF-8/UTF-16LE encoding, and newline style. It does not change display resolution or the rendering API automatically. Verify the selected settings in-game after applying: Fortnite updates or cloud sync can override or ignore configuration entries.

The app does not modify game binaries, inject into the game, alter anti-cheat, disable security, make timer/HPET/boot edits, overclock hardware, or change network settings. It does not claim any measured FPS gain or latency reduction. Actual performance depends on scene complexity, CPU/GPU load, cooling, driver versions, and shader compilation. The 3.57 ms figure is `1000 / 280`, a refresh interval, **not measured input latency**.

## 1080p / 280 Hz starting point

- Confirm 280 Hz in Windows Advanced display settings and your monitor's on-screen menu.
- Try Fortnite's Performance rendering mode and restart. Compare DX12 if Performance stutters; let shaders warm up before judging either.
- Start at 100% scale and a 280 FPS cap. Lower the cap to a rate your PC sustains if frame times fluctuate. Unlimited is available for comparison, but full GPU saturation can increase latency.
- If using a compatible FreeSync display, enable FreeSync in the display and AMD software and try the 277 FPS cap. A cap slightly below refresh helps stay within the adaptive-sync range; it is not a guarantee against transient overshoot or tearing.
- Test standard Radeon Anti-Lag where supported in AMD's Fortnite profile. Its benefit depends on the driver, rendering mode, and GPU load. Turn off Radeon Chill for this comparison.
- Compare the same replay or Creative route before/after, including FPS drops and subjective mouse response. This app is not a benchmark or end-to-end latency measurement tool.

## Backups and recovery

Use **Open backup folder** to find recovery files. They are stored under Electron's per-user application-data directory, `%APPDATA%\Dropzone Optimizer\recovery`. The button opens the exact directory used by the running app.

Before any mutation, the app saves the original Fortnite file and a journal of the exact Windows values/power plan. It permits one active backup at a time. Restore it before applying another preset. Original archive files are retained after successful restoration.

Restoration changes only managed keys and preserves unrelated edits. If a managed value has changed to something other than the app's value or its original value, restoration pauses for that item and restores independent items where possible. The UI reports the conflict and retains the backup. To resolve a conflict, inspect `original-settings.json` and `GameUserSettings.original.ini` in the backup folder. With Fortnite closed, return the conflicting key to its recorded `after` or `before` value, then retry Restore. Manually copying the entire original INI over the current file also reverts newer unrelated game settings, so review differences first. Never delete `active-backup.json` merely to dismiss an interrupted operation.

## Development

Use Node.js 22 or later (tested with Node 24).

```sh
npm ci
npm start
```

On Linux, preview the interface with `npm run preview`. It intentionally cannot change Windows settings. Do not treat preview hardware values as detected telemetry.

```sh
npm test
npx playwright install chromium
npm run test:ui
npm run package:win
```

If Chromium is already installed, `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui` avoids a second browser download. The packaging command produces a portable Windows ZIP in `dist/`; extract all its contents before running.

For this cloud workspace, use writable caches:

```sh
npm ci --cache /workspace/.npm-cache
CHROMIUM_PATH=/usr/bin/chromium npm run test:ui
XDG_CACHE_HOME=/workspace/.cache ELECTRON_BUILDER_CACHE=/workspace/.cache/electron-builder npm run package:win
```

The engine tests exercise real temporary INI files and a simulated Windows adapter. Browser tests exercise UI flows with simulated Windows responses. A Windows-only integration test uses a temporary test registry key, reads system information and the active power plan, and parses the production PowerShell commands. It never changes Fortnite settings or the active power plan. Run `npm test` on Windows to execute it; it is skipped on other operating systems.

This build was prepared on Linux. Live changes on Windows, Fortnite honoring the settings, and FPS/latency improvements require validation on the target PC. No live PC performance results are bundled or implied.

## Architecture

- `ui/`: local HTML, CSS and JavaScript; no remote scripts, fonts, analytics, or accounts.
- `src/main.cjs` and `src/preload.cjs`: isolated Electron IPC with a small allowlisted API, sandboxed renderer, no Node integration, and denied navigation.
- `src/engine.mjs`: journaled application, original-file backup, conflict-aware restoration, single-operation locking.
- `src/windows.mjs`: Windows system detection, current-user registry operations, power-plan access.
- `src/ini.mjs` and `src/profiles.mjs`: bounded settings input and INI editing.

Independent software; not affiliated with or endorsed by Epic Games, Fortnite, AMD, or Intel.
