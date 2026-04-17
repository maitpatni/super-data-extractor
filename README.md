# Super Data Extractor

A browser-based data extraction web application for extracting business data from Google Maps and LinkedIn, with Excel export capabilities.

## Features

- **Google Maps Extractor** - Search businesses by keyword, location, radius, category
  - Extract: name, address, phone, website, rating, reviews, category, opening hours
  - Pre-extraction filters (has phone, has website, minimum rating, has reviews)
  - Pagination support for up to 60 results

- **LinkedIn Extractor** - Search professional profiles
  - Search by: name, company, role/title, location, industry
  - Extract: full name, headline, company, job title, location, profile URL, connection degree

- **Modern UI** - Dark/light theme, responsive design, sidebar navigation
- **Real-time Progress** - Progress bar with ETA during extraction
- **History & Logs** - View past extractions, re-export, delete
- **Excel Export** - Download results as .xlsx files with proper formatting
- **Settings** - Configure API keys, enable/disable platforms

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Excel Export**: SheetJS (xlsx library)

## Quick Start

### Prerequisites

- Node.js (v14+) installed

### Installation

```bash
cd SuperDataExtractor
npm install
```

### Run

```bash
npm start
# or
node server.js
```

The application will be available at http://localhost:3000

## Configuration

### Google Maps API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable "Places API" and "Maps JavaScript API"
4. Go to "Credentials" and create an API key
5. Copy the API key

### LinkedIn API

Note: LinkedIn's API access is restricted. The app includes demo data for demonstration purposes. In production, you would need:
- Official LinkedIn API access (requires partner approval)
- OR web scraping solutions (within LinkedIn's ToS boundaries)

## Usage

### Google Maps Extraction

1. Navigate to Google Maps from sidebar
2. Enter a keyword (e.g., "restaurants")
3. Enter a location (e.g., "New York, NY")
4. Optionally set category, max results, radius
5. Configure pre-extraction filters
6. Click "Start Extraction"
7. View results in table
8. Click "Export to Excel" to download

### LinkedIn Extraction

1. Navigate to LinkedIn from sidebar
2. Enter search parameters
3. Click "Start Extraction"
4. View results in table
5. Export to Excel

### History

1. Navigate to History from sidebar
2. View past extractions with timestamps
3. Click "View" to see results
4. Click "Export" to re-export
5. Click "Delete" to remove

### Settings

1. Navigate to Settings from sidebar
2. Enter your Google Maps API key
3. Toggle platform enable/disable
4. Click "Save Settings"
5. Optionally click "Validate API Keys"

## Project Structure

```
SuperDataExtractor/
├── server.js              # Express server with API routes
├── package.json          # Dependencies
├── public/
│   ├── index.html      # Main HTML file
│   ├── css/
│   │   └── styles.css # Main styles
│   └── js/
│       ├── app.js       # Main application
│       ├── router.js   # Client-side routing
│       ├── api.js     # API client
│       ├── googleMaps.js  # Google Maps extractor
│       ├── linkedin.js  # LinkedIn extractor
│       ├── export.js  # Excel export
│       └── utils.js   # Utilities
├── README.md          # This file
└── SPEC.md           # Project specification
```

## API Endpoints

| Method | Endpoint | Description |
|--------|---------|-----------|
| GET | `/api/settings` | Get settings |
| POST | `/api/settings` | Save settings |
| POST | `/api/settings/validate-google` | Validate Google API key |
| POST | `/api/google-maps/search` | Search Google Maps |
| POST | `/api/linkedin/search` | Search LinkedIn profiles |
| GET | `/api/history` | Get extraction history |
| DELETE | `/api/history/:id` | Delete history item |
| POST | `/api/export` | Export to Excel |

## Data Stored

- Settings are stored in `localStorage`
- Extraction history in `localStorage`
- No server-side database (demo mode)

## Troubleshooting

### "API key is required" error

1. Go to Settings
2. Enter your Google Maps API key
3. Click "Save Settings"

### No results found

- Verify your API key is valid
- Check the keyword and location
- Try increasing the radius or max results

### Export not working

- Ensure the results table has data
- Check browser console for errors
- Try a different browser

## License

MIT