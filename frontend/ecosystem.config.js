// PM2 config for Next.js frontends (journal + PnL showcase).
//
//   tj-frontend     — algohub.cryptosmart.site/journal  (port 3001, basePath=/journal)
//   tj-pnl-frontend — pnl.cryptosmart.site              (port 3012, root, SITE_MODE=pnl)
//
// Builds live in separate distDirs so restarting one never overwrites the other:
//   journal → .next
//   pnl     → .next-pnl
module.exports = {
  apps: [
    {
      name: "tj-frontend",
      cwd: "/var/www/trading-journal/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        NEXT_DIST_DIR: ".next",
      },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "tj-pnl-frontend",
      cwd: "/var/www/trading-journal/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3012",
      env: {
        NODE_ENV: "production",
        PORT: "3012",
        NEXT_DIST_DIR: ".next-pnl",
        // Public vars are inlined at build time; these are here for clarity only.
        NEXT_PUBLIC_SITE_MODE: "pnl",
        NEXT_PUBLIC_BASE_PATH: "",
        NEXT_PUBLIC_API_BASE: "/api",
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
