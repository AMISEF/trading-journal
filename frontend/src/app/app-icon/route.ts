/**
 * آیکن رسمی اپ ALGO HUB.
 *
 * فایلِ منبع (ALGOHUB-LOGO.png) در ریشهٔ مخزن است و مستقیماً توسط Next سرو
 * نمی‌شود؛ این مسیر آن را پیدا می‌کند و با کش یک‌روزه برمی‌گرداند.
 *
 * تغییر اندازه (۵۱۲، ۱۹۲، ۱۸۰ …) روی سرویسِ هاب انجام می‌شود (مسیر /app-icon با
 * Pillow). این مسیر ابتدا همان نسخهٔ آماده را از هابِ محلی می‌گیرد و اگر در دسترس
 * نبود، فایلِ خام را سرو می‌کند. هیچ وابستگیِ ناموجودی اینجا import نمی‌شود تا
 * بیلدِ Next هرگز به خاطرِ آیکن نشکند.
 */
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZES = [48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];

const HUB_BASE = process.env.ALGOHUB_HUB_BASE || "http://" + "127.0.0.1:8000";

const CANDIDATES: string[] = [
  process.env.ALGOHUB_LOGO_PATH || "",
  path.join(process.cwd(), "public", "ALGOHUB-LOGO.png"),
  path.join(process.cwd(), "..", "ALGOHUB-LOGO.png"),
  "/var/www/trading-journal/ALGOHUB-LOGO.png",
  path.join(process.cwd(), "public", "logo-icon.png"),
].filter(Boolean);

const cache = new Map<number, Uint8Array>();

async function fromHub(size: number): Promise<Uint8Array | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${HUB_BASE}/app-icon?size=${size}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function fromDisk(): Promise<Uint8Array | null> {
  for (const file of CANDIDATES) {
    try {
      const buf = await readFile(file);
      return new Uint8Array(buf);
    } catch {
      // مسیر بعدی را امتحان کن.
    }
  }
  return null;
}

export async function GET(request: Request) {
  const asked = Number(new URL(request.url).searchParams.get("size"));
  const size = SIZES.includes(asked) ? asked : 512;

  const hit = cache.get(size);
  if (hit) {
    return new Response(hit, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
    });
  }

  const data = (await fromHub(size)) || (await fromDisk());
  if (!data) return new Response("app icon not found", { status: 404 });

  cache.set(size, data);
  return new Response(data, {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
