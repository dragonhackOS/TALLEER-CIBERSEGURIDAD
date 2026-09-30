/**
 * Configuración de pruebas. Requiere PostgreSQL y Redis reales
 * (ver README → "Pruebas"). Usa una base de datos dedicada.
 */
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/talleres_test";
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";
process.env.AUTH_SECRET = "test-secret-0123456789abcdef0123456789abcdef-xyz";
process.env.APP_URL = "http://localhost:3000";
process.env.ALLOWED_EMAIL_DOMAIN = "prepayucatan.com";
process.env.ADMIN_NOTIFICATION_EMAILS = "dragonhackprime@gmail.com,gretty.escalante@prepayucatan.com";
process.env.SMTP_HOST = "";
process.env.EMAIL_DISPATCH_INLINE = "false";
process.env.DB_POOL_MAX = process.env.DB_POOL_MAX ?? "30";
process.env.MIN_FORM_FILL_SECONDS = "0";
