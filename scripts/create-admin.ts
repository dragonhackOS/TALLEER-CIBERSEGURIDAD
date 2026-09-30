/**
 * Crear administrador desde la terminal:
 *   npm run admin:create -- --email admin@prepayucatan.com --name "Nombre" --role SUPER_ADMIN
 * La contraseña se solicita de forma interactiva (o ADMIN_PASSWORD en el entorno).
 */
import "dotenv/config";
import readline from "node:readline";
import { createAdmin } from "../src/server/services/admin.service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function askHidden(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  out._writeToOutput = (s: string) => {
    if (s.includes(q)) out.output.write(s);
    else out.output.write("*");
  };
  return new Promise((resolve) => rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); }));
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const name = arg("name") ?? "Administrador";
  const role = (arg("role") ?? "ADMIN").toUpperCase();
  if (!email) throw new Error("Falta --email");
  if (!["SUPER_ADMIN", "ADMIN", "INSTRUCTOR", "CHECKIN_STAFF", "VIEWER"].includes(role)) throw new Error("Rol inválido");
  const password = process.env.ADMIN_PASSWORD ?? (await askHidden("Contraseña (mín. 12 caracteres): "));
  const admin = await createAdmin({ email, name, role: role as "ADMIN", password }, { adminId: null, ipHash: null });
  console.log(`✓ Administrador creado: ${admin.email} (${admin.role})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`✗ ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
