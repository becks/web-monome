# Changelog

## 0.1.3 — 2026-10-19

- Themes: Light, Graphite, Amber, Ocean and Night, plus Auto (follows the system). The choice is remembered and also recolors the LEDs.
- **FINE** toggle for Arc rings, so touch devices get the fine adjustment that Shift gives on a keyboard.
- Short haptic feedback on grid and Arc button presses on Android.
- Web app manifest and icon for Add to Home Screen.
- Server: a failed send to a browser that drops mid-frame no longer stops the frame/ping loop; the error is logged instead.
- Server: browser files are served with `Cache-Control: no-cache`, so updates appear after a normal reload.
- The version comes from a single `VERSION` file and the server sends it to the page.
- Arc buttons ignore the right mouse button, like the grid.
- Tests use free ports instead of 10111/10112.
- CSS moved to `web/style.css`; JavaScript and server code reformatted for readability. Behavior is otherwise unchanged.

## 0.1.2 — 2026-10-16

- Translated documentation, browser interface, accessibility labels and installer messages into English.
- Updated the displayed version. Controller behavior is unchanged.

## 0.1.1 — 2026-10-16

Consolidated sources after testing on the user's Shield.

- Replaced WebSocket truthiness checks with explicit `None` comparisons for older aiohttp releases, where an empty response evaluates to false. This fixes missing updates and second-controller checks.
- Switched to `core/grid`, `core/arc`, `core/osc` and `core/metro` so virtual devices share norns core instances and appear on the ports used by scripts.
- Included regression tests for falsy WebSockets and registration in core device tables.
- Preserved reattachment on script changes, device-added callbacks, held-key release and watchdog behavior.
- Updated Git installation, file-transfer guidance and compatibility notes.

## 0.1 — initial prototype

- Browser-based Grid 128 and four-ring Arc.
- Local WebSocket/OSC bridge, norns mod and systemd service.
- Diagnostic script and automated tests.

Git history starts from the consolidated corrected state; it does not reconstruct individual earlier troubleshooting changes.
