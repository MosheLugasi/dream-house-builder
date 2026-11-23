#!/usr/bin/env bash
# Render the contact sheets of the character into tools/character-preview/shots/.
#   npx vite --port 5195 --strictPort &      (from the repo root)
#   bash tools/character-preview/shoot-all.sh
set -u
cd "$(dirname "$0")"
OUT=shots
mkdir -p "$OUT"
shot() { node shoot.cjs "$OUT/$1.png" "$2" "${3:-1600}" "${4:-900}"; }
shot lineup "mode=lineup&nonav=1"
shot faces "mode=faces&nonav=1&fy=0.3" 1800 620
shot faces-front "mode=faces&nonav=1&fy=0" 1800 620
for b in girl boy woman man; do
  shot "face-$b" "mode=face&body=$b&nonav=1" 1700 620
  shot "turn-$b" "mode=turn&body=$b&nonav=1"
  shot "walk-$b" "mode=strip&anim=walk&body=$b&view=side&nonav=1" 1900 560
  shot "run-$b" "mode=strip&anim=run&body=$b&view=side&nonav=1" 1900 520
  shot "poses-$b" "mode=poses&body=$b&nonav=1&view=34" 1900 600
done
shot walk-girl-front "mode=strip&anim=walk&body=girl&view=front&nonav=1" 1900 560
shot walk-man-34 "mode=strip&anim=walk&body=man&view=34&nonav=1" 1900 600
shot hair-front "mode=styles&kind=hair&body=girl&nonav=1&view=34&head=1" 1800 520
shot hair-back "mode=styles&kind=hair&body=girl&nonav=1&view=34b&head=1" 1800 520
shot hair-woman "mode=styles&kind=hair&body=woman&nonav=1&view=front&head=1" 1800 520
shot tops "mode=styles&kind=top&body=woman&nonav=1&view=34" 1500 800
shot tops-girl-back "mode=styles&kind=top&body=girl&nonav=1&view=34b" 1500 800
shot bottoms "mode=styles&kind=bottom&body=girl&nonav=1&view=34" 1200 800
shot accessories "mode=styles&kind=acc&body=girl&nonav=1&view=34" 1700 800
shot accessories-back "mode=styles&kind=acc&body=boy&nonav=1&view=34b" 1700 800
shot lie "mode=lie&body=woman&nonav=1&elev=14" 1500 560
shot gestures "mode=gestures&body=girl&nonav=1&view=34" 1900 520
shot random "mode=random&n=10&seed=3&nonav=1" 1900 700
for p in 0 1 2 3 4; do shot "activities-$p" "mode=activities&body=girl&nonav=1&view=34&page=$p&elev=10" 1900 560; done
shot activities-man-0 "mode=activities&body=man&nonav=1&view=front&page=0&per=6" 1900 700
shot creator "/tools/character-preview/creator.html" 1280 800
shot creator-walk "/tools/character-preview/creator.html?seed=7&walk=1" 1280 800
shot creator-closeup "/tools/character-preview/creator.html?body=woman&hairStyle=long&close=1" 1280 800
METRICS=1 node shoot.cjs - "mode=metrics&secs=1.5" 800 600 > "$OUT/metrics.json"
