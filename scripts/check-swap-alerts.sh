#!/bin/bash
# Checks Upstash KV for pending swap alerts and posts to X via xurl
# Run via cron every 1 minute

SITE_DIR="/Users/lobstarintern/lobstarintern-site"

# Load env vars
if [ -f "$SITE_DIR/.env.local" ]; then
  KV_URL=$(grep "^KV_REST_API_URL=" "$SITE_DIR/.env.local" | cut -d'"' -f2)
  KV_TOKEN=$(grep "^KV_REST_API_TOKEN=" "$SITE_DIR/.env.local" | cut -d'"' -f2)
fi

if [ -z "$KV_URL" ] || [ -z "$KV_TOKEN" ]; then
  exit 0
fi

# Pop one alert from the list
RESPONSE=$(curl -s "$KV_URL" \
  -X POST \
  -H "Authorization: Bearer $KV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '["LPOP", "pending_swap_alerts"]')

ALERT=$(echo "$RESPONSE" | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    result = r.get('result')
    if result and result != 'null':
        print(result)
except:
    pass
" 2>/dev/null)

if [ -z "$ALERT" ]; then
  exit 0
fi

# Parse the alert and compose tweet
TWEET=$(echo "$ALERT" | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    sig = d.get('signature', '')
    sol = d.get('solChange', 0)
    tokens = d.get('tokenChanges', [])
    source = d.get('source', '')

    parts = []
    if sol != 0:
        sign = '+' if sol > 0 else ''
        parts.append(f'{sign}{sol:.4f} SOL')
    for tc in tokens:
        amt = tc.get('amount', 0)
        name = tc.get('name', tc.get('mint', '???')[:8])
        sign = '+' if amt > 0 else ''
        if abs(amt) > 1:
            parts.append(f'{sign}{amt:,.0f} {name}')
        else:
            parts.append(f'{sign}{amt:.4f} {name}')

    change_str = ' | '.join(parts) if parts else 'Swap detected'

    tweet = f'LobstarWilde.sol swap detected.\n\n{change_str}'
    if source:
        tweet += f'\nvia {source.replace(\"_\", \" \")}'
    tweet += f'\n\nhttps://solscan.io/tx/{sig}'

    print(tweet)
except Exception as e:
    print(f'LobstarWilde.sol swap detected. Check Solscan for details.')
" 2>/dev/null)

if [ -n "$TWEET" ]; then
  xurl post "$TWEET" 2>/dev/null
  echo "$(date -u): Posted swap alert" >> /tmp/swap-alerts.log
fi
