/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "Menlo", "Monaco", "Consolas", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        axiom: {
          bg: "#090c12",
          panel: "#10151f",
          raised: "#171e2b",
          border: "#232c3d",
          accent: "#7c9aff",
          accent2: "#22d3ee",
          green: "#34d399",
          amber: "#fbbf24",
          muted: "#8492a8",
        },
      },
    },
  },
  plugins: [],
};
