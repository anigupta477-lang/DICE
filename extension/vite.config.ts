import { resolve } from 'node:path';
import { copyFileSync, mkdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function copyManifestPlugin(): Plugin {
  return {
    name: 'copy-manifest',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      mkdirSync(outDir, { recursive: true });
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(outDir, 'manifest.json'),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), copyManifestPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        micPermission: resolve(__dirname, 'mic-permission.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'background'
            ? 'background.js'
            : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
