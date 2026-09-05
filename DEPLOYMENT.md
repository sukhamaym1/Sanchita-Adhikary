# 🚀 One-Click Deployment Guide: GitHub & Cloudflare Pages

This guide walks you through publishing the website live on Cloudflare Pages via GitHub in just a few minutes with zero build issues.

---

## 1. Push Your Code to GitHub

### Option A: From AI Studio (Easiest)
1. In the top right menu or settings of AI Studio, click **Export to GitHub** or **Download as ZIP**.
2. If downloaded as a ZIP:
   - Extract the files on your computer.
   - Initialize a Git repository and push to GitHub:
     ```bash
     git init
     git add .
     git commit -m "Initial commit: LIC Advisor Website"
     git branch -M main
     git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
     git push -u origin main
     ```

---

## 2. Deploy to Cloudflare Pages (Zero-Config)

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation sidebar, go to **Compute (Workers & Pages)** > **Pages**.
3. Click **Connect to Git** (or **Create application** > **Pages** > **Connect to Git**).
4. Select your GitHub account and choose your repository.
5. Click **Begin setup**.

### Build Settings:
Cloudflare will automatically recognize Vite from `package.json`. Confirm the following fields:

| Setting | Value |
| :--- | :--- |
| **Framework preset** | `Vite` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` (leave blank or default) |
| **Environment variables** | None needed (fully client-side & static) |

6. Click **Save and Deploy**.
7. Cloudflare will build the site and deploy it to a live `.pages.dev` URL (e.g. `https://sanchita-lic.pages.dev`).

---

## 3. Custom Domain (Optional)

1. In your Cloudflare Pages project, go to the **Custom domains** tab.
2. Click **Set up a custom domain**.
3. Enter your domain (e.g., `sanchitabarman.com` or `www.sanchitabarman.com`).
4. Follow the automatic DNS activation steps. Cloudflare provides free SSL/TLS certificates automatically.

---

## 4. Built-in Cloudflare Features Included

The project already includes pre-configured Cloudflare rules in the `public/` directory:
- **`public/_redirects`**: Automatically routes clean URLs (such as `/admin`, `/privacy-policy`, `/disclaimer`, `/terms`) directly to their respective pages with zero 404 errors.
- **`public/_headers`**: Pre-configures production security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) and 1-year caching for static media assets.
- **Google Sheets Sync**: The consultation inquiry form automatically posts directly to your Google Sheet without needing serverless functions or API keys.
