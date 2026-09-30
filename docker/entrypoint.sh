#!/bin/sh
# Punto de entrada del contenedor.
#   web     → migraciones + (seed opcional) + Next.js
#   worker  → tareas periódicas (reservas, lista de espera, correos)
#   *       → comando arbitrario (p. ej. "npm run admin:create -- ...")
set -eu

# AUTH_SECRET: si no se proporcionó, se genera UNA vez y se persiste en el volumen
# compartido /app/data (web y worker deben usar el mismo secreto).
if [ -z "${AUTH_SECRET:-}" ]; then
  if [ ! -s /app/data/auth_secret ]; then
    umask 077
    node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" > /app/data/auth_secret
    echo "[entrypoint] AUTH_SECRET generado y guardado en /app/data/auth_secret (defínelo explícitamente en producción)."
  fi
  AUTH_SECRET="$(cat /app/data/auth_secret)"
  export AUTH_SECRET
fi

case "${1:-web}" in
  web)
    if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
      echo "[entrypoint] Aplicando migraciones…"
      npx prisma migrate deploy
    fi
    if [ "${RUN_SEED:-false}" = "true" ]; then
      echo "[entrypoint] Ejecutando seed (idempotente)…"
      npx tsx prisma/seed.ts
    fi
    echo "[entrypoint] Iniciando servidor web en :${PORT:-3000}"
    exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
    ;;
  worker)
    echo "[entrypoint] Iniciando worker"
    exec npx tsx scripts/worker.ts
    ;;
  *)
    exec "$@"
    ;;
esac
