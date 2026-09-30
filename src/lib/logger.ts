/**
 * Logger estructurado (JSON por línea). Redacta automáticamente campos
 * sensibles: contraseñas, OTP, tokens, cookies y secretos.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE = /pass(word)?|otp|code_?hash|^code$|token|secret|cookie|authorization|session|totp/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    if (value instanceof Error) return { name: value.name, message: value.message };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function currentLevel(): Level {
  const l = (process.env.LOG_LEVEL ?? "info") as Level;
  return l in ORDER ? l : "info";
}

function write(level: Level, event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && !process.env.LOG_IN_TESTS) return;
  if (ORDER[level] < ORDER[currentLevel()]) return;
  const line = JSON.stringify({
    level,
    event,
    ...(data ? (redact(data) as Record<string, unknown>) : {}),
    timestamp: new Date().toISOString(),
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => write("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};
