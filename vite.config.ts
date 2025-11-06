// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: './',
    plugins: [react()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: './index.html',
                'filter-editor': './filter-editor.html',
                'script-output': './script-output.html'
            }
        }
    },
    server: {
        port: 1421,
        strictPort: true
    }
});
