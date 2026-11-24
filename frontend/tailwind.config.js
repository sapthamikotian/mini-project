/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#080D18",
        sidebar: "#0D1424",
        card: "#111C30",
        primary: "#3485F7",
        cyan: "#20C9D8",
        success: "#22C55E",
        warning: "#F59E0B",
        critical: "#EF4444",
        "text-primary": "#F8FAFC",
        "text-secondary": "#94A3B8",
      },
      borderColor: { DEFAULT: "#1E293B" },
    },
  },
  plugins: [],
};
