import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1200px" } },
    extend: {
      fontFamily: {
        sans: ["'Inter Variable'", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#eff5ff",
          100: "#dbe8fe",
          200: "#bfd5fe",
          300: "#93b8fd",
          400: "#6090fa",
          500: "#3b6cf6",
          600: "#2550eb",
          700: "#1d3fd8",
          800: "#1e35af",
          900: "#1e338a",
          950: "#172154",
        },
        navy: { 700: "#12356f", 800: "#0d2a5c", 900: "#0b2250", 950: "#081a3d" },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15,23,42,.04), 0 4px 16px -4px rgba(15,23,42,.08)",
        lift: "0 2px 4px rgba(15,23,42,.04), 0 12px 32px -8px rgba(15,23,42,.14)",
      },
      borderRadius: { "2xl": "1rem", "3xl": "1.25rem" },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        "pulse-dot": { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
      },
      animation: { "fade-in": "fade-in .35s ease-out both", "pulse-dot": "pulse-dot 1.6s ease-in-out infinite" },
    },
  },
  plugins: [],
} satisfies Config;
