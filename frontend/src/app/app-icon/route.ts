/**
 * لوگوی رسمی اپ ALGO HUB.
 *
 * فایل اصلی (ALGOHUB-LOGO.png) در ریشهٔ مخزن قرار دارد، پس مستقیماً توسط Next
 * سرو نمی‌شود. این مسیر چند مکان احتمالی را به ترتیب می‌گردد و هر کدام موجود
 * بود را با کش یک‌روزه برمی‌گرداند (آیکن اپ، apple-touch-icon و اعلان‌ها).
 */
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANDIDATES: string[] = [
  process.env.ALGOHUB_LOGO_PATH || "",
  path.join(process.cwd(), "public", "ALGOHUB-LOGO.png"),
  path.join(process.cwd(), "..", "ALGOHUB-LOGO.png"),
  "/var/www/trading-journal/ALGOHUB-LOGO.png",
  path.join(process.cwd(), "public", "logo-icon.png"),
].filter(Boolean);

export async function GET() {
  for (const file of CANDIDATES) {
    try {
      const buf = await readFile(file);
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      // مسیر بعدی را امتحان کن.
    }
  }
  return new Response("app icon not found", { status: 404 });
}
