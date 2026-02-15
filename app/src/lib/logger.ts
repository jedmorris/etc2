const SECRET_PATTERNS = [
  /sk_[a-zA-Z0-9_]+/g,
  /whsec_[a-zA-Z0-9_]+/g,
  /Bearer\s+[a-zA-Z0-9._-]+/g,
  /token=[a-zA-Z0-9._-]+/gi,
  /key=[a-zA-Z0-9._-]+/gi,
]

function sanitize(input: string): string {
  let result = input
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return sanitize(error.message)
  }
  if (typeof error === 'string') {
    return sanitize(error)
  }
  return 'Unknown error'
}

export const logger = {
  error(message: string, ...args: unknown[]) {
    console.error(sanitize(message), ...args.map(a =>
      typeof a === 'string' ? sanitize(a) : a instanceof Error ? sanitizeError(a) : a
    ))
  },
  warn(message: string, ...args: unknown[]) {
    console.warn(sanitize(message), ...args.map(a =>
      typeof a === 'string' ? sanitize(a) : a instanceof Error ? sanitizeError(a) : a
    ))
  },
  info(message: string, ...args: unknown[]) {
    console.info(sanitize(message), ...args.map(a =>
      typeof a === 'string' ? sanitize(a) : a instanceof Error ? sanitizeError(a) : a
    ))
  },
}
