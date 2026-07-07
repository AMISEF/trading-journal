/** @type {import('next').NextConfig} */
// وقتی این اپ زیر یک مسیر (مثلاً algohub.cryptosmart.site/journal) سرو می‌شود،
// NEXT_PUBLIC_BASE_PATH=/journal تنظیم کنید تا Next همهٔ صفحات و دارایی‌ها را زیر
// همان پیشوند بسازد. برای اجرای مستقل روی روتِ دامنه، این متغیر را خالی بگذارید.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  // Allow remote images (backend uploads endpoint, etc.)
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

module.exports = nextConfig;
