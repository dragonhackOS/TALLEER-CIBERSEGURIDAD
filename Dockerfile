# ─────────────────────────────────────────────────────────────
# PREPA YUCATÁN — TALLERES · imagen de producción
#   - Next.js (web) y worker comparten la misma imagen
#   - Usuario no-root, healthcheck, secretos solo por variables de entorno
# ─────────────────────────────────────────────────────────────
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- dependencias ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

# ---------- build ----------
FROM deps AS build
COPY . .
RUN npx prisma generate \
 && npx next build \
 # Descarga anticipada del motor de migraciones de Prisma (evita descargas en runtime)
 && npx prisma version >/dev/null

# ---------- runtime ----------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 app \
 && useradd --system --uid 1001 --gid app --home /app app \
 && mkdir -p /app/data \
 && chown app:app /app/data

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/scripts ./scripts
COPY --from=build --chown=app:app /app/package.json /app/next.config.ts /app/prisma.config.ts /app/tsconfig.json ./
COPY --chown=app:app docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh

USER app
EXPOSE 3000
# /app/data: montar un volumen (docker compose lo hace) si AUTH_SECRET no se define por variable.

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["web"]
