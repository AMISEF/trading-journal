# Trading Journal — پنل ژورنال تریدینگ کریپتو (Crypto Smart)

پنل داخلی ثبت و تحلیل معاملات کریپتو. بک‌اند **FastAPI + PostgreSQL**، فرانت
**Next.js 14**. این پروژه از تاریخ یکپارچه‌سازی، **زیرِ مسیر `/journal` روی
دامنهٔ مشترک** `algohub.cryptosmart.site` سرو می‌شود — کنارِ پروژهٔ خواهر
«CryptoSmart Hub» (پورتفولیو) و بدون دست‌زدن به سایتِ کاملاً مستقل
`cryptosmart.site`.

> این فایل مرجعِ کامل پروژه است: معماری، پشتهٔ فناوری، اجرای محلی، تست، دیپلوی،
> و راهنمای دیباگِ سرور. اگر با پروژه آشنا نیستید، همین یک فایل کافی است تا
> بتوانید سایت را از صفر بالا بیاورید یا مشکلی را روی سرور پیدا و رفع کنید.

---

## فهرست

1. [این پروژه چیست و کجا زندگی می‌کند](#۱-این-پروژه-چیست-و-کجا-زندگی-میکند)
2. [معماری کلی (این پروژه + پروژهٔ خواهر پورتفولیو)](#۲-معماری-کلی)
3. [نقشهٔ پورت‌ها و سرویس‌های سرور](#۳-نقشهٔ-پورتها-و-سرویسهای-سرور)
4. [پشتهٔ فناوری و معماری کد](#۴-پشتهٔ-فناوری-و-معماری-کد)
5. [ساختار پوشه‌ها](#۵-ساختار-پوشهها)
6. [basePath و اجرای هر دو حالت (زیرمسیر / مستقل)](#۶-basepath-و-اجرای-هر-دو-حالت-زیرمسیر--مستقل)
7. [اجرای محلی (توسعه)](#۷-اجرای-محلی-توسعه)
8. [تست و آزمون نرم‌افزار](#۸-تست-و-آزمون-نرمافزار)
9. [متغیرهای محیطی](#۹-متغیرهای-محیطی)
10. [دیتابیس (PostgreSQL)](#۱۰-دیتابیس-postgresql)
11. [راه‌اندازی کامل سرور از صفر](#۱۱-راهاندازی-کامل-سرور-از-صفر)
12. [Nginx — دو حالت: زیرِ algohub یا مستقل](#۱۲-nginx--دو-حالت-زیرِ-algohub-یا-مستقل)
13. [CI/CD (استقرار خودکار)](#۱۳-cicd-استقرار-خودکار)
14. [دیباگ روی سرور — چک‌لیست قدم‌به‌قدم](#۱۴-دیباگ-روی-سرور--چکلیست-قدمبهقدم)
15. [اشتباهات رایج و درس‌های آموخته‌شده](#۱۵-اشتباهات-رایج-و-درسهای-آموختهشده)
16. [دستورهای مفید روزمره](#۱۶-دستورهای-مفید-روزمره)

---

## ۱. این پروژه چیست و کجا زندگی می‌کند

**Trading Journal** یک اپلیکیشنِ دو‌بخشی است: بک‌اند **FastAPI** (API + منطقِ
محاسباتِ معاملات) و فرانت **Next.js 14** (App Router). کاربر معاملاتش را ثبت
می‌کند، ژورنال آن‌ها را می‌بیند، تحلیل هوش‌مصنوعی می‌گیرد و کیف‌پول/اشتراکش را
مدیریت می‌کند.

- **آدرس فعلی (توصیه‌شده):** `https://algohub.cryptosmart.site/journal`
- **دامنهٔ مستقلِ قدیمی:** `https://trading-journal.cryptosmart.site` — این
  دامنه دیگر مستقیماً سرو نمی‌شود؛ به‌جایش با **۳۰۱ ریدایرکت** به آدرسِ بالا
  هدایت می‌شود (چون basePath ساختِ Next.js یک ثابتِ زمانِ build است و یک
  خروجی نمی‌تواند هم‌زمان با و بدونِ prefix سرو شود — جزئیات در بخشِ ۱۵).
- **سرور:** همان VPS پروژهٔ پورتفولیو، IP ثابت `38.252.8.195`، که میزبانِ سه
  پروژهٔ مستقل است:
  1. `cryptosmart.site` — سایتِ دیگری که **کاملاً مستقل** است؛ به آن کاری نداریم.
  2. **CryptoSmart Hub** (ریپوی جداگانه `AMISEF/portfolio`) — روی روتِ دامنهٔ
     مشترک.
  3. **همین پروژه (Trading Journal)** — زیرِ `/journal`.

## ۲. معماری کلی

```
                         algohub.cryptosmart.site
                                    │
                                 Nginx (80/443)
                    ┌───────────────┴────────────────┐
              مسیر  "/" و "/static/"           مسیر  "/journal/*"
                    │                                 │
                    ▼                                 ▼
     ┌─────────────────────────────┐   ┌──────────────────────────────────┐
     │  CryptoSmart Hub (ریپوی جدا) │   │  Trading Journal (همین ریپو)      │
     │  FastAPI + Jinja2           │   │  ┌────────────┐  ┌──────────────┐ │
     │  pm2: cryptosmart-portfolio │   │  │ frontend    │  │ backend       │ │
     │  پورت: 8000                 │   │  │ Next.js     │  │ FastAPI       │ │
     │  دیتابیس: SQLite            │   │  │ pm2:tj-front│  │ pm2:tj-backend│ │
     └─────────────────────────────┘   │  │ پورت: 3001  │  │ پورت: 8001    │ │
                                        │  └────────────┘  └───────┬──────┘ │
                                        │                    دیتابیس:       │
                                        │                    PostgreSQL     │
                                        │                    trading_journal│
                                        └──────────────────────────────────┘
```

- **دو پروژه، دو پروسه، دو دیتابیس کاملاً مجزا.** هیچ کد یا داده‌ای بینِ
  پورتفولیو (SQLite) و ژورنال (PostgreSQL) به اشتراک گذاشته نمی‌شود.
- ناوبریِ متقابل: در ژورنال یک نوارِ «هاب کریپتو اسمارت»
  (`src/components/HubNav.tsx` + بخشِ مشابه در `AppShell.tsx`) با تگ‌های خامِ
  `<a>` (نه `Link` نکست، تا basePath به ابتدایشان اضافه نشود) به صفحاتِ اصلیِ
  پورتفولیو (`/`, `/portfolio`, `/exclusive`) لینک می‌دهد.
- برای جزئیاتِ کاملِ سمتِ پورتفولیو، README ریپوی `AMISEF/portfolio` را
  ببینید.

## ۳. نقشهٔ پورت‌ها و سرویس‌های سرور

| سایت / اپ | پوشه روی سرور | نام پروسهٔ pm2 | پورت داخلی (فقط 127.0.0.1) | دیتابیس |
|---|---|---|---|---|
| `cryptosmart.site` (مستقل، دست‌نخورده) | `/var/www/cryptosmart` | `cryptosmart` | `3000` | مستقل از این دو پروژه |
| CryptoSmart Hub (پورتفولیو — ریپوی جدا) | `/var/www/portfolio` | `cryptosmart-portfolio` | `8000` | SQLite |
| **Trading Journal — فرانت** (همین ریپو) | `/var/www/trading-journal/frontend` | `tj-frontend` | `3001` | ندارد |
| **Trading Journal — بک‌اند** (همین ریپو) | `/var/www/trading-journal/backend` | `tj-backend` | `8001` | PostgreSQL: `trading_journal` |

هیچ پورتی مستقیماً به اینترنت باز نیست؛ فقط Nginx روی `80`/`443` عمومی است و
بر اساس `server_name` و مسیرِ URL به این پروسه‌ها proxy می‌کند.

بررسی سریع:
```bash
pm2 list
ss -tlnp | grep -E ':3000|:3001|:8000|:8001'
```

## ۴. پشتهٔ فناوری و معماری کد

### بک‌اند (`backend/`)
- **فریم‌ورک:** FastAPI (async) روی uvicorn.
- **دیتابیس:** PostgreSQL، دسترسی async با **SQLAlchemy 2.0** + `asyncpg`،
  مهاجرت‌های اسکیما با **Alembic** (`backend/alembic/`).
- **اعتبارسنجی/تنظیمات:** Pydantic v2 + `pydantic-settings`.
- **احراز هویت:** JWT (کتابخانهٔ `python-jose`) + هشِ رمز با `passlib`/`bcrypt`.
- **معماریِ لایه‌ای** زیرِ `app/`:
  - `app/api/` — لایهٔ HTTP، هر فایل یک حوزه: `auth.py` (ثبت‌نام/ورود)،
    `trades.py` (ثبتِ معاملات)، `dashboard.py` (آمار/نمودار)، `wallet.py`
    (کیف پول)، `admin.py` (پنل مدیریت)، `ai.py` (تحلیلِ هوش‌مصنوعی)،
    `export.py` (خروجی اکسل)، `uploads.py` (آپلود اسکرین‌شات)، `market.py`
    (دادهٔ بازار برای فرم ثبتِ معامله)، `crud.py`/`serializers.py`/`templates.py`
    (کمک‌کننده‌های مشترک).
  - `app/services/` — منطقِ تجاریِ خالص، بدونِ وابستگی به HTTP؛ مهم‌ترین آن
    `calc.py` — موتورِ محاسباتِ ریسک/بازده معاملات (RR، سود/زیانِ چندپلهٔ
    TP، …) که **تحتِ تستِ واحد است** (`app/tests/test_calc.py`).
  - `app/models/` — مدل‌های SQLAlchemy (جدول‌های دیتابیس).
  - `app/schemas/` — مدل‌های Pydantic برای ورودی/خروجیِ API.
  - `app/core/` — تنظیمات، اتصال دیتابیس، امنیت/JWT.
  - `app/tests/` — تست‌های `pytest`/`pytest-asyncio`.
- **چرا این معماری؟** جداییِ `services/calc.py` از لایهٔ HTTP یعنی موتورِ
  حساس‌ترین بخشِ برنامه (محاسبهٔ سود/زیان و RR معاملات) را می‌توان بدونِ بالا
  آوردنِ دیتابیس یا سرور، فقط با فراخوانیِ تابع تست کرد — دقیقاً همان کاری که
  `test_calc.py` انجام می‌دهد.

### فرانت‌اند (`frontend/`)
- **فریم‌ورک:** Next.js 14 (App Router)، TypeScript، Tailwind CSS.
- **مدیریتِ حالت:** Zustand (`src/store/auth.ts` — سشنِ کاربر/توکن).
- **ساختارِ صفحات** زیرِ `src/app/`: `login/`, `register/`, `dashboard/`,
  `journals/`, `analysis/`, `subscription/`, `wallet/`, `admin/`.
- **کامپوننت‌های کلیدی:** `AppShell.tsx` (چارچوبِ صفحاتِ لاگین‌شده — سایدبار +
  منو)، `HubNav.tsx` (نوارِ پایینیِ متقابل با پورتفولیو)، `AuthGuard.tsx`
  (محافظِ مسیرهای نیازمندِ ورود/ادمین).
- **basePath:** با `NEXT_PUBLIC_BASE_PATH` کنترل می‌شود — به [بخش ۶](#۶-basepath-و-اجرای-هر-دو-حالت-زیرمسیر--مستقل) نگاه کنید.

## ۵. ساختار پوشه‌ها

```
trading-journal/
├─ backend/
│  ├─ app/
│  │  ├─ main.py            # نقطهٔ ورود FastAPI
│  │  ├─ api/                # لایهٔ HTTP (auth, trades, dashboard, wallet, admin, ai, export, uploads, market)
│  │  ├─ services/            # منطق تجاری خالص (از‌جمله calc.py)
│  │  ├─ models/               # مدل‌های SQLAlchemy
│  │  ├─ schemas/               # مدل‌های Pydantic
│  │  ├─ core/                   # تنظیمات، دیتابیس، امنیت
│  │  └─ tests/                   # pytest
│  ├─ alembic/                     # مهاجرت‌های دیتابیس
│  ├─ ecosystem.config.js          # پیکربندی pm2 برای بک‌اند
│  ├─ requirements.txt
│  └─ .env.example
├─ frontend/
│  ├─ src/
│  │  ├─ app/                # صفحات (App Router)
│  │  ├─ components/          # AppShell, HubNav, AuthGuard, WalletModal, ThemeToggle, …
│  │  ├─ store/                 # Zustand (auth)
│  │  └─ lib/                    # api.ts (کلاینت HTTP + BASE_PATH/LOGIN_PATH)، format.ts، types.ts
│  ├─ next.config.js          # basePath شرطی از NEXT_PUBLIC_BASE_PATH
│  ├─ ecosystem.config.js     # پیکربندی pm2 برای فرانت
│  └─ .env.local.example
├─ nginx/
│  ├─ algohub.cryptosmart.site.conf   # کانفیگِ ترکیبیِ فعلی (هر دو اپ زیرِ یک دامنه)
│  └─ trading-journal.conf             # کانفیگِ دامنهٔ مستقلِ قدیمی (الان صرفاً یک الگو/مرجع)
└─ .github/workflows/deploy.yml        # CI/CD
```

## ۶. basePath و اجرای هر دو حالت (زیرمسیر / مستقل)

Next.js `basePath` یک **ثابتِ زمانِ build** است — در خروجیِ `.next` نهایی
جاسازی می‌شود و هم روی مسیریابی و هم روی URL داراییِ استاتیک (CSS/JS/تصاویر)
اثر می‌گذارد. **یک build نمی‌تواند هم‌زمان با و بدونِ پیشوند سرو شود.**

این پروژه از `NEXT_PUBLIC_BASE_PATH` (در `frontend/next.config.js`) برای
کنترلِ این رفتار استفاده می‌کند:

```js
// frontend/next.config.js
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const nextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  images: { remotePatterns: [...] },
};
```

دو حالتِ ممکن (فقط یکی را هم‌زمان می‌توان build کرد):

| حالت | `NEXT_PUBLIC_BASE_PATH` | `NEXT_PUBLIC_API_BASE` | کاربرد |
|---|---|---|---|
| **زیرِ algohub (فعلی، در پروداکشن)** | `/journal` | `/journal/api` | build فعلیِ سرور |
| مستقل (دیگر در پروداکشن استفاده نمی‌شود) | (خالی) | `/api` | فقط برای توسعهٔ محلی/تست جدا |

⚠️ **این دو متغیر در زمانِ build داخلِ کد جاسازی می‌شوند** — یعنی هر بار که
مقدارشان تغییر کند، باید دوباره `npm run build` اجرا شود و pm2 ری‌استارت شود؛
صرفِ تغییرِ `.env.local` بدونِ rebuild اثری ندارد.

## ۷. اجرای محلی (توسعه)

پیش‌نیاز: Python 3.11+، Node.js 18+، PostgreSQL (یا از دیتابیسِ سرور استفاده
با تونل).

### بک‌اند
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env     # DATABASE_URL, SECRET_KEY, CORS_ORIGINS را تنظیم کنید
# جدول‌ها هنگام استارت خودکار ساخته می‌شوند (یا: alembic upgrade head)
uvicorn app.main:app --reload --port 8001
```

### فرانت‌اند
```bash
cd frontend
cp .env.local.example .env.local
# برای توسعهٔ محلیِ ساده، مقدار پیش‌فرض کافی است:
#   NEXT_PUBLIC_API_BASE=http://localhost:8001/api
npm install
npm run dev     # http://localhost:3001 (یا پورتی که Next انتخاب می‌کند)
```

## ۸. تست و آزمون نرم‌افزار

### تست‌های خودکار بک‌اند (pytest)
موتورِ محاسباتِ معاملات (`app/services/calc.py`) تحتِ تستِ واحد است — مقادیرِ
موردانتظار در `SPEC.md` بخش ۷ دستی محاسبه و در تست‌ها کامنت شده‌اند (سناریوهای
LONG/SHORT با چند TP، RR موردانتظار در برابرِ RR واقعی):

```bash
cd backend
source venv/bin/activate
pytest -v
```

هر تغییری در منطقِ محاسباتی (RR، سود/زیانِ چندپلهٔ TP، کارمزد/فاندینگ) باید
تستِ متناظر داشته باشد یا حداقل تست‌های موجود را سبز نگه دارد.

### Smoke test بک‌اند (اگر پایگاه‌دادهٔ تست در دسترس نیست)
```bash
python -c "from app.main import app; print('OK, routes:', len(app.routes))"
```

### تستِ فرانت‌اند
این پروژه در حال حاضر تستِ خودکار برای فرانت ندارد؛ آزمونِ کیفیت به این
صورت است:
```bash
cd frontend
npm run build     # اگر بیلد بدونِ خطا تمام شود، تایپ‌اسکریپت + لینت پایه رد شده
```
سپس تستِ بصری در مرورگر (دسکتاپ + موبایل، حالتِ `basePath=/journal`) الزامی
است — خصوصاً برای صفحاتی که به هاب لینک می‌دهند (`HubNav.tsx`) یا از
`AuthGuard` استفاده می‌کنند.

### تستِ یکپارچگیِ end-to-end پس از دیپلوی
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://algohub.cryptosmart.site/journal          # 200
curl -s -o /dev/null -w "%{http_code}\n" https://algohub.cryptosmart.site/journal/          # 308 (کانونیکالِ Next)
curl -s -o /dev/null -w "%{http_code}\n" https://algohub.cryptosmart.site/journal/login      # 200
curl -s https://algohub.cryptosmart.site/journal/api/health                                  # {"status":"ok"}
```

## ۹. متغیرهای محیطی

### بک‌اند (`backend/.env`, نمونه در `backend/.env.example`)
| متغیر | کاربرد |
|---|---|
| `DATABASE_URL` | اتصالِ async به PostgreSQL: `postgresql+asyncpg://user:pass@localhost:5432/trading_journal` |
| `SECRET_KEY` | امضای JWT — رشتهٔ تصادفیِ بلند (`openssl rand -hex 32`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | مدتِ اعتبارِ لاگین (پیش‌فرض ۷ روز) |
| `CORS_ORIGINS` | دامنه‌های مجازِ فراخوانیِ API (کاما جدا) |
| `UPLOAD_DIR` | مسیرِ ذخیرهٔ اسکرین‌شاتِ معاملات روی دیسک |
| `AI_API_STYLE` / `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | تحلیلِ هوش‌مصنوعیِ معاملات (`openai`/`anthropic`/`dify`) |
| `AI_MAX_TOKENS` / `AI_REPORT_MAX_TOKENS` | سقفِ توکن برای پاسخِ چت / گزارشِ نهادیِ ۱۹‌بخشی |

### فرانت‌اند (`frontend/.env.local`, نمونه در `frontend/.env.local.example`)
| متغیر | حالتِ زیرِ algohub (فعلی) | حالتِ مستقل (قدیمی) |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | `/journal/api` | `/api` |
| `NEXT_PUBLIC_BASE_PATH` | `/journal` | (خالی) |

⚠️ هر دو متغیرِ فرانت **در زمانِ build جاسازی می‌شوند** — بعد از تغییر حتماً
`npm run build` + `pm2 restart tj-frontend`.

## ۱۰. دیتابیس (PostgreSQL)

- **نام دیتابیس:** `trading_journal` — کاملاً مستقل از SQLiteِ پروژهٔ پورتفولیو.
- **ساختِ اولیه (یک‌بار روی سرور):**
  ```bash
  sudo -u postgres psql <<'SQL'
  CREATE USER tj_user WITH PASSWORD 'STRONG_PASSWORD';
  CREATE DATABASE trading_journal OWNER tj_user;
  GRANT ALL PRIVILEGES ON DATABASE trading_journal TO tj_user;
  SQL
  ```
- **مهاجرت‌های اسکیما:** با Alembic (`backend/alembic/`)، به‌علاوهٔ چند اسکریپتِ
  یک‌بارمصرفِ قدیمی‌تر در ریشهٔ `backend/` (`migrate_add_*.py`) که پیش از
  استقرارِ کاملِ Alembic نوشته شده‌اند — برای دیتابیس‌های جدید نیازی به اجرای
  آن‌ها نیست، جدول‌ها هنگامِ استارت یا با `alembic upgrade head` ساخته می‌شوند.
- **بکاپ‌گیریِ دستی:**
  ```bash
  pg_dump -U tj_user trading_journal > ~/tj-backup-$(date +%F).sql
  ```

## ۱۱. راه‌اندازی کامل سرور از صفر

```bash
# پیش‌نیازها
apt update && apt install -y python3-venv python3-pip nodejs npm postgresql postgresql-contrib
systemctl enable --now postgresql
npm install -g pm2

# دیتابیس (به بخش ۱۰ نگاه کنید)

# کد
mkdir -p /var/www/trading-journal && cd /var/www/trading-journal
git clone <URL-ریپو> .

# بک‌اند
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env && nano .env
pm2 start ecosystem.config.js      # tj-backend روی 8001

# فرانت‌اند (حالتِ زیرِ algohub — پیش‌فرضِ فعلیِ پروداکشن)
cd ../frontend
cp .env.local.example .env.local
nano .env.local     # NEXT_PUBLIC_API_BASE=/journal/api ، NEXT_PUBLIC_BASE_PATH=/journal
npm install
npm run build
pm2 start ecosystem.config.js      # tj-frontend روی 3001

pm2 save
```

## ۱۲. Nginx — دو حالت: زیرِ algohub یا مستقل

### الف) حالتِ فعلیِ پروداکشن — زیرِ `algohub.cryptosmart.site`
فایلِ الگو: `nginx/algohub.cryptosmart.site.conf` (نسخهٔ کامل با کامنت در
ریپوی پورتفولیو هم موجود است، دو ریپو این فایل را هم‌زمان نگه می‌دارند). نصب:
```bash
cp nginx/algohub.cryptosmart.site.conf /etc/nginx/sites-available/algohub.cryptosmart.site.conf
ln -s /etc/nginx/sites-available/algohub.cryptosmart.site.conf /etc/nginx/sites-enabled/ 2>/dev/null
nginx -t && systemctl reload nginx
certbot --nginx -d algohub.cryptosmart.site --non-interactive --redirect
```
جزئیاتِ کاملِ مسیرها (`/journal`, `/journal/`, `/journal/api/`,
`/journal/uploads/`) در README ریپوی پورتفولیو، بخشِ Nginx.

⚠️ همان هشدارِ حیاتیِ ریپوی پورتفولیو اینجا هم صدق می‌کند: **هرگز این فایل را
مستقیماً روی فایلِ زندهٔ سرور کپی نکنید بدونِ اینکه بلافاصله بعدش دوباره
Certbot را اجرا کنید** — وگرنه بلوکِ SSل که Certbot اضافه کرده پاک می‌شود.

### ب) دامنهٔ مستقلِ قدیمی — الان صرفاً یک ریدایرکت
فایلِ زندهٔ سرور در `/etc/nginx/sites-available/trading-journal` دیگر به
`tj-frontend`/`tj-backend` proxy نمی‌کند؛ چون build فعلیِ فرانت با
`basePath=/journal` ساخته شده (بخش ۶) و دیگر نمی‌تواند بدونِ پیشوند جواب
بدهد. به‌جایش این فایل صرفاً یک ریدایرکتِ ۳۰۱ است:
```nginx
server {
    server_name trading-journal.cryptosmart.site;
    location / {
        return 301 https://algohub.cryptosmart.site/journal$request_uri;
    }
    listen 443 ssl; # managed by Certbot
    ssl_certificate ...;      # managed by Certbot — دست نزنید
    ssl_certificate_key ...;  # managed by Certbot — دست نزنید
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;    # managed by Certbot
}
server {
    if ($host = trading-journal.cryptosmart.site) { return 301 https://$host$request_uri; }
    listen 80;
    server_name trading-journal.cryptosmart.site;
    return 404;
}
```
فایلِ `nginx/trading-journal.conf` در این ریپو یک نسخهٔ الگوی **قدیمی** است
(بدونِ بلوکِ SSL — چون Certbot آن را جدا اضافه می‌کند) و صرفاً برای مرجع نگه
داشته شده؛ اگر روزی خواستید ژورنال را کاملاً مستقل و بدونِ basePath دوباره
دیپلوی کنید، باید فرانت را با `NEXT_PUBLIC_BASE_PATH` خالی دوباره build کنید و
سپس این الگو را به‌روز و نصب کنید.

## ۱۳. CI/CD (استقرار خودکار)

هر push به شاخهٔ `main`، با `.github/workflows/deploy.yml`:
1. با SSH به سرور وصل می‌شود.
2. کدِ جدید را می‌گیرد (`git pull` یا rsync، بسته به تنظیمِ فعلیِ Workflow).
3. بک‌اند: نصبِ وابستگی‌ها + `pm2 restart tj-backend`.
4. فرانت: `npm install` + `npm run build` + `pm2 restart tj-frontend`.

سکرت‌های لازم (**Settings → Secrets and variables → Actions**):
`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

## ۱۴. دیباگ روی سرور — چک‌لیست قدم‌به‌قدم

1. **وضعیتِ پروسه‌ها:**
   ```bash
   pm2 list
   pm2 logs tj-backend --lines 100
   pm2 logs tj-frontend --lines 100
   ```
2. **آیا پورت‌های درست گوش می‌دهند؟**
   ```bash
   ss -tlnp | grep -E ':3001|:8001'
   ```
3. **تستِ مستقیم بدونِ Nginx:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/api/health
   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/journal
   ```
4. **تستِ از پشتِ Nginx، بدونِ Cloudflare (با SNI درست):**
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" \
        --resolve algohub.cryptosmart.site:443:127.0.0.1 \
        https://algohub.cryptosmart.site/journal
   ```
   حتماً از `--resolve` استفاده کنید — نه فقط هدرِ Host دستی؛ در غیرِ این
   صورت SNIِ غلط می‌تواند Nginx را به بلوکِ سرورِ دیگری هدایت کند (علتِ ریشه‌ایِ
   بزرگ‌ترین قطعیِ این پروژه — بخش ۱۵).
5. **بررسیِ خودِ Nginx:**
   ```bash
   nginx -t
   nginx -T | grep -A 40 "server_name algohub"
   ```
   اگر بلوکِ `listen 443 ssl` برای `algohub.cryptosmart.site` وجود نداشت،
   Certbot را دوباره اجرا کنید (بخش ۱۲-الف).
6. **نسخهٔ Next.js روی سرور را با `package.json` مقایسه کنید** — یک بارِ
   واقعی، `node_modules/next` روی سرور دستی به نسخهٔ ناسازگار (`^16.2.10`)
   تغییر کرده بود درحالی‌که `package.json` ریپو `14.2.15` را pin کرده بود:
   ```bash
   grep '"version"' /var/www/trading-journal/frontend/node_modules/next/package.json
   grep '"next"' /var/www/trading-journal/frontend/package.json
   ```
   اگر مغایرت دیدید:
   ```bash
   cd /var/www/trading-journal/frontend
   git checkout -- package.json package-lock.json
   rm -rf node_modules .next
   npm ci
   npm run build
   pm2 restart tj-frontend
   ```
7. **لاگ‌های Nginx:**
   ```bash
   tail -n 100 /var/log/nginx/error.log
   tail -n 100 /var/log/nginx/access.log
   ```
8. **بررسیِ اینکه بقیهٔ سایت‌ها دست‌نخورده مانده‌اند:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://cryptosmart.site/
   curl -s -o /dev/null -w "%{http_code}\n" https://algohub.cryptosmart.site/
   curl -sI https://trading-journal.cryptosmart.site/     # باید 301 به algohub/journal بدهد
   ```

## ۱۵. اشتباهات رایج و درس‌های آموخته‌شده

- **basePath یک ثابتِ زمانِ build است.** یک deployment نمی‌تواند هم زیرِ
  `/journal` و هم مستقل کار کند. تصمیمِ نهایی: build فعلی همیشه با
  `NEXT_PUBLIC_BASE_PATH=/journal` ساخته می‌شود، و دامنهٔ مستقلِ قدیمی صرفاً
  ریدایرکت می‌کند (بخش ۱۲-ب).
- **حلقهٔ ریدایرکتِ بی‌نهایت روی `/journal`:** اگر Nginx یک ریدایرکتِ اسلش‌دار
  بزند و Next.js خودش عکسِ آن را (بدونِ اسلش) بزند، بینِ این دو رفتار یک حلقهٔ
  بی‌نهایت شکل می‌گیرد. راه‌حل: `location = /journal` باید مستقیماً proxy کند،
  نه ریدایرکت — این منطق داخلِ `nginx/algohub.cryptosmart.site.conf` با کامنتِ
  توضیحی موجود است.
- **بلوکِ SSلِ Certbot در فایل‌های Nginx زندهٔ سرور می‌آید، نه در قالب‌های
  گیت.** کپیِ بی‌احتیاطِ قالبِ گیت روی فایلِ زندهٔ سرور، این بلوک را پاک
  می‌کند و کل دامنه از کار می‌افتد — حتی اگر هر دو پروسهٔ pm2 کاملاً سالم
  باشند. همیشه بعد از هر `cp` روی فایلِ Nginxِ سرور، دوباره
  `certbot --nginx -d algohub.cryptosmart.site --non-interactive --redirect`
  اجرا کنید.
- **`curl` بدونِ `--resolve` گمراه‌کننده است** — همیشه SNI را با
  `--resolve <domain>:443:127.0.0.1` درست تنظیم کنید، وگرنه ممکن است نتیجهٔ
  یک بلوکِ سرورِ کاملاً متفاوت را ببینید.
- **لینک‌های داخلیِ بینِ دو اپ باید تگِ خامِ `<a>` باشند، نه `<Link>` نکست** —
  چون `Link` به‌صورتِ خودکار `basePath` را جلوی مسیر اضافه می‌کند و لینکِ به
  اپِ دیگر (که basePath ندارد) را خراب می‌کند. به همینِ دلیل `HubNav.tsx` و
  بخشِ `HUB_LINKS` در `AppShell.tsx` عمداً از `<a>` استفاده می‌کنند.

## ۱۶. دستورهای مفید روزمره

```bash
pm2 logs tj-backend         # لاگ زندهٔ بک‌اند
pm2 logs tj-frontend        # لاگ زندهٔ فرانت
pm2 restart tj-backend tj-frontend
pm2 restart cryptosmart-portfolio     # پروژهٔ خواهر (اگر لازم بود)

# ری‌بیلدِ کاملِ فرانت پس از تغییرِ کد یا env
cd /var/www/trading-journal/frontend
npm ci && npm run build && pm2 restart tj-frontend

# اعمالِ مهاجرتِ جدیدِ دیتابیس
cd /var/www/trading-journal/backend
./venv/bin/alembic upgrade head
```
