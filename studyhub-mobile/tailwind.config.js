/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}', './lib/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#172B4D',
        muted: '#66758B',
        brand: '#2563EB',
        canvas: '#F4F7FB',
        line: '#E4EAF2',
      },
    },
  },
  plugins: [],
};
