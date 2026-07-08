/** @type {import('next').NextConfig} */
// وقتی این اپ زیر یک مسیر (مثلاً algohub.cryptosmart.site/journal) سرو می‌شود،
// NEXT_PUBLIC_BASE_PATH=/journal تنظیم کنید تا Next همهٔ صفحات و دارایی‌ها را زیر
// همان پیشوند بسازد. برای اجرای مستقل روی روتِ دامنه، این متغیر را خالی بگذارید.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  // Allow remote images (backend uploads endpoint, etc.)
  // unoptimized: true — Next's built-in optimizer re-fetches local /public
  // assets internally without applying basePath, so under a sub-path
  // (NEXT_PUBLIC_BASE_PATH=/journal) it 404s and serves images/logos broken.
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

module.exports = nextConfig;
