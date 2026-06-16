#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DB="${YIBIAO_DB_PATH:-$HOME/Library/Application Support/yibiao-client/workspace/yibiao.sqlite}"
BACKUP_DIR="${YIBIAO_BACKUP_DIR:-$PROJECT_ROOT/output/database-backups}"
RETENTION_DAYS="${YIBIAO_BACKUP_RETENTION_DAYS:-30}"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_name="yibiao-${timestamp}.sqlite"
backup_path="$BACKUP_DIR/$backup_name"
tmp_path="$BACKUP_DIR/.${backup_name}.tmp"
latest_path="$BACKUP_DIR/yibiao-latest.sqlite"
log_path="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$log_path"
}

if ! command -v sqlite3 >/dev/null 2>&1; then
  log "ERROR: sqlite3 command not found"
  exit 1
fi

if [ ! -f "$SOURCE_DB" ]; then
  log "ERROR: source database not found: $SOURCE_DB"
  exit 1
fi

rm -f "$tmp_path"
sqlite3 "$SOURCE_DB" <<SQL
.timeout 5000
.backup '$tmp_path'
SQL

integrity_result="$(sqlite3 "$tmp_path" 'pragma integrity_check;' | tr -d '\r')"
if [ "$integrity_result" != "ok" ]; then
  rm -f "$tmp_path"
  log "ERROR: backup integrity_check failed: $integrity_result"
  exit 1
fi

mv "$tmp_path" "$backup_path"
ln -sfn "$backup_name" "$latest_path"

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [ "$RETENTION_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -name 'yibiao-*.sqlite' -type f -mtime +"$RETENTION_DAYS" -delete
fi

size_bytes="$(wc -c < "$backup_path" | tr -d ' ')"
log "OK: backed up $SOURCE_DB to $backup_path (${size_bytes} bytes)"
printf '%s\n' "$backup_path"
