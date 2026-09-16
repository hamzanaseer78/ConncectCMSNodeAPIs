#!/usr/bin/env bash
# Fix Seq when served behind https://cmsapis.lightclouderp.com/logs
set -euo pipefail

SEQ_CONTAINER_NAME="${SEQ_CONTAINER_NAME:-seq}"
SEQ_PUBLIC_URL="${SEQ_PUBLIC_URL:-https://cmsapis.lightclouderp.com/logs}"

if ! docker ps --format '{{.Names}}' | grep -qx "$SEQ_CONTAINER_NAME"; then
  echo "Container '$SEQ_CONTAINER_NAME' is not running."
  exit 1
fi

CANONICAL="${SEQ_PUBLIC_URL%/}/"

docker exec "$SEQ_CONTAINER_NAME" seq config set -k api.canonicalUri -v "$CANONICAL"
docker exec "$SEQ_CONTAINER_NAME" seq config set -k trustedProxies -v "0.0.0.0/0"
docker restart "$SEQ_CONTAINER_NAME"

echo "Updated Seq canonical URI to: $CANONICAL"
echo "Restart the API: pm2 restart connect-cms-api"
