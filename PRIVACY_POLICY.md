# Privacy Policy — PropSight (SG Rental Copilot)

**Last updated:** March 2, 2026

## Overview

PropSight is a browser extension that helps renters in Singapore identify key listing attributes on PropertyGuru. This policy explains what data the extension accesses, how it is used, and how it is stored.

## Data Collection

**PropSight does not collect, transmit, or store any personal data on external servers.**

The extension operates entirely within your browser. There is no backend server, no analytics, no telemetry, and no user accounts.

## Data Accessed

The extension accesses the following data **locally in your browser only**:

| Data | Purpose |
|------|---------|
| PropertyGuru listing page content | Extracts rental attributes (cooking policy, room type, etc.) using client-side pattern matching |
| Extracted tag results | Cached locally in `chrome.storage.local` for 24 hours to avoid re-processing |
| Filter preferences | Your filter panel settings are saved locally so they persist across page navigations |

## Data Storage

All data is stored in `chrome.storage.local`, which is sandboxed to the extension and only accessible by PropSight. No data is sent to any external server or third party.

Cached data automatically expires after 24 hours.

## Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Save extracted tags and filter preferences locally |
| Host access to `propertyguru.com.sg` | Read listing descriptions to extract rental attributes |

## Third-Party Services

PropSight does **not** use any third-party services, APIs, analytics platforms, or advertising networks.

## Changes to This Policy

If this policy is updated, the new version will be published in the extension's GitHub repository and the Chrome Web Store listing.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/niclasliu/PropSight).
