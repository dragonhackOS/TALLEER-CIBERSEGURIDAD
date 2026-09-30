/**
 * Errores de dominio con código estable y estado HTTP.
 * El mensaje es seguro para mostrarse al usuario (en español).
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  badRequest: (message = "Solicitud inválida.", details?: Record<string, unknown>) =>
    new AppError("BAD_REQUEST", 400, message, details),
  validation: (details?: Record<string, unknown>) =>
    new AppError("VALIDATION_ERROR", 422, "Revisa los datos enviados.", details),
  invalidEmailDomain: (domain: string) =>
    new AppError("INVALID_EMAIL_DOMAIN", 422, `Solo se aceptan correos institucionales @${domain}.`),
  unauthorized: (message = "Necesitas iniciar sesión.") => new AppError("UNAUTHORIZED", 401, message),
  sessionExpired: () =>
    new AppError("SESSION_EXPIRED", 401, "Tu sesión expiró. Verifica tu correo nuevamente para continuar."),
  forbidden: (message = "No tienes permiso para realizar esta acción.") => new AppError("FORBIDDEN", 403, message),
  notFound: (message = "Recurso no encontrado.") => new AppError("NOT_FOUND", 404, message),
  workshopFull: (details?: Record<string, unknown>) =>
    new AppError("WORKSHOP_FULL", 409, "El taller ha alcanzado su capacidad máxima.", details),
  workshopClosed: () => new AppError("WORKSHOP_CLOSED", 409, "Las inscripciones para este taller están cerradas."),
  workshopNotOpenYet: () => new AppError("WORKSHOP_NOT_OPEN", 409, "Las inscripciones para este taller aún no abren."),
  alreadyRegistered: (details?: Record<string, unknown>) =>
    new AppError("ALREADY_REGISTERED", 409, "Ya tienes una inscripción activa.", details),
  alreadyWaitlisted: () => new AppError("ALREADY_WAITLISTED", 409, "Ya estás en la lista de espera de este taller."),
  seatsAvailable: () =>
    new AppError("SEATS_AVAILABLE", 409, "Aún hay lugares disponibles; puedes inscribirte directamente."),
  otpInvalid: () => new AppError("OTP_INVALID", 400, "El código es incorrecto o ya expiró."),
  otpLocked: () =>
    new AppError("OTP_LOCKED", 429, "Superaste el número de intentos. Solicita un código nuevo."),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError("RATE_LIMITED", 429, "Demasiadas solicitudes. Inténtalo más tarde.", undefined, {
      "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))),
    }),
  rejected: () => new AppError("REQUEST_REJECTED", 400, "No pudimos procesar tu solicitud. Inténtalo de nuevo."),
  challengeRequired: (siteKey: string) =>
    new AppError("CHALLENGE_REQUIRED", 403, "Completa la verificación de seguridad para continuar.", { siteKey }),
  conflict: (code: string, message: string, details?: Record<string, unknown>) =>
    new AppError(code, 409, message, details),
  unprocessable: (code: string, message: string, details?: Record<string, unknown>) =>
    new AppError(code, 422, message, details),
  internal: () => new AppError("INTERNAL_ERROR", 500, "Ocurrió un error inesperado. Inténtalo más tarde."),
};

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
