import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: './',
    plugins: [react()],
    build: {
        outDir: 'dist',
    },
    server: {
        port: 3003,
        strictPort: true,
    },
});
