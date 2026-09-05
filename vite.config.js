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

// Custom plugin to copy data/ folder into dist/data/ and create dist/admin/index.html on production build
function buildHelpersPlugin() {
  return {
    name: 'build-helpers-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/admin' || req.url === '/admin/') {
          req.url = '/pages/admin.html';
        }
        next();
      });
    },
    closeBundle() {
      // 1. Copy data/ to dist/data/
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

      // 2. Mirror pages/admin.html to dist/admin/index.html for native /admin URL support
      const adminHtml = resolve(__dirname, 'dist', 'pages', 'admin.html');
      const adminDir = resolve(__dirname, 'dist', 'admin');
      if (fs.existsSync(adminHtml)) {
        if (!fs.existsSync(adminDir)) {
          fs.mkdirSync(adminDir, { recursive: true });
        }
        // Adjust relative script and stylesheet paths if necessary, but assets are absolute or Vite-hashed
        fs.copyFileSync(adminHtml, resolve(adminDir, 'index.html'));
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
  plugins: [buildHelpersPlugin()],
  build: {
    rollupOptions: {
      input: getInputs()
    }
  }
});
