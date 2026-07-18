import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standard Vite + React config. Dev server proxies /api/* to Netlify Functions
// when running via `netlify dev` (Netlify CLI handles that automatically).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
});
