# Dify prompt pack — v5

The four system prompts the AI coach runs on. Paste each file into the SYSTEM box
of the matching node in the **existing** Dify app, then hit **Publish**.

## Why files and not a `.yml` DSL export

Importing a DSL creates a **new app** in Dify, and a Dify app's API key is bound
to the app. A new app therefore means:

- a new API key → `AI_API_KEY` in `backend/.env` has to change,
- a new published endpoint,
- re-picking the model on all four nodes anyway (model names are workspace bound),
- the old app left behind, still answering if anything still points at it.

Pasting four prompts into the app that is already published and already wired to
the backend avoids every one of those. Same endpoint, same key, same models.

## Node mapping

| Dify node | `analysis_type` | file |
| --- | --- | --- |
| تحلیل کلی معاملات | `overall` | `01-coach-system.md` |
| تحلیل تک‌معامله | `trade` | `02-trade-system.md` |
| گزارش نهادی | `institutional` | `03-institutional-system.md` |
| چت با مربی | `chat` | `04-chat-system.md` |

Leave the USER message as it is — it already passes `{{#context#}}` (plus
`user_message` / `chat_history` on the chat node). The backend builds everything
else: named trades, the full dashboard, the trading plan, the checklists, the
requested thinking level and the exit chart images.

## After pasting

Set `DIFY_PROMPTS_IN_WORKFLOW=1` in `backend/.env` and restart `tj-backend`.
That stops the backend from prepending the same prompt to `context`, which is
where the input-token saving actually comes from. Leave it unset and both copies
are sent — harmless, but wasteful.

## Model choice

See the table in the chat thread. Short version: keep `gpt-5.6-luna-pro` on the
coach and the institutional report, and on the single-trade node prefer whichever
model reads chart images best in your workspace — that node is the only one where
vision quality decides the output.
