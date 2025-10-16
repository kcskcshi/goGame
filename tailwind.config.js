/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Pretendard Variable"', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: 'hsl(240 10% 6%)',
        foreground: 'hsl(210 40% 98%)',
        muted: {
          DEFAULT: 'hsl(240 10% 16%)',
          foreground: 'hsl(219 14% 70%)',
        },
        border: 'hsl(240 12% 18%)',
        primary: {
          DEFAULT: 'hsl(262 83% 66%)',
          foreground: 'hsl(0 0% 100%)',
        },
        destructive: {
          DEFAULT: 'hsl(356 75% 53%)',
          foreground: 'hsl(0 0% 100%)',
        },
        accent: {
          DEFAULT: 'hsl(222 31% 18%)',
          foreground: 'hsl(210 40% 96%)',
        },
        card: {
          DEFAULT: 'hsl(240 12% 11%)',
          foreground: 'hsl(210 40% 96%)',
        },
        input: 'hsl(240 12% 20%)',
        ring: 'hsl(262 83% 66%)',
        success: {
          DEFAULT: 'hsl(152 70% 50%)',
          foreground: 'hsl(150 90% 88%)',
        },
        warning: {
          DEFAULT: 'hsl(43 96% 56%)',
          foreground: 'hsl(35 82% 15%)',
        },
      },
      borderRadius: {
        lg: '0.9rem',
        md: '0.6rem',
        sm: '0.45rem',
      },
      boxShadow: {
        subtle:
          '0px 20px 60px -30px rgba(15, 23, 42, 0.75), inset 0 0 0 1px rgba(148, 163, 184, 0.05)',
        glow: '0 0 0 1px rgba(148, 163, 184, 0.25), 0 30px 60px -40px rgba(129, 140, 248, 0.45)',
      },
    },
  },
  plugins: [],
}
