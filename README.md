# Trading Journal — پنل ژورنال تریدینگ کریپتو (Crypto Smart)

پنل داخلی ثبت و تحلیل معاملات کریپتو. بک‌اند **FastAPI + PostgreSQL**، فرانت **Next.js 14**.
روی ساب‌دامین `trading-journal.cryptosmart.site` و **کنار** سایت فعلی `cryptosmart.site` اجرا می‌شود — بدون دست‌زدن به سایت فعلی.

```
trading-journal/
├─ backend/    # FastAPI (uvicorn) — پورت 8001
├─ frontend/   # Next.js — پورت 3001
├─ nginx/trading-journal.conf
└─ .github/workflows/deploy.yml   # CI/CD (push به main → دیپلوی)
```

پورت‌ها و مسیرها جدا از سایت فعلی هستند:
| اپ | پوشه روی سرور | PM2 | پورت |
|---|---|---|---|
| سایت فعلی | `/var/www/cryptosmart` | `cryptosmart` | 3000 |
| ژورنال (فرانت) | `/var/www/trading-journal/frontend` | `tj-frontend` | 3001 |
| ژورنال (بک‌اند) | `/var/www/trading-journal/backend` | `tj-backend` | 8001 |

---

# راهنمای قدم‌به‌قدم — انتشار روی گیت‌هاب و سرور

> همه‌چیز جداست؛ سایت فعلی شما دست‌نخورده می‌ماند.

## بخش ۰ — ساخت ریپوی گیت‌هاب و آپلود کد

۱. در گیت‌هاب یک ریپوی **خالی** بساز با نام `trading-journal` (بدون README/gitignore).
۲. روی سیستم خودت، داخل پوشه‌ی `trading-journal` که برایت فرستادم این دستورها را بزن:

```bash
cd trading-journal
git init
git add .
git commit -m "Initial commit: trading journal app"
git branch -M main
git remote add origin git@github.com:aminkhosusimehr/trading-journal.git
git push -u origin main
```

(اگر SSH نداری از HTTPS استفاده کن: `https://github.com/aminkhosusimehr/trading-journal.git`)

## بخش ۱ — DNS (Hostinger / Cloudflare)

یک رکورد A اضافه کن:
```
Type: A   Name: trading-journal   Value: 38.252.8.195   TTL: 300
```
چند دقیقه تا چند ساعت برای انتشار صبر کن. تست:
```bash
ping trading-journal.cryptosmart.site
```

## بخش ۲ — پیش‌نیازهای سرور (یک‌بار)

با SSH وارد سرور شو (`ssh root@38.252.8.195`) و این‌ها را نصب کن (اگر از قبل نیستند):

```bash
# Python و ابزارها
apt update
apt install -y python3-venv python3-pip

# PostgreSQL
apt install -y postgresql postgresql-contrib
systemctl enable --now postgresql
```

دیتابیس و کاربر بساز (یک رمز قوی به‌جای `STRONG_PASSWORD` بگذار و یادداشت کن):
```bash
sudo -u postgres psql <<'SQL'
CREATE USER tj_user WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE trading_journal OWNER tj_user;
GRANT ALL PRIVILEGES ON DATABASE trading_journal TO tj_user;
SQL
```

## بخش ۳ — گرفتن کد روی سرور (Deploy Key)

برای اینکه CI/CD بتواند روی سرور `git pull` کند، همان روش سایت فعلی را تکرار می‌کنیم.

```bash
# اگر کلید دیپلوی سایت فعلی را داری می‌توانی همان را برای این ریپو هم اضافه کنی،
# یا یک کلید جدید بساز:
ssh-keygen -t ed25519 -f ~/.ssh/tj_deploy -N ""
cat ~/.ssh/tj_deploy.pub
```
محتوای `.pub` را در گیت‌هاب ریپوی `trading-journal` → **Settings → Deploy keys → Add deploy key** بچسبان (Allow write لازم نیست).

سپس روی سرور به git بگو از این کلید استفاده کند و کد را کلون کن:
```bash
# host alias برای این ریپو
cat >> ~/.ssh/config <<'CFG'

Host github-tj
    HostName github.com
    User git
    IdentityFile ~/.ssh/tj_deploy
    IdentitiesOnly yes
CFG

cd /var/www
git clone git@github-tj:aminkhosusimehr/trading-journal.git
cd trading-journal
```
> اگر کلید دیپلوی سایت فعلی را دوباره استفاده می‌کنی، کلون را با همان remote عادی `git@github.com:...` بزن.

## بخش ۴ — تنظیم فایل‌های env

**بک‌اند:**
```bash
cd /var/www/trading-journal/backend
cp .env.example .env
nano .env
```
این مقادیر را تنظیم کن:
```
DATABASE_URL=postgresql+asyncpg://tj_user:STRONG_PASSWORD@localhost:5432/trading_journal
SECRET_KEY=<یک رشته تصادفی طولانی>   # بساز با: openssl rand -hex 32
CORS_ORIGINS=https://trading-journal.cryptosmart.site
```

**فرانت:**
```bash
cd /var/www/trading-journal/frontend
cp .env.local.example .env.local
nano .env.local
```
```
NEXT_PUBLIC_API_BASE=/api
```

## بخش ۵ — نصب و بالا آوردن (یک‌بار)

**بک‌اند:**
```bash
cd /var/www/trading-journal/backend
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
# جدول‌ها هنگام استارت خودکار ساخته می‌شوند
pm2 start ecosystem.config.js
```

**فرانت:**
```bash
cd /var/www/trading-journal/frontend
npm install
npm run build
pm2 start ecosystem.config.js
```

ذخیره‌ی لیست PM2 تا بعد از ری‌استارت سرور هم بالا بیایند:
```bash
pm2 save
```

## بخش ۶ — Nginx (server block جدا)

```bash
cp /var/www/trading-journal/nginx/trading-journal.conf /etc/nginx/sites-available/trading-journal
ln -s /etc/nginx/sites-available/trading-journal /etc/nginx/sites-enabled/
nginx -t        # باید بگوید successful
systemctl reload nginx
```

## بخش ۷ — SSL

```bash
certbot --nginx -d trading-journal.cryptosmart.site
```
گزینه‌ی ریدایرکت HTTP→HTTPS را بزن. تمام.

## بخش ۸ — تست نهایی

```bash
curl -I https://trading-journal.cryptosmart.site            # باید 200
curl https://trading-journal.cryptosmart.site/api/health    # {"status":"ok"}
pm2 list                                                    # tj-backend و tj-frontend سبز
```
حالا در مرورگر باز کن، ثبت‌نام کن (اولین کاربر **ادمین** می‌شود).

---

## از این به بعد (CI/CD خودکار)

هر بار به برنچ `main` پوش کنی، GitHub Actions خودکار روی سرور `git pull` + نصب + build + `pm2 restart` می‌زند.
در گیت‌هاب ریپوی `trading-journal` → **Settings → Secrets and variables → Actions** این سه سکرت را بگذار (همان مقادیر سایت فعلی):
```
VPS_HOST     = 38.252.8.195
VPS_USER     = root
VPS_SSH_KEY  = <کلید خصوصی SSH سرور>
```

## دستورهای مفید
```bash
pm2 logs tj-backend     # لاگ بک‌اند
pm2 logs tj-frontend    # لاگ فرانت
pm2 restart tj-backend tj-frontend
```
