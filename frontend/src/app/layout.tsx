import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BASE_PATH } from "@/lib/api";
import { TelegramNav } from "@/components/TelegramNav";

const isPnlSite = process.env.NEXT_PUBLIC_SITE_MODE === "pnl";

export const metadata: Metadata = {
  title: isPnlSite ? "برایند الگو اسمارت | Crypto Smart" : "ژورنال تریدینگ | Algo Hub",
  description: isPnlSite
    ? "لایو معاملات و برایند سود و زیان ربات الگو اسمارت"
    : "پنل ژورنال معاملات کریپتو",
};

/**
 * Root layout.
 * - dir="rtl" + lang="fa" for a right-to-left Persian UI.
 * - Vazirmatn loaded from a CDN (keeps the offline build clean).
 * - An inline script applies the saved theme BEFORE paint to avoid a flash.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
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
        <link
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
          rel="stylesheet"
        />
        <link rel="icon" href={`${BASE_PATH}/logo-icon.png`} />
        {/* SDK مینی‌اپ تلگرام -- برای دکمهٔ بازگشتِ بومی و ادغام با هابِ algohub. */}
        <script src="https://telegram.org/js/telegram-web-app.js" async></script>
        {/* Apply theme before first paint (no flash of wrong theme). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tj_theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <TelegramNav />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
