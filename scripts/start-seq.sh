#!/usr/bin/env bash
set -euo pipefail

SEQ_PUBLIC_URL="${SEQ_PUBLIC_URL:-https://cmsapis.lightclouderp.com/logs}"
SEQ_HOST_PORT="${SEQ_HOST_PORT:-5341}"
SEQ_CONTAINER_NAME="${SEQ_CONTAINER_NAME:-seq}"
SEQ_ADMIN_USER="${SEQ_ADMIN_USER:-admin}"
SEQ_ADMIN_PASSWORD="${SEQ_ADMIN_PASSWORD:-}"

if [[ -z "$SEQ_ADMIN_PASSWORD" ]]; then
  echo "Set SEQ_ADMIN_PASSWORD before running, e.g.:"
  echo "  SEQ_ADMIN_PASSWORD='YourStrongPassword123!' bash scripts/start-seq.sh"
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$SEQ_CONTAINER_NAME"; then
  echo "Container '$SEQ_CONTAINER_NAME' already exists."
  echo "Start it:  docker start $SEQ_CONTAINER_NAME"
  echo "Recreate:  docker rm -f $SEQ_CONTAINER_NAME && $0"
  exit 1
fi

docker run -d \
  --name "$SEQ_CONTAINER_NAME" \
  --restart unless-stopped \
  -e ACCEPT_EULA=Y \
  -e "SEQ_FIRSTRUN_ADMINUSERNAME=${SEQ_ADMIN_USER}" \
  -e "SEQ_FIRSTRUN_ADMINPASSWORD=${SEQ_ADMIN_PASSWORD}" \
  -e "SEQ_API_CANONICALURI=${SEQ_PUBLIC_URL%/}/" \
  -e "SEQ_TRUSTEDPROXIES=0.0.0.0/0" \
  -v seq_data:/data \
  -p "127.0.0.1:${SEQ_HOST_PORT}:80" \
  datalust/seq

echo "Seq started."
echo "  UI:       ${SEQ_PUBLIC_URL}/"
echo "  Username: ${SEQ_ADMIN_USER}"
echo "  Upstream: http://127.0.0.1:${SEQ_HOST_PORT}"
echo "Restart the Node API: pm2 restart connect-cms-api"
