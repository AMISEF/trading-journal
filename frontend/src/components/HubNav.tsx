"use client";

/**
 * نوارِ پایینیِ «هاب» — همان نوار منوی پروژهٔ پورتفولیو که در algohub.cryptosmart.site
 * روی روتِ دامنه سرو می‌شود. این نوار علاوه بر منوی خودِ ژورنال نمایش داده می‌شود تا
 * کاربر بتواند بین اپ‌ها (پورتفولیو در روت، ژورنال زیر /journal، و «برایند ربات») جابه‌جا شود.
 *
 * چیدمان متقارن: «نمای بازار» در وسط، دو آیتم در هر طرف. لینک‌های پورتفولیو با تگِ
 * خامِ <a> هستند (نه <Link> نکست) تا basePath به ابتدای‌شان اضافه نشود و واقعاً از اپِ
 * ژورنال خارج و به روتِ دامنه بروند.
 */
import { BASE_PATH } from "@/lib/api";

type NavKey = "journal" | "bot" | "home" | "portfolio" | "exclusive";

const ITEMS: { key: NavKey; href: string; label: string; icon: React.ReactNode }[] = [
  {
    key: "journal",
    href: `${BASE_PATH}/dashboard`,
    label: "تریدینگ ژورنال",
    icon: (
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    ),
  },
  {
    key: "bot",
    href: `${BASE_PATH}/bot`,
    label: "برایند ربات",
    // آیکون ربات (Lucide "bot")
    icon: (
      <>
        <path d="M12 8V4H8" />
        <rect width="16" height="12" x="4" y="8" rx="2" />
        <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
      </>
    ),
  },
  {
    key: "home",
    href: "/",
    label: "نمای بازار",
    icon: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  },
  {
    key: "portfolio",
    href: "/portfolio",
    label: "مدیریت سرمایه",
    icon: <path d="M3 13h7V3H3zM14 21h7V11h-7zM14 3v5h7V3zM3 17v4h7v-4z" fill="currentColor" stroke="none" />,
  },
  {
    key: "exclusive",
    href: "/exclusive",
    label: "تحلیل اختصاصی",
    icon: <path d="M3 3v18h18M7 14l4-4 3 3 5-6" />,
  },
];

export function HubNav({ active = "journal" }: { active?: NavKey }) {
  return (
    <nav className="hub-nav" aria-label="ناوبری هاب">
      <div className="hub-nav__bar">
        {ITEMS.map((it) => (
          <a
            key={it.key}
            href={it.href}
            className={`hub-nav__item${it.key === active ? " is-active" : ""}`}
            aria-label={it.label}
          >
            <span className="hub-nav__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {it.icon}
              </svg>
            </span>
            <span className="hub-nav__label">{it.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
