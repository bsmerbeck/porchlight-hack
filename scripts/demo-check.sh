#!/usr/bin/env bash
# scripts/demo-check.sh -- single go/no-go health check to run right before walking on
# stage (Phase 5 Plan 03, DEMO-02/DEMO-03).
#
# Read-only. No secrets are embedded or required (T-05-08) -- every check is an
# unauthenticated GET/POST against public or link-local endpoints. Prints one PASS/FAIL
# row per check in a single table and exits non-zero if anything failed.
#
# Every check runs in the BACKGROUND with a short per-check timeout, so total wall-clock
# time is bounded by the slowest single check (a few seconds), not the sum of all of
# them -- this is what keeps a full run comfortably under 10s even when the Pi/Hue
# Bridge are unreachable from wherever this happens to run (e.g. off the venue LAN).
#
# Usage:
#   bash scripts/demo-check.sh
#
# Override any target via env vars (defaults match the locked demo-night config, see
# CLAUDE.md / PROJECT.md "Demo network"):
#   SITE_URL=https://porchlight-hack.web.app
#   PROJECT_ID=porchlight-hack
#   REGION=us-central1
#   PI_URL=http://169.254.10.2:8080
#   HUE_URL=http://169.254.12.12
#   DEMO_CHECK_TIMEOUT=2   # seconds, per-check curl timeout

set -u

SITE_URL="${SITE_URL:-https://porchlight-hack.web.app}"
PROJECT_ID="${PROJECT_ID:-porchlight-hack}"
REGION="${REGION:-us-central1}"
PI_URL="${PI_URL:-http://169.254.10.2:8080}"
HUE_URL="${HUE_URL:-http://169.254.12.12}"
CHECK_TIMEOUT="${DEMO_CHECK_TIMEOUT:-2}"

FUNCTIONS_BASE="https://${REGION}-${PROJECT_ID}.cloudfunctions.net"
FIRESTORE_BASE="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents"

WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/demo-check.XXXXXX") || { echo "FATAL: mktemp -d failed" >&2; exit 2; }
trap 'rm -rf "$WORKDIR"' EXIT

NAMES=()
IDX=0

# --- individual checks ---------------------------------------------------------------
# Each check prints ONE line of detail to stdout and returns 0 (pass) / 1 (fail).

check_site() {
  local path="$1" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$CHECK_TIMEOUT" "${SITE_URL}${path}" 2>/dev/null)
  echo "GET ${SITE_URL}${path} -> ${code:-no response}"
  [ "$code" = "200" ]
}

# Reuses the exact reachability signal Phase 2 established: elevenlabsCustomLlm rejects
# an unauthenticated request with 401 (not a connection error/5xx), which proves the
# Function is deployed and its auth gate is live -- a real go/no-go health check for a
# 401 doesn't need a bearer token, and this endpoint is the one thing that must be up
# for a live phone call to work at all.
check_functions_alive() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$CHECK_TIMEOUT" -X POST "${FUNCTIONS_BASE}/elevenlabsCustomLlm" 2>/dev/null)
  echo "POST ${FUNCTIONS_BASE}/elevenlabsCustomLlm (no bearer) -> ${code:-no response} (401 = deployed + rejecting correctly)"
  [ "$code" = "401" ]
}

check_firestore_doc() {
  local path="$1" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$CHECK_TIMEOUT" "${FIRESTORE_BASE}/${path}" 2>/dev/null)
  echo "GET Firestore ${path} -> ${code:-no response}"
  [ "$code" = "200" ]
}

check_pi_health() {
  local body
  body=$(curl -s --max-time "$CHECK_TIMEOUT" "${PI_URL}/health" 2>/dev/null)
  if [ -z "$body" ]; then
    echo "GET ${PI_URL}/health -> no response (Pi unreachable -- check the ethernet cable, not Wi-Fi)"
    return 1
  fi
  echo "GET ${PI_URL}/health -> ${body}"
  printf '%s' "$body" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'
}

