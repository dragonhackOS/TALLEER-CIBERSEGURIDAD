/**
 * Seed idempotente: talleres de ejemplo + super administrador inicial.
 *   npm run db:seed
 * Variables: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (si falta, se genera una y se imprime UNA vez).
 */
import "dotenv/config";
import crypto from "node:crypto";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/server/auth/password";

const WORKSHOPS = [
  {
    slug: "rootme-if-you-can",
    name: "ROOTME IF YOU CAN",
    description:
      "Tu primera experiencia en hacking ético, Linux y CTF. Aprenderás a moverte en la terminal, entender permisos, encontrar pistas ocultas y resolver retos reales en un entorno seguro y legal.",
    instructorName: "Equipo de Ciberseguridad",
    location: "Laboratorio de cómputo",
    level: "PRINCIPIANTE" as const,
    maxCapacity: 25,
    startTime: "10:00",
    endTime: "13:00",
    icon: "terminal",
    codePrefix: "RY",
  },
  {
    slug: "hardware-hacking",
    name: "Hardware Hacking",
    description:
      "Explora cómo funcionan los dispositivos por dentro: microcontroladores, UART, lectura de firmware y fundamentos de seguridad en hardware con prácticas guiadas.",
    instructorName: "Laboratorio de Electrónica",
    location: "Taller de electrónica",
    level: "INTERMEDIO" as const,
    maxCapacity: 20,
    startTime: "10:00",
    endTime: "13:00",
    icon: "cpu",
    codePrefix: "HWH",
  },
  {
    slug: "ctf-starter",
    name: "CTF Starter",
    description:
      "Introducción a las competencias Capture The Flag: criptografía básica, web, forense y OSINT. Trabajarás en equipo resolviendo retos de dificultad progresiva.",
    instructorName: "Club de CTF",
    location: "Aula magna",
    level: "PRINCIPIANTE" as const,
    maxCapacity: 30,
    startTime: "14:00",
    endTime: "17:00",
    icon: "flag",
    codePrefix: "CTF",
  },
];

async function main() {
  const date = new Date(`${process.env.SEED_WORKSHOP_DATE ?? "2026-10-10"}T00:00:00.000Z`);
  for (const w of WORKSHOPS) {
    await db().workshop.upsert({
      where: { slug: w.slug },
      update: {},
      create: { ...w, date, status: "OPEN", eventKey: "default" },
    });
    console.log(`✓ Taller: ${w.name}`);
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (email) {
    const exists = await db().admin.findUnique({ where: { email } });
    if (!exists) {
      let password = process.env.SEED_ADMIN_PASSWORD ?? "";
      let generated = false;
      if (password.length < 12) {
        password = crypto.randomBytes(18).toString("base64url");
        generated = true;
      }
      await db().admin.create({
        data: { email, name: "Super administrador", role: "SUPER_ADMIN", passwordHash: await hashPassword(password) },
      });
      console.log(`✓ Super administrador creado: ${email}`);
      if (generated) {
        console.log("──────────────────────────────────────────────────────────");
        console.log(`  CONTRASEÑA GENERADA (se muestra solo una vez): ${password}`);
        console.log("  Cámbiala al iniciar sesión (Mi cuenta → Contraseña).");
        console.log("──────────────────────────────────────────────────────────");
      }
    } else {
      console.log(`• Administrador ${email} ya existe (sin cambios).`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
