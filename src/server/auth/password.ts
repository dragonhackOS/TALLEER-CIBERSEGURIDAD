import { hash, verify } from "@node-rs/argon2";

/** Parámetros Argon2id (OWASP: m=19 MiB, t=2, p=1 como mínimo). */
const OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
}

let dummy: string | null = null;
/** Hash ficticio para igualar tiempos cuando el usuario no existe. */
export async function dummyVerify(password: string) {
  if (!dummy) dummy = await hashPassword("dummy-password-for-timing-equalization");
  await verifyPassword(dummy, password);
}

export function passwordStrengthError(password: string): string | null {
  if (password.length < 12) return "La contraseña debe tener al menos 12 caracteres.";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) return "Usa al menos tres de: minúsculas, mayúsculas, números y símbolos.";
  return null;
}
