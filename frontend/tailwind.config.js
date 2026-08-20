/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        sans: ['Inter', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        // Citizen (light)
        ink: "#0F172A",
        canvas: "#F8FAFC",
        surface: "#FFFFFF",
        // Brand gradient endpoints
        brand: {
          indigo: "#4338CA",
          sky: "#0EA5E9",
          emerald: "#10B981",
        },
        // Authority (dark)
        night: "#0B1120",
        panel: "#0F172A",
        // Severity
        sev: {
          low: "#22C55E",
          medium: "#F59E0B",
          high: "#F97316",
          critical: "#EF4444",
        },
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(15, 23, 42, 0.15)",
        glow: "0 0 24px -2px rgba(14, 165, 233, 0.4)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(120deg, #4338CA 0%, #0EA5E9 100%)",
        "grid-dark":
          "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid-40": "40px 40px",
      },
      animation: {
        scan: "scan 2.2s linear infinite",
        pulseGlow: "pulseGlow 2.5s ease-in-out infinite",
        floaty: "floaty 6s ease-in-out infinite",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        pulseGlow: {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(14,165,233,0.5)" },
          "50%": { boxShadow: "0 0 0 16px rgba(14,165,233,0)" },
        },
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
    },
  },
  plugins: [],
};
