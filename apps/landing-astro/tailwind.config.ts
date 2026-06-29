import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#3C3B3D",
          dark: "#262527",
          light: "#59575A",
          50: "#F7F5F1",
          100: "#EEEAE2",
          200: "#DDD6C8",
          300: "#C6B9A4",
          400: "#9B907F",
          500: "#6E665B",
          600: "#555052",
          700: "#3C3B3D",
          800: "#2F2E30",
          900: "#201F21",
        },
        secondary: {
          DEFAULT: "#48CFAD",
          dark: "#2BAE8E",
        },
        accent: {
          DEFAULT: "#FC6E51",
          dark: "#E0532F",
        },
        ink: {
          DEFAULT: "#1A1A1B",
          soft: "#262527",
          line: "#3C3B3D",
        },
        background: {
          DEFAULT: "#FFFFFF",
          secondary: "#F5F7FA",
        },
        foreground: {
          DEFAULT: "#1A1A1B",
          secondary: "#656D78",
          muted: "#9CA3AF",
        },
        border: {
          DEFAULT: "#E6E9EE",
          strong: "#CCD1D9",
        },
      },
      fontFamily: {
        heading: ["var(--font-noto-thai)", "sans-serif"],
        sans: ["var(--font-noto-thai)", "sans-serif"],
        inter: ["var(--font-noto-thai)", "sans-serif"],
        lexend: ["var(--font-noto-thai)", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "8px",
        card: "16px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        "card-hover": "0 12px 32px -8px rgb(15 23 42 / 0.12), 0 4px 8px -4px rgb(15 23 42 / 0.06)",
        soft: "0 2px 8px -2px rgb(15 23 42 / 0.06)",
        elevated: "0 24px 60px -16px rgb(15 23 42 / 0.18), 0 8px 24px -12px rgb(15 23 42 / 0.10)",
      },
      animation: {
        "fade-up": "fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) forwards",
        "fade-in": "fadeIn 0.6s ease-out forwards",
        float: "float 7s ease-in-out infinite",
        "float-slow": "float 10s ease-in-out infinite",
        marquee: "marquee 28s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-14px)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
