/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{ts,tsx,html}",
    "./components/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
