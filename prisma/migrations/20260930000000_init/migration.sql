-- PREPA YUCATÁN — TALLERES · migración inicial
-- Estructura generada a partir de prisma/schema.prisma + restricciones de integridad
-- que Prisma no puede expresar (CHECK, índices únicos parciales, triggers).

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE "WorkshopStatus" AS ENUM ('DRAFT', 'OPEN', 'FULL', 'CLOSED', 'CANCELLED', 'FINISHED');
CREATE TYPE "WorkshopLevel" AS ENUM ('PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO');
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'CHECKED_IN', 'NO_SHOW', 'CANCELLED', 'WAITLISTED');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'EXPIRED', 'RELEASED');
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'PROMOTED', 'CANCELLED');
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'INSTRUCTOR', 'CHECKIN_STAFF', 'VIEWER');
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');
CREATE TYPE "CheckinMethod" AS ENUM ('QR', 'MANUAL', 'CODE');
CREATE TYPE "ActorType" AS ENUM ('ADMIN', 'STUDENT', 'SYSTEM');

-- ============================================================
-- TABLES
-- ============================================================
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "full_name" VARCHAR(120),
    "classroom" VARCHAR(20),
    "semester" INTEGER,
    "phone" VARCHAR(20),
    "programming_experience" VARCHAR(40),
    "security_experience" VARCHAR(40),
    "ctf_before" BOOLEAN,
    "privacy_accepted_at" TIMESTAMP(3),
    "email_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_sessions" (
    "id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "student_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "student_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workshops" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "instructor_name" VARCHAR(120) NOT NULL,
    "instructor_admin_id" UUID,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "level" "WorkshopLevel" NOT NULL,
    "max_capacity" INTEGER NOT NULL,
    "registered_count" INTEGER NOT NULL DEFAULT 0,
    "image_url" VARCHAR(500),
    "icon" VARCHAR(40),
    "code_prefix" VARCHAR(6) NOT NULL DEFAULT 'TLR',
    "event_key" VARCHAR(60) NOT NULL DEFAULT 'default',
    "status" "WorkshopStatus" NOT NULL DEFAULT 'DRAFT',
    "registration_opens_at" TIMESTAMP(3),
    "registration_closes_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workshops_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "registrations" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(40) NOT NULL,
    "registration_code" VARCHAR(20) NOT NULL,
    "student_id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "event_key" VARCHAR(60) NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "qr_version" INTEGER NOT NULL DEFAULT 1,
    "source" VARCHAR(20) NOT NULL DEFAULT 'WEB',
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "promoted_registration_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_by_id" UUID,
    "method" "CheckinMethod" NOT NULL,
    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_verifications" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "ip_hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'VIEWER',
    "totp_secret" VARCHAR(255),
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "admin_id" UUID NOT NULL,
    "ip_hash" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID,
    "actor_type" "ActorType" NOT NULL DEFAULT 'ADMIN',
    "action" VARCHAR(60) NOT NULL,
    "resource_type" VARCHAR(40),
    "resource_id" VARCHAR(80),
    "metadata" JSONB,
    "ip_hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "scope" VARCHAR(80) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "state" VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "capacity_notification_events" (
    "id" UUID NOT NULL,
    "workshop_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "capacity_snapshot" INTEGER NOT NULL,
    "registered_snapshot" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "capacity_notification_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "to_addresses" TEXT[],
    "subject" VARCHAR(250) NOT NULL,
    "template" VARCHAR(60) NOT NULL,
    "payload" JSONB,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "related_type" VARCHAR(40),
    "related_id" VARCHAR(80),
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settings" (
    "key" VARCHAR(60) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- ============================================================
-- INDEXES (Prisma)
-- ============================================================
CREATE UNIQUE INDEX "students_email_key" ON "students"("email");
CREATE INDEX "students_created_at_idx" ON "students"("created_at");
CREATE UNIQUE INDEX "student_sessions_token_hash_key" ON "student_sessions"("token_hash");
CREATE INDEX "student_sessions_student_id_idx" ON "student_sessions"("student_id");
CREATE INDEX "student_sessions_expires_at_idx" ON "student_sessions"("expires_at");
CREATE UNIQUE INDEX "workshops_slug_key" ON "workshops"("slug");
CREATE INDEX "workshops_status_idx" ON "workshops"("status");
CREATE INDEX "workshops_event_key_idx" ON "workshops"("event_key");
CREATE INDEX "workshops_created_at_idx" ON "workshops"("created_at");
CREATE INDEX "reservations_workshop_id_status_expires_at_idx" ON "reservations"("workshop_id", "status", "expires_at");
CREATE INDEX "reservations_student_id_idx" ON "reservations"("student_id");
CREATE INDEX "reservations_status_idx" ON "reservations"("status");
CREATE UNIQUE INDEX "registrations_public_id_key" ON "registrations"("public_id");
CREATE UNIQUE INDEX "registrations_registration_code_key" ON "registrations"("registration_code");
CREATE INDEX "registrations_student_id_idx" ON "registrations"("student_id");
CREATE INDEX "registrations_workshop_id_idx" ON "registrations"("workshop_id");
CREATE INDEX "registrations_status_idx" ON "registrations"("status");
CREATE INDEX "registrations_created_at_idx" ON "registrations"("created_at");
CREATE INDEX "registrations_event_key_idx" ON "registrations"("event_key");
CREATE INDEX "waitlist_entries_workshop_id_status_position_idx" ON "waitlist_entries"("workshop_id", "status", "position");
CREATE INDEX "waitlist_entries_student_id_idx" ON "waitlist_entries"("student_id");
CREATE UNIQUE INDEX "attendances_registration_id_key" ON "attendances"("registration_id");
CREATE INDEX "attendances_checked_in_at_idx" ON "attendances"("checked_in_at");
CREATE INDEX "email_verifications_email_created_at_idx" ON "email_verifications"("email", "created_at");
CREATE INDEX "email_verifications_expires_at_idx" ON "email_verifications"("expires_at");
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");
CREATE INDEX "admins_role_idx" ON "admins"("role");
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions"("admin_id");
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");
CREATE INDEX "audit_logs_admin_id_idx" ON "audit_logs"("admin_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");
CREATE UNIQUE INDEX "capacity_notification_events_workshop_id_kind_capacity_snap_key" ON "capacity_notification_events"("workshop_id", "kind", "capacity_snapshot");
CREATE INDEX "email_logs_status_next_attempt_at_idx" ON "email_logs"("status", "next_attempt_at");
CREATE INDEX "email_logs_created_at_idx" ON "email_logs"("created_at");

-- ============================================================
-- FOREIGN KEYS
-- ============================================================
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workshops" ADD CONSTRAINT "workshops_instructor_admin_id_fkey" FOREIGN KEY ("instructor_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_checked_in_by_id_fkey" FOREIGN KEY ("checked_in_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "capacity_notification_events" ADD CONSTRAINT "capacity_notification_events_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- INTEGRIDAD DE CUPOS (defensa en profundidad)
-- Aunque la aplicación bloquea la fila del taller (SELECT ... FOR UPDATE),
-- la base de datos rechaza físicamente cualquier sobrecupo.
-- ============================================================
ALTER TABLE "workshops"
  ADD CONSTRAINT "workshops_capacity_positive_chk" CHECK ("max_capacity" > 0 AND "max_capacity" <= 10000),
  ADD CONSTRAINT "workshops_registered_nonneg_chk" CHECK ("registered_count" >= 0),
  ADD CONSTRAINT "workshops_no_overbooking_chk" CHECK ("registered_count" <= "max_capacity"),
  ADD CONSTRAINT "workshops_time_format_chk" CHECK ("start_time" ~ '^[0-2][0-9]:[0-5][0-9]$' AND "end_time" ~ '^[0-2][0-9]:[0-5][0-9]$');

ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_qr_version_chk" CHECK ("qr_version" >= 1);

ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_position_chk" CHECK ("position" >= 1);

-- Un estudiante no puede tener dos inscripciones ACTIVAS al mismo taller.
-- UNIQUE(student_id, workshop_id) sobre inscripciones no canceladas.
CREATE UNIQUE INDEX "uq_registration_active_student_workshop"
  ON "registrations" ("student_id", "workshop_id")
  WHERE "status" IN ('REGISTERED', 'CHECKED_IN', 'NO_SHOW');

-- Un estudiante solo puede tener UNA reserva activa a la vez.
CREATE UNIQUE INDEX "uq_reservation_active_student"
  ON "reservations" ("student_id")
  WHERE "status" = 'ACTIVE';

-- Un estudiante solo puede estar una vez en la lista de espera de un taller.
CREATE UNIQUE INDEX "uq_waitlist_active_student_workshop"
  ON "waitlist_entries" ("student_id", "workshop_id")
  WHERE "status" = 'WAITING';

-- La posición en la lista de espera es única por taller.
CREATE UNIQUE INDEX "uq_waitlist_workshop_position"
  ON "waitlist_entries" ("workshop_id", "position");

-- Búsquedas administrativas case-insensitive.
CREATE INDEX "students_full_name_lower_idx" ON "students" (lower("full_name"));

-- ============================================================
-- AUDITORÍA INMUTABLE
-- Los registros de auditoría no pueden modificarse ni eliminarse
-- (ni siquiera desde la aplicación). Solo un DBA con privilegios puede
-- deshabilitar el trigger de forma explícita.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es de solo inserción (append-only)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_mutation();

-- ============================================================
-- ZONA HORARIA: Prisma almacena TIMESTAMP(3) en UTC.
-- Forzamos UTC para que CURRENT_TIMESTAMP y now() sean coherentes.
-- ============================================================
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin privilegios para fijar timezone de la base; configure timezone=UTC en el servidor.';
END $$;
