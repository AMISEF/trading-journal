import type { Config } from "tailwindcss";

/**
 * Tailwind config.
 * - darkMode "class": we toggle the "dark" class on <html> for the Dark Ocean theme.
 * - Colors reference CSS variables (defined in globals.css) so both themes share one palette token set.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens backed by CSS variables (see globals.css)
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        "primary-soft": "var(--primary-soft)",
        profit: "var(--profit)",
        "profit-soft": "var(--profit-soft)",
        loss: "var(--loss)",
        "loss-soft": "var(--loss-soft)",
        neutral: "var(--neutral)",
      },
      fontFamily: {
        sans: ["Vazirmatn", "system-ui", "sans-serif"],
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.85)" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
