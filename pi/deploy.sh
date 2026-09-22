#!/usr/bin/env bash
# Deploy pi/ to the Raspberry Pi over the direct ethernet cable, install and
# enable the systemd unit, and confirm the service answers /health.
#
# Requires: passwordless SSH key auth to pi@169.254.10.2 (already set up) and
# passwordless sudo on the Pi (already enabled). No internet needed on either
# side beyond the direct cable link.
set -euo pipefail

PI_HOST="pi@169.254.10.2"
PI_URL="http://169.254.10.2:8080"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Copying pi/ to ${PI_HOST}:/home/pi/porchlight/pi/"
scp -r "${REPO_ROOT}/pi" "${PI_HOST}:/home/pi/porchlight/"

echo "==> Installing and enabling porchlight-lamp.service on the Pi"
ssh "${PI_HOST}" '
  set -e
  sudo cp /home/pi/porchlight/pi/porchlight-lamp.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now porchlight-lamp.service
  sudo systemctl restart porchlight-lamp.service
'

echo "==> Waiting for ${PI_URL}/health"
if curl -sf "${PI_URL}/health" > /dev/null; then
  echo "PASS: ${PI_URL}/health is responding — deploy succeeded."
else
  echo "FAIL: ${PI_URL}/health did not respond after deploy." >&2
  exit 1
fi
