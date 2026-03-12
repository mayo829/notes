/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        surface: {
          50:  '#f8f8f8',
          100: '#f0f0f0',
          200: '#e4e4e4',
          300: '#d1d1d1',
          700: '#2a2a2a',
          800: '#1e1e1e',
          900: '#141414',
          950: '#0d0d0d',
        },
        accent: {
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
      },
      typography: (theme) => ({
        invert: {
          css: {
            '--tw-prose-body': theme('colors.zinc[300]'),
            '--tw-prose-headings': theme('colors.zinc[100]'),
            '--tw-prose-links': theme('colors.violet[400]'),
            '--tw-prose-code': theme('colors.violet[300]'),
            '--tw-prose-pre-bg': theme('colors.zinc[900]'),
            '--tw-prose-quotes': theme('colors.zinc[400]'),
            '--tw-prose-hr': theme('colors.zinc[700]'),
            '--tw-prose-bullets': theme('colors.zinc[500]'),
            '--tw-prose-counters': theme('colors.zinc[500]'),
            '--tw-prose-th-borders': theme('colors.zinc[600]'),
            '--tw-prose-td-borders': theme('colors.zinc[700]'),
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
