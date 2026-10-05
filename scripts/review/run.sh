#!/bin/bash
# [1030 · 운영 루프] 주간 운영 실측 한 줄 — 데스크톱·폰·다크 세 번 + 디자인 치수 두 번 → reports/review/<ISO 주>/report.md
# 쓰임: npm run review:prod            (BASE 기본 https://naezipnow.com · ROUTES 기본 scripts/review/routes.json)
set -euo pipefail
cd "$(dirname "$0")/../.."
WEEK=$(date -u +%G-%V)
OUT=${OUT:-reports/review/$WEEK}
mkdir -p "$OUT"
export OUT ROUTES=${ROUTES:-scripts/review/routes.json} BASE=${BASE:-https://naezipnow.com}
MODE=d DARK=0 node scripts/review/probe-prod.mjs > "$OUT/probe_d.log" 2>&1
MODE=m DARK=0 node scripts/review/probe-prod.mjs > "$OUT/probe_m.log" 2>&1
MODE=d DARK=1 node scripts/review/probe-prod.mjs > "$OUT/probe_d_dark.log" 2>&1
MODE=d node scripts/review/design-probe.mjs > "$OUT/design_d.log" 2>&1
MODE=m node scripts/review/design-probe.mjs > "$OUT/design_m.log" 2>&1
node scripts/review/report.mjs "$OUT" && echo "통과: $OUT/report.md" || { echo "위반 있음: $OUT/report.md"; exit 1; }
