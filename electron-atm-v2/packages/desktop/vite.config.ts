import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react() as any],
    base: './', // relative paths for electron
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: false, // Don't wipe out main.js/preload.js built by tsc!
        rollupOptions: {
            input: {
                renderer: './index.html'
            }
        }
    }
});
