"use client";

/**
 * AI trading-coach panel. Loads any cached analysis on mount, lets the user
 * (re)generate it, and renders the Markdown result. Reused for both per-trade
 * and whole-journal ("overall") analysis via the fetcher/generator props.
 */
import { useEffect, useRef, useState } from "react";
import type { AIAnalysis } from "@/lib/types";
import { formatJalaliDateTime } from "@/lib/jalali";

interface Props {
  /** GET the cached analysis / job status. */
  fetcher: () => Promise<AIAnalysis>;
  /** POST to (re)generate the analysis (starts a background job). */
  generator: () => Promise<AIAnalysis>;
  title?: string;
  /** Short hint shown under the title. */
  subtitle?: string;
}

const POLL_MS = 4000;
const MAX_POLLS = 60; // ~4 minutes, then re-enable with a retry hint

export function AICoachPanel({ fetcher, generator, title, subtitle }: Props) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const polls = useRef(0);

  const apply = (res: AIAnalysis) => {
    setAnalysis(res.analysis);
    setGeneratedAt(res.generatedAt);
    setEnabled(res.enabled);
    setStatus(res.status);
    if (res.status === "ERROR" && res.error) setError(res.error);
    else if (res.status !== "ERROR") setError("");
  };

  // Poll while a background job is running.
  const poll = async () => {
    if (polls.current >= MAX_POLLS) {
      setStatus(null);
      setError("تحلیل بیش از حد انتظار طول کشید. لطفاً دوباره تلاش کنید.");
      return;
    }
    polls.current += 1;
    try {
      const res = await fetcher();
      if (!mounted.current) return;
      apply(res);
      if (res.status === "PENDING") {
        timer.current = setTimeout(poll, POLL_MS);
      }
    } catch {
      if (mounted.current) timer.current = setTimeout(poll, POLL_MS);
    }
  };

  useEffect(() => {
    mounted.current = true;
    fetcher()
      .then((res) => {
        if (!mounted.current) return;
        apply(res);
        if (res.status === "PENDING") {
          polls.current = 0;
          timer.current = setTimeout(poll, POLL_MS);
        }
      })
      .catch(() => {})
      .finally(() => mounted.current && setLoading(false));
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    setError("");
    setStatus("PENDING");
    try {
      const res = await generator();
      if (!mounted.current) return;
      apply(res);
      if (timer.current) clearTimeout(timer.current);
      polls.current = 0;
      timer.current = setTimeout(poll, POLL_MS);
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: { detail?: string }; status?: number } })?.response;
      setStatus(null);
      setError(resp?.data?.detail ?? `خطای سرور (${resp?.status ?? "?"})`);
    }
  };

  const pending = status === "PENDING";

  return (
    <div className="tj-card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500/20 to-sky-500/20 text-lg">
            🤖
          </span>
          <div>
            <h2 className="text-base font-bold">{title ?? "تحلیل هوش مصنوعی"}</h2>
            <p className="text-xs text-muted">
              {subtitle ?? "مربی معامله‌گری مبتنی بر هوش مصنوعی"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={pending || (!enabled && !analysis)}
          className="rounded-xl bg-gradient-to-l from-violet-600 to-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "در حال تحلیل…" : analysis ? "تحلیل مجدد" : "تحلیل کن"}
        </button>
      </div>

      {!enabled && !analysis && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-50/60 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          تحلیل هوش مصنوعی هنوز فعال نشده است. مدیر سیستم باید کلید سرویس را در سرور تنظیم کند.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          {error}
        </div>
      )}

      {pending && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-4 text-sm text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          در حال بررسی همه‌ی جزئیات… تحلیل در پس‌زمینه انجام می‌شود و نتیجه به‌صورت خودکار نمایش داده خواهد شد (ممکن است تا یک دقیقه طول بکشد).
        </div>
      )}

      {loading && !pending && (
        <p className="text-sm text-muted">در حال بارگذاری…</p>
      )}

      {analysis && (
        <div className="space-y-2">
          <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-border bg-surface-2/40 p-4">
            <Markdown content={analysis} />
          </div>
          {generatedAt && (
            <p className="pt-1 text-xs text-muted">
              آخرین تحلیل: {formatJalaliDateTime(generatedAt)}
            </p>
          )}
        </div>
      )}

      {!analysis && !pending && !loading && enabled && !error && (
        <p className="text-sm text-muted">
          برای دریافت تحلیل و توصیه‌های بهبود، روی «تحلیل کن» بزنید.
        </p>
      )}
    </div>
  );
}

// ─── Minimal Markdown renderer (headings, bold, lists, paragraphs) ───────────
function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length === 0) return;
    const items = [...list];
    blocks.push(
      <ul key={`ul-${key++}`} className="list-disc space-y-1 pr-5 text-sm leading-relaxed">
        {items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (trimmed === "") {
      flushList();
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flushList();
      blocks.push(
        <h4 key={`h-${key++}`} className="pt-1 text-sm font-bold text-foreground">
          {inline(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(
        <h3 key={`h-${key++}`} className="border-r-2 border-violet-500 pr-2 pt-2 text-base font-bold text-foreground">
          {inline(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(
        <h2 key={`h-${key++}`} className="pt-2 text-lg font-extrabold text-foreground">
          {inline(trimmed.slice(2))}
        </h2>
      );
    } else if (/^[-*]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-*]\s+/, ""));
    } else if (/^\d+[.)]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^\d+[.)]\s+/, ""));
    } else {
      flushList();
      blocks.push(
        <p key={`p-${key++}`} className="text-sm leading-relaxed text-foreground/90">
          {inline(trimmed)}
        </p>
      );
    }
  }
  flushList();

  return <div className="space-y-2">{blocks}</div>;
}

/** Render inline **bold** segments. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
