import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// Collect all HTML entry points (root index.html and any pages in pages/)
function getInputs() {
  const inputs = {
    main: resolve(__dirname, 'index.html')
  };

  const pagesDir = resolve(__dirname, 'pages');
  if (fs.existsSync(pagesDir)) {
    const pageFiles = fs.readdirSync(pagesDir).filter(file => file.endsWith('.html'));
    pageFiles.forEach(file => {
      const name = file.replace('.html', '');
      inputs[name] = resolve(pagesDir, file);
    });
  }

  return inputs;
}

// Custom plugin to copy data/ folder into dist/data/ on production build
function copyDataFolderPlugin() {
  return {
    name: 'copy-data-folder',
    closeBundle() {
      const srcDataDir = resolve(__dirname, 'data');
      const distDataDir = resolve(__dirname, 'dist', 'data');
      if (fs.existsSync(srcDataDir)) {
        if (!fs.existsSync(distDataDir)) {
          fs.mkdirSync(distDataDir, { recursive: true });
        }
        const files = fs.readdirSync(srcDataDir);
        files.forEach(file => {
          fs.copyFileSync(resolve(srcDataDir, file), resolve(distDataDir, file));
        });
      }
    }
  };
}

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {}
  },
  plugins: [copyDataFolderPlugin()],
  build: {
    rollupOptions: {
      input: getInputs()
    }
  }
});
