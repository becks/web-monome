# web monome for Norns Shield

A browser-based Grid 128 and four-ring Arc for Mac, iPad and Android tablets.
The page runs on your Shield: no TouchOSC, Web MIDI, cloud service or account is required.
Communication uses your local network (Wi-Fi or Ethernet), **not USB MIDI**.
This is not an official Monome product.

## Installation

You need a Shield running norns with MODS support and Python 3, on the same network as your browser. Internet access on the Shield is needed to clone the repository and install `python3-aiohttp` if missing.

1. Connect to your Shield from Terminal on your Mac:

   ```sh
   ssh we@norns.local
   ```

2. Run these commands on the Shield:

   ```sh
   cd ~/dust/code
   git clone https://github.com/becks/web-monome.git web-monome
   cd web-monome
   bash install.sh
   ```

   If a `web-monome` folder already exists, keep it as a backup before cloning. The installation path must be `~/dust/code/web-monome`, without a second nested folder. The installer uses sudo to install `python3-aiohttp` if needed, creates `web-monome.service` and enables automatic startup. It does not modify norns core or musical scripts.

3. On norns, open **SYSTEM → MODS**, enable **WEB-MONOME**, then restart norns.
4. In **SYSTEM → DEVICES → GRID**, assign **web grid 128** to port 1. In **ARC**, assign **web arc 4** to port 1. The mod automatically uses a free port but preserves existing assignments.
5. Open **http://norns.local:8088** in your browser. If the name does not resolve, find the Shield's IP address in SYSTEM → WIFI and use `http://YOUR-NORNS-IP:8088`.
6. Load **SELECT → web-monome → web-monome** to test the controller. The exact menu path depends on your norns version. Grid presses light up keys, and Arc movements move the ring indicators. Then load your musical script normally.

If you install from a ZIP instead, transfer the ZIP with `scp` and extract it on the Shield. Avoid copying individual files through Samba if transfers produce empty or null-filled files.

## Everyday use

Turn on norns, load a script and open the bookmarked page. Connection is automatic. **Grid**, **Arc** and **Both** change the visible controls; the browser remembers your choice.

- **Grid:** press and hold one or more keys on a touchscreen. Each finger holds its original key until released, as on a physical controller. A mouse holds only one key at a time; multi-key gestures require a touchscreen.
- **Arc:** drag vertically on a ring. Up increases the value; down decreases it. You can also use the mouse wheel, or arrow keys when a ring has focus. For finer adjustment, turn on **FINE** above the rings or hold Shift while dragging. Movement is relative, not an absolute position.
- **Press:** the button below each ring sends an Arc key event for scripts that use it.
- **Themes:** pick one from the menu in the header: Light, Graphite (dark), Amber, Ocean, or Night (dim red for dark rooms). **Auto** follows the system light/dark setting. The browser remembers your choice, and themes also change the LED colors.
- **Fullscreen:** use the ⛶ button. If unsupported, use Add to Home Screen. On iPad this opens the controller without browser bars. On Android, Chrome may open it as a normal tab, because installing a web app requires HTTPS.
- **Screen lock:** browsers only allow a page to keep the screen awake over HTTPS, so set your tablet's auto-lock to a long interval or Never while playing.
- **Haptics:** on Android, grid and Arc button presses give a short vibration. iPad does not support this from a web page.
- Only one browser can control the Shield at a time. Close the page on your Mac before switching to a tablet.
- Losing focus, changing views, disconnecting or missing heartbeats releases held keys. The page reconnects automatically.
- Audio stays on the Shield; it is not streamed to the browser.

## Compatibility and limitations

**The user confirmed operation on a physical Norns Shield with Fall and mlre** after the 0.1.1 fixes. The separate barcode-grid script was also reported working. This does not guarantee universal compatibility.

Automated tests use simulated hardware. They cover protocol exchange, LED feedback, release on disconnect, heartbeat expiry, rejection of a second controller, and Lua integration with upstream norns core Grid/Arc modules. JavaScript and shell syntax have also been checked. Browser interaction, latency and multitouch behavior still need testing on each target device.

The mod registers virtual devices in the standard `grid.devices` and `arc.devices` tables and uses the ports exposed by `grid.connect()` and `arc.connect()`. Scripts using these APIs do not need individual patches. Supported features include 16-level LEDs, relative LED changes, refresh, intensity, Arc segments, press/release and delta events. Grid can switch to 8×16 through `rotation()`; this is a virtual layout change rather than a physical orientation simulation.

Tilt sensors, Grid 256, multiple devices of the same type, and direct calls to native `_norns` hardware primitives are not supported. Scripts that inspect physical devices, other emulator mods and different core versions may require adjustments. Disable toga/midigrid during initial testing to avoid conflicts.

The complete script collection has not been tested. mlr is not validated: its Lua file showed no readable content during troubleshooting. This is separate from the confirmed mlre result.

The watchdog allocates a metro after script initialization. A script that already uses all available metros may prevent this additional check; the server still handles release when the browser disconnects.

## Troubleshooting

- **Page unreachable:** check the network and IP, then run `systemctl status web-monome` on the Shield.
- **Enable the mod on Norns:** enable WEB-MONOME, restart norns and load the diagnostic script. Check Maiden for Lua errors.
- **Connected but no response:** check port 1 assignments for GRID and ARC, then reload the script.
- **Server logs:** `journalctl -u web-monome -n 50 --no-pager`.
- **Another controller:** close other tabs. A session that stops responding is released after a timeout.
- Do not expose port 8088 to the Internet. This controller is intended for a trusted local network and has no authentication. WebSocket origin checks block requests from other websites, but anyone who can reach the page on your LAN can use it.

## Updating a Git installation

```sh
cd ~/dust/code/web-monome
git pull --ff-only
sudo systemctl restart web-monome
```

Also restart norns when `lib/mod.lua` changes. Browser files are served with `no-cache`, so a normal page reload picks up the new version.

## Removal

Disable WEB-MONOME in SYSTEM → MODS and restart norns. Then run on the Shield:

```sh
sudo systemctl disable --now web-monome.service
sudo rm /etc/systemd/system/web-monome.service
sudo systemctl daemon-reload
```

You can then remove `~/dust/code/web-monome` and restore previous device assignments in DEVICES. The installed Python dependency is retained.

## Architecture and tests

Browser → WebSocket on port 8088 → Python aiohttp server → loopback OSC on port 10111 → Lua mod → Grid/Arc APIs. LED frames return through loopback OSC port 10112 and WebSocket. Outgoing frames are coalesced to a nominal maximum of 30 Hz; input events are forwarded immediately. Mod OSC paths use `/web/*`.

References: [norns](https://github.com/monome/norns) core modules and [norns-example-mod](https://github.com/monome/norns-example-mod).

Run server tests from the project directory (requires aiohttp). They use free ports, so they also run on a Shield where the service is active:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --check web/app.js
bash -n install.sh
```

For Lua tests, download upstream norns `lua/core/grid.lua` and `lua/core/arc.lua` as `norns-grid.lua` and `norns-arc.lua` in a directory of your choice. Then run with Lua 5.3 or newer:

```sh
CORE_DIR=/path/to/core-files lua tests/test_mod.lua
```

See [CHANGELOG.md](CHANGELOG.md) for included fixes. This repository contains the generic Grid/Arc controller; barcode-grid is a separate musical script.
