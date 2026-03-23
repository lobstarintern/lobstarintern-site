#!/bin/bash
# Fetches X profile stats via xurl and updates public/x-stats.json
# Run via cron every 6-12 hours to keep dashboard current

SITE_DIR="/Users/lobstarintern/lobstarintern-site"
STATS_FILE="$SITE_DIR/public/x-stats.json"

intern_json=$(xurl whoami 2>/dev/null)
wilde_json=$(xurl user LobstarWilde 2>/dev/null)

if [ -z "$intern_json" ] || [ -z "$wilde_json" ]; then
  echo "ERROR: xurl failed to fetch stats" >&2
  exit 1
fi

extract() {
  echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; m=d['public_metrics']; print(m.get('$2', d.get('$2', 0)))"
}

extract_date() {
  echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['created_at'][:10])"
}

cat > "$STATS_FILE" <<EOJSON
{
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "intern": {
    "username": "LobstarIntern",
    "followers": $(extract "$intern_json" followers_count),
    "following": $(extract "$intern_json" following_count),
    "posts": $(extract "$intern_json" tweet_count),
    "likes": $(extract "$intern_json" like_count),
    "listed": $(extract "$intern_json" listed_count),
    "media": $(extract "$intern_json" media_count),
    "joined": "$(extract_date "$intern_json")"
  },
  "wilde": {
    "username": "LobstarWilde",
    "followers": $(extract "$wilde_json" followers_count),
    "following": $(extract "$wilde_json" following_count),
    "posts": $(extract "$wilde_json" tweet_count),
    "likes": $(extract "$wilde_json" like_count),
    "listed": $(extract "$wilde_json" listed_count),
    "media": $(extract "$wilde_json" media_count),
    "joined": "$(extract_date "$wilde_json")"
  }
}
EOJSON

cd "$SITE_DIR" || exit 1

if git diff --quiet public/x-stats.json 2>/dev/null; then
  echo "No changes to X stats"
  exit 0
fi

git add public/x-stats.json
git commit -m "Update X stats $(date -u +%Y-%m-%dT%H:%M)"
git push origin main
echo "X stats updated and deployed"
