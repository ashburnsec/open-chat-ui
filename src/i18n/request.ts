import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './locales';

/**
 * Resolve the request locale from the `NEXT_LOCALE` cookie, falling
 * back to the default. We don't infer from `Accept-Language` because
 * the user's explicit choice (set in /settings) should win — and SSR
 * with a cookie-only signal makes the client/server render match.
 */

/**
 * next-intl rejects keys containing "." because it uses dots as nesting
 * separators. This sanitizer recursively replaces dots in object keys
 * with underscores, so any stale cached JSON with model IDs like
 * "gemini-2.5-flash-image" won't crash `getMessages()`.
 */
function sanitizeKeys(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const safeKey = key.includes('.') ? key.replace(/\./g, '_') : key;
    result[safeKey] = sanitizeKeys(val);
  }
  return result;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const raw_messages = (await import(`../../messages/${locale}.json`)).default;
  const messages = sanitizeKeys(raw_messages) as Record<string, unknown>;
  return { locale, messages };
});
