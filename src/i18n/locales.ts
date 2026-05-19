export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Map locale → BCP 47 tag for the `<html lang>` attribute. Browsers
 * use this for hyphenation, screen-reader pronunciation, etc.
 */
export const HTML_LANG: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en',
};

/** Display labels for the language switcher. */
export const LOCALE_LABELS: Record<Locale, string> = {
  zh: '中文',
  en: 'English',
};
