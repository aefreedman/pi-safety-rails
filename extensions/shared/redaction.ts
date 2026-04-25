const REDACTION_RULES: Array<[RegExp, string]> = [
  [/(OP_SERVICE_ACCOUNT_TOKEN(?:_GITHUB)?\s*[=:]\s*)[^\s;]+/gi, "$1[REDACTED]"],
  [/(\b(?:X-Auth-Token|Authorization|Cookie|Set-Cookie)\s*[:=]\s*)[^\r\n]+/gi, "$1[REDACTED]"],
  [/\bgh[pousr]_[A-Za-z0-9_]+\b/g, "[REDACTED]"],
  [/\bops_[A-Za-z0-9._-]+\b/g, "[REDACTED]"],
  [(/(?:\bBearer\s+)[A-Za-z0-9._~+\/-]+/gi) as RegExp, "Bearer [REDACTED]"],
  [/("(?:credential|api[_-]?key|token|access_token|refresh_token)"\s*:\s*")[^"]+(")/gi, "$1[REDACTED]$2"],
  [/\b(op:\/\/[^/\s]+\/[^/\s]+\/[^/\s]+)\b/gi, "op://[REDACTED]/[REDACTED]/[REDACTED]"],
];

export function redactSensitiveText(value: string): string {
  let output = value;
  for (const [pattern, replacement] of REDACTION_RULES) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export function redactUnknown<T>(value: T): { value: T; changed: boolean } {
  if (typeof value === "string") {
    const next = redactSensitiveText(value);
    return { value: next as T, changed: next !== value };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = redactUnknown(item);
      changed ||= result.changed;
      return result.value;
    });
    return { value: (changed ? next : value) as T, changed };
  }

  if (!value || typeof value !== "object") {
    return { value, changed: false };
  }

  let changed = false;
  const entries = Object.entries(value as Record<string, unknown>);
  const next: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    const result = redactUnknown(item);
    changed ||= result.changed;
    next[key] = result.value;
  }

  return { value: (changed ? next : value) as T, changed };
}
