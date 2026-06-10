// PM2 config for the Next.js frontend.
// Runs `next start` on port 3001 (the existing cryptosmart site uses 3000).
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
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