# The bridge (bridge/index.mjs) has no HTTP endpoint of its own -- its liveness signal
# is the running Node process itself (see bridge/README.md).
check_bridge_process() {
  if pgrep -f "node bridge/index.mjs" > /dev/null 2>&1; then
    echo "bridge process found (pgrep -f \"node bridge/index.mjs\")"
    return 0
  fi
  echo "no 'node bridge/index.mjs' process found -- run: pnpm run lamp:bridge (in a tab that stays open)"
  return 1
}

check_hue_bridge() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$CHECK_TIMEOUT" "${HUE_URL}/api/0/config" 2>/dev/null)
  echo "GET ${HUE_URL}/api/0/config -> ${code:-no response}"
  [ "$code" = "200" ]
}

# Phase 6 (D-11): at least one Hue bulb must be reachable. Needs the paired app key from
# the gitignored bridge/hue-local.json (read locally, never printed); IP from HUE_URL.
check_hue_bulbs() {
  local key_file body user n
  key_file="$(cd "$(dirname "$0")/.." && pwd)/bridge/hue-local.json"
  if [ ! -f "$key_file" ]; then
    echo "no bridge/hue-local.json (Hue app key) -- run pnpm venue:up"
    return 1
  fi
  user=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).username||"")}catch{}' "$key_file")
  body=$(curl -s --max-time "$CHECK_TIMEOUT" "${HUE_URL}/api/${user}/lights" 2>/dev/null)
  n=$(printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const l=JSON.parse(s);const a=Array.isArray(l)?[]:Object.values(l);process.stdout.write(a.filter(x=>x&&x.state&&x.state.reachable).length+"/"+a.length)}catch{process.stdout.write("0/0")}})')
  echo "reachable bulbs ${n:-0/0}"
  [ "${n%%/*}" -ge 1 ] 2>/dev/null
}

# --- runner ----------------------------------------------------------------------------

run_check() {
  local label="$1"
  shift
  NAMES[$IDX]="$label"
  ( "$@" > "$WORKDIR/$IDX.out" 2>&1; echo $? > "$WORKDIR/$IDX.status" ) &
  IDX=$((IDX + 1))
}

run_check "Site: /"                              check_site "/"
run_check "Site: /app"                           check_site "/app"
run_check "Site: /stage"                         check_site "/stage"
run_check "Site: /verify"                        check_site "/verify"
run_check "Site: /sim"                           check_site "/sim"
run_check "Functions: elevenlabsCustomLlm"       check_functions_alive
run_check "Firestore: stats/waitlist"            check_firestore_doc "stats/waitlist"
run_check "Firestore: lamp/current"              check_firestore_doc "lamp/current"
run_check "Pi: GET /health"                      check_pi_health
run_check "Bridge: node bridge/index.mjs running" check_bridge_process
run_check "Hue Bridge: GET /api/0/config"        check_hue_bridge
run_check "Hue bulbs reachable >= 1"             check_hue_bulbs

TOTAL=$IDX
wait

echo
printf '%-42s %-7s %s\n' "CHECK" "RESULT" "DETAIL"
printf '%-42s %-7s %s\n' "------------------------------------------" "-------" "----------------------------------------------------------"

FAIL_COUNT=0
i=0
while [ "$i" -lt "$TOTAL" ]; do
  status=$(cat "$WORKDIR/$i.status" 2>/dev/null || echo 1)
  detail=$(cat "$WORKDIR/$i.out" 2>/dev/null || echo "(no output)")
  if [ "$status" = "0" ]; then
    mark="PASS \xE2\x9C\x93"
  else
    mark="FAIL \xE2\x9C\x97"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  printf "%-42s ${mark}  %s\n" "${NAMES[$i]}" "$detail"
  i=$((i + 1))
done

echo
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "GO -- all ${TOTAL} checks passed. Walk on stage."
  exit 0
else
  echo "NO-GO -- ${FAIL_COUNT}/${TOTAL} check(s) failed. See DEMO.md's fallback sections before you go on."
  exit 1
fi
