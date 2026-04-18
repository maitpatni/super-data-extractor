# 🗺️ Super Data Extractor

> **Extract business leads from Google Maps and LinkedIn profiles — fast, free to self-host, and production-ready.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Google Places API](https://img.shields.io/badge/Google%20Places-API%20(New)-4285F4)](https://developers.google.com/maps/documentation/places)

Super Data Extractor is a modern web app that lets you extract business data from **Google Maps** and **LinkedIn** profiles, filter results, and export to **Excel or CSV** — all from a clean, responsive UI.

---

## ✨ Features

### 🗺️ Google Maps Extractor
- Search businesses by keyword, location, category, and radius
- **Grid search strategy** — extracts 100–500+ results per search (bypasses Google's 20-result-per-page limit)
- 70+ searchable categories (restaurants, hospitals, IT companies, digital marketing agencies, founders, and more)
- **Location autocomplete** — city suggestions as you type
- Filters: has phone, has website, open now, min rating, price level
- Results table with sortable columns, row selection, star ratings, clickable phone/website
- **Skip previously extracted** — avoids duplicate API charges on re-runs
- Real-time progress with ETA during extraction
- Cost estimate in **₹ INR** before and after each run

### 🔗 LinkedIn Extractor
- Search by name, company, role, location, industry
- Powered by [Proxycurl API](https://nubela.co/proxycurl) — no OAuth needed, just an API key
- Same table UI with sorting, filtering, and export

### 📊 Dashboard
- Real extraction stats (no dummy data)
- API status cards (Google Maps, LinkedIn)
- Session cost summary in ₹
- Recent activity feed
- Quick action buttons

### 💾 Account System
- Secure login/register with bcrypt password hashing
- SQLite database — all searches, history, settings saved per account
- Session-based auth with Bearer tokens

### 📥 Export
- **Excel (.xlsx)** — bold headers, alternating rows, auto column widths
- **CSV** — clean and simple
- Export selected rows or all results
- Timestamped filenames: `google_maps_restaurant_mumbai_2026-04-18.xlsx`

### ⚙️ Settings
- Manage Google Maps API key + LinkedIn (Proxycurl) API key per account
- API key validation with test button
- Dark/light mode (persists across sessions)
- Saved searches with one-click reload
- Search templates for common use cases

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A [Google Maps API key](https://developers.google.com/maps/documentation/places/web-service/get-api-key) with **Places API (New)** enabled
- *(Optional)* A [Proxycurl API key](https://nubela.co/proxycurl) for LinkedIn extraction

### Run Locally

```bash
# Clone the repo
git clone https://github.com/maitpatni/super-data-extractor.git
cd super-data-extractor

# Install dependencies
npm install

# Start the server
node server.js

# Open in browser
open http://localhost:3000
```

### Run with PM2 (Production)

```bash
npm install -g pm2
pm2 start server.js --name super-data-extractor
pm2 save
pm2 startup
```

Then proxy port `3000` via Nginx with SSL for a permanent domain.

---

## 🌐 Live Demo

**Try it online:** *(link coming soon — self-hosted)*

---

## 🔑 API Keys Setup

### Google Maps (Required)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Places API (New)**
3. Create an API key
4. Add it in the app under **Settings → Google Maps API Key**

> ⚠️ This app uses the **new** Places API (`places.googleapis.com/v1`). The legacy Maps API key will not work.

### LinkedIn via Proxycurl (Optional)
1. Sign up at [nubela.co/proxycurl](https://nubela.co/proxycurl)
2. Get your API key
3. Add it in **Settings → LinkedIn API Key**

---

## 🏗️ Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js + Express |
| Frontend | Vanilla JS (ES6+), HTML5, CSS3 |
| Database | SQLite (via better-sqlite3) |
| Auth | bcryptjs + Bearer tokens |
| Excel Export | SheetJS (xlsx) |
| Maps API | Google Places API (New) |
| LinkedIn API | Proxycurl |

---

## 📁 Project Structure

```
super-data-extractor/
├── server.js          # Express backend + API proxy
├── database.js        # SQLite schema + queries
├── public/
│   ├── index.html     # Main SPA shell
│   ├── css/styles.css # UI styles
│   └── js/
│       ├── app.js         # App bootstrap + routing
│       ├── auth.js        # Login/register UI
│       ├── googleMaps.js  # Maps extractor UI
│       ├── linkedin.js    # LinkedIn extractor UI
│       ├── export.js      # Excel/CSV export
│       ├── api.js         # API client
│       ├── router.js      # Client-side router
│       └── utils.js       # Shared utilities
└── data/
    └── sde.db         # SQLite database (auto-created)
```

---

## 🛡️ Privacy & Security

- API keys stored in your own database (never sent to third parties)
- All Google Maps API calls are server-side proxied
- Passwords hashed with bcrypt
- No external analytics or tracking

---

## 🤝 Contributing

Pull requests welcome! Please open an issue first for major changes.

---

## 📄 License

MIT © [Broodle](https://broodle.in)
