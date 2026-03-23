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

intern_followers=$(echo "$intern_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['public_metrics']['followers_count'])")
intern_following=$(echo "$intern_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['public_metrics']['following_count'])")
intern_posts=$(echo "$intern_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['public_metrics']['tweet_count'])")
intern_likes=$(echo "$intern_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['public_metrics']['like_count'])")
intern_listed=$(echo "$intern_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['public_metrics']['listed_count'])")

wilde_followers=$(echo "$wilde_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['public_metrics']['followers_count'])")
wilde_following=$(echo "$wilde_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['public_metrics']['following_count'])")
wilde_posts=$(echo "$wilde_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['public_metrics']['tweet_count'])")
wilde_likes=$(echo "$wilde_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['public_metrics']['like_count'])")
wilde_listed=$(echo "$wilde_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['public_metrics']['listed_count'])")

cat > "$STATS_FILE" <<EOJSON
{
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "intern": {
    "username": "LobstarIntern",
    "followers": $intern_followers,
    "following": $intern_following,
    "posts": $intern_posts,
    "likes": $intern_likes,
    "listed": $intern_listed
  },
  "wilde": {
    "username": "LobstarWilde",
    "followers": $wilde_followers,
    "following": $wilde_following,
    "posts": $wilde_posts,
    "likes": $wilde_likes,
    "listed": $wilde_listed
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
