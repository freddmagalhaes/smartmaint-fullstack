#!/usr/bin/env bash
# Sobe um MySQL descartável em Docker, roda a suíte e remove o container.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=smartmaint-test-db-tmp
PORT="${TEST_DB_PORT:-3399}"
PASS="teste-local-123"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
docker run -d --name "$NAME" -e MYSQL_ROOT_PASSWORD="$PASS" -p "127.0.0.1:$PORT:3306" mysql:8.0 >/dev/null
for _ in $(seq 1 40); do
  docker exec "$NAME" mysqladmin ping -h 127.0.0.1 -uroot -p"$PASS" --silent 2>/dev/null && break
  sleep 3
done
TEST_DB_HOST=127.0.0.1 TEST_DB_PORT="$PORT" TEST_DB_USER=root TEST_DB_PASSWORD="$PASS" npm test
