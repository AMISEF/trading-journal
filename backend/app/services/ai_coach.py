"""Orchestrates the AI coach: data in, prompt out, model call.

What changed versus the old ``ai_analysis`` entry points:

* **thinking levels** - ``low``/``medium``/``high``/``max`` feed the last
  10/20/30/50 trades, ``ultra`` adds the exit chart screenshots.
* **the trader's own plan and checklist** travel with every request.
* **every dashboard metric** is included, not a hand picked subset.
* **single trade review** asks the model to read the chart independently first
  ("here is where I would have entered / taken profit / exited"), score its own
  setup, and only then judge the user's trade.

Transport notes: with ``AI_API_STYLE=dify`` the system prompts live inside the
Dify workflow, so we prepend ours to the context - the new behaviour then works
without re-importing the workflow. The local Dify runner also lifts the two
image cap that ``ai_analysis._dify_run`` applies, which the ultra level needs.

Every optional lookup rolls the session back on failure: PostgreSQL aborts the
whole transaction after a failed statement, so without it the job's final
commit would fail as well.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Sequence

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.template import ChecklistTemplate
from app.models.trade import Trade
from app.models.trading_plan import TradingPlan
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.services import ai_analysis, ai_context, ai_prompts, balances
from app.services.ai_analysis import AINotConfigured, AIRequestError

logger = logging.getLogger("app.services.ai_coach")

# The ultra level may ship this many chart screenshots.
_DIFY_IMAGE_CAP = 10


async def _safe_rollback(db: AsyncSession) -> None:
    try:
        await db.rollback()
    except Exception:  # pragma: no cover
        logger.warning("rollback failed", exc_info=True)


# ---------------------------------------------------------------------------
# storage helpers
# ---------------------------------------------------------------------------
async def load_checklists(db: AsyncSession, user_id: int) -> list[ChecklistTemplate]:
    try:
        result = await db.execute(
            select(ChecklistTemplate).where(ChecklistTemplate.user_id == user_id)
        )
        return list(result.scalars().all())
    except Exception:  # pragma: no cover - never break a report over this
        logger.warning("could not load checklists for user %s", user_id, exc_info=True)
        await _safe_rollback(db)
        return []


async def load_plan(db: AsyncSession, user_id: int) -> list:
    try:
        result = await db.execute(
            select(TradingPlan).where(TradingPlan.user_id == user_id)
        )
        row = result.scalar_one_or_none()
    except Exception:  # table may not exist yet on an old deployment
        logger.warning("could not load trading plan for user %s", user_id, exc_info=True)
        await _safe_rollback(db)
        return []
    if not row or not row.topics:
        return []
    return list(row.topics)


async def save_plan(db: AsyncSession, user_id: int, topics: Any) -> list:
    clean = topics if isinstance(topics, list) else []
    result = await db.execute(select(TradingPlan).where(TradingPlan.user_id == user_id))
    row = result.scalar_one_or_none()
    if row is None:
        row = TradingPlan(user_id=user_id, topics=clean, revision=1)
        db.add(row)
    else:
        row.topics = clean
        row.revision = (row.revision or 0) + 1
    await db.commit()
    return clean


async def load_dashboard(db: AsyncSession, user: User) -> Any:
    """Every metric the user sees on the dashboard (imported lazily)."""
    try:
        from app.api.dashboard import build_user_dashboard

        return await build_user_dashboard(db, user)
    except Exception:  # pragma: no cover - the report still works without it
        logger.warning("dashboard unavailable for user %s", getattr(user, "id", "?"), exc_info=True)
        await _safe_rollback(db)
        return None


# ---------------------------------------------------------------------------
# trade selection
# ---------------------------------------------------------------------------
def recent_closed(user: User, trades: Sequence[Trade], limit: int) -> list[Trade]:
    closed = [
        t for t in trades
        if t.status == "CLOSED" and balances.in_active_cycle(t, user.capital_reset_date)
    ]
    closed.sort(key=lambda t: t.number or 0)
    return closed[-limit:] if limit > 0 else closed


def _exit_images(trades: Sequence[Trade], cap: int) -> list[tuple[str, str, str]]:
    """``(label, media_type, base64)`` for the newest exit screenshots."""
    images: list[tuple[str, str, str]] = []
    if cap <= 0:
        return images
    for trade in sorted(trades, key=lambda t: t.number or 0, reverse=True):
        if len(images) >= cap:
            break
        data = ai_analysis._image_data(getattr(trade, "image_after", None))
        if data:
            label = f"چارت خروج {ai_context.trade_label(trade)}:"
            images.append((label, data[0], data[1]))
    return images


# ---------------------------------------------------------------------------
# transport
# ---------------------------------------------------------------------------
async def _dify_run_many(
    analysis_type: str,
    context: str,
    images: list[tuple[str, str, str]],
    dify_user: str,
) -> str:
    """Same as ``ai_analysis._dify_run`` but without the two-image cap."""
    key = ai_analysis._api_key()
    if not key:
        raise AINotConfigured("تحلیل هوش مصنوعی فعال نیست. کلید API در سرور تنظیم نشده است.")
    base = (settings.AI_BASE_URL or "").rstrip("/")
    if not base:
        raise AINotConfigured("AI_BASE_URL برای حالت dify تنظیم نشده است.")

    chart_images: list[dict] = []
    for _label, media, b64 in images[:_DIFY_IMAGE_CAP]:
        file_id = await ai_analysis._dify_upload_file(base, key, media, b64, dify_user)
        if file_id:
            chart_images.append(
                {"type": "image", "transfer_method": "local_file", "upload_file_id": file_id}
            )

    payload = {
        "inputs": {
            "analysis_type": analysis_type,
            "context": context,
            "user_message": "",
            "chat_history": "",
            "chart_images": chart_images,
        },
        "response_mode": "streaming",
        "user": dify_user,
    }
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    result_text = ""
    fallback_text = ""
    error_msg: str | None = None
    try:
        async with httpx.AsyncClient(timeout=ai_analysis._DIFY_TIMEOUT) as client:
            async with client.stream(
                "POST", f"{base}/workflows/run", json=payload, headers=headers
            ) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", "replace")[:300]
                    raise AIRequestError(f"سرویس Dify خطا برگرداند ({resp.status_code}): {body}")
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    data_str = line[len("data:"):].strip()
                    if not data_str:
                        continue
                    try:
                        obj = json.loads(data_str)
                    except ValueError:
                        continue
                    event = obj.get("event")
                    node_data = obj.get("data") or {}
                    if event == "workflow_finished":
                        outputs = node_data.get("outputs") or {}
                        result_text = (outputs.get("result") or "").strip()
                        error_msg = node_data.get("error")
                    elif event == "node_finished" and node_data.get("node_type") == "llm":
                        out = (node_data.get("outputs") or {}).get("text")
                        if out:
                            fallback_text = out.strip()
    except AIRequestError:
        raise
    except httpx.HTTPError as exc:
        raise AIRequestError(f"خطا در ارتباط با Dify: {exc}") from exc

    if error_msg:
        raise AIRequestError(f"خطای Dify: {error_msg}")
    text = result_text or fallback_text
    if not text:
        raise AIRequestError("پاسخ خالی از Dify دریافت شد.")
    return text


async def _run(
    system: str,
    context: str,
    images: list[tuple[str, str, str]] | None,
    max_tokens: int,
    analysis_type: str,
    dify_user: str,
) -> str:
    images = images or []
    style = (settings.AI_API_STYLE or "openai").strip().lower()
    if style == "dify":
        # The workflow carries the old prompts, so ship the new one inline.
        merged = system.strip() + "\n\n---\n\n" + context
        return await _dify_run_many(analysis_type, merged, images, dify_user)
    return await ai_analysis._complete(
        system,
        context,
        images,
        max_tokens=max_tokens,
        analysis_type=analysis_type,
        dify_user=dify_user,
    )


# ---------------------------------------------------------------------------
# public entry points
# ---------------------------------------------------------------------------
async def run_overall(
    db: AsyncSession,
    user: User,
    trades: list[Trade],
    transactions: list[WalletTransaction] | None,
    level: str | None = None,
) -> str:
    level = ai_prompts.normalize_level(level)
    cfg = ai_prompts.LEVELS[level]
    selection = recent_closed(user, trades, cfg["trades"])
    dash = await load_dashboard(db, user)
    checklists = await load_checklists(db, user.id)
    plan_topics = await load_plan(db, user.id)

    context = ai_context.build_coach_context(
        user=user,
        trades=selection,
        dash=dash,
        checklists=checklists,
        plan_topics=plan_topics,
        level_note=f"سطح تفکر انتخاب‌شده: {cfg['label']} ({level})",
    )
    system = ai_prompts.COACH_SYSTEM_PROMPT + "\n\n" + ai_prompts.level_block(level)
    images = _exit_images(selection, cfg["images"])
    if images:
        context += (
            "\n\n## تصاویر پیوست\n"
            f"{len(images)} تصویر چارت خروج پیوست شده است؛ هر کدام با نام معامله برچسب خورده. "
            "در تحلیل حتماً به آن‌ها استناد کن."
        )
    return await _run(
        system,
        context,
        images,
        max_tokens=max(cfg["tokens"], settings.AI_REPORT_MAX_TOKENS or 0),
        analysis_type="overall",
        dify_user=str(user.id),
    )


async def run_trade(
    db: AsyncSession,
    user: User,
    trades: list[Trade],
    trade: Trade,
    transactions: list[WalletTransaction] | None,
) -> str:
    dash = await load_dashboard(db, user)
    checklists = await load_checklists(db, user.id)
    plan_topics = await load_plan(db, user.id)
    recent = [t for t in recent_closed(user, trades, 6) if t.id != trade.id]

    context = ai_context.build_trade_context(
        user=user,
        trade=trade,
        recent_trades=recent,
        dash=dash,
        checklists=checklists,
        plan_topics=plan_topics,
    )

    images: list[tuple[str, str, str]] = []
    for label, url in (
        (f"چارت قبل از ورود {ai_context.trade_label(trade)}:", trade.image_before),
        (f"چارت بعد از خروج {ai_context.trade_label(trade)}:", trade.image_after),
    ):
        data = ai_analysis._image_data(url)
        if data:
            images.append((label, data[0], data[1]))
    if not images:
        context += (
            "\n\nتوجه: کاربر برای این معامله تصویر چارتی ثبت نکرده است. "
            "بخش «تحلیل مستقل من از چارت» را بر اساس اعداد ثبت‌شده بنویس و یادآوری کن ثبت تصویر چقدر کمک می‌کند."
        )

    return await _run(
        ai_prompts.TRADE_SYSTEM_PROMPT,
        context,
        images,
        max_tokens=max(settings.AI_MAX_TOKENS or 0, 4000),
        analysis_type="trade",
        dify_user=str(user.id),
    )


async def run_institutional(
    db: AsyncSession,
    user: User,
    trades: list[Trade],
    transactions: list[WalletTransaction] | None,
) -> str:
    dash = await load_dashboard(db, user)
    checklists = await load_checklists(db, user.id)
    plan_topics = await load_plan(db, user.id)
    selection = recent_closed(user, trades, ai_analysis.AI_SUMMARY_MAX_TRADES)

    # Keep the deterministic python metrics (incl. Monte Carlo) as the base.
    base_summary = ai_analysis.build_institutional_summary(user, trades, transactions)
    context = ai_context.build_institutional_context(
        user=user,
        base_summary=base_summary,
        trades=selection,
        dash=dash,
        checklists=checklists,
        plan_topics=plan_topics,
    )
    images = _exit_images(selection, 8)
    return await _run(
        ai_prompts.INSTITUTIONAL_SYSTEM_PROMPT,
        context,
        images,
        max_tokens=max(settings.AI_REPORT_MAX_TOKENS or 0, 8000),
        analysis_type="institutional",
        dify_user=str(user.id),
    )


# ---------------------------------------------------------------------------
# chat grounding
# ---------------------------------------------------------------------------
async def chat_context_overall(
    db: AsyncSession,
    user: User,
    trades: list[Trade],
    transactions: list[WalletTransaction] | None,
    analysis: str | None = None,
) -> str:
    dash = await load_dashboard(db, user)
    checklists = await load_checklists(db, user.id)
    plan_topics = await load_plan(db, user.id)
    selection = recent_closed(user, trades, 20)
    context = ai_context.build_coach_context(
        user=user,
        trades=selection,
        dash=dash,
        checklists=checklists,
        plan_topics=plan_topics,
    )
    parts = [ai_prompts.CHAT_RULES, context]
    if analysis:
        parts.append("## گزارش مربی که قبلاً برای همین کاربر تولید شده\n" + analysis)
    return "\n\n".join(parts)


async def chat_context_trade(
    db: AsyncSession,
    user: User,
    trades: list[Trade],
    trade: Trade,
    transactions: list[WalletTransaction] | None,
    analysis: str | None = None,
) -> str:
    dash = await load_dashboard(db, user)
    checklists = await load_checklists(db, user.id)
    plan_topics = await load_plan(db, user.id)
    context = ai_context.build_trade_context(
        user=user,
        trade=trade,
        recent_trades=[],
        dash=dash,
        checklists=checklists,
        plan_topics=plan_topics,
    )
    parts = [ai_prompts.CHAT_RULES, context]
    if analysis:
        parts.append("## تحلیلی که قبلاً برای همین معامله تولید شده\n" + analysis)
    return "\n\n".join(parts)


async def chat_context_report(
    db: AsyncSession,
    user: User,
    trades: list[Trade],
    transactions: list[WalletTransaction] | None,
    analysis: str | None = None,
) -> str:
    checklists = await load_checklists(db, user.id)
    plan_topics = await load_plan(db, user.id)
    dash = await load_dashboard(db, user)
    selection = recent_closed(user, trades, 30)
    context = ai_context.build_institutional_context(
        user=user,
        base_summary=ai_analysis.build_institutional_summary(user, trades, transactions),
        trades=selection,
        dash=dash,
        checklists=checklists,
        plan_topics=plan_topics,
    )
    parts = [ai_prompts.CHAT_RULES, context]
    if analysis:
        parts.append("## گزارش نهادی تولیدشده\n" + analysis)
    return "\n\n".join(parts)
