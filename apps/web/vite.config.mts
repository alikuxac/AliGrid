import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    base: './',
    plugins: [
        tsconfigPaths(),
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name: 'AliGrid Engine',
                short_name: 'AliGrid',
                theme_color: '#0a0f1d',
                background_color: '#0a0f1d',
                display: 'standalone',
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}']
            }
        })
    ],
    server: {
        port: 3001,
    },
});
