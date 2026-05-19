import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './locales';

/**
 * Resolve the request locale from the `NEXT_LOCALE` cookie, falling
 * back to the default. We don't infer from `Accept-Language` because
 * the user's explicit choice (set in /settings) should win — and SSR
 * with a cookie-only signal makes the client/server render match.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
