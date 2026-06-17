import type { Config } from "tailwindcss";
import plugin from "tailwindcss";
import forms from "@tailwindcss/forms";
import contentQueries from "@tailwindcss/container-queries";

const config: Omit<Config, "content"> = {
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    screens: {
      xs: "480px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
      "3xl": "1920px",
      "4xl": "2560px", // only need to control product grid mode in ultra 4k device
    },
    extend: {
      colors: {
        gray: {
          0: "rgb(var(--gray-0) / <alpha-value>)",
          50: "rgb(var(--gray-50) / <alpha-value>)",
          100: "rgb(var(--gray-100) / <alpha-value>)",
          200: "rgb(var(--gray-200) / <alpha-value>)",
          300: "rgb(var(--gray-300) / <alpha-value>)",
          400: "rgb(var(--gray-400) / <alpha-value>)",
          500: "rgb(var(--gray-500) / <alpha-value>)",
          600: "rgb(var(--gray-600) / <alpha-value>)",
          700: "rgb(var(--gray-700) / <alpha-value>)",
          800: "rgb(var(--gray-800) / <alpha-value>)",
          900: "rgb(var(--gray-900) / <alpha-value>)",
          1000: "rgb(var(--gray-1000) / <alpha-value>)",
        },
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)",
        primary: {
          lighter: "rgb(var(--primary-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--primary-default) / <alpha-value>)",
          dark: "rgb(var(--primary-dark) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          lighter: "rgb(var(--secondary-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--secondary-default) / <alpha-value>)",
          dark: "rgb(var(--secondary-dark) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        // ─────────────────────────────────────────────────────────────
        // PERPOS STANDARD PALETTE (flat-UI). ทุกสีในแอปต้องมาจากชุดนี้เท่านั้น
        // ทุก Tailwind color family ถูก map กลับเข้าสีพาเลตต์มาตรฐาน
        // (จับเฉดหลักที่ 500 แล้วไล่ tint/shade) — ดู DESIGN.md §2
        //   blue/sky/cyan      → CHARCOAL #3C3B3D (primary/brand — โทน mono, เลิก AQUA)
        //   indigo/violet/purple → PLUM #8067B7
        //   pink/rose/fuchsia  → PINK ROSE #EC87C0
        //   red                → RUBY #D8334A (negative/destructive)
        //   orange             → BITTERSWEET #FC6E51
        //   amber/yellow       → SUNFLOWER #FFCE54 (warning)
        //   green/emerald      → MINT #48CFAD (positive)
        //   lime               → GRASS #A0D468
        //   teal               → TEAL #A0CECB
        //   slate/zinc/neutral/stone → neutral gray ramp (= gray)
        // ─────────────────────────────────────────────────────────────
        red: {
          lighter: "rgb(var(--red-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--red-default) / <alpha-value>)",
          dark: "rgb(var(--red-dark) / <alpha-value>)",
          50: "#FCF1F2", 100: "#F9E0E4", 200: "#F3C2C9", 300: "#EC9DA8", 400: "#E36A7B", 500: "#D8334A", 600: "#C43448", 700: "#A93546", 800: "#903744", 900: "#773842",
        },
        orange: {
          lighter: "rgb(var(--orange-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--orange-default) / <alpha-value>)",
          dark: "rgb(var(--orange-dark) / <alpha-value>)",
          50: "#FFF5F3", 100: "#FFE9E5", 200: "#FED4CB", 300: "#FEB9AB", 400: "#FD9580", 500: "#FC6E51", 600: "#E3674E", 700: "#C25F4B", 800: "#A45748", 900: "#854E45",
        },
        blue: {
          lighter: "rgb(var(--blue-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--blue-default) / <alpha-value>)",
          dark: "rgb(var(--blue-dark) / <alpha-value>)",
          50: "#F5F5F5", 100: "#ECEBEC", 200: "#D8D8D8", 300: "#B5B5B5", 400: "#868587", 500: "#5F5E60", 600: "#3C3B3D", 700: "#2E2E30", 800: "#232324", 900: "#19191A",
        },
        green: {
          lighter: "rgb(var(--green-lighter) / <alpha-value>)",
          DEFAULT: "rgb(var(--green-default) / <alpha-value>)",
          dark: "rgb(var(--green-dark) / <alpha-value>)",
          50: "#F2FCF9", 100: "#E4F8F3", 200: "#C8F1E6", 300: "#A7E8D8", 400: "#79DCC3", 500: "#48CFAD", 600: "#46BC9E", 700: "#44A38B", 800: "#428B79", 900: "#417368",
        },
        sky: {
          50: "#F5F5F5", 100: "#ECEBEC", 200: "#D8D8D8", 300: "#B5B5B5", 400: "#868587", 500: "#5F5E60", 600: "#3C3B3D", 700: "#2E2E30", 800: "#232324", 900: "#19191A",
        },
        cyan: {
          50: "#F5F5F5", 100: "#ECEBEC", 200: "#D8D8D8", 300: "#B5B5B5", 400: "#868587", 500: "#5F5E60", 600: "#3C3B3D", 700: "#2E2E30", 800: "#232324", 900: "#19191A",
        },
        indigo: {
          50: "#F6F4FA", 100: "#ECE8F4", 200: "#D9D1E9", 300: "#C2B6DC", 400: "#A290CA", 500: "#8067B7", 600: "#7761A7", 700: "#6C5A92", 800: "#61537F", 900: "#564C6B",
        },
        violet: {
          50: "#F6F4FA", 100: "#ECE8F4", 200: "#D9D1E9", 300: "#C2B6DC", 400: "#A290CA", 500: "#8067B7", 600: "#7761A7", 700: "#6C5A92", 800: "#61537F", 900: "#564C6B",
        },
        purple: {
          50: "#F6F4FA", 100: "#ECE8F4", 200: "#D9D1E9", 300: "#C2B6DC", 400: "#A290CA", 500: "#8067B7", 600: "#7761A7", 700: "#6C5A92", 800: "#61537F", 900: "#564C6B",
        },
        fuchsia: {
          50: "#FEF7FB", 100: "#FCEDF6", 200: "#F9DBEC", 300: "#F6C5E1", 400: "#F1A7D1", 500: "#EC87C0", 600: "#D57DAF", 700: "#B77099", 800: "#9B6484", 900: "#7F586F",
        },
        pink: {
          50: "#FEF7FB", 100: "#FCEDF6", 200: "#F9DBEC", 300: "#F6C5E1", 400: "#F1A7D1", 500: "#EC87C0", 600: "#D57DAF", 700: "#B77099", 800: "#9B6484", 900: "#7F586F",
        },
        rose: {
          50: "#FEF7FB", 100: "#FCEDF6", 200: "#F9DBEC", 300: "#F6C5E1", 400: "#F1A7D1", 500: "#EC87C0", 600: "#D57DAF", 700: "#B77099", 800: "#9B6484", 900: "#7F586F",
        },
        amber: {
          50: "#FFFCF3", 100: "#FFF8E5", 200: "#FFF0CC", 300: "#FFE7AD", 400: "#FFDB82", 500: "#FFCE54", 600: "#E6BB51", 700: "#C4A24D", 800: "#A58A49", 900: "#867346",
        },
        yellow: {
          50: "#FFFCF3", 100: "#FFF8E5", 200: "#FFF0CC", 300: "#FFE7AD", 400: "#FFDB82", 500: "#FFCE54", 600: "#E6BB51", 700: "#C4A24D", 800: "#A58A49", 900: "#867346",
        },
        lime: {
          50: "#F8FCF4", 100: "#F1F9E8", 200: "#E2F2D2", 300: "#D1EAB7", 400: "#BAE091", 500: "#A0D468", 600: "#93C062", 700: "#82A65B", 800: "#728E54", 900: "#62754D",
        },
        emerald: {
          50: "#F2FCF9", 100: "#E4F8F3", 200: "#C8F1E6", 300: "#A7E8D8", 400: "#79DCC3", 500: "#48CFAD", 600: "#46BC9E", 700: "#44A38B", 800: "#428B79", 900: "#417368",
        },
        teal: {
          50: "#F8FCFB", 100: "#F1F8F7", 200: "#E2F0EF", 300: "#D1E7E6", 400: "#BADBD9", 500: "#A0CECB", 600: "#93BBB9", 700: "#82A2A0", 800: "#728A8A", 900: "#627373",
        },
        slate: { 0: "#FFFFFF", 50: "#F8FAFC", 100: "#F5F7FA", 200: "#E6E9EE", 300: "#CCD1D9", 400: "#9CA3AF", 500: "#656D78", 600: "#525866", 700: "#3C3B3D", 800: "#2A2A2C", 900: "#1A1A1B", 950: "#0F0F10" },
        zinc: { 0: "#FFFFFF", 50: "#F8FAFC", 100: "#F5F7FA", 200: "#E6E9EE", 300: "#CCD1D9", 400: "#9CA3AF", 500: "#656D78", 600: "#525866", 700: "#3C3B3D", 800: "#2A2A2C", 900: "#1A1A1B", 950: "#0F0F10" },
        neutral: { 0: "#FFFFFF", 50: "#F8FAFC", 100: "#F5F7FA", 200: "#E6E9EE", 300: "#CCD1D9", 400: "#9CA3AF", 500: "#656D78", 600: "#525866", 700: "#3C3B3D", 800: "#2A2A2C", 900: "#1A1A1B", 950: "#0F0F10" },
        stone: { 0: "#FFFFFF", 50: "#F8FAFC", 100: "#F5F7FA", 200: "#E6E9EE", 300: "#CCD1D9", 400: "#9CA3AF", 500: "#656D78", 600: "#525866", 700: "#3C3B3D", 800: "#2A2A2C", 900: "#1A1A1B", 950: "#0F0F10" },
      },
      fontFamily: {
        inter: ["var(--font-inter)"],
        lexend: ["var(--font-lexend)"],
      },
      // required these animations for the Loader component
      animation: {
        blink: "blink 1.4s infinite both;",
        "scale-up": "scaleUp 500ms infinite alternate",
        "spin-slow": "spin 4s linear infinite",
        popup: "popup 500ms var(--popup-delay, 0ms) linear 1",
        skeleton: "skeletonWave 1.6s linear 0.5s infinite",
        "spinner-ease-spin": "spinnerSpin 0.8s ease infinite",
        "spinner-linear-spin": "spinnerSpin 0.8s linear infinite",
      },
      backgroundImage: {
        skeleton: `linear-gradient(90deg,transparent,#ecebeb,transparent)`,
        "skeleton-dark": `linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)`,
      },
      keyframes: {
        blink: {
          "0%": { opacity: "0.2" },
          "20%": { opacity: "1" },
          "100%": { opacity: "0.2" },
        },
        scaleUp: {
          "0%": { transform: "scale(0)" },
          "100%": { transform: "scale(1)" },
        },
        popup: {
          "0%": { transform: "scale(0)" },
          "50%": { transform: "scale(1.3)" },
          "100%": { transform: "scale(1)" },
        },
        skeletonWave: {
          "0%": {
            transform: "translateX(-100%)",
          },
          "50%": {
            /* +0.5s of delay between each loop */
            transform: "translateX(100%)",
          },
          "100%": {
            transform: "translateX(100%)",
          },
        },
        spinnerSpin: {
          "0%": {
            transform: "rotate(0deg)",
          },
          "100%": {
            transform: "rotate(360deg)",
          },
        },
      },
      content: {
        underline: 'url("/public/underline.svg")',
      },
      boxShadow: {
        profilePic:
          "0px 2px 4px -2px rgba(0, 0, 0, 0.10), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)",
        roundedCard:
          "0px 4px 6px -4px rgba(0, 0, 0, 0.1), 0px 10px 15px -3px rgba(0, 0, 0, 0.1)",
      },
      gridTemplateColumns: {
        "18": "repeat(18, minmax(0, 1fr))",
      },
    },
  },
  plugins: [
    forms,
    contentQueries,
    // @ts-ignore
    plugin(({ addVariant }: any) => {
      addVariant("not-read-only", "&:not(:read-only)");
    }),
  ],
};
export default config;
