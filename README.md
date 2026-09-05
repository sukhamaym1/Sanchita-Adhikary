# Sanchita Adhikary Barman - LIC Advisor Website

This is a complete, production-ready website designed for Sanchita Adhikary Barman, LIC Insurance Advisor. 

---

## 📁 Project Directory Structure

The project has been organized so that the root folder stays clean, with specific types of files grouped into dedicated folders:

```text
├── index.html                   # Main customer-facing homepage
│
├── data/                        # Editable website data & configuration
│   ├── config.json              # Advisor contact info, phone, WhatsApp, Google Sheets URL
│   ├── testimonials.json        # Client reviews and ratings
│   ├── achievements.json        # Professional awards and milestones
│   └── README.md
│
├── pages/                       # Secondary website & legal pages
│   ├── admin.html               # GitHub-based admin portal
│   ├── disclaimer.html          # LIC agent legal disclaimer
│   ├── privacy-policy.html      # Privacy policy
│   ├── terms.html               # Terms of use
│   └── README.md
│
├── backend/                     # Google Sheets integration & backend scripts
│   ├── google-apps-script.js    # Apps Script code to deploy to your Google Sheet
│   └── README.md
│
├── js/                          # Frontend scripts
│   ├── main.js                  # Main website logic, form validation & dispatch
│   ├── admin.js                 # Admin dashboard logic
│   └── google-sheets.js         # Google Sheets utilities
│
├── css/                         # Custom styles & design rules
│   └── style.css
│
├── assets/                      # Media assets
│   └── images/                  # Profile photo, badges, and illustrations
│
├── public/                      # Search engine crawlers & SEO files
│   ├── robots.txt               # Web crawler instructions
│   └── sitemap.xml              # XML Sitemap
│
├── vite.config.js               # Build & development server configuration
├── package.json                 # Project dependencies & scripts
├── metadata.json                # Platform app metadata
└── README.md                    # Project documentation
```

---

## 🛠️ How to Update Your Content

- **Contact Info & Settings:** Edit `data/config.json` (phone, WhatsApp, email, hours, social links, Google Sheet backend URL).
- **Client Testimonials:** Edit `data/testimonials.json` to add or update reviews.
- **Achievements:** Edit `data/achievements.json` to add awards or milestones.
- **Google Sheets Backend:** See `backend/google-apps-script.js` and `backend/README.md`.
