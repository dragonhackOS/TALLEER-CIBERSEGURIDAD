#!/usr/bin/env bash
# Restaurar un respaldo:  ./scripts/backup/restore.sh backups/talleres-20261010-021500.dump
# ⚠ Reemplaza los datos actuales. Detén web y worker antes de restaurar.
set -euo pipefail
FILE="${1:?Uso: restore.sh <archivo.dump>}"
DB_USER="${POSTGRES_USER:-talleres}"
DB_NAME="${POSTGRES_DB:-talleres}"

[ -f "${FILE}.sha256" ] && sha256sum -c "${FILE}.sha256"

read -r -p "Esto sobrescribirá la base '${DB_NAME}'. Escribe RESTAURAR para continuar: " ok
[ "${ok}" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

docker compose stop web worker
# El trigger de auditoría impide borrar filas; --clean elimina y recrea los objetos.
docker compose exec -T postgres pg_restore -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner --single-transaction < "${FILE}"
docker compose start web worker
echo "[restore] OK"
