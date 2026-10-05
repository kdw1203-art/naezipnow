#!/bin/bash
# [1030 · 운영 루프] 묶음 포장 — 기준 트리 대비 바뀐 파일만 zip + 적용 PowerShell. 실제 인덱스·커밋은 건드리지 않는다.
# 쓰임: scripts/review/pack.sh <묶음번호> <기준트리1>[,<기준트리2>] <COMMIT-MSG 파일> [출력 폴더]
#   예: scripts/review/pack.sh 1031 64ce4542a3fc148aaa3b2c10b09dd7c485c1d4b2 docs/release-1031-commit.txt /tmp/out
set -euo pipefail
ID=$1; BASES=$2; MSG=$3; OUTDIR=${4:-/tmp/pack-$ID}
cd "$(dirname "$0")/../.."
IFS=, read -r -a BASE_ARR <<< "$BASES"
BASE=${BASE_ARR[0]}
mkdir -p "$OUTDIR"; rm -f "$OUTDIR/tmp.index"
export GIT_INDEX_FILE=$OUTDIR/tmp.index
git read-tree "$BASE"
git add -A .
# [1035b] 실행 비트 금지 — Windows 의 git add 는 새 파일을 100644 로만 넣으므로 100755 가 섞이면 소유자 쪽 트리 해시가 달라진다(1035 적용 실패 원인).
EXECS=$(git ls-files --stage | awk '$1=="100755"{print $4}')
if [ -n "$EXECS" ]; then echo "STOP: 실행 비트(100755) 파일 — chmod -x 뒤 다시 포장: $EXECS"; unset GIT_INDEX_FILE; rm -f "$OUTDIR/tmp.index"; exit 1; fi
TREE=$(git write-tree)
git diff --cached --no-renames --name-only --diff-filter=ACMT "$BASE" > "$OUTDIR/FILES.txt"
git diff --cached --no-renames --name-only --diff-filter=D "$BASE" > "$OUTDIR/DELETED.txt"
unset GIT_INDEX_FILE
PKG=$OUTDIR/pkg; rm -rf "$PKG"; mkdir -p "$PKG"
while IFS= read -r f; do mkdir -p "$PKG/$(dirname "$f")"; cp "$f" "$PKG/$f"; done < "$OUTDIR/FILES.txt"
cp "$OUTDIR/FILES.txt" "$PKG/FILES.txt"; cp "$OUTDIR/DELETED.txt" "$PKG/DELETED.txt"; cp "$MSG" "$PKG/COMMIT-MSG.txt"
rm -f "$OUTDIR/naezipnow-$ID.zip"
(cd "$PKG" && zip -r -q -X "$OUTDIR/naezipnow-$ID.zip" .)
ALLOWED=$(printf '"%s", ' "${BASE_ARR[@]}"); ALLOWED=${ALLOWED%, }
sed -e "s/__TREE__/$TREE/g" -e "s/__ID__/$ID/g" -e "s/__BASES__/$ALLOWED/" scripts/review/apply-template.ps1 > "$OUTDIR/apply-$ID.ps1"
echo "TREE=$TREE files=$(wc -l < "$OUTDIR/FILES.txt") deleted=$(wc -l < "$OUTDIR/DELETED.txt")"
ls -la "$OUTDIR/naezipnow-$ID.zip" "$OUTDIR/apply-$ID.ps1" | awk '{print $5, $9}'
