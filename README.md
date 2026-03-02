# PropSight — SG Rental Copilot

Chrome extension that reveals hidden rental listing attributes on **PropertyGuru Singapore** using client-side pattern matching. No backend or API keys required.

## How It Works

```
PropertyGuru Search Results
    │
    ├─ Content script detects listing cards (MutationObserver)
    │
    ├─ Fetches each listing's detail page (via og:description / __NEXT_DATA__)
    │
    ├─ Extracts tags with regex rule engine (rule-extractor.ts) — zero latency, no API
    │
    ├─ Injects colored pill tags into the DOM
    │
    ├─ Caches results in chrome.storage.local (24h TTL)
    │
    └─ Filter panel (Phase 2a) lets you narrow results by extracted tags
```

The entire pipeline runs in the browser. There is no backend call, no LLM invocation, and no API key to configure.

## Project Structure

```
PropSense/
├── extension/                 # Chrome extension (Plasmo framework)
│   ├── contents/
│   │   └── propertyguru.ts    # Content script: card detection, fetch, inject
│   ├── background.ts          # Service worker (placeholder for future use)
│   ├── popup.tsx              # Extension popup (clear cache)
│   ├── lib/
│   │   ├── types.ts           # Shared TypeScript types & filter definitions
│   │   ├── tags.ts            # Tag → display pill mapping & CSS injection
│   │   ├── rule-extractor.ts  # Regex-based tag extraction engine
│   │   ├── tag-store.ts       # In-memory tag store (pub/sub for filter panel)
│   │   └── filter-panel.ts    # Floating filter panel UI (Phase 2a)
│   ├── package.json
│   └── tsconfig.json
├── PRD.txt
└── README.md
```

## Quick Start

```bash
cd extension

# Install dependencies
npm install

# Start Plasmo dev server (auto-reloads on file changes)
npm run dev
```

Then load in Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `extension/build/chrome-mv3-dev`

### Test

1. Browse to [PropertyGuru Rentals](https://www.propertyguru.com.sg/property-for-rent)
2. Colored tag pills should appear on listing cards within a few seconds
3. A floating "PropSight Filter" panel appears at the bottom-right corner

No backend setup needed — everything runs client-side.

## Tag Extraction

Tags are extracted by `rule-extractor.ts`, a pure regex engine that pattern-matches against listing descriptions. It covers 10 dimensions:

| Dimension | Possible Values |
|---|---|
| Cooking Policy | Heavy Cooking OK, Light Cooking Only, No Cooking |
| Owner Occupancy | Owner Stays, Owner Not Staying |
| Address Registration | Allowed, Not Allowed |
| Room Type | Master Room, Common Room, Studio, Whole Unit, Partition |
| Bathroom | Private, Shared |
| Agent Fee | No Agent Fee, Has Agent Fee, Half Month |
| Lease Term | N months (integer) |
| Gender Preference | Male Only, Female Only, Couples OK, Any |
| Visitor Policy | Allowed, Restricted, Not Allowed |
| Additional Flags | aircon, wifi, furnished, high floor, no pets, etc. |

## Tag Colors

| Color | Meaning | Examples |
|-------|---------|---------|
| 🔴 Red | Deal-breaker / restriction | No Cooking, Landlord Lives In, No Address Reg, Partition Room, No Visitors |
| 🟢 Green | Positive signal | Heavy Cooking OK, No Landlord, Address Reg OK, Private Bath, No Agent Fee |
| 🟡 Yellow | Caution / conditional | Light Cooking Only, Visitor Restrictions, Agent Fee, Gender Preference |
| 🔵 Blue | Neutral info | Room Type, Shared Bath, Lease Term, Additional Flags |

## Filter Panel (Phase 2a)

On search results pages, a floating panel at the bottom-right lets you filter listings by:
- Cooking, Owner, Bathroom, Room Type, Address Registration, Gender, Visitors
- "Hide unanalyzed" toggle to show only listings with confirmed tags
- Match counter showing `visible / total` listings
- Filter state is persisted in `chrome.storage.local`

Filtering is instant — it toggles CSS `display` on listing card elements.

## Publish to Chrome Web Store

```bash
cd extension
npm run build
npm run package
# Upload the .zip from build/ to Chrome Web Store
```

## Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | X-Ray Tagger (regex-based tag extraction + injection) | ✅ Complete |
| 2a | Tag Filter Panel (client-side filtering by tags) | ✅ Complete |
| 2b | Smart Search (NL → PropertyGuru filters via LLM) | 📋 Planned |
| 2c | AI Reranking (semantic re-ordering + top picks) | 📋 Planned |
