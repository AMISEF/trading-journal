/**
 * Minimal Markdown → HTML conversion used for the printable PDF report.
 * Supports headings, bold, bullet/numbered lists, GitHub-style tables and
 * paragraphs. Output is self-contained HTML (the print window injects its own
 * CSS), so escaping user/model text is important.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline: **bold** → <strong>. Operates on already-escaped text. */
function inline(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.includes("|");
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: string[] = [];
  let i = 0;

  const flushList = () => {
    if (list.length === 0) return;
    out.push("<ul>" + list.map((it) => `<li>${inline(escapeHtml(it))}</li>`).join("") + "</ul>");
    list = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Table: header row + separator + body rows
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushList();
      const header = splitRow(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        body.push(splitRow(lines[i]));
        i += 1;
      }
      const thead =
        "<thead><tr>" +
        header.map((h) => `<th>${inline(escapeHtml(h))}</th>`).join("") +
        "</tr></thead>";
      const tbody =
        "<tbody>" +
        body
          .map(
            (r) =>
              "<tr>" +
              r.map((c) => `<td>${inline(escapeHtml(c))}</td>`).join("") +
              "</tr>"
          )
          .join("") +
        "</tbody>";
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    if (trimmed === "") {
      flushList();
    } else if (trimmed.startsWith("### ")) {
      flushList();
      out.push(`<h4>${inline(escapeHtml(trimmed.slice(4)))}</h4>`);
    } else if (trimmed.startsWith("## ")) {
      flushList();
      out.push(`<h3>${inline(escapeHtml(trimmed.slice(3)))}</h3>`);
    } else if (trimmed.startsWith("# ")) {
      flushList();
      out.push(`<h2>${inline(escapeHtml(trimmed.slice(2)))}</h2>`);
    } else if (/^[-*]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-*]\s+/, ""));
    } else if (/^\d+[.)]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^\d+[.)]\s+/, ""));
    } else {
      flushList();
      out.push(`<p>${inline(escapeHtml(trimmed))}</p>`);
    }
    i += 1;
  }
  flushList();
  return out.join("\n");
}

/**
 * Open a print window with a hedge-fund-styled cover page + the rendered report
 * and trigger the browser's "Save as PDF". Falls back silently if popups are
 * blocked.
 */
export function printReport(opts: {
  title: string;
  subject?: string;
  generatedAt?: string | null;
  contentMarkdown: string;
}): void {
  const { title, subject, generatedAt, contentMarkdown } = opts;
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) {
    alert("برای دانلود PDF، اجازه‌ی باز شدن پنجره (popup) را بدهید.");
    return;
  }
  const body = markdownToHtml(contentMarkdown);
  const dateStr = generatedAt ? new Date(generatedAt).toLocaleString("fa-IR") : "";
  const html = `<!doctype html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: A4; margin: 18mm 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Vazirmatn", "Segoe UI", Tahoma, sans-serif;
    color: #0f172a; line-height: 1.8; font-size: 12px; margin: 0;
  }
  .cover {
    height: 100vh; display: flex; flex-direction: column; justify-content: center;
    align-items: center; text-align: center; page-break-after: always;
    background: linear-gradient(160deg, #0b1120, #1e293b); color: #e2e8f0;
    border-radius: 4px;
  }
  .cover .badge {
    letter-spacing: 2px; font-size: 11px; color: #38bdf8; margin-bottom: 16px;
    border: 1px solid rgba(56,189,248,0.4); padding: 6px 14px; border-radius: 999px;
  }
  .cover h1 { font-size: 30px; margin: 6px 0; font-weight: 800; }
  .cover h2 { font-size: 16px; font-weight: 500; color: #94a3b8; margin: 4px 0; }
  .cover .meta { margin-top: 28px; font-size: 12px; color: #cbd5e1; }
  .cover .rule { width: 80px; height: 3px; background: #38bdf8; margin: 18px auto; border-radius: 3px; }
  h2 { font-size: 18px; border-bottom: 2px solid #0ea5e9; padding-bottom: 4px; margin: 22px 0 10px; color: #0c4a6e; }
  h3 { font-size: 15px; margin: 18px 0 8px; color: #0369a1; border-right: 4px solid #0ea5e9; padding-right: 8px; }
  h4 { font-size: 13px; margin: 12px 0 6px; font-weight: 700; }
  p { margin: 6px 0; }
  ul { margin: 6px 18px 6px 0; padding: 0; }
  li { margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; }
  th { background: #0c4a6e; color: #fff; font-weight: 700; }
  tbody tr:nth-child(even) { background: #f1f5f9; }
  strong { color: #0c4a6e; }
  .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <section class="cover">
    <div class="badge">INSTITUTIONAL DUE DILIGENCE</div>
    <h1>${title}</h1>
    ${subject ? `<h2>${subject}</h2>` : ""}
    <div class="rule"></div>
    <div class="meta">${dateStr ? `تاریخ تولید گزارش: ${dateStr}` : ""}</div>
  </section>
  <main>${body}</main>
  <div class="footer">این گزارش توسط دستیار هوش مصنوعی تولید شده و صرفاً جهت ارزیابی داخلی است.</div>
  <script>
    window.onload = function () { setTimeout(function () { window.print(); }, 350); };
  </script>
</body>
</html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
