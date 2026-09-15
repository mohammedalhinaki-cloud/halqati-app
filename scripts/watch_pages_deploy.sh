#!/bin/bash
# Polls the Pages build marker until the fresh artifact (post c79c73b) lands.
B="https://mohammedalhinaki-cloud.github.io/halqati-app"
OLD="page-2eaf2f222cb44543.js"
for i in $(seq 1 150); do
  CH=$(curl -s --max-time 15 "$B/?w=$i$(date +%s%N)" | grep -oE 'page-[a-f0-9]+\.js' | head -1)
  T=$(date -u +%H:%M:%S)
  if [ -n "$CH" ] && [ "$CH" != "$OLD" ]; then
    curl -s --max-time 15 "$B/_next/static/chunks/app/$CH" -o /tmp/watch_chunk.js
    HIT=$(grep -c "يجب أن تسبق" /tmp/watch_chunk.js 2>/dev/null || echo 1)
    if [ "$HIT" = "0" ] && [ "$(wc -c </tmp/watch_chunk.js)" -gt 20000 ]; then
      echo "$T FRESH-DEPLOY-CONFIRMED chunk=$CH validation-removed=yes"
      exit 0
    fi
  fi
  echo "$T waiting (chunk=${CH:-none})"
  sleep 180
done
echo "$(date -u +%H:%M:%S) GAVE-UP-AFTER-45MIN still-stale"
