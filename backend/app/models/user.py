"""Database model for application users."""

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    false,
    not_,
    or_,
)
from sqlalchemy.ext.hybrid import Comparator, hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.services import groups as groups_svc


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class _GroupMembership(Comparator):
    """مقایسهٔ «عضویت» روی ستونِ چندگروهیِ `user_group`.

    ستون یک لیستِ کاما-جدا نگه می‌دارد («CRYPTOSMART_TEAM,LIVE_TRADE»)، پس
    برابریِ ساده دیگر معنا ندارد. این Comparator کاری می‌کند که
    `User.user_group == groups.LIVE_TRADE_GROUP` به «عضوِ لایو ترید است»
    ترجمه شود، بنابراین همهٔ کوئری‌های موجود (مثلاً showcaseِ عمومی) بدون هیچ
    تغییری درست کار می‌کنند و کاربر می‌تواند هم‌زمان عضوِ چند گروه باشد.
    """

    __hash__ = Comparator.__hash__

    def _matches(self, group: str):
        col = self.expression
        # چهار حالتِ ممکنِ قرارگیریِ نام در لیست: تنها عضو، اول، آخر، وسط.
        return or_(
            col == group,
            col.like(f"{group},%"),
            col.like(f"%,{group}"),
            col.like(f"%,{group},%"),
        )

    def __eq__(self, other):  # noqa: D105 - SQL expression, not a bool
        if other is None:
            return or_(self.expression.is_(None), self.expression == "")
        return self._matches(str(other))

    def __ne__(self, other):  # noqa: D105
        return not_(self.__eq__(other))

    def in_(self, other):
        clauses = [self.__eq__(value) for value in other]
        return or_(*clauses) if clauses else false()

    def notin_(self, other):
        return not_(self.in_(other))


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))

    # Contact phone — Iranian mobile in the form 09xxxxxxxxx. Required at
    # registration; nullable so pre-existing rows remain valid.
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Role is either "TRADER" or "ADMIN". First user ever becomes ADMIN.
    role: Mapped[str] = mapped_column(String(20), default="TRADER")

    # Starting wallet/margin balance the user enters manually.
    wallet_margin: Mapped[float] = mapped_column(Float, default=1000.0)

    # عضویتِ گروه‌های نمایشی — چندگانه. مقدارِ خامِ ستون یک لیستِ کاما-جدا است
    # («CRYPTOSMART_TEAM»، «LIVE_TRADE»، یا «CRYPTOSMART_TEAM,LIVE_TRADE»)، پس
    # یک کاربر می‌تواند هم‌زمان عضوِ تیم کریپتو اسمارت و لایو ترید باشد.
    # نامِ ستون در دیتابیس همان user_group است تا هیچ مهاجرتی لازم نشود.
    user_group_raw: Mapped[str | None] = mapped_column(
        "user_group", String(50), nullable=True
    )

    @hybrid_property
    def user_group(self) -> str | None:
        """گروهِ اصلی (برای نمایش و سازگاری با کدِ قدیمیِ تک‌گروهی)."""
        return groups_svc.primary(self.user_group_raw)

    @user_group.setter
    def user_group(self, value: str | None) -> None:
        """مقدارِ تک‌گروهیِ قدیمی: کلِ عضویت‌ها را با همین یک گروه جایگزین می‌کند."""
        self.user_group_raw = groups_svc.serialize(groups_svc.parse(value))

    @user_group.comparator
    def user_group(cls):  # noqa: N805 - hybrid comparator signature
        return _GroupMembership(cls.user_group_raw)

    @property
    def user_groups(self) -> list[str]:
        """همهٔ گروه‌هایی که کاربر عضوشان است."""
        return groups_svc.parse(self.user_group_raw)

    @user_groups.setter
    def user_groups(self, value) -> None:
        self.user_group_raw = groups_svc.serialize(value)

    # Marks the single showcase/demo account whose journal the «ایجاد دمو»
    # button renders read-only. Independent of user_group, so a demo account can
    # also be a team member.
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Date when capital was last reset (for group members). Trades before this
    # date are locked and don't affect the running balance.
    capital_reset_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Cached AI coach "overall" report (Markdown) across the whole journal.
    ai_overall: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_overall_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Background-job state: None | "PENDING" | "DONE" | "ERROR".
    ai_overall_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ai_overall_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # How many coach runs this account has spent (the free tier + referral
    # bonuses are counted against this, so one stored result is not enough).
    ai_overall_runs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Cached institutional due-diligence report (Markdown) + its job state.
    ai_report: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_report_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_report_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ai_report_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Follow-up chat threads: list of {role, content, at}.
    ai_overall_chat: Mapped[list | None] = mapped_column(JSON, nullable=True)
    ai_report_chat: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Toobit exchange API credentials, encrypted at rest (see app.core.crypto).
    # The plaintext never leaves the server; the API only exposes whether a key is
    # set and a masked preview. The secret is required to sign private requests
    # (positions / fills) when auto-importing the user's futures trades.
    toobit_api_key_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    toobit_secret_key_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    # When the user (re)saved their Toobit key. Only positions opened at/after this
    # time are imported — historical trades from before connecting are ignored.
    toobit_key_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Cursor for the incremental futures sync: last fill/trade time already imported.
    toobit_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Last sync error (surfaced in settings so the user can fix bad/expired keys).
    toobit_sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Subscription
    subscription_tier: Mapped[str] = mapped_column(String(20), default="bronze")
    subscription_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ------------------------------------------------------------------
    # دعوت دوستان (رفرال) — جزئیات در app/services/referrals.py
    # ------------------------------------------------------------------
    # کدِ یکتای دعوت؛ در اولین بازدید از صفحهٔ دعوت دوستان ساخته می‌شود.
    referral_code: Mapped[str | None] = mapped_column(
        String(16), unique=True, index=True, nullable=True
    )
    # دعوت‌کنندهٔ این کاربر (اگر با لینک دعوت ثبت‌نام کرده باشد).
    referred_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # شمارشگرهای دنرمال‌شده تا پلن‌ها بدون کوئری اضافه به سهمیهٔ جایزه دسترسی داشته باشند.
    referral_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    referral_qualified: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # پلکان‌هایی که جایزه‌شان پرداخت شده (مثلاً ["silver", "gold"]).
    referral_rewards: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # ------------------------------------------------------------------
    # کارنامهٔ عمومی معامله‌گر — جزئیات در app/services/share.py
    # ------------------------------------------------------------------
    # نشانیِ یکتای صفحهٔ عمومی (/u/<slug>)؛ فقط پلن طلایی و الماسی می‌سازند.
    share_slug: Mapped[str | None] = mapped_column(
        String(40), unique=True, index=True, nullable=True
    )
    # آیا لینک همین حالا فعال است (کاربر می‌تواند بدون حذفِ اسلاگ خاموشش کند).
    share_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # چه چیزی به اشتراک گذاشته می‌شود:
    # "dashboard" | "journal" (بدون جزئیات) | "journal_full" (با جزئیات) | "all"
    share_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="all")
    # عنوان و معرفیِ کوتاهِ صفحه (اختیاری).
    share_title: Mapped[str | None] = mapped_column(String(80), nullable=True)
    share_bio: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # نمایشِ ناشناس: به‌جای نام و نام خانوادگی فقط نام کاربری نشان داده شود.
    share_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # شمارندهٔ بازدید و زمانِ ساخت لینک.
    share_views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    share_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # All trades belonging to this user.
    trades: Mapped[list["Trade"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )

    # Deposit / withdrawal history.
    wallet_transactions: Mapped[list["WalletTransaction"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan",
    )
