export interface DocumentError {
  code: string
  messageKey: string
  params?: Record<string, string | number | boolean>
  cause?: unknown
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: DocumentError }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err(
  code: string,
  input?: Partial<Omit<DocumentError, 'code'>>,
): Result<never> {
  return {
    ok: false,
    error: {
      code,
      messageKey: input?.messageKey || `errors.${code}`,
      params: input?.params,
      cause: input?.cause,
    },
  }
}

export function isOk<T>(result: Result<T>): result is { ok: true; value: T } {
  return result.ok
}

export function isErr<T>(result: Result<T>): result is { ok: false; error: DocumentError } {
  return !result.ok
}

export function errorCauseMatches(cause: unknown, code: string): boolean {
  if (cause === code) return true
  if (cause instanceof Error && cause.message === code) return true
  if (typeof cause !== 'object' || cause === null) return false
  if ('code' in cause && cause.code === code) return true
  if ('message' in cause && cause.message === code) return true
  return false
}
