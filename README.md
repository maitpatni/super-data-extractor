# 🗺️ Super Data Extractor

> **Extract business leads from Google Maps and LinkedIn profiles — fast, free to self-host, and production-ready.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Google Places API](https://img.shields.io/badge/Google%20Places-API%20(New)-4285F4)](https://developers.google.com/maps/documentation/places)
[![SQLite](https://img.shields.io/badge/SQLite-database-003B57)](https://sqlite.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/maitpatni/super-data-extractor/pulls)

**Super Data Extractor** is an open-source, self-hosted web application for extracting business leads from **Google Maps** and **LinkedIn** profiles. Search by keyword, location, category, and filters — then export clean data to **Excel or CSV** in seconds.

---

## 🌐 Live Demo

**Try it online:** [superextractor.broodle.in](https://superextractor.broodle.in)

---

## ✨ Features

### 🗺️ Google Maps Business Extractor
- 🔍 **Smart search** — keyword, location, category, radius, max results
- 📦 **100–500+ results per search** — proprietary grid search strategy bypasses Google's 20-result-per-page limit
- 🏙️ **Location autocomplete** — city and area suggestions as you type
- 📂 **70+ categories** — restaurants, hospitals, IT companies, digital marketing agencies, law firms, colleges, founders, real estate, and more
- 🔎 **Advanced filters** — has phone, has website, open now, minimum rating, price level
- 📊 **Interactive data table** — sortable columns, row selection checkboxes, star ratings, clickable phone & website
- ♻️ **Skip already-extracted places** — avoids duplicate API charges on re-runs using session deduplication
- ⏱️ **Real-time progress** — live progress bar with ETA during extraction
- 💰 **Cost estimate in ₹ INR** — before and after each run so you know exactly what you're spending

### 🔗 LinkedIn Profile Extractor
- 🔍 Search by name, company, role, location, industry
- ⚡ Powered by [Apollo.io API](https://app.apollo.io) — no OAuth, no browser automation, just an API key
- 📋 Full profile data: name, headline, company, role, location, email, phone, profile URL
- Same interactive table with sorting, filtering, and export

### 📊 Dashboard
- ✅ Real extraction stats (zero fake/demo data)
- 🟢 API status cards — Google Maps & LinkedIn
- 💰 Session cost summary in ₹ INR
- 📋 Recent activity feed
- ⚡ Quick action buttons

### 🔐 Account & Authentication
- Secure register/login with full name, email, password, mobile
- Passwords hashed with bcrypt (salt rounds = 10)
- SQLite database — all searches, history, settings saved per user account
- Session-based auth with Bearer tokens (30-day expiry)

### 💾 Data & Export
- **Excel (.xlsx)** — bold headers, alternating row colors, auto column widths, named sheets
- **CSV** — clean comma-separated for any tool
- Export selected rows or all results
- Timestamped filenames: `google_maps_restaurant_mumbai_2026-04-18.xlsx`
- Post-extraction column picker — show/hide columns before export

### ⚙️ Settings & UX
- API key management per user account (Google Maps + LinkedIn/Apollo.io)
- API key validation with live test button
- Dark/light mode — persists across sessions
- Saved searches with one-click reload (up to 10 per user)
- Search templates: Restaurants, Hospitals, Digital Marketing Agencies, IT Companies, Real Estate, Hotels, Gyms
- Search history with re-run and per-entry export
- Website reachability check — green ✅ / red ❌ indicators on results

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 18+** — [Download](https://nodejs.org)
- **Google Maps API key** with Places API (New) enabled — [Setup guide below](#-google-maps-api-key-setup-2026)
- *(Optional)* **Apollo.io API key** for LinkedIn — [Setup guide below](#-linkedin-via-apolloio-api)

### Run Locally (Development)

```bash
# 1. Clone the repo
git clone https://github.com/maitpatni/super-data-extractor.git
cd super-data-extractor

# 2. Install dependencies
npm install

# 3. Start the server
node server.js

# 4. Open in browser
open http://localhost:3000
```

Register an account on first run — all data is stored locally in `data/sde.db`.

### Run with PM2 (Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start the app
pm2 start server.js --name super-data-extractor

# Save PM2 process list (auto-restart on reboot)
pm2 save
pm2 startup
```

### Deploy with Nginx + SSL

Point your Nginx reverse proxy at port `3000`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🔑 Google Maps API Key Setup (2026)

> ⚠️ This app uses the **new** Google Places API (`places.googleapis.com/v1`). You must enable **Places API (New)** — the old Places API will not work.

### Step-by-step (Google Cloud Console 2026)

1. **Go to Google Cloud Console**
   👉 [console.cloud.google.com](https://console.cloud.google.com)

2. **Create or select a project**
   - Click the project dropdown at the top → **New Project**
   - Name it (e.g. `super-data-extractor`) → **Create**

3. **Enable the APIs**
   - Go to **APIs & Services → Library**
   - Search for **"Places API (New)"** → Click it → **Enable**
   - Also enable **"Places API"** (for autocomplete)

4. **Create an API key**
   - Go to **APIs & Services → Credentials**
   - Click **+ Create Credentials → API key**
   - Copy the key

5. **Restrict the API key** *(recommended)*
   - Click on the key → **Edit**
   - Under **API restrictions** → Select **Restrict key**
   - Select: **Places API (New)**, **Places API**
   - Under **Application restrictions** → **IP addresses** (add your server IP)
   - Click **Save**

6. **Set up billing**
   - Go to **Billing** → Link a billing account
   - Google gives **$200 free credit per month** — enough for thousands of searches
   - Each text search = ~₹1.43, each place detail = ~₹1.43

7. **Add to the app**
   - Open Super Data Extractor → **Settings**
   - Paste your key in **Google Maps API Key** → **Save & Test**

---

## 🔑 LinkedIn via Apollo.io API

1. Sign up free at https://app.apollo.io
2. Go to Settings → Integrations → API Keys
3. Click 'Create new key'
4. Copy your API key
5. Paste in Super Data Extractor → Settings → Apollo.io API Key → Save & Test

> 💡 Free tier: 200 email credits/month, unlimited people search

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 18+ + Express 4 |
| Frontend | Vanilla JS (ES6+), HTML5, CSS3 |
| Database | SQLite via `better-sqlite3` |
| Auth | `bcryptjs` + Bearer tokens |
| Excel Export | SheetJS (`xlsx`) |
| Maps Data | Google Places API (New) |
| LinkedIn Data | Apollo.io REST API |
| Process Manager | PM2 |

---

## 📁 Project Structure

```
super-data-extractor/
├── server.js              # Express backend + API proxy + auth
├── database.js            # SQLite schema + all DB queries
├── package.json
├── public/
│   ├── index.html         # Single-page app shell
│   ├── css/styles.css     # Full responsive UI styles
│   └── js/
│       ├── app.js         # App bootstrap, routing, state
│       ├── auth.js        # Login & register pages
│       ├── googleMaps.js  # Google Maps extractor UI
│       ├── linkedin.js    # LinkedIn extractor UI
│       ├── export.js      # Excel/CSV export logic
│       ├── api.js         # Authenticated API client
│       ├── router.js      # Client-side hash router
│       └── utils.js       # Shared utilities + localStorage
└── data/
    └── sde.db             # SQLite database (auto-created on first run)
```

---

## 💡 How Grid Search Works

Google Places API (New) returns a maximum of **20 results per call** with pagination up to ~60 total. To extract 100–500+ results, Super Data Extractor uses a **grid search strategy**:

1. The search area is divided into a grid of smaller circles (e.g. 3×3 = 9 zones)
2. Each zone runs an independent search with a smaller radius
3. All results are combined and **deduplicated by Place ID**
4. Only unique results are returned — no duplicates, no wasted API credits

This approach can extract **200–500+ unique businesses** from a single city search.

---

## 🛡️ Security & Privacy

- 🔐 Passwords hashed with bcrypt (never stored in plain text)
- 🔑 API keys stored in your own SQLite database (never sent to third parties)
- 🌐 All Google Maps API calls are proxied server-side (keys never exposed to browser)
- 🚫 No external analytics, no tracking, no telemetry
- 🔒 Session tokens expire after 30 days

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

1. Fork the repo
2. Create your branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

MIT © [Broodle](https://broodle.in)

---

## ⭐ Star this repo if it helped you!

If Super Data Extractor saved you time, give it a ⭐ — it helps others find it too.
