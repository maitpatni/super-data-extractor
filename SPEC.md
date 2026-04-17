# Super Data Extractor - Project Specification

## 1. Project Overview

**Project Name:** Super Data Extractor  
**Project Type:** Browser-based Web Application (Node.js + Express Backend, Vanilla JS Frontend)  
**Core Functionality:** Extract business data from Google Maps and LinkedIn, export to Excel  
**Target Users:** Sales professionals, marketers, recruiters, business analysts

---

## 2. UI/UX Specification

### 2.1 Layout Structure

**Page Sections:**
- **Sidebar (Left):** Fixed width 260px, collapsible on mobile
- **Header:** Fixed height 64px, contains logo, theme toggle, settings button
- **Main Content Area:** Fluid width, scrollable content
- **Footer:** Fixed at bottom of content area, contains version info

**Responsive Breakpoints:**
- Mobile: < 768px (sidebar becomes hamburger menu)
- Tablet: 768px - 1024px (compact sidebar 220px)
- Desktop: > 1024px (full sidebar 260px)

### 2.2 Visual Design

**Color Palette - Dark Mode (Default):**
- Background Primary: `#0d1117`
- Background Secondary: `#161b22`
- Background Tertiary: `#21262d`
- Surface: `#30363d`
- Border: `#30363d`
- Text Primary: `#e6edf3`
- Text Secondary: `#8b949e`
- Text Muted: `#6e7681`
- Accent Primary: `#58a6ff` (Blue)
- Accent Success: `#3fb950` (Green)
- Accent Warning: `#d29922` (Yellow)
- Accent Error: `#f85149` (Red)
- Accent Purple: `#a371f7`

**Color Palette - Light Mode:**
- Background Primary: `#ffffff`
- Background Secondary: `#f6f8fa`
- Background Tertiary: `#eaeef2`
- Surface: `#ffffff`
- Border: `#d0d7de`
- Text Primary: `#1f2328`
- Text Secondary: `#656d76`
- Text Muted: `#8c959f`
- Accent Primary: `#0969da`
- Accent Success: `#1a7f37`
- Accent Warning: `#9a6700`
- Accent Error: `#cf222e`
- Accent Purple: `#8250df`

