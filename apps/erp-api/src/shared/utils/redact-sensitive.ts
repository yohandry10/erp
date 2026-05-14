const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEY_EXACT_MATCHES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-tenant-token',
  'metrics-token',
  'csrf-token',
  'csrf',
  'password',
  'secret',
  'api-key',
  'api_token',
  'apiToken',
  'access_token',
  'access-token',
  'refresh_token',
  'refresh-token',
  'session_token',
  'session-token',
  'jwt',
  'id-token',
  'id_token',
  'token',
  'token-',
  'token_',
  'auth_token',
  'auth-token',
]);

const SENSITIVE_KEY_PATTERNS = [
  /(?:^|[-_])authorization(?:$|[-_])/i,
  /(?:^|[-_])cookie(?:$|[-_])/i,
  /(?:^|[-_])set[-_]?cookie(?:$|[-_])/i,
  /(?:^|[-_])api[-_]?key(?:$|[-_])/i,
  /(?:^|[-_])auth(?:[-_]?token)?(?:$|[-_])/i,
  /(?:^|[-_])access[-_]?token(?:$|[-_])/i,
  /(?:^|[-_])refresh[-_]?token(?:$|[-_])/i,
  /(?:^|[-_])session(?:[-_]?token)?(?:$|[-_])/i,
  /(?:^|[-_])csrf(?:$|[-_])/i,
  /(?:^|[-_])id[-_]?token(?:$|[-_])/i,
  /(?:^|[-_])metrics[-_]?token(?:$|[-_])/i,
  /(?:^|[-_])password/i,
  /(?:^|[-_])secret/i,
  /(?:^|[-_])jwt(?:$|[-_])/i,
  /(?:^|[-_])signature(?:$|[-_])/i,
];

const isPlainObject = (value: unknown): value is Record<string, any> => {
  return value !== null && typeof value === 'object' && value.constructor === Object;
};

const normalizeKey = (key: string): string => key.toLowerCase().trim();

const isSensitiveKey = (key: string): boolean => {
  const normalized = normalizeKey(key);

  if (SENSITIVE_KEY_EXACT_MATCHES.has(normalized)) {
    return true;
  }

  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(normalized));
};

const redactStringValue = (value: string, preserveBearer = false): string => {
  if (preserveBearer && /^bearer\s+/i.test(value)) {
    return 'Bearer [REDACTED]';
  }

  return REDACTED_VALUE;
};

const redactValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return redactStringValue(value, true);
  }

  return REDACTED_VALUE;
};

const deepRedact = (input: unknown, depth = 0): any => {
  if (depth > 8) {
    return REDACTED_VALUE;
  }

  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (Array.isArray(input)) {
    return input.map((item) => deepRedact(item, depth + 1));
  }

  if (!isPlainObject(input)) {
    return input;
  }

  const data = input as Record<string, any>;
  const sanitized: Record<string, any> = {};

  Object.entries(data).forEach(([key, value]) => {
    if (isSensitiveKey(key)) {
      sanitized[key] = redactValue(value);
      return;
    }

    if (typeof value === 'string' && /(?:^|[-_])token(?:$|[-_])/i.test(key)) {
      sanitized[key] = redactValue(value);
      return;
    }

    sanitized[key] = deepRedact(value, depth + 1);
  });

  return sanitized;
};

export const redactSensitiveData = <T>(data: T): T => deepRedact(data) as T;

export const redactSensitiveHeaders = (
  headers: Record<string, any>,
): Record<string, any> => {
  return deepRedact(headers) as Record<string, any>;
};
