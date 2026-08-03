/**
 * آیکن رسمی اپ ALGO HUB.
 *
 * فایلِ منبع (ALGOHUB-LOGO.png) در ریشهٔ مخزن است و مستقیماً توسط Next سرو
 * نمی‌شود؛ این مسیر آن را پیدا می‌کند، به اندازهٔ خواسته‌شده (پیش‌فرض ۵۱۲×۵۱۲)
 * تغییر اندازه می‌دهد و در حافظه کش می‌کند.
 *
 * تغییر اندازه با sharp انجام می‌شود (همراهِ Next در حالت production موجود است).
 * اگر در دسترس نبود، فایلِ خام برگردانده می‌شود تا آیکن هرگز خالی نباشد.
 */
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZES = [48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];

const CANDIDATES: string[] = [
  process.env.ALGOHUB_LOGO_PATH || "",
  path.join(process.cwd(), "public", "ALGOHUB-LOGO.png"),
  path.join(process.cwd(), "..", "ALGOHUB-LOGO.png"),
  "/var/www/trading-journal/ALGOHUB-LOGO.png",
  path.join(process.cwd(), "public", "logo-icon.png"),
].filter(Boolean);

const cache = new Map<number, Buffer>();

async function sourceBuffer(): Promise<Buffer | null> {
  for (const file of CANDIDATES) {
    try {
      return await readFile(file);
    } catch {
      // مسیر بعدی.
    }
  }
  return null;
}

async function iconBuffer(size: number): Promise<Buffer | null> {
  const hit = cache.get(size);
  if (hit) return hit;

  const raw = await sourceBuffer();
  if (!raw) return null;

  let out = raw;
  try {
    // لوگو مربعی و بدون پس‌زمینه است؛ contain + پس‌زمینهٔ شفاف آن را دست‌نخورده نگه می‌دارد.
    const sharp = (await import("sharp")).default as any;
    out = await sharp(raw)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    // sharp در دسترس نیست — همان فایلِ خام سرو می‌شود.
  }

  cache.set(size, out);
  return out;
}

export async function GET(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get("size"));
  const size = SIZES.includes(raw) ? raw : 512;

  const buf = await iconBuffer(size);
  if (!buf) return new Response("app icon not found", { status: 404 });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
