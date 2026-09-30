#!/usr/bin/env bash
# Respaldo de PostgreSQL con rotación.
#   ./scripts/backup/backup.sh                 (usa docker compose)
#   BACKUP_DIR=/srv/backups RETENTION_DAYS=30 ./scripts/backup/backup.sh
# Programar diario (cron del host):
#   15 2 * * * cd /ruta/al/proyecto && ./scripts/backup/backup.sh >> backups/backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_USER="${POSTGRES_USER:-talleres}"
DB_NAME="${POSTGRES_DB:-talleres}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="${BACKUP_DIR}/talleres-${STAMP}.dump"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[backup] Generando ${FILE}"
# Formato custom (-Fc): comprimido y restaurable selectivamente con pg_restore.
docker compose exec -T postgres pg_dump -U "${DB_USER}" -d "${DB_NAME}" -Fc --no-owner --no-privileges > "${FILE}"
chmod 600 "${FILE}"

# Verificación rápida de integridad del archivo.
docker compose exec -T postgres pg_restore --list < "${FILE}" > /dev/null
sha256sum "${FILE}" > "${FILE}.sha256"

echo "[backup] Eliminando respaldos con más de ${RETENTION_DAYS} días"
find "${BACKUP_DIR}" -name 'talleres-*.dump*' -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[backup] OK ($(du -h "${FILE}" | cut -f1))"
