// PM2 process configuration for the Trading Journal backend.
// Start with:  pm2 start ecosystem.config.js
//
// This runs uvicorn from inside the project's virtualenv so PM2 doesn't
// need to know about Python paths. The interpreter is set to "none" because
// uvicorn is a binary script (not a .js file) and PM2 should exec it directly.

const path = require("path");

module.exports = {
  apps: [
    {
      name: "tj-backend",
      // cwd = the backend directory (this file's folder), so relative paths work.
      cwd: __dirname,
      // Run the uvicorn binary from the venv directly.
      script: path.join(__dirname, "venv", "bin", "uvicorn"),
      // Tell PM2 not to wrap this in a Node interpreter.
      interpreter: "none",
      args: "app.main:app --host 127.0.0.1 --port 8001",
      // Restart if it crashes, but back off if it keeps failing fast.
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      // Pass through the environment; .env is loaded by the app itself.
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
  ],
};
