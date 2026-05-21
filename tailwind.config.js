/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // หรือ 'media' หากต้องการใช้ตามการตั้งค่าระบบ
  theme: {
    extend: {},
  },
  plugins: [],
}