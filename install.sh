#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$project_dir" != "$HOME/dust/code/web-monome" ]]; then
  echo 'Place the web-monome folder in ~/dust/code/ on the Shield first.' >&2
  exit 1
fi
if ! python3 -c 'import aiohttp' 2>/dev/null; then
  sudo apt-get update
  sudo apt-get install -y python3-aiohttp
fi
service_file="$(mktemp)"
trap 'rm -f "$service_file"' EXIT
cat > "$service_file" <<EOF
[Unit]
Description=Web Monome local Grid and Arc
After=network.target
[Service]
Type=simple
User=$(id -un)
WorkingDirectory=$project_dir
ExecStart=/usr/bin/python3 $project_dir/server.py
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
EOF
sudo install -m 644 "$service_file" /etc/systemd/system/web-monome.service
sudo systemctl daemon-reload
sudo systemctl enable --now web-monome.service
printf '\nNow enable WEB-MONOME in SYSTEM > MODS and restart Norns.\nOpen http://norns.local:8088 on a Mac or tablet on the same network.\n'
