import { HttpErrorResponse } from '@angular/common/http';

/** Max length for a user-visible API error line (long text is often stacks or HTML). */
const MAX_USER_ERROR_LEN = 220;

/**
 * Returns `text` if it looks safe for end users; otherwise `fallback`.
 * Blocks stack traces, common DB/runtime leaks, HTML error pages, and multiline dumps.
 */
export function sanitizeUserFacingErrorText(text: string | null | undefined, fallback: string): string {
  if (text == null) return fallback;
  const t = String(text).trim();
  if (t.length === 0) return fallback;
  if (t.length > MAX_USER_ERROR_LEN) return fallback;
  if (t.includes('<') && t.includes('>')) return fallback;
  const newlines = (t.match(/\n/g) || []).length;
  if (newlines > 1) return fallback;

  const lower = t.toLowerCase();
  const suspicious =
    /\bat\s+[\w.$/]+\s*\(/i.test(t) ||
    /\.(ts|js|mjs|cjs):\d+/i.test(t) ||
    /:\d+:\d+/.test(t) ||
    /mongodb|mongoose|sequelize|prisma|postgres|sqlite|econnrefused|deadlock|syntax error near/i.test(lower) ||
    /stack trace|internal server|errno|e11000|duplicate key/i.test(lower) ||
    /^\s*error:\s*$/im.test(t);

  if (suspicious) return fallback;

  return t;
}

function messageFromBody(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) {
    const s = body.trim();
    if (s.startsWith('<')) return null;
    try {
      const parsed = JSON.parse(s) as { message?: string; error?: string };
      const fromJson = parsed?.message ?? parsed?.error;
      if (typeof fromJson === 'string' && fromJson.trim()) return fromJson;
    } catch {
      if (s.length <= MAX_USER_ERROR_LEN) return s;
    }
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    const msg = o['message'] ?? o['error'];
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return null;
}

/**
 * User-facing message from Angular HttpClient failures and typical API JSON bodies.
 * Server messages are sanitized; technical or unsafe content falls back to `fallback`.
 */
export function extractHttpErrorMessage(err: unknown, fallback: string): string {
  if (err == null) return fallback;

  if (err instanceof HttpErrorResponse) {
    const raw = messageFromBody(err.error);
    if (raw) return sanitizeUserFacingErrorText(raw, fallback);
    return fallback;
  }

  if (err instanceof Error && err.message.trim()) {
    const m = err.message;
    if (/^Http failure response/i.test(m)) return fallback;
    return sanitizeUserFacingErrorText(m, fallback);
  }

  if (typeof err === 'object') {
    const e = err as { error?: unknown; message?: string };
    const fromNested = messageFromBody(e.error);
    if (fromNested) return sanitizeUserFacingErrorText(fromNested, fallback);
    if (typeof e.message === 'string' && e.message.trim()) {
      const m = e.message;
      if (/^Http failure response/i.test(m)) return fallback;
      return sanitizeUserFacingErrorText(m, fallback);
    }
  }

  return fallback;
}
