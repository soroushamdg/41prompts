/* Removes anything that could be a model key or a user's prompt from error
   reports. Keys are encrypted at rest and must never reach Sentry or logs. */

const KEY_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g, // Anthropic
  /sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{16,}/g, // OpenAI
  /AIza[0-9A-Za-z_-]{30,}/g, // Google
  /(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}/g, // Stripe
  /whsec_[A-Za-z0-9]{10,}/g,
  /re_[A-Za-z0-9_]{16,}/g, // Resend
];

const SECRET_FIELDS = /^(api[-_]?key|key|apikey|authorization|cookie|set-cookie|x-api-key|x-goog-api-key|password|secret|token|prompt|system|messages|requestBodyValues|body|text|bloks)$/i;

export function redactString(s: string): string {
  let out = s;
  for (const re of KEY_PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

export function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 8) return value;
  if (typeof value === "string") return redactString(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_FIELDS.test(k) ? "[redacted]" : redactDeep(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

type SentryLikeEvent = {
  message?: string;
  request?: { data?: unknown; cookies?: unknown; headers?: Record<string, string>; query_string?: unknown; url?: string };
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string; data?: unknown }>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
};

/** Sentry beforeSend: drops request bodies and cookies, redacts key-shaped strings. */
export function scrubEvent<E extends SentryLikeEvent>(event: E): E {
  if (event.message) event.message = redactString(event.message);
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url) event.request.url = redactString(event.request.url.replace(/([?&]key=)[^&]+/g, "$1[redacted]"));
    if (event.request.headers) event.request.headers = redactDeep(event.request.headers);
  }
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = redactString(ex.value);
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((b) => ({ ...b, message: b.message && redactString(b.message), data: redactDeep(b.data) }));
  if (event.extra) event.extra = redactDeep(event.extra);
  if (event.contexts) event.contexts = redactDeep(event.contexts);
  return event;
}
