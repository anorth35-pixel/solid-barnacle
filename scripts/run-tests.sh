#!/usr/bin/env bash
# run-tests.sh — run the full CribbGolf automated test suite against the hosted server.
#
# Usage:
#   ./scripts/run-tests.sh <server-url> [reps-per-config]
#
# Examples:
#   ./scripts/run-tests.sh https://your-app.railway.app
#   ./scripts/run-tests.sh https://your-app.railway.app 10
#
# Config rotation (game-runner.mjs --config N):
#   0: 2-player, stroke play, no muggins
#   1: 2-player, stroke play, muggins ON
#   2: 2-player, match play
#   3: 2-player, all stakes (skins/nassau/sandies/barkies/greenies)
#   4: 2-player, skins only
#   5: 2-player, nassau only
#   6: 2-player, side bets (sandies/barkies/greenies)
#   7: 2-player, skins + muggins
#   8: 3-player, stroke play, no muggins
#   9: 3-player, stroke play, muggins ON
#  10: 3-player, all stakes (skins/sandies/barkies/greenies)

set -uo pipefail

SERVER=${1:?"Usage: $0 <server-url> [reps-per-config]"}
REPS=${2:-5}   # games per config (11 configs × REPS games total)
TIMEOUT=300    # seconds per game before watchdog kills it

LOG_DIR="scripts/logs/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR"

PASS=0
FAIL=0
FATAL=0
GAME_NUM=0

# Configs: "N:label:player-count"
CONFIGS=(
  "0:2p-stroke:2"
  "1:2p-muggins:2"
  "2:2p-matchplay:2"
  "3:2p-all-stakes:2"
  "4:2p-skins:2"
  "5:2p-nassau:2"
  "6:2p-sidebets:2"
  "7:2p-skins-muggins:2"
  "8:3p-stroke:3"
  "9:3p-muggins:3"
  "10:3p-all-stakes:3"
)

echo "══════════════════════════════════════════════════"
echo " CribbGolf Automated Test Suite"
echo " Server:  $SERVER"
echo " Configs: ${#CONFIGS[@]}  ×  $REPS reps = $((${#CONFIGS[@]} * REPS)) games"
echo " Logs:    $LOG_DIR"
echo "══════════════════════════════════════════════════"
echo ""

# ── Game runners ──────────────────────────────────────────────────────────────

run_game() {
  local cfg_idx=$1 label=$2 player_count=$3
  GAME_NUM=$((GAME_NUM + 1))
  local log_base="$LOG_DIR/g${GAME_NUM}-${label}"
  local pids=()

  printf "  [%3d] %-18s  " "$GAME_NUM" "$label"

  # Start joiners in the background (they poll room:list to find the creator's room)
  local joiner_names=("Bob" "Carol" "Dave")
  for i in $(seq 1 $((player_count - 1))); do
    local jname="${joiner_names[$((i-1))]}"
    node scripts/game-runner.mjs \
      --server "$SERVER" \
      --name "Bot-$jname" \
      --role joiner \
      --timeout "$TIMEOUT" \
      > "${log_base}-${jname,,}.log" 2>&1 &
    pids+=($!)
  done

  # Small head-start so the creator's room exists before joiners request room:list
  sleep 1

  # Creator runs in the foreground; exits 0 on game:over
  node scripts/game-runner.mjs \
    --server "$SERVER" \
    --name "Bot-Alice" \
    --role creator \
    --config "$cfg_idx" \
    --timeout "$TIMEOUT" \
    > "${log_base}-alice.log" 2>&1
  local creator_ec=$?

  # Reap all joiner processes
  local joiner_ec=0
  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || joiner_ec=$?
  done

  # Evaluate result
  if [ $creator_ec -eq 0 ] && [ $joiner_ec -eq 0 ]; then
    echo "PASS"
    PASS=$((PASS + 1))
  elif [ $creator_ec -eq 2 ] || [ $joiner_ec -eq 2 ]; then
    echo "FATAL (timeout) — halting run"
    echo ""
    echo "Last 20 lines from ${log_base}-alice.log:"
    tail -20 "${log_base}-alice.log" 2>/dev/null | sed 's/^/    /'
    FATAL=$((FATAL + 1))
    return 2  # caller checks this
  else
    echo "FAIL (creator=$creator_ec joiner=$joiner_ec)"
    FAIL=$((FAIL + 1))
    # Print last 10 lines of creator log for quick diagnosis
    tail -10 "${log_base}-alice.log" 2>/dev/null | sed 's/^/    /'
  fi

  return 0
}

# ── Main loop ─────────────────────────────────────────────────────────────────

for rep in $(seq 1 "$REPS"); do
  echo "── Pass $rep / $REPS ──────────────────────────────"

  for entry in "${CONFIGS[@]}"; do
    IFS=: read -r cfg_idx label player_count <<< "$entry"
    run_game "$cfg_idx" "$label" "$player_count" || {
      # Fatal timeout — stop immediately so the user can investigate
      echo ""
      echo "★ STOPPED: Fatal error in game $GAME_NUM. Fix before continuing."
      echo "  Full logs: $LOG_DIR"
      echo ""
      echo "Results so far:  $PASS passed  $FAIL failed  $FATAL fatal"
      exit 2
    }

    sleep 2  # brief pause between games so the server fully tears down
  done

  echo ""
done

# ── Summary ───────────────────────────────────────────────────────────────────

echo "══════════════════════════════════════════════════"
echo " Results: $PASS passed   $FAIL failed   $FATAL fatal"
echo " Logs:    $LOG_DIR"
echo "══════════════════════════════════════════════════"

[ "$FAIL" -eq 0 ] && [ "$FATAL" -eq 0 ] && exit 0 || exit 1
