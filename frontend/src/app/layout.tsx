import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TelegramNav } from "@/components/TelegramNav";
import { PwaInstall } from "@/components/PwaInstall";
import { Track } from "@/components/Track";
import { DESCRIPTION, KEYWORDS, SITE_URL, TITLE, jsonLd } from "@/lib/seo";

const isPnlSite = process.env.NEXT_PUBLIC_SITE_MODE === "pnl";

export const metadata: Metadata = isPnlSite
  ? {
      title: "برآیند الگو اسمارت | Crypto Smart",
      description: "لایو معاملات و برآیند سود و زیان ربات الگو اسمارت",
      robots: { index: false, follow: false },
    }
  : {
      metadataBase: new URL(SITE_URL),
      title: {
        default: TITLE,
        template: "%s | ALGO HUB",
      },
      description: DESCRIPTION,
      keywords: KEYWORDS,
      applicationName: "ALGO HUB",
      authors: [{ name: "Crypto Smart" }],
      creator: "Crypto Smart",
      publisher: "Crypto Smart",
      alternates: {
        canonical: "/",
        languages: { "fa-IR": "/" },
      },
      openGraph: {
        type: "website",
        locale: "fa_IR",
        siteName: "ALGO HUB",
        title: TITLE,
        description: DESCRIPTION,
        url: "/",
        images: [{ url: "/app-icon?size=512", width: 512, height: 512, alt: "ALGO HUB" }],
      },
      twitter: {
        card: "summary_large_image",
        title: TITLE,
        description: DESCRIPTION,
        images: ["/app-icon?size=512"],
      },
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      },
      category: "finance",
    };

/**
 * Root layout.
 * - dir="rtl" + lang="fa" for a right-to-left Persian UI.
 * - Dana (Persian) + Montserrat (Latin) loaded from a CDN.
 * - <html> ships with the default theme (classic dark); an inline script
 *   applies the user's saved theme before first paint, so there is never a
 *   flash of the wrong colours.
 *   Themes: light | soft | barbie | cinderella | dark | ocean | classic.
 * - PWA: the journal is part of the installable ALGO HUB app. The manifest,
 *   the service worker and the icon endpoints all live at the domain root and
 *   are served by the hub app, so nothing here has to be built or bundled:
 *     /app-icon?size=N    the blue app icon
 *     /app-splash?size=N  the transparent logo used on the launch screen
 * - SEO: rich metadata + JSON-LD (Organization / WebSite / SoftwareApplication /
 *   FAQPage) so Google can build a rich result for Persian trading-journal
 *   queries. robots.txt and sitemap.xml live in app/robots.ts and app/sitemap.ts.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl" className="dark" data-theme="classic" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://cdn.jsdelivr.net"
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://cdn.fontcdn.ir" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Persian UI font: Dana. English/Latin font: Montserrat. Vazirmatn kept as fallback. */}
        <link href="https://cdn.fontcdn.ir/Font/Persian/Dana/Dana.css" rel="stylesheet" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/png" sizes="192x192" href="/app-icon?size=192" />
        {/* اپلیکیشن نصب‌شدنی ALGO HUB (مدیریت سرمایه + ژورنال تریدینگ) */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="application-name" content="ALGO HUB" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ALGO HUB" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0A1622" />
        <link rel="apple-touch-icon" sizes="180x180" href="/app-icon?size=180" />
        {/* SDK مینی‌اپ تلگرام -- برای دکمهٔ بازگشتِ بومی و ادغام با هابِ algohub. */}
        <script src="https://telegram.org/js/telegram-web-app.js" async></script>
        {/* داده‌های ساختاریافته برای گوگل (فقط سایت اصلی ژورنال). */}
        {!isPnlSite && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
          />
        )}
        {/* Apply the saved theme before first paint (no flash of wrong colours).
            Default is the classic palette; "blue" is a legacy value that the
            classic theme replaced. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d={light:0,soft:0,barbie:0,cinderella:0,dark:1,ocean:1,classic:1};var t=localStorage.getItem('tj_theme');if(t==='blue')t='classic';if(!(t in d))t='classic';var r=document.documentElement;r.setAttribute('data-theme',t);if(d[t]){r.classList.add('dark');}else{r.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <TelegramNav />
          {children}
          <PwaInstall />
          <Track />
        </ThemeProvider>
      </body>
    </html>
  );
}
