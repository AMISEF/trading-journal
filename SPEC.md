# SPEC — پنل ژورنال تریدینگ کریپتو (Crypto Smart)

> منبع حقیقت پروژه. استک: **بک‌اند پایتون (FastAPI) + فرانت‌اند Next.js**.
> دامنه: `trading-journal.cryptosmart.site` · سرور: `38.252.8.195`
> دیپلوی: گیت‌هاب + CI/CD + PM2 + Nginx + SSL (هم‌الگوی پروژه‌ی فعلی روی همین سرور).

---

## ۱) فازها

- **فاز ۱ (فعلی):** پنل داخلی تیم. ثبت دستی معاملات، ماشین‌حساب پویا، داشبورد، لیست ژورنال، پنل ادمین.
- **فاز ۲:** معرفی رسمی؛ احتمال اتصال خودکار به حساب توبیت (کلید API فقط روی سرور).
- **فاز ۳:** مینی‌اپ Web3 داخل ربات تلگرام + احتمال افزودن قابلیت‌های AI.

طراحی باید افزودن فازهای بعد را بدون بازنویسی ممکن کند. چون بک‌اند یک API مستقل است، هم سایت و هم مینی‌اپ تلگرام و هم سرویس‌های AI آینده از همان API استفاده می‌کنند.

---

## ۲) استک فنی

**بک‌اند (Python):** FastAPI (async) · Uvicorn (PM2) · PostgreSQL · SQLAlchemy 2.x async + Alembic · JWT (python-jose) + passlib[bcrypt] · httpx · Pydantic v2 · openpyxl. تاریخ شمسی در فرانت؛ بک‌اند UTC.

**فرانت:** Next.js 14 (App Router) + TypeScript · Tailwind (RTL، روشن/Dark Ocean) · Recharts · dayjs + jalaliday · Zustand + auto-save · axios/fetch.

---

## ۴) مدل داده

**User:** id · email (یکتا) · username (یکتا) · firstName · lastName · passwordHash · role (`TRADER`|`ADMIN`) · walletMargin (پیش‌فرض ۱۰۰۰) · createdAt
**Trade:** id · userId · number (خودکار ۱..n هر کاربر) · symbol · direction (`LONG`|`SHORT`) · status (`PLANNED`|`OPEN`|`CLOSED`) · entryPrice · leverage · marginPercent · stopLoss? · analysisTf? · triggerTf? · isRiskFreePlan · openDate? · closeDate? · exitType? (`RISK_FREE`|`LAST_TP`|`STOP_LOSS`|`TRAILING_STOP`) · trailExitValue? · trailIsPercent? · isRiskFreeMgmt · realizedPnl? · rrExpected? · rrAchieved? · emotions(JSON) · checklistTicks(JSON) · entryReasons[] · exitReasons[] · entryNote? · exitNote? · generalNote? · imageBefore? · imageAfter? · tags[] · createdAt · updatedAt · UNIQUE(userId, number)
**TakeProfit:** id · tradeId · order · price · savePercent (پیش‌فرض ۰)
**ChecklistTemplate:** id · userId · title · items(JSON [{id,text}])
**ReasonTemplate:** id · userId · kind (`entry`|`exit`) · text

---

## ۷) ⭐ موتور محاسبه (calc.py)

> فقط معاملات بسته‌شده روی موجودی اثر دارند.

```python
sign = +1 if direction == "LONG" else -1
margin        = wallet_balance_now * margin_percent / 100
position_size = margin * leverage
def leveraged_return(P): return sign * (P - entry) / entry * leverage
def spot_growth_pct(P):  return sign * (P - entry) / entry * 100
def leveraged_pct(P):    return leveraged_return(P) * 100
def full_dollar_at(P):   return margin * leveraged_return(P)
risk_1r = margin * abs(entry - stop_loss) / entry * leverage
remaining = 1.0; realized_total = 0.0
for tp in take_profits_sorted:
    closed = remaining * (tp.save_percent / 100)
    realized_total += full_dollar_at(tp.price) * closed
    remaining      *= (1 - tp.save_percent / 100)
if exit_type == "LAST_TP":        realized_total += full_dollar_at(last_tp_price) * remaining
elif exit_type == "STOP_LOSS":    realized_total += full_dollar_at(stop_loss) * remaining
elif exit_type == "RISK_FREE":    realized_total += 0
elif exit_type == "TRAILING_STOP":
    P = entry * (1 + sign * trail_value/100) if trail_is_percent else trail_value
    realized_total += full_dollar_at(P) * remaining
realized_pnl = realized_total
rr_expected  = full_dollar_at(last_tp_price) / risk_1r
rr_achieved  = realized_total / risk_1r
result_pct   = realized_pnl / margin * 100
```

⚠️ کمیسیون و فاندینگ هیچ‌جا وارد نمی‌شوند. ✅ تست واحد نوشته شود.
سشن از open_date: سیدنی/توکیو/لندن/نیویورک.

---

## ۱۲) پروکسی API بازار (httpx + کش چندثانیه‌ای)
- قیمت توبیت: `GET https://api.toobit.com/quote/v1/contract/ticker/price?symbol=BTC-SWAP-USDT`
- نمادها: `GET https://api.toobit.com/api/v1/exchangeInfo` → `contracts` (symbol + tickSize)
- نرخ USDT/تومان از تبدیل: بازار `USDTIRT`.
- تبدیل ورودی کاربر `BTC` → `BTC-SWAP-USDT`.
- فاز ۱ کلید API لازم ندارد.

(بقیه بخش‌ها: صفحه تب‌دار ثبت معامله، لیست ژورنال + اکسل، داشبورد، ادمین، تم/RTL — طبق توضیحات پرامپت.)
