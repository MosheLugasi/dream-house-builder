#!/usr/bin/env bash
# Re-create every screenshot under tools/pet-preview/shots/.
#   npx vite --port 5192 --strictPort &      (from the repo root)
#   bash tools/pet-preview/shoot-all.sh
set -e
cd "$(dirname "$0")/../.."
S="node tools/pet-preview/shoot.cjs"
for id in dog puppy cat; do
  case $id in dog) span=0.95; close=0.42; cy=0.63; cz=0.42;; puppy) span=0.56; close=0.3; cy=0.37; cz=0.22;; cat) span=0.5; close=0.22; cy=0.27; cz=0.2;; esac
  case $id in dog) walk=1.4; trot=2.8; run=5;; puppy) walk=1.1; trot=2; run=4;; cat) walk=1; trot=2.2; run=4;; esac
  $S $id-turn "pet=pet-$id&view=turn"
  $S $id-turn-close "pet=pet-$id&view=turn&pole=0&span=$span&tile=640x520"
  $S $id-head "pet=pet-$id&view=turn&pole=0&span=$close&tile=560x460&cy=$cy&cz=$cz&static=1"
  $S $id-walk "pet=pet-$id&view=strip&speed=$walk&frames=8&tile=400x300&span=$span&travel=1"
  $S $id-trot "pet=pet-$id&view=strip&speed=$trot&frames=8&tile=400x300&span=$span&travel=1"
  GAIT=0.3,$walk,$trot,$run $S $id-run "pet=pet-$id&view=strip&speed=$run&frames=8&tile=400x300&span=$span&travel=1"
  $S $id-moods "pet=pet-$id&view=seq&seq=idle:1,sit:1.6,lie:1.8,happy:1.6&frames=12&tile=400x320&span=$span&az=55&el=12"
  $S $id-happy "pet=pet-$id&view=seq&seq=happy:3&t0=1.5&t1=1.92&frames=8&tile=400x320&span=$span&az=150&el=18"
  $S $id-transitions "pet=pet-$id&view=seq&seq=idle:0.4:0,idle:1.2:$walk,idle:1.2:$trot,idle:1.2:$run,idle:0.8:0,happy:1.2:$walk,sit:1.4&frames=16&tile=380x290&span=$span&travel=1"
done
$S dog-idle "pet=pet-dog&view=seq&seq=idle:12&t0=0.5&t1=11.5&frames=8&tile=400x330&span=0.95&az=35&el=10"
$S cat-recolor "pet=pet-cat&view=turn&pole=0&span=0.5&tile=640x520&colors=coat:%23777b82;markings:%2333363b;collar:%23d43c6a"
$S dog-recolor "pet=pet-dog&view=turn&pole=0&span=0.95&tile=640x520&colors=coat:%232e2a28;markings:%236b5a4c;collar:%233a8ed0"
