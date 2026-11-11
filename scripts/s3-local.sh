#!/usr/bin/env bash
# Local S3 stand-in for R2 used by the API integration tests (design.md D16).
# versitygw verifies SigV4 (headers and presigned query), so presigned PUT/GET
# behave like R2. Creates the test bucket.
set -euo pipefail
NAME=moverse-s3
if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -p 9000:7070 \
    -e ROOT_ACCESS_KEY=moverse -e ROOT_SECRET_KEY=moverse-secret \
    --entrypoint sh versity/versitygw:v1.0.16 \
    -c 'mkdir -p /data && exec /app/versitygw posix /data' >/dev/null
fi
for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9000/ || true)
  [ "$code" != "000" ] && exit 0
  sleep 1
done
echo "s3 gateway did not start" >&2
docker logs "$NAME" >&2 || true
exit 1
