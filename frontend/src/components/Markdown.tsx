"use client";

/**
 * Minimal Markdown renderer (headings, bold, lists, tables, paragraphs).
 * Shared by the AI coach panel and the public team AI showcase so both render
 * analyses identically.
 */
import type { ReactNode } from "react";

const isTableRow = (l: string) => l.trim().startsWith("|") && l.includes("|");
const isTableSep = (l: string) =>
  /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes("-");

function splitRow(l: string): string[] {
  let s = l.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
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

  let idx = 0;
  while (idx < lines.length) {
    const raw = lines[idx];
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (isTableRow(line) && idx + 1 < lines.length && isTableSep(lines[idx + 1])) {
      flushList();
      const header = splitRow(line);
      idx += 2;
      const body: string[][] = [];
      while (idx < lines.length && isTableRow(lines[idx])) {
        body.push(splitRow(lines[idx]));
        idx += 1;
      }
      blocks.push(
        <div key={`t-${key++}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {header.map((h, i) => (
                  <th key={i} className="border border-white/15 bg-white/5 p-2 text-right font-bold">
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="border border-white/10 p-2 text-right">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (trimmed === "") {
      flushList();
      idx += 1;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flushList();
      blocks.push(
        <h4 key={`h-${key++}`} className="pt-1 text-sm font-bold">
          {inline(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(
        <h3 key={`h-${key++}`} className="border-r-2 border-violet-400 pr-2 pt-2 text-base font-bold">
          {inline(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(
        <h2 key={`h-${key++}`} className="pt-2 text-lg font-extrabold">
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
        <p key={`p-${key++}`} className="text-sm leading-relaxed opacity-90">
          {inline(trimmed)}
        </p>
      );
    }
    idx += 1;
  }
  flushList();

  return <div className="space-y-2">{blocks}</div>;
}

function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
