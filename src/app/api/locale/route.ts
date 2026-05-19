import { NextResponse } from 'next/server';
import { ensureSameOrigin, jsonError } from '@/lib/bff';
import { isLocale, LOCALE_COOKIE } from '@/i18n/locales';

export const runtime = 'nodejs';

/**
 * POST /api/locale  { locale: 'zh' | 'en' }
 *
 * Persist the user's UI language as a cookie. next-intl's
 * getRequestConfig() picks it up on the next request, so the client
 * just needs to refresh after calling this.
 */
export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;

  let body: { locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid JSON body');
  }
  if (!isLocale(body.locale)) return jsonError('invalid locale');

  const res = NextResponse.json({ success: true });
  res.cookies.set({
    name: LOCALE_COOKIE,
    value: body.locale,
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
