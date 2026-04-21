/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./store/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        cfh: {
          bg: "#f5f7f4",
          panel: "#ffffff",
          ink: "#1f2f23",
          accent: "#2b6f52",
          muted: "#6e7b72"
        }
      },
      boxShadow: {
        panel: "0 8px 24px rgba(31, 47, 35, 0.08)"
      }
    }
  },
  plugins: []
};
