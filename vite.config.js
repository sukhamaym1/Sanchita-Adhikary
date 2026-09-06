import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import sharp from 'sharp';

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
          return next();
        } else if (req.url === '/lic-links' || req.url === '/lic-links/') {
          req.url = '/pages/lic-links.html';
          return next();
        } else if (req.url === '/resources' || req.url === '/resources/') {
          req.url = '/pages/resources.html';
          return next();
        }

        // Handle direct favicon upload in dev server
        if (req.url === '/api/upload-favicon' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            try {
              const { dataUrl } = JSON.parse(bodyStr || '{}');
              if (!dataUrl) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: 'No image data provided' }));
              }
              const matches = dataUrl.match(/^data:([A-Za-z0-9\-+/]+);base64,(.+)$/);
              if (!matches) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: 'Invalid data URL format' }));
              }
              const mimeType = matches[1];
              const buffer = Buffer.from(matches[2], 'base64');
              const isSvg = mimeType.includes('svg');

              const publicDir = resolve(__dirname, 'public');
              const assetsDir = resolve(__dirname, 'assets', 'images');
              if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
              if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

              let finalFaviconUrl = '/favicon.png';

              if (isSvg) {
                fs.writeFileSync(resolve(publicDir, 'favicon.svg'), buffer);
                finalFaviconUrl = '/favicon.svg';
              } else {
                fs.writeFileSync(resolve(publicDir, 'favicon.png'), buffer);
                fs.writeFileSync(resolve(assetsDir, 'favicon.png'), buffer);
              }

              // Generate responsive favicon PNGs using sharp
              try {
                await sharp(buffer).resize(32, 32).png().toFile(resolve(publicDir, 'favicon-32x32.png'));
                await sharp(buffer).resize(180, 180).png().toFile(resolve(publicDir, 'apple-touch-icon.png'));
                await sharp(buffer).resize(192, 192).png().toFile(resolve(publicDir, 'favicon-192x192.png'));
                await sharp(buffer).resize(512, 512).png().toFile(resolve(publicDir, 'favicon-512x512.png'));
                await sharp(buffer).resize(48, 48).toFormat('png').toFile(resolve(publicDir, 'favicon.ico'));
              } catch (sharpErr) {
                console.warn('Sharp resize warning:', sharpErr.message);
              }

              // Update data/config.json with cache buster
              const versionedUrl = `${finalFaviconUrl}?v=${Date.now()}`;
              const configPath = resolve(__dirname, 'data', 'config.json');
              if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                config.faviconUrl = versionedUrl;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

                // Mirror to dist if it exists
                const distConfigPath = resolve(__dirname, 'dist', 'data', 'config.json');
                if (fs.existsSync(distConfigPath)) {
                  fs.writeFileSync(distConfigPath, JSON.stringify(config, null, 2), 'utf8');
                }
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, faviconUrl: versionedUrl, isSvg }));
            } catch (err) {
              console.error('Error handling favicon upload:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Handle direct LIC brand / logo upload in dev server
        if (req.url === '/api/upload-lic-brand' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            try {
              const { dataUrl, targetType, applyToBoth, filename } = JSON.parse(bodyStr || '{}');
              if (!dataUrl) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: 'No image data provided' }));
              }
              const matches = dataUrl.match(/^data:([A-Za-z0-9\-+/]+);base64,(.+)$/);
              if (!matches) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: 'Invalid data URL format' }));
              }
              const mimeType = matches[1];
              const buffer = Buffer.from(matches[2], 'base64');
              const isSvg = mimeType.includes('svg');
              const ext = isSvg ? 'svg' : 'png';

              const publicDir = resolve(__dirname, 'public');
              const assetsDir = resolve(__dirname, 'assets', 'images');
              if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
              if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

              const timestamp = Date.now();
              const configPath = resolve(__dirname, 'data', 'config.json');
              let config = {};
              if (fs.existsSync(configPath)) {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              }

              let logoUrl = config.licLogoUrl || '/assets/images/lic-logo-white.svg';
              let badgeUrl = config.licBadgeIconUrl || '/assets/images/favicon.svg';
              let footerUrl = config.footerLicLogoUrl || config.licLogoUrl || '/assets/images/lic-logo-white.svg';

              if (targetType === 'logo' || targetType === 'both' || applyToBoth || targetType === 'all') {
                const logoFilename = `lic-brand-logo.${ext}`;
                fs.writeFileSync(resolve(publicDir, logoFilename), buffer);
                fs.writeFileSync(resolve(assetsDir, logoFilename), buffer);
                logoUrl = `/${logoFilename}?v=${timestamp}`;
                config.licLogoUrl = logoUrl;
                config.footerLicLogoUrl = logoUrl;
              }

              if (targetType === 'badge' || (applyToBoth && targetType !== 'badge') || targetType === 'both' || targetType === 'all') {
                const badgeFilename = (applyToBoth && targetType !== 'badge') ? `lic-brand-logo.${ext}` : `lic-badge-icon.${ext}`;
                if (badgeFilename !== `lic-brand-logo.${ext}`) {
                  fs.writeFileSync(resolve(publicDir, badgeFilename), buffer);
                  fs.writeFileSync(resolve(assetsDir, badgeFilename), buffer);
                }
                badgeUrl = `/${badgeFilename}?v=${timestamp}`;
                config.licBadgeIconUrl = badgeUrl;
              }

              if (targetType === 'footer') {
                const footerFilename = `lic-footer-logo.${ext}`;
                fs.writeFileSync(resolve(publicDir, footerFilename), buffer);
                fs.writeFileSync(resolve(assetsDir, footerFilename), buffer);
                footerUrl = `/${footerFilename}?v=${timestamp}`;
                config.footerLicLogoUrl = footerUrl;
              }

              if (fs.existsSync(configPath)) {
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
                const distConfigPath = resolve(__dirname, 'dist', 'data', 'config.json');
                if (fs.existsSync(distConfigPath)) {
                  fs.writeFileSync(distConfigPath, JSON.stringify(config, null, 2), 'utf8');
                }
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ 
                success: true, 
                licLogoUrl: config.licLogoUrl, 
                licBadgeIconUrl: config.licBadgeIconUrl,
                footerLicLogoUrl: config.footerLicLogoUrl 
              }));
            } catch (err) {
              console.error('Error handling LIC brand upload:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
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

      // 2. Mirror pages/*.html to dist/[slug]/index.html for native clean URLs
      const pagesToMirror = [
        { src: 'pages/admin.html', dest: 'admin' },
        { src: 'pages/lic-links.html', dest: 'lic-links' },
        { src: 'pages/resources.html', dest: 'resources' },
        { src: 'pages/terms.html', dest: 'terms' },
        { src: 'pages/privacy-policy.html', dest: 'privacy-policy' },
        { src: 'pages/disclaimer.html', dest: 'disclaimer' },
      ];

      pagesToMirror.forEach(({ src, dest }) => {
        const srcFile = resolve(__dirname, 'dist', src);
        const targetDir = resolve(__dirname, 'dist', dest);
        if (fs.existsSync(srcFile)) {
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          fs.copyFileSync(srcFile, resolve(targetDir, 'index.html'));
        }
      });

      // 3. Copy assets/images/ to dist/assets/images/ for runtime custom uploads
      const srcImagesDir = resolve(__dirname, 'assets', 'images');
      const distImagesDir = resolve(__dirname, 'dist', 'assets', 'images');
      if (fs.existsSync(srcImagesDir)) {
        fs.cpSync(srcImagesDir, distImagesDir, { recursive: true });
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
