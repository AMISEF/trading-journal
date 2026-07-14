"""Email sending via the Resend REST API (same provider as the portfolio app).

Uses httpx (already a dependency) so no mail server is needed. The API key is
read only from the environment. To send from the domain address the domain must
be DNS-verified in Resend; otherwise Resend only allows onboarding@resend.dev to
the account owner.
"""

from __future__ import annotations

import httpx

from app.core.config import settings


class MailNotConfigured(RuntimeError):
    """Raised when RESEND_API_KEY is not set."""


async def send_email(to_email: str, subject: str, html: str, text: str) -> None:
    if not settings.RESEND_API_KEY:
        raise MailNotConfigured("RESEND_API_KEY not set (.env)")
    payload = {
        "from": f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM_EMAIL}>",
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": text,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            settings.RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if r.status_code >= 300:
        raise RuntimeError(f"Resend error {r.status_code}: {r.text}")


def _render(heading: str, intro: str, code: str, minutes: int, footer_note: str) -> str:
    return f"""\
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="background-color:#eff6ff;margin:0;">
  <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center">
    <tr><td style="font-family:Tahoma,Arial,sans-serif;background-color:#eff6ff;padding:24px 12px;direction:rtl;">
      <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:600px;background-color:#ffffff;border-radius:12px;">
        <tr><td style="padding:40px;">
          <h1 style="font-size:28px;line-height:1.4;font-weight:700;color:#1e3a8a;
                     margin:8px 0 8px;text-align:center;">{heading}</h1>
          <p style="font-size:16px;color:#475569;line-height:1.9;margin:8px 0 24px;text-align:center;">{intro}</p>
          <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
                 style="background-color:#eff6ff;border-radius:10px;margin:16px 0 24px;text-align:center;">
            <tr><td style="padding:28px 24px;">
              <p style="font-size:13px;color:#475569;letter-spacing:1px;margin:0 0 12px;">کد تأیید شما</p>
              <h2 style="font-size:38px;line-height:1.4;font-weight:700;color:#1e3a8a;
                         letter-spacing:8px;margin:0 0 12px;direction:ltr;">{code}</h2>
              <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0;">این کد تا {minutes} دقیقه معتبر است.</p>
            </td></tr>
          </table>
          <p style="font-size:14px;color:#64748b;line-height:1.9;margin:32px 0 0;">{footer_note}</p>
          <hr style="border:none;border-top:2px solid #eaeaea;margin:24px 0;">
          <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:16px 0 0;text-align:center;">
            برای امنیت شما، این کد را هرگز با کسی به اشتراک نگذارید.<br>© کریپتو اسمارت — Algo Hub
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def reset_email_content(code: str) -> tuple[str, str, str]:
    """(subject, html, text) for a password reset / change code."""
    minutes = settings.AUTH_CODE_TTL // 60
    subject = "کد تغییر رمز عبور — Algo Hub"
    html = _render(
        "تغییر رمز عبور",
        "درخواستِ تغییر رمز عبور دریافت شد. برای ادامه، کد زیر را وارد کنید.",
        code, minutes,
        "اگر شما این درخواست را نداده‌اید، رمز شما همچنان امن است و نیازی به اقدام نیست.",
    )
    text = f"کد تغییر رمز عبور شما در Algo Hub: {code}\nاین کد تا {minutes} دقیقه معتبر است."
    return subject, html, text
