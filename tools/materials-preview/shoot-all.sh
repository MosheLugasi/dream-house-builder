#!/bin/sh
# Render every finish in batches of six and save contact sheets:
#   tools/materials-preview/shoot-all.sh [room|close|top] [extra query]
# -> tools/materials-preview/shots/<view>-<nn>.png   (dev server must run on port 5198)
cd "$(dirname "$0")/../.." || exit 1
VIEW="${1:-room}"
EXTRA="$2"
IDS=$(grep -o "id: '[a-z0-9-]*'" src/materials/catalog.ts | sed "s/id: '//;s/'//")
i=0; batch=""; nn=1
for id in $IDS; do
  batch="${batch:+$batch,}$id"; i=$((i+1))
  if [ $i -eq 6 ]; then
    node tools/materials-preview/shoot.cjs "$VIEW-$(printf %02d $nn)" "view=$VIEW&ids=$batch$EXTRA" 2>&1 | grep -v "GL Driver"
    i=0; batch=""; nn=$((nn+1))
  fi
done
[ -n "$batch" ] && node tools/materials-preview/shoot.cjs "$VIEW-$(printf %02d $nn)" "view=$VIEW&ids=$batch$EXTRA" 2>&1 | grep -v "GL Driver"
