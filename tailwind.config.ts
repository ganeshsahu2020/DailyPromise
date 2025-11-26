import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          deep: "#0b1a2b",
          card: "#1f2b38",
          border: "rgba(255,255,255,.08)",
          text: "#e8f0f7",
          muted: "rgba(232,240,247,.72)",
          emerald: "#00a572",
          coral: "#ff6f61",
          gold: "#c08a2f",
          lavender: "#a78bfa",
        },
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,.20)",
        float: "0 12px 40px rgba(0,0,0,.28)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(16, 185, 129, 0.5)" },
          "50%": { boxShadow: "0 0 0 10px rgba(16, 185, 129, 0)" },
        },
        "gradient-x": {
          "0%, 100%": {
            "background-size": "200% 200%",
            "background-position": "left center",
          },
          "50%": {
            "background-size": "200% 200%",
            "background-position": "right center",
          },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        pulseGlow: "pulseGlow 2.4s ease-in-out infinite",
        "gradient-x": "gradient-x 15s ease infinite",
      },
      backgroundImage: {
        "lux-1":
          "radial-gradient(1200px 600px at 10% 10%, rgba(167, 139, 250, 0.12), transparent 60%), radial-gradient(1200px 600px at 90% 20%, rgba(255, 111, 97, 0.12), transparent 60%)",
        "icon-gradient": "linear-gradient(135deg, #22d3ee, #10b981, #c084fc)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [animate],
};

export default config;
