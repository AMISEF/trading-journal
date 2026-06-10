# فرانت‌اند ژورنال تریدینگ (Crypto Smart)

پنل ژورنال معاملات کریپتو — Next.js 14 (App Router) + TypeScript + Tailwind CSS.
رابط کاربری راست‌به‌چپ (فارسی)، دو تم روشن و «Dark Ocean»، تاریخ شمسی، و
ذخیره‌ی خودکار.

## اجرا

```bash
npm install
cp .env.local.example .env.local   # و در صورت نیاز NEXT_PUBLIC_API_BASE را تنظیم کنید
npm run dev                        # http://localhost:3000
```

ساخت نسخه‌ی production:

```bash
npm run build
npm run start
```

## متغیر محیطی

- `NEXT_PUBLIC_API_BASE` — آدرس پایه‌ی API بک‌اند.
  - توسعه: `http://localhost:8001/api`
  - production (پشت Nginx، هم‌مبدأ): `/api`

## ساختار

```
src/
  app/                صفحات App Router
    login, register   احراز هویت
    dashboard         داشبورد + نمودارها (Recharts)
    journals          لیست ژورنال + ویرایشگر [id]
    admin             پنل ادمین (کاربران → ژورنال‌ها → نمای فقط‌خواندنی)
    layout.tsx        RTL + فونت Vazirmatn + اعمال تم پیش از رندر
    globals.css       متغیرهای CSS برای هر دو تم
  components/         اجزای رابط کاربری
    editor/           ویرایشگر معامله (تب‌ها، فیلدها، پیش‌نمایش محاسبه)
  lib/               api.ts, types.ts, theme.ts, jalali.ts, format.ts, hooks.ts
  store/             auth.ts, trade.ts (Zustand + ذخیره‌ی خودکار)
```

## نکات کلیدی

- **تم:** `darkMode: "class"`؛ انتخاب کاربر در `localStorage` ذخیره می‌شود و
  پیش از رندر اول اعمال می‌گردد (بدون پرش رنگ).
- **احراز هویت:** توکن JWT در `localStorage` با کلید `tj_token` نگهداری و به‌صورت
  Bearer به همه‌ی درخواست‌ها افزوده می‌شود. `AuthGuard` در نبود توکن به
  `/login` هدایت می‌کند.
- **ذخیره‌ی خودکار:** هر تغییر در ویرایشگر با debounce حدود ۸۰۰ms به
  `PATCH /trades/{id}` ارسال می‌شود (Zustand store در `src/store/trade.ts`).
- **محاسبه‌ی زنده:** اعداد هر تارگت و R:R از `POST /calc/preview` (با debounce)
  گرفته می‌شوند.
- **رنگ‌ها:** سبز = سود / Long، قرمز = ضرر / Short، آبی = خنثی.

## مواردی که ساده‌سازی شده‌اند

- نمودار «سود و زیان روزانه» به‌صورت میله‌ای (به‌جای تقویم) پیاده شده است.
- محدودسازی اعشار قیمت بر اساس tickSize به‌صورت پایه انجام می‌شود؛ مقدار دقیق
  tick هنگام انتخاب نماد از API گرفته می‌شود.
