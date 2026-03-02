# PropSight AI — SG Rental Copilot

AI-powered browser extension that reveals hidden rental listing attributes on **PropertyGuru Singapore** using Gemini LLM analysis.

## Architecture

```
Browser Extension (Plasmo)
    ├── Local Cache (chrome.storage.local, 24h TTL)
    │     ↓ cache miss
    │   Fetch listing descriptions (iframe / background fetch)
    │     ↓ listing text (batch)
    └── Python Backend (FastAPI)  →  Gemini Flash LLM
          ↓ structured JSON tags
        Browser Extension  →  DOM tag injection
              ↓
        Save to Local Cache
```

- **Backend is stateless** — no database, no Redis. It's a pure LLM proxy: receives listing text, calls Gemini, returns structured tags.
- **Caching is client-side only** — `chrome.storage.local` caches analyzed tags per listing ID with a 24h TTL. Same user revisiting the same listing gets instant results without hitting the backend.

## Project Structure

```
PropSense/
├── backend/              # FastAPI service (stateless LLM proxy)
│   ├── app/
│   │   ├── main.py       # App entry, CORS, lifespan
│   │   ├── config.py     # Pydantic settings (.env)
│   │   ├── models.py     # Request/response & tag enums
│   │   ├── routers/
│   │   │   └── analyze.py  # POST /v1/analyze, /v1/fetch-descriptions
│   │   └── services/
│   │       ├── gemini.py   # Gemini LLM extraction
│   │       └── scraper.py  # PropertyGuru page fetcher
│   ├── Dockerfile
│   ├── railway.toml
│   ├── requirements.txt
│   └── .env.example
├── extension/            # Chrome extension (Plasmo)
│   ├── contents/
│   │   └── propertyguru.ts  # Content script (DOM observer + injector)
│   ├── background.ts        # Service worker (API bridge)
│   ├── popup.tsx             # Settings popup
│   ├── lib/
│   │   ├── types.ts          # Shared TypeScript types
│   │   └── tags.ts           # Tag display logic & CSS
│   └── package.json
└── README.md
```

## Quick Start (Local Development)

### 1. Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env → set your GEMINI_API_KEY

# Start backend (no external dependencies needed — no Redis, no DB)
uvicorn app.main:app --reload --port 8000
```

Verify: `curl http://localhost:8000/health`

### 2. Chrome Extension

```bash
cd extension

# Install dependencies
npm install

# Start dev server (auto-reloads)
npm run dev
```

Then load the extension in Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/build/chrome-mv3-dev` folder

### 3. Test

1. Open the extension popup → confirm backend status is green
2. Browse to [PropertyGuru Rentals](https://www.propertyguru.com.sg/property-for-rent)
3. AI tags should appear on listing cards within a few seconds

## Deploy to Railway

### Backend

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login & init
railway login
railway init

# Set environment variables
railway variables set GEMINI_API_KEY=your_key_here
railway variables set GEMINI_MODEL=gemini-2.5-flash

# Deploy
cd backend
railway up
```

Railway will auto-detect the `Dockerfile` and `railway.toml`.
No Redis or database add-on needed — the backend is fully stateless.

### Extension

After deploying the backend:
1. Copy your Railway backend URL (e.g., `https://propsight-ai-production.up.railway.app`)
2. Open the extension popup
3. Paste the URL into the **API Server URL** field
4. Click **Save Settings**

To publish the extension:
```bash
cd extension
npm run build
npm run package
# Upload the .zip from build/ to Chrome Web Store
```

## API Reference

### `GET /health`

Health check.

### `POST /v1/analyze`

Batch-analyze listing descriptions via Gemini LLM. Stateless — no server-side caching.

**Request:**
```json
{
  "listings": [
    { "id": "12345678", "text": "Master room near Clementi MRT, no cooking..." }
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "12345678",
      "tags": {
        "cooking_policy": "no_cooking",
        "owner_occupancy": "unknown",
        "address_registration": "unknown",
        "room_type": "master_room",
        "bathroom": "unknown",
        "agent_fee": "unknown",
        "lease_term_months": null,
        "gender_preference": "unknown",
        "visitor_policy": "unknown"
      },
      "cached": false
    }
  ]
}
```

### `POST /v1/fetch-descriptions`

Server-side fetch of PropertyGuru listing pages. Extracts description text from HTML.

**Request:**
```json
{
  "urls": {
    "12345678": "https://www.propertyguru.com.sg/listing/..."
  }
}
```

**Response:**
```json
{
  "descriptions": {
    "12345678": "Master room for rent near Clementi MRT..."
  }
}
```

## Tag Categories

| Color | Meaning | Examples |
|-------|---------|---------|
| 🔴 Red | Deal-breaker / risk | No Cooking, Landlord Lives In, No Address Reg, Partition Room |
| 🟢 Green | Positive signal | Heavy Cooking OK, Private Bath, No Agent Fee, No Landlord |
| 🟡 Yellow | Informational | Light Cooking, Shared Bath, Lease Term, Gender Preference |
