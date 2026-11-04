/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Valores definidos em :root (src/index.css)
      colors: {
        nevoa: 'var(--nevoa)',
        papel: 'var(--papel)',
        tinta: { DEFAULT: 'var(--tinta)', suave: 'var(--tinta-suave)' },
        linha: 'var(--linha)',
        noite: { DEFAULT: 'var(--noite)', azul: 'var(--noite-azul)' },
        azul: { DEFAULT: 'var(--azul)', escuro: 'var(--azul-escuro)', claro: 'var(--azul-claro)' },
        ciano: { DEFAULT: 'var(--ciano)', escuro: 'var(--ciano-escuro)', claro: 'var(--ciano-claro)' },
        vermelho: { DEFAULT: 'var(--vermelho)', claro: 'var(--vermelho-claro)' },
        ambar: { DEFAULT: 'var(--ambar)', vivo: 'var(--ambar-vivo)', claro: 'var(--ambar-claro)' },
        zap: { DEFAULT: 'var(--zap)', escuro: 'var(--zap-escuro)', balao: 'var(--zap-balao)' },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        numero: ['Space Grotesk', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
