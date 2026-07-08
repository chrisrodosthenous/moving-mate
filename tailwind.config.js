const colors = require('tailwindcss/colors');

/**
 * MovingMate — Logo Brand Theme (Green + White only)
 * Tailwind v4 configuration with shadcn/ui semantic tokens
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{html,ts}', './src/components/**/*.{html,ts}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        /* Logo brand raw values */
        brand: {
          green: '#22C55E',
          'green-light': '#4ADE80',
          'green-dark': '#16A34A',
          'green-deep': '#052E14',
          cream: '#F0EDE6',
          black: '#090909',
          sage: '#8B9A88',
          'sage-dim': '#6B7A68',
          surface: '#0F0F0F',
          border: '#243328',
        },
        'brand-teal': {
          light: '#4ADE80',
          DEFAULT: '#22C55E',
          dark: '#16A34A',
        },
        'brand-slate': {
          DEFAULT: '#1C1F1C',
          light: '#243328',
        },
        'brand-nav': 'hsl(var(--popover) / 0.94)',
        nav: 'hsl(var(--popover) / 0.94)',
        'brand-surface': '#0F0F0F',
        'brand-100': '#8B9A88',
        'brand-400': '#22C55E',
        'brand-900': '#141714',
        ice: '#F0EDE6',
        'card-title': '#FFFFFF',
        subtle: '#8B9A88',
        'surface-track': '#1C1F1C',
        'surface-hover': 'hsl(var(--secondary) / 0.25)',
        'accent-warning': '#318556',
        'accent-success': '#22C55E',
        'accent-info': '#4ADE80',

        /* ══════════════════════════════════════════════════════════════════
           SHADCN SEMANTIC TOKENS (CSS VARIABLE REFERENCES)
           These map to the CSS custom properties in global.css
           ══════════════════════════════════════════════════════════════════ */
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
        },
        error: {
          DEFAULT: 'hsl(var(--error) / <alpha-value>)',
          foreground: 'hsl(var(--error-foreground) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'hsl(var(--info) / <alpha-value>)',
          foreground: 'hsl(var(--info-foreground) / <alpha-value>)',
        },
      },

      /* ══════════════════════════════════════════════════════════════════
         TACTILE SHADOWS - ELECTRIC BLUE GLOW SYSTEM
         ══════════════════════════════════════════════════════════════════ */
      boxShadow: {
        surface: '0 8px 32px rgba(0, 0, 0, 0.65)',
        'btn-primary': '0 4px 14px rgba(34, 197, 94, 0.35)',
        'btn-primary-hover': '0 6px 20px rgba(34, 197, 94, 0.50)',
        'btn-secondary': '0 4px 12px rgba(0, 0, 0, 0.45)',
        'input-focus': '0 0 10px rgba(34, 197, 94, 0.15)',
        'card-elevated': '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(34, 197, 94, 0.1)',
      },

      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },

      transitionDuration: {
        DEFAULT: '300ms',
      },

      transitionTimingFunction: {
        DEFAULT: 'ease-in-out',
      },

      screens: {
        xs: '360px',
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(0.5rem)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-from-right': {
          from: { opacity: '0', transform: 'translate3d(1rem, 0, 0)' },
          to: { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'slide-out-to-right': {
          from: { opacity: '1', transform: 'translate3d(0, 0, 0)' },
          to: { opacity: '0', transform: 'translate3d(1rem, 0, 0)' },
        },
        'slide-in-from-top': {
          from: { opacity: '0', transform: 'translate3d(0, -0.5rem, 0)' },
          to: { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 15px rgba(34, 197, 94, 0.3)' },
          '50%': { boxShadow: '0 0 25px rgba(34, 197, 94, 0.5)' },
        },
      },

      animation: {
        'fade-in': 'fade-in 300ms ease-in-out both',
        'slide-up': 'slide-up 300ms ease-in-out both',
        'scale-in': 'scale-in 300ms ease-in-out both',
        'slide-in-from-right': 'slide-in-from-right 300ms ease-in-out both',
        'slide-out-to-right': 'slide-out-to-right 200ms ease-in both',
        'slide-in-from-top': 'slide-in-from-top 300ms ease-in-out both',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
