import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: funciona no GitHub Pages (usuario.github.io/oficina-moto) e local
export default defineConfig({
  plugins: [react()],
  base: './',
});
