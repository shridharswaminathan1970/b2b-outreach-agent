#!/usr/bin/env bash
# Dump the database to ./backups/. Uses DIRECT_URL (session connection) from .env.
# Optionally upload to object storage (S3/R2) by setting BACKUP_UPLOAD_CMD.
set -euo pipefail
cd "$(dirname "$0")/.."

DIRECT_URL="$(grep -E '^DIRECT_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' || true)"
if [ -z "${DIRECT_URL:-}" ]; then
  echo "ERROR: DIRECT_URL not found in .env" >&2
  exit 1
fi

mkdir -p backups
OUT="backups/backup-$(date +%Y%m%d-%H%M%S).sql"
echo "==> Dumping database to ${OUT}…"
pg_dump "${DIRECT_URL}" --no-owner --no-privileges > "${OUT}"
echo "==> Wrote ${OUT}"

# Optional: upload, e.g. BACKUP_UPLOAD_CMD='aws s3 cp {} s3://my-bucket/'
if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  echo "==> Uploading…"
  eval "${BACKUP_UPLOAD_CMD//\{\}/$OUT}"
fi
