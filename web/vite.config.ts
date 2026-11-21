import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // amazon-cognito-identity-js references Node's `global`.
  define: { global: 'globalThis' },
});