**Typography:**
- Font Family: `'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Font Family Mono: `'IBM Plex Mono', 'Fira Code', monospace`
- Heading 1: 28px, weight 600
- Heading 2: 22px, weight 600
- Heading 3: 18px, weight 600
- Body: 14px, weight 400
- Small: 12px, weight 400
- Caption: 11px, weight 500

**Spacing System:**
- Base unit: 4px
- XS: 4px
- SM: 8px
- MD: 16px
- LG: 24px
- XL: 32px
- XXL: 48px

**Visual Effects:**
- Border Radius Small: 6px
- Border Radius Medium: 8px
- Border Radius Large: 12px
- Box Shadow Subtle: `0 1px 2px rgba(0, 0, 0, 0.1)`
- Box Shadow Medium: `0 4px 12px rgba(0, 0, 0, 0.15)`
- Box Shadow Strong: `0 8px 24px rgba(0, 0, 0, 0.2)`
- Transition Fast: 150ms ease
- Transition Normal: 250ms ease
- Transition Slow: 350ms ease

### 2.3 Components

**Sidebar Navigation:**
- Logo area with app icon and name
- Nav items with icons and labels
- Active state: accent background, white text
- Hover state: subtle background shift
- Collapse button for mobile

**Cards:**
- Background: surface color
- Padding: 20px
- Border radius: 12px
- Box shadow: subtle

**Buttons:**
- Primary: Accent blue background, white text
- Secondary: Transparent, border, accent text
- Ghost: Transparent, no border
- Disabled: 50% opacity, no pointer events
- States: hover (lighten 10%), active (darken 5%), focus (ring)

**Form Inputs:**
- Height: 40px
- Background: secondary
- Border: 1px solid border color
- Focus: accent border, subtle glow
- Error: error border color

**Progress Bar:**
- Height: 8px
- Background: tertiary
- Fill: gradient from accent to success
- Animation: striped moving pattern

**Data Table:**
- Header: tertiary background, bold text
- Rows: alternating subtle backgrounds
- Hover: highlight row

**Modal:**
- Backdrop: rgba(0,0,0,0.7)
- Content: card style, max-width 500px
- Animation: fade + scale

---

## 3. Functionality Specification

### 3.1 Core Features

**Settings Page:**
- API key inputs for:
  - Google Maps API Key (required for Places)
  - LinkedIn API credentials (extensible)
- API key validation with test button
- Settings persistence in localStorage (demo mode) / database (production)
- Platform enable/disable toggles

**Google Maps Extractor:**
- Search Parameters:
  - Keyword (required): Business type or name
  - Location (required): City, address, or coordinates
  - Radius (optional): 100-50000 meters, default 5000
  - Category (optional): predefined categories dropdown
  - Max Results (optional): 1-60, default 20
- Extract Fields:
  - Name
  - Address (full formatted)
  - Phone number
  - Website URL
  - Rating (1-5 stars)
  - Number of reviews
  - Category/type
  - Opening hours
  - Location coordinates
  - Place ID

**LinkedIn Extractor:**
- Search Parameters:
  - Name (optional)
  - Company (optional)
  - Role/Title (optional)
  - Location (optional)
  - Industry (optional)
- Extract Fields:
  - Full name
  - Headline
  - Company
  - Job title
  - Location
  - Profile URL
  - Connection degree

**Filters:**
- Pre-extraction filters:
  - Has phone number (checkbox)
  - Has website (checkbox)
  - Minimum rating (slider 1-5)
  - Has reviews (checkbox)
- Post-extraction filters:
  - Text search within results
  - Column-based sorting
  - Select/deselect rows

**Export:**
- Excel (xlsx) format
- Sheet name customizable
- Column headers with proper formatting
- Bold headers, alternate row colors
- Auto column width
- Filename: `{source}_{timestamp}.xlsx`

**Progress Display:**
- Real-time progress bar
- Current operation text
- Processed/total count
- Estimated time remaining
- Cancel button

**Extraction History:**
- List of past extractions
- Date, source, count, status
- View results
- Re-export
- Delete entry

### 3.2 Pages/Routes

1. **Dashboard** (`/`) - Overview with quick actions
2. **Google Maps** (`/google-maps`) - Google Places extraction
3. **LinkedIn** (`/linkedin`) - LinkedIn profile extraction
4. **History** (`/history`) - Past extractions
5. **Settings** (`/settings`) - API configuration
6. **Docs** (`/docs`) - Documentation

### 3.3 Data Handling

- All extraction runs stored in memory (demo) or database
- Export directly to browser download
- Settings in localStorage
- No server-side data persistence in demo mode

### 3.4 Edge Cases

- Invalid API key handling with clear error messages
- Rate limiting handling with backoff
- Empty results handling
- Network error recovery
- Large dataset handling (pagination/virtualization)

---

## 4. Technical Stack

- **Backend:** Node.js + Express
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Excel Export:** xlsx library (SheetJS)
- **No database** (demo mode with localStorage)

---

## 5. Acceptance Criteria

1. Application starts with `node server.js` and opens in browser at localhost:3000
2. Settings page accepts and validates API keys
3. Google Maps extractor returns business data based on search params
4. LinkedIn extractor searches profiles (note: uses mock/demo data due to API limitations)
5. Responsive UI works on mobile, tablet, desktop
6. Dark/light mode toggle works and persists
7. Sidebar navigation works with active states
8. Pre-extraction filters affect search results
9. Excel export downloads with proper formatting
10. Progress bar updates in real-time during extraction
11. History shows past extractions with view/re-export options
12. README provides setup and usage instructions

---

## 6. File Structure

```
SuperDataExtractor/
├── server.js              # Express backend server
├── package.json           # Dependencies
├── public/
│   ├── index.html        # Main HTML file
│   ���── css/
│   │   └── styles.css   # Main styles
│   └── js/
│       ├── app.js       # Main application
│       ├── router.js   # Client-side routing
│       ├── api.js      # API client
│       ├── googleMaps.js  # Google Maps extractor
│       ├── linkedin.js   # LinkedIn extractor
│       ├── export.js   # Excel export
│       └── utils.js    # Utilities
├── README.md            # Documentation
└── SPEC.md              # This specification
```