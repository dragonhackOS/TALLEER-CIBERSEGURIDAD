# PREPA YUCATÁN — TALLERES

Plataforma institucional para gestionar inscripciones de estudiantes a talleres de la Escuela Preparatoria Yucatán: verificación de correo institucional por OTP, cupos estrictos a prueba de concurrencia, reservas temporales, lista de espera con promoción automática, QR de asistencia, check-in, panel administrativo en tiempo real, auditoría inmutable, exportaciones y notificaciones por correo.

```bash
cp .env.example .env        # opcional para local; recomendado
docker compose up -d --build
```

| Servicio | URL |
|---|---|
| Sitio de alumnos | http://localhost:3000 |
| Panel administrativo | http://localhost:3000/admin |
| Buzón de correos de prueba (Mailpit) | http://localhost:8025 |

La primera vez, la contraseña del super administrador (`admin@prepayucatan.com` por defecto) se imprime en los logs si `SEED_ADMIN_PASSWORD` está vacío:

```bash
docker compose logs web | grep -A1 "CONTRASEÑA GENERADA"
```

---

## Índice

1. [Requisitos](#requisitos)
2. [Arquitectura](#arquitectura)
3. [Integridad de cupos (cómo se garantiza)](#integridad-de-cupos)
4. [Instalación y desarrollo local](#instalación-y-desarrollo-local)
5. [Variables de entorno](#variables-de-entorno)
6. [Migraciones y seed](#migraciones-y-seed)
7. [Docker](#docker)
8. [SMTP y notificaciones](#smtp-y-notificaciones)
9. [Redis](#redis)
10. [Creación del primer administrador y roles](#primer-administrador-y-roles)
11. [Configuración de talleres](#configuración-de-talleres)
12. [Seguridad](#seguridad)
13. [Pruebas](#pruebas)
14. [Producción](#producción)
15. [Railway](#railway)
16. [Backups](#backups)
17. [API](#api)

---

## Requisitos

- Docker 24+ y Docker Compose v2 (camino recomendado), **o**
- Node.js 20.18+ (probado con 22), PostgreSQL 14+ (probado con 16) y Redis 6+ (probado con 7).

## Arquitectura

```
                ┌──────────────── Next.js 15 (App Router, TypeScript) ────────────────┐
 Navegador ───▶ │ middleware.ts  CSP con nonce · CSRF (Origin + double-submit) · CORS │
                │ app/(public)   catálogo, inscripción, comprobante, "mi inscripción"  │
                │ app/admin      panel SaaS (RBAC) · SSE en tiempo real               │
                │ app/api/**     API REST (Zod .strict, rate limit, errores estables)  │
                │ server/        servicios de dominio · auth · repositorios            │
                └──────┬──────────────────────────┬───────────────────────────────────┘
                       │ Prisma 7 + adapter pg    │ ioredis
                ┌──────▼──────┐            ┌──────▼──────┐        ┌───────────────┐
                │ PostgreSQL  │            │   Redis     │        │ worker (tsx)  │
                │ fuente de   │            │ rate limit  │◀──────▶│ expira reservas│
                │ verdad      │            │ pub/sub SSE │        │ lista espera   │
                │ CHECK/locks │            │ anti-replay │        │ outbox correos │
                └─────────────┘            └─────────────┘        └───────────────┘
```

```
src/
  app/            páginas y rutas API (Next.js)
  components/     UI (primitivas estilo shadcn/ui, panel, sitio público)
  features/       flujo de inscripción (wizard, OTP, temporizadores)
  lib/            env, db, redis, crypto, logger, formato
  middleware.ts   cabeceras de seguridad, CSRF, CORS
  schemas/        esquemas Zod (compartidos cliente/servidor)
  server/
    auth/         sesiones de alumno/admin, Argon2id, RBAC
    http/         envoltura de rutas, cookies, guards
    repositories/ primitivas de bloqueo (FOR UPDATE, advisory locks)
    services/     inscripción, reservas, lista de espera, OTP, check-in,
                  notificaciones, outbox de correo, auditoría, exportaciones…
prisma/           schema.prisma · migrations/ · seed.ts
scripts/          worker, creación de administradores, backups
tests/            pruebas (incluye concurrencia 100 → 25)
docker/           entrypoint
```

**Decisiones clave**

- **PostgreSQL es la fuente definitiva de verdad.** Reservas, cupos, idempotencia y outbox de correo viven en la base de datos. Redis se usa para rate limiting, pub/sub en tiempo real y anti-replay de TOTP; si Redis cae, los cupos siguen siendo correctos.
- **Prisma 7 sin motor Rust** (driver adapter `pg`): menos binarios nativos y consultas SQL crudas parametrizadas donde se necesitan bloqueos.
- **Outbox de correo**: los correos se insertan en `email_logs` dentro de la misma transacción de la inscripción. Solo existen si hay COMMIT; se envían inmediatamente después y el worker reintenta con backoff exponencial.

## Integridad de cupos

Nunca puede existir `26 / 25`, aunque 100 alumnos confirmen en el mismo milisegundo. Se garantiza en capas:

1. **Bloqueo de fila** — `SELECT … FROM workshops WHERE id = $1 FOR UPDATE` serializa todas las inscripciones de un mismo taller.
2. **Lock consultivo por alumno** — `pg_advisory_xact_lock(hash(student))` serializa solicitudes del mismo alumno (política "un taller por evento").
3. **UPDATE atómico condicionado** — `UPDATE workshops SET registered_count = registered_count + 1 WHERE id = $1 AND registered_count < max_capacity RETURNING …`. Si no devuelve fila → `409 WORKSHOP_FULL`.
4. **Restricción física** — `CHECK (registered_count <= max_capacity)` en la tabla: la base de datos rechaza cualquier sobrecupo aunque existiera un bug.
5. **Índices únicos parciales** — `UNIQUE(student_id, workshop_id) WHERE status IN ('REGISTERED','CHECKED_IN','NO_SHOW')`, una sola reserva activa por alumno, una sola entrada activa en lista de espera.
6. **Reintentos** automáticos ante `deadlock_detected`/`serialization_failure`.

Flujo transaccional (`src/server/services/registration.service.ts → registerStudent`):

```
BEGIN
  lock alumno → SELECT workshop FOR UPDATE → validar estado/ventana
  → verificar duplicado → validar reserva propia o lugares libres
    (inscritos + reservas vigentes, y lista de espera vacía)
  → UPDATE condicionado del contador → INSERT inscripción
  → reserva CONVERTED → auditoría → correos al outbox → alertas de capacidad
  → respuesta idempotente (misma transacción)
COMMIT → evento en tiempo real → despacho inmediato de correos
```

La **reserva temporal** (5 min) se guarda en `reservations` con `expires_at`; toda consulta de disponibilidad ignora las vencidas, así que expiran solas aunque el navegador se cierre. El worker las marca como `EXPIRED` y, si hay lista de espera, promueve al siguiente.

## Instalación y desarrollo local

```bash
npm install                        # también ejecuta "prisma generate"
cp .env.example .env               # ajusta DATABASE_URL / REDIS_URL / AUTH_SECRET
npm run db:migrate                 # prisma migrate deploy
SEED_ADMIN_EMAIL=admin@prepayucatan.com npm run db:seed
npm run dev                        # http://localhost:3000
npm run worker                     # en otra terminal: reservas, lista de espera, correos
```

¿No tienes PostgreSQL/Redis locales? `docker compose -f docker-compose.test.yml up -d` levanta ambos en `localhost`.

Sin `SMTP_HOST` los correos no se envían: se registran en el log (el asunto del OTP se enmascara). Para ver los correos reales en local usa Mailpit: `docker run -p 1025:1025 -p 8025:8025 axllent/mailpit` y `SMTP_HOST=localhost SMTP_PORT=1025`.

## Variables de entorno

Todas están documentadas en [`.env.example`](.env.example) y se validan con Zod al arrancar (`src/lib/env.ts`); si falta algo crítico el proceso falla con un mensaje claro. Las más importantes:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL |
| `REDIS_URL` | Conexión Redis |
| `AUTH_SECRET` | ≥ 32 caracteres. Deriva (HKDF) las llaves de OTP, QR, hash de IP y cifrado TOTP. `openssl rand -base64 48` |
| `APP_URL` | URL pública. Con `https://` se activan cookies `Secure` + prefijo `__Host-`, HSTS y `upgrade-insecure-requests` |
| `ALLOWED_EMAIL_DOMAIN` | `prepayucatan.com` — coincidencia exacta del dominio |
| `ADMIN_NOTIFICATION_EMAILS` | Destinatarios separados por comas; se validan y nunca se exponen en la API pública |
| `SMTP_*`, `EMAIL_FROM` | Servidor de correo |
| `OTP_EXPIRATION_MINUTES`, `RESERVATION_TIMEOUT_MINUTES`, `SESSION_TIMEOUT_MINUTES` | 10 / 5 / 10 |
| `REGISTRATION_POLICY` | `ONE_PER_EVENT` (UNIQUE alumno+evento) o `ONE_PER_WORKSHOP` (UNIQUE alumno+taller) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile (se exige solo ante comportamiento sospechoso, o siempre con `TURNSTILE_ALWAYS=true`) |
| `TRUST_PROXY` | `true` solo detrás de un proxy inverso de confianza (para leer `X-Forwarded-For`) |

## Migraciones y seed

- Migraciones versionadas en `prisma/migrations/`. Además de las tablas, la migración inicial crea los `CHECK` de capacidad, los índices únicos parciales, el trigger que hace **inmutable** `audit_logs` y fija la zona horaria de la base en UTC.
- Aplicar: `npm run db:migrate` (en Docker se ejecuta automáticamente al iniciar `web`).
- Nueva migración tras cambiar `schema.prisma`: `npx prisma migrate dev --name <cambio>` (entorno de desarrollo).
- Seed (`npm run db:seed`, idempotente): crea **ROOTME IF YOU CAN** (25), **Hardware Hacking** (20) y **CTF Starter** (30), todos `OPEN`, de 3 horas; y el super administrador si defines `SEED_ADMIN_EMAIL`.

## Docker

```bash
docker compose up -d --build      # postgres, redis, mailpit, web, worker
docker compose logs -f web worker
docker compose down               # conserva datos (volúmenes pgdata, redisdata, appdata)
docker compose down -v            # ⚠ borra todos los datos
```

- `web` espera a que PostgreSQL y Redis estén sanos, aplica migraciones, ejecuta el seed (si `RUN_SEED=true`) e inicia Next.js. Tiene healthcheck en `/api/health`.
- `worker` usa la misma imagen (`command: worker`) y comparte el volumen `appdata` (ahí se guarda `AUTH_SECRET` si no lo defines).
- PostgreSQL y Redis **no publican puertos** hacia el host. Redis exige contraseña.
- La imagen corre como usuario no-root (uid 1001) con `tini` como PID 1.
- Después del primer arranque puedes poner `RUN_SEED=false` en `.env`.

## SMTP y notificaciones

Configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` (`true` para 465) y `EMAIL_FROM`. Funciona con Google Workspace, Microsoft 365, Amazon SES, SendGrid, Mailgun, Postmark, etc. Recomendado: SPF, DKIM y DMARC para el dominio remitente.

| Evento | Destinatario | Asunto |
|---|---|---|
| OTP | Alumno | `Tu código de verificación` |
| Inscripción confirmada (solo tras COMMIT) | Alumno (con QR) y administradores | `Nueva inscripción — <taller>` + botón **VER EN PANEL** → `/admin/registrations/{id}` |
| 80 % / 90 % de ocupación | Administradores | `Ocupación 80% — <taller>` |
| Último lugar | Administradores | `Último lugar disponible — <taller>` |
| 100 % | Administradores | `Taller lleno — <taller>` + **VER INSCRITOS** |
| Cancelación | Administradores y alumno | `Cancelación — <taller>` |
| Promoción desde lista de espera | Alumno y administradores | `Promovido desde lista de espera — <taller>` |

Las alertas de capacidad se registran en `capacity_notification_events` con `UNIQUE(workshop_id, kind, capacity_snapshot)`: nunca se repiten (se rearman solo si cambia la capacidad). No se envía nada si falla el formulario, el OTP es incorrecto, solo existe una reserva o el alumno abandona.

## Redis

- **Rate limiting** con ventana deslizante atómica (Lua + sorted set). Los identificadores se guardan hasheados.

  | Acción | Límite |
  |---|---|
  | Solicitar OTP | 3 / 15 min por correo · 20 / 15 min por IP |
  | Verificar OTP | 5 / 15 min por correo (+ 5 intentos por código) |
  | Formulario | 5 / 10 min por IP |
  | Inscripción | 5 / 10 min por alumno |
  | Login administrativo | 5 / 15 min por correo+IP · 20 / 15 min por IP · bloqueo de cuenta tras 10 fallos |
  | API pública | 60 / min por IP |

  Respuesta: `429 {"error":"RATE_LIMITED","message":"Demasiadas solicitudes. Inténtalo más tarde."}` con `Retry-After`. Los límites de autenticación fallan cerrados si Redis no responde.
- **Pub/Sub** `py:realtime` → Server-Sent Events del panel (`/api/admin/stream`).
- **Puntaje de sospecha** por IP (honeypot, envíos demasiado rápidos, OTP fallidos, rate limits) que activa Turnstile dinámicamente.

## Primer administrador y roles

Opción A — automáticamente con Docker (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`).

Opción B — desde la terminal (pide la contraseña sin mostrarla):

```bash
docker compose exec web npm run admin:create -- --email coordinacion@prepayucatan.com --name "Coordinación" --role SUPER_ADMIN
# local: npm run admin:create -- --email … --role ADMIN
```

Después, desde **Administradores** el super administrador crea cuentas, cambia roles, desactiva cuentas y revoca sesiones. Cada administrador puede activar **2FA TOTP** en **Mi cuenta**.

| Rol | Permisos |
|---|---|
| `SUPER_ADMIN` | Control total, administradores y configuración |
| `ADMIN` | Talleres, alumnos, inscripciones, lista de espera, exportaciones, auditoría |
| `INSTRUCTOR` | Lectura y check-in **solo de sus talleres asignados** |
| `CHECKIN_STAFF` | Solo check-in y asistencia |
| `VIEWER` | Solo lectura |

Los permisos se verifican en el backend en cada endpoint (`requireAdmin(req, "permiso")`); ocultar botones en el frontend es solo cosmético.

## Configuración de talleres

Panel → **Talleres** → *Nuevo taller*: nombre, slug, descripción, instructor (y cuenta de instructor asignada), fecha, horario, lugar, nivel, capacidad, icono/imagen, prefijo del código (`PY-CTF-XXXXXX`) y **evento** (agrupa talleres para la regla "un taller por evento").

Estados: `DRAFT → OPEN ⇄ FULL (automático) → CLOSED / CANCELLED / FINISHED`, más archivar/duplicar. Estados públicos derivados en el servidor: **Disponible, Pocos lugares, Cupo lleno, Cerrado, Próximamente**.

Capacidad: se cambia con bloqueo de fila; nunca por debajo de los inscritos (*"No puedes establecer una capacidad inferior al número actual de estudiantes inscritos."*). Si aumenta, se promueve la lista de espera.

**Logo oficial**: copia el archivo a `public/brand/` y ponlo en **Configuración → Identidad institucional** (o `LOGO_URL`).

## Seguridad

| Amenaza | Mitigación |
|---|---|
| SQL Injection | Prisma + consultas crudas **parametrizadas** (tagged templates); sin SQL dinámico |
| XSS | React escapa por defecto; CSP con **nonce** + `strict-dynamic`; escapado explícito en plantillas de correo |
| CSRF | Cookies `SameSite=Strict`; verificación de `Origin`/`Referer`; token double-submit `X-CSRF-Token` |
| IDOR / manipulación de IDs | UUID y `publicId` aleatorios (~130 bits); toda consulta filtra por el dueño de la sesión; instructores limitados a sus talleres |
| Mass assignment | Esquemas Zod `.strict()`; nunca se aceptan `role`, `capacity`, `status` ni contadores del cliente |
| Replay | Idempotency-Key; OTP de un solo uso; TOTP anti-replay; QR versionado (regenerar invalida el anterior) |
| Race conditions | `FOR UPDATE`, advisory locks, UPDATE condicionado, `CHECK`, índices únicos parciales |
| Fuerza bruta | Rate limiting, máximo de intentos de OTP, bloqueo de cuenta, Argon2id (m=19 MiB, t=2) |
| Sesiones | Tokens aleatorios de 256 bits, solo el hash SHA-256 en BD; `HttpOnly`, `Secure`, `SameSite=Strict`, `__Host-`; expiración absoluta + inactividad; revocables; token nuevo en cada login (anti fixation) |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |
| Fuga de datos | `Referrer-Policy`, `Permissions-Policy`, CORS sin orígenes externos, QR sin datos personales, destinatarios nunca expuestos, IPs hasheadas con HMAC |
| Bots | Honeypot `website_url`, tiempo mínimo de llenado, puntaje de sospecha, Turnstile dinámico; el cliente nunca sabe qué capa se activó |
| Alias de correo | Dominio exacto; se rechazan `+alias`, subdominios, sufijos y homógrafos Unicode |
| CSV injection | Celdas que empiezan con `= + - @` se neutralizan en exportaciones |
| Auditoría | `audit_logs` append-only con trigger (UPDATE/DELETE/TRUNCATE bloqueados) |

**Logging estructurado** (JSON por línea) con redacción automática de contraseñas, OTP, tokens, cookies y secretos: `{"event":"registration_created","registrationId":"…","workshop":"rootme-if-you-can","timestamp":"…"}`.

## Pruebas

```bash
docker compose -f docker-compose.test.yml up -d   # PostgreSQL + Redis efímeros
npm run test:prepare                               # migraciones en talleres_test
npm test
```

47 pruebas contra PostgreSQL y Redis reales, entre ellas la **prueba obligatoria de concurrencia**:

```
✓ 100 inscripciones simultáneas → 25 creadas, 75 rechazadas (WORKSHOP_FULL)
✓ 100 reservas simultáneas → 25 lugares retenidos como máximo
✓ mezcla simultánea de reservas e inscripciones directas nunca supera el cupo
✓ el mismo alumno enviando 50 solicitudes simultáneas obtiene una sola inscripción
✓ la base de datos rechaza físicamente el sobrecupo (CHECK constraint)
```

También cubren: dominio de correo, OTP (texto plano, un solo uso, incorrecto, expirado, intentos, rate limit), inscripción duplicada, política por evento, notificaciones solo tras COMMIT, alertas sin repetición, idempotencia, reservas (retención, expiración, conversión), cancelaciones, lista de espera y promoción, cambio de capacidad, RBAC, check-in/QR (firma, alteración, doble uso, revocación), expiración de sesión, inmutabilidad de auditoría y CSV injection.

## Producción

1. Dominio con HTTPS (Caddy, nginx o Cloudflare delante) → `APP_URL=https://talleres.prepayucatan.com` y `TRUST_PROXY=true`.
2. `AUTH_SECRET` propio y fuerte; contraseñas fuertes para `POSTGRES_PASSWORD` y `REDIS_PASSWORD`.
3. SMTP real (y elimina el servicio `mailpit`).
4. `RUN_SEED=false` tras el primer arranque; crea administradores nominales y activa 2FA.
5. Respaldos automáticos (abajo) y monitoreo de `/api/health`.
6. Opcional: Turnstile (`TURNSTILE_SITE_KEY`/`SECRET_KEY`).
7. Revisa el texto de `/privacidad` con el área jurídica.

Ejemplo de proxy (Caddy):

```
talleres.prepayucatan.com {
  reverse_proxy localhost:3000 {
    flush_interval -1   # necesario para Server-Sent Events
  }
}
```

## Railway

1. `npm i -g @railway/cli && railway login && railway init` dentro de la carpeta del proyecto.
2. En el proyecto: **+ New → Database → PostgreSQL** y **+ New → Database → Redis**.
3. `railway up` crea el servicio **web** (usa el `Dockerfile`). En *Settings*: *Healthcheck Path* `/api/health` y *Networking → Generate Domain*.
4. Variables del servicio **web**:

   ```env
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   AUTH_SECRET=<openssl rand -base64 48>
   APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
   TRUST_PROXY=true
   ALLOWED_EMAIL_DOMAIN=prepayucatan.com
   ADMIN_NOTIFICATION_EMAILS=dragonhackprime@gmail.com,gretty.escalante@prepayucatan.com
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=2587
   SMTP_USER=resend
   SMTP_PASSWORD=<api key>
   SMTP_SECURE=false
   EMAIL_FROM=Talleres Prepa Yucatán <no-reply@prepayucatan.com>
   RUN_SEED=true
   SEED_ADMIN_EMAIL=admin@prepayucatan.com
   SEED_ADMIN_PASSWORD=<12+ caracteres>
   ```
5. Servicio **worker**: *+ New → Empty Service*, `railway up --service worker`, mismas variables (sin `SEED_*`, `RUN_SEED=false`), *Custom Start Command* `/usr/local/bin/entrypoint.sh worker` y **sin** healthcheck ni dominio. `AUTH_SECRET` debe ser idéntico en web y worker.
6. Railway bloquea SMTP en los puertos 25/465/587 en planes Free/Trial/Hobby: usa un proveedor con puerto alterno (Resend 2587/2465, Mailgun/Brevo 2525) o el plan Pro.
7. Tras el primer despliegue exitoso, cambia `RUN_SEED=false`.

## Backups

```bash
./scripts/backup/backup.sh                         # pg_dump -Fc + verificación + sha256 + rotación
BACKUP_DIR=/srv/backups RETENTION_DAYS=30 ./scripts/backup/backup.sh
./scripts/backup/restore.sh backups/talleres-20261010-021500.dump
```

- **Automático** (cron del host, diario a las 02:15):
  `15 2 * * * cd /opt/prepa-talleres && ./scripts/backup/backup.sh >> backups/backup.log 2>&1`
- **Rotación**: se eliminan los respaldos con más de `RETENTION_DAYS` días (14 por defecto). Recomendado: 7 diarios + 4 semanales + 12 mensuales y una copia **fuera del servidor** (S3/Backblaze/Drive institucional) cifrada.
- **Restauración**: detiene `web` y `worker`, ejecuta `pg_restore --clean --single-transaction` y los reinicia. Prueba la restauración periódicamente en un entorno aparte.
- Manual equivalente: `docker compose exec -T postgres pg_dump -U talleres -d talleres -Fc > respaldo.dump`.

## API

Todas las respuestas de error tienen la forma `{"error": "CODIGO", "message": "Texto en español"}`. Códigos HTTP: 200, 201, 400, 401, 403, 404, 409, 422, 429, 500.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/request-code` | Envía OTP (`email`, honeypot) |
| POST | `/api/auth/verify-code` | Verifica OTP y crea sesión de alumno |
| GET/DELETE | `/api/session` · POST `/api/session/keepalive` | Estado, cierre y renovación de la sesión |
| GET | `/api/workshops` · `/api/workshops/:id` | Catálogo con cupos calculados en el servidor |
| POST | `/api/reservations` · DELETE `/api/reservations/:id` | Reserva temporal |
| POST | `/api/registrations` | Inscripción (**`Idempotency-Key: <UUID>`** obligatoria) |
| GET | `/api/registration/:publicId` · `/qr` | Comprobante y QR |
| POST | `/api/waitlist` | Unirse a la lista de espera |
| GET | `/api/me` · POST `/api/me/registrations/:id/cancel` · DELETE `/api/me/waitlist/:id` | Autoservicio del alumno |
| POST | `/api/admin/auth/login` · `logout` · GET `me` | Autenticación administrativa |
| GET | `/api/admin/dashboard` · `/api/admin/stream` (SSE) | Métricas y tiempo real |
| GET/POST | `/api/admin/workshops` · GET/PATCH `/:id` · POST `/:id/actions` · PUT `/:id/capacity` | Talleres |
| GET | `/api/admin/registrations` · GET/PATCH `/:id` | Inscripciones y acciones (cancelar, mover, check-in, reenviar, regenerar QR) |
| POST | `/api/admin/checkin` · GET `/api/admin/checkin/search` | Check-in (QR, código o búsqueda) |
| GET | `/api/admin/students` · `/waitlist` · `/attendance` · `/audit` · `/exports` | Consultas y exportaciones (CSV/XLSX) |
| GET/POST/PATCH | `/api/admin/admins` · GET/PUT `/api/admin/settings` | Administración |
| GET | `/api/health` | Salud de PostgreSQL y Redis |

Ejemplo de cupo lleno:

```http
HTTP/1.1 409 Conflict
{"error":"WORKSHOP_FULL","message":"El taller ha alcanzado su capacidad máxima.","details":{"waitlistAvailable":true}}
```
