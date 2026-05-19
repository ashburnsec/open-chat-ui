import type { Metadata } from 'next';
import { Inter, Noto_Sans_SC, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ConfirmProvider } from '@/hooks/use-confirm';
import { HTML_LANG, type Locale } from '@/i18n/locales';
import './globals.css';

// M44 · Vercel DESIGN.md 应用. Geist 是 Vercel 私有, 用 Inter 作开源替代
// (DESIGN.md 自己说 "Inter 是最近的 stylistic match, ss01/ss02 启用几何变体").
// 中文走 Noto Sans SC, 让所有设备 (Mac/Win/Linux/Android) 看到同一中文字体.
const fontInter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const fontNotoSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-sc',
  display: 'swap',
});

// Geist Mono 替代用 JetBrains Mono (DESIGN.md 自己说 "JetBrains Mono is the
// closest match for technical labels"). 用在 code block / caption-mono.
const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('title'), description: t('description') };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();
  return (
    <html
      lang={HTML_LANG[locale]}
      suppressHydrationWarning
      className={`${fontInter.variable} ${fontNotoSC.variable} ${fontMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <ConfirmProvider>
              {children}
              {/* Centralised toast outlet — components dispatch via `toast()` from sonner. */}
              <Toaster richColors closeButton position="bottom-right" />
            </ConfirmProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
