# Changelog

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
