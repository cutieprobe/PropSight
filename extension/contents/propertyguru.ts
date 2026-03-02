import type { PlasmoCSConfig } from "plasmo"

import type {
  ListingResult,
  ListingTags,
} from "~lib/types"
import { isAllUnknown } from "~lib/types"
import {
  tagsToDisplay,
  createTagContainer,
  createLoadingEl,
  injectStyles,
} from "~lib/tags"
import { extractTagsFromText } from "~lib/rule-extractor"
import { setTags } from "~lib/tag-store"
import { initFilterPanel, applyFilters } from "~lib/filter-panel"

// ── Plasmo content-script config ──────────────────────────────────────────────

export const config: PlasmoCSConfig = {
  matches: [
    "https://www.propertyguru.com.sg/property-for-rent*",
    "https://www.propertyguru.com.sg/listing/*",
    "https://www.propertyguru.com.sg/room-rental*",
    "https://www.propertyguru.com.sg/map-search*",
  ],
  run_at: "document_idle",
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCAL_CACHE_KEY = "propsight_cache"
const LOCAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000

// ── State ─────────────────────────────────────────────────────────────────────

const processedListings = new Set<string>()
const analysisComplete = new Set<string>()

// ── Boot ──────────────────────────────────────────────────────────────────────

console.log(`[PropSight] Content script loaded on ${window.location.pathname} (v3-rules-only)`)

injectStyles()

if (isSearchResultsPage()) {
  console.log("[PropSight] Search results page detected")
  observeSearchResults()
  initFilterPanel()
} else if (isListingDetailPage()) {
  console.log("[PropSight] Listing detail page detected")
  processDetailPage()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSearchResultsPage(): boolean {
  const p = window.location.pathname
  return p.includes("/property-for-rent") || p.includes("/room-rental") || p.includes("/map-search")
}

function isMapViewPage(): boolean {
  return window.location.pathname.includes("/map-search")
}

function isListingDetailPage(): boolean {
  return window.location.pathname.includes("/listing/")
}

function extractListingIdFromUrl(url: string): string | null {
  const m = url.match(/\/listing\/[^/]*-(\d+)/)
  return m ? m[1] : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL CACHE
// ═══════════════════════════════════════════════════════════════════════════════

interface CachedEntry {
  tags: ListingTags
  ts: number
}

async function getLocalCache(): Promise<Record<string, CachedEntry>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(LOCAL_CACHE_KEY, (data) => {
      resolve((data[LOCAL_CACHE_KEY] as Record<string, CachedEntry>) ?? {})
    })
  })
}

async function setLocalCache(cache: Record<string, CachedEntry>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_CACHE_KEY]: cache }, resolve)
  })
}

async function getFromLocalCache(ids: string[]): Promise<{
  hits: ListingResult[]
  misses: string[]
}> {
  const cache = await getLocalCache()
  const now = Date.now()
  const hits: ListingResult[] = []
  const misses: string[] = []
  for (const id of ids) {
    const entry = cache[id]
    if (entry && now - entry.ts < LOCAL_CACHE_TTL_MS) {
      hits.push({ id, tags: entry.tags, cached: true })
    } else {
      misses.push(id)
    }
  }
  return { hits, misses }
}

async function saveToLocalCache(results: ListingResult[]): Promise<void> {
  const cache = await getLocalCache()
  const now = Date.now()
  for (const key of Object.keys(cache)) {
    if (now - cache[key].ts > LOCAL_CACHE_TTL_MS) delete cache[key]
  }
  let saved = 0
  for (const r of results) {
    if (isAllUnknown(r.tags)) continue
    cache[r.id] = { tags: r.tags, ts: now }
    saved++
  }
  if (saved > 0) {
    await setLocalCache(cache)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH RESULTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function observeSearchResults(): void {
  processVisibleListings()

  // SPA may render cards after document_idle
  setTimeout(() => processVisibleListings(), 500)
  setTimeout(() => processVisibleListings(), 1500)

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        processVisibleListings()
        break
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

interface CardInfo {
  id: string
  url: string
  card: Element
}

function processVisibleListings(): void {
  const cards = findListingCards()
  const newCards: CardInfo[] = []

  for (const card of cards) {
    const info = extractCardInfo(card)
    if (!info) continue

    if (!card.hasAttribute("data-listing-id")) {
      card.setAttribute("data-listing-id", info.id)
    }

    if (!processedListings.has(info.id)) {
      processedListings.add(info.id)
      card.appendChild(createLoadingEl(info.id))
      newCards.push(info)
    } else if (analysisComplete.has(info.id)) {
      if (!card.querySelector(".propsight-tags:not(.propsight-loading-wrapper)")) {
        reInjectFromCache(info.id)
      }
    }
  }

  if (newCards.length > 0) {
    console.log(`[PropSight] Found ${newCards.length} new cards:`, newCards.map(c => ({ id: c.id, url: c.url.substring(0, 80) })))
    processCardsWithCache(newCards)
  }
}

function reInjectFromCache(id: string): void {
  removeAllPropsightElements(id)
  getFromLocalCache([id]).then(({ hits }) => {
    if (hits.length > 0 && !isAllUnknown(hits[0].tags)) {
      const card = findBestCardElement(id)
      if (!card) return
      setTags(id, hits[0].tags, card as HTMLElement)
      if (card.querySelector(".propsight-tags:not(.propsight-loading-wrapper)")) return
      const tags = tagsToDisplay(hits[0].tags)
      if (tags.length > 0) card.appendChild(createTagContainer(tags, isMapViewPage()))
    }
  })
}

async function processCardsWithCache(cards: CardInfo[]): Promise<void> {
  const allIds = cards.map((c) => c.id)
  const { hits: localHits, misses: afterLocal } = await getFromLocalCache(allIds)

  const validLocalHits = localHits.filter((r) => !isAllUnknown(r.tags))
  const staleLocalIds = localHits.filter((r) => isAllUnknown(r.tags)).map((r) => r.id)

  console.log(`[PropSight] Cache: ${validLocalHits.length} hits, ${afterLocal.length} misses, ${staleLocalIds.length} stale`)

  for (const result of validLocalHits) {
    const cardInfo = cards.find((c) => c.id === result.id)
    if (cardInfo) setTags(result.id, result.tags, cardInfo.card as HTMLElement)
    injectSearchResultTags(result)
    analysisComplete.add(result.id)
  }

  const combinedMisses = [...afterLocal, ...staleLocalIds]
  if (combinedMisses.length === 0) return

  const uncachedCards = cards.filter((c) => combinedMisses.includes(c.id))
  await fetchDescriptionsAndAnalyze(uncachedCards)
}

function ensureLoadingIndicators(cards: CardInfo[]): void {
  for (const c of cards) {
    if (document.getElementById(`propsight-loading-${c.id}`)) continue
    const card = findBestCardElement(c.id)
    if (card && !card.querySelector(".propsight-loading-wrapper")) {
      card.appendChild(createLoadingEl(c.id))
    }
  }
}

function countKnownFields(tags: ListingTags): number {
  let n = 0
  if (tags.cooking_policy !== "unknown") n++
  if (tags.owner_occupancy !== "unknown") n++
  if (tags.room_type !== "unknown") n++
  if (tags.bathroom !== "unknown") n++
  if (tags.agent_fee !== "unknown") n++
  if (tags.gender_preference !== "unknown") n++
  if (tags.address_registration !== "unknown") n++
  if (tags.visitor_policy !== "unknown") n++
  if (tags.lease_term_months != null) n++
  if (tags.additional_flags && tags.additional_flags.length > 0) n++
  return n
}

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { credentials: "include", signal: controller.signal }).finally(
    () => clearTimeout(timer)
  )
}

const MAX_CONCURRENT_FETCHES = 5
const FETCH_TIMEOUT_MS = 8000

async function fetchDescriptionsAndAnalyze(cards: CardInfo[]): Promise<void> {
  ensureLoadingIndicators(cards)

  const allResults: ListingResult[] = []
  const queue = [...cards]
  const promises: Promise<void>[] = []

  function next(): Promise<void> {
    const c = queue.shift()
    if (!c) return Promise.resolve()
    return fetchWithTimeout(c.url, FETCH_TIMEOUT_MS)
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        return resp.text()
      })
      .then((html) => {
        const desc = extractOgDescriptionFromHtml(html)
        if (!desc || desc.length < 30) {
          console.log(`[PropSight] ${c.id}: no description (${desc?.length ?? 0} chars)`)
          return
        }
        const tags = extractTagsFromText(desc)
        setTags(c.id, tags, c.card as HTMLElement)
        allResults.push({ id: c.id, tags, cached: false })
      })
      .catch((err) => {
        console.warn(`[PropSight] fetch ${c.id} failed:`, err.message ?? err)
      })
      .finally(() => {
        if (queue.length > 0) return next()
      })
  }

  const initial = Math.min(MAX_CONCURRENT_FETCHES, cards.length)
  for (let i = 0; i < initial; i++) {
    promises.push(next())
  }
  await Promise.all(promises)

  console.log(
    `[PropSight] Done: ${allResults.length}/${cards.length} extracted by rules`
  )

  for (const result of allResults) {
    injectSearchResultTags(result)
  }
  const meaningful = allResults.filter((r) => !isAllUnknown(r.tags))
  if (meaningful.length > 0) {
    saveToLocalCache(meaningful)
  }
  for (const c of cards) {
    document.getElementById(`propsight-loading-${c.id}`)?.remove()
    analysisComplete.add(c.id)
  }

  applyFilters()
}

function extractOgDescriptionFromHtml(html: string): string {
  const ogMatch =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["']/i) ??
    html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:description["']/i)
  if (ogMatch?.[1] && ogMatch[1].length > 50) {
    return ogMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
      .substring(0, 3000)
  }

  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (nextDataMatch?.[1]) {
    try {
      const data = JSON.parse(nextDataMatch[1])
      const ogDesc: string =
        data?.props?.pageProps?.data?.metadata?.metaTags?.openGraph?.description ?? ""
      if (ogDesc.length > 30) {
        return ogDesc
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 3000)
      }
    } catch {
      /* ignore parse errors */
    }
  }

  return ""
}

function findListingCards(): Element[] {
  const seenIds = new Set<string>()
  const unique: Element[] = []

  const byDataAttr = document.querySelectorAll("[data-listing-id]")
  if (byDataAttr.length > 0) {
    for (const el of Array.from(byDataAttr)) {
      const id = el.getAttribute("data-listing-id")!
      if (seenIds.has(id)) continue
      seenIds.add(id)
      const best = findBestCardElement(id)
      unique.push(best ?? el)
    }
    return unique
  }

  const selectorSets = [
    ".listing-card",
    ".listing-widget-new",
    '[class*="listingCard"]',
    '[class*="MapListingCard"]',
    '[class*="map-listing"]',
    '[class*="listing-map-card"]',
  ]
  for (const sel of selectorSets) {
    const cards = document.querySelectorAll(sel)
    if (cards.length > 0) return Array.from(cards)
  }

  const links = document.querySelectorAll('a[href*="/listing/"]')
  const seen = new Set<Element>()
  const cards: Element[] = []
  links.forEach((link) => {
    const card = link.closest(
      'div[class*="card"], div[class*="listing"], div[class*="Card"], li, article'
    )
    if (card && !seen.has(card)) {
      seen.add(card)
      cards.push(card)
    }
  })
  return cards
}

function extractCardInfo(card: Element): CardInfo | null {
  let id = card.getAttribute("data-listing-id")
  let url = ""

  const link = card.querySelector('a[href*="/listing/"]') as HTMLAnchorElement | null
  if (link) {
    url = link.href
    if (!id) id = extractListingIdFromUrl(link.href)
  }

  if (!id || !url) return null
  return { id, url, card }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LISTING DETAIL PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function injectDetailLoading(id: string): void {
  const tryInject = (): boolean => {
    if (document.getElementById("propsight-detail-loading")) return true
    const header = document.querySelector('h1, [class*="title"], [class*="listing-name"]')
    if (header?.parentElement) {
      const loader = createLoadingEl(id)
      loader.id = "propsight-detail-loading"
      header.parentElement.insertBefore(loader, header.nextSibling)
      return true
    }
    const main = document.querySelector('main, [role="main"], #__next, #root')
    if (main?.firstChild) {
      const loader = createLoadingEl(id)
      loader.id = "propsight-detail-loading"
      main.insertBefore(loader, main.firstChild)
      return true
    }
    return false
  }
  if (tryInject()) return
  for (const ms of [300, 800, 1500]) {
    setTimeout(() => {
      if (!document.getElementById("propsight-detail-loading")) tryInject()
    }, ms)
  }
}

function processDetailPage(): void {
  const id = extractListingIdFromUrl(window.location.pathname)
  if (!id) return

  getFromLocalCache([id]).then(async ({ hits }) => {
    if (hits.length > 0 && !isAllUnknown(hits[0].tags)) {
      document.querySelectorAll(".propsight-tags, .propsight-loading").forEach((el) => el.remove())
      injectDetailTags(hits[0])
      return
    }

    processedListings.add(id)
    document.querySelectorAll(".propsight-tags, .propsight-loading").forEach((el) => el.remove())

    const tryExtract = (): boolean => {
      const text = extractDetailPageText()
      if (!text || text.length < 30) return false

      const tags = extractTagsFromText(text)
      const result: ListingResult = { id, tags, cached: false }
      injectDetailTags(result)
      if (!isAllUnknown(tags)) {
        saveToLocalCache([result])
      }
      console.log(`[PropSight] Detail page ${id}: rules extracted ${countKnownFields(tags)} fields`)
      return true
    }

    if (tryExtract()) return

    injectDetailLoading(id)
    for (const ms of [500, 1500, 3000]) {
      await sleep(ms)
      if (tryExtract()) {
        document.getElementById("propsight-detail-loading")?.remove()
        return
      }
    }
    document.getElementById("propsight-detail-loading")?.remove()
    console.warn(`[PropSight] Detail page ${id}: no description found after retries`)
  })
}

function extractDetailPageText(): string {
  const ogMeta = document.querySelector('meta[property="og:description"]')?.getAttribute("content")
  if (ogMeta && ogMeta.length > 50) return ogMeta.substring(0, 3000)

  const aboutDesc = document.querySelector('.about-section .description, [da-id="description-widget"] .description')
  const aboutText = aboutDesc?.textContent?.trim() ?? ""
  if (aboutText.length > 50) return aboutText.substring(0, 3000)

  const detailsTable = document.querySelector('[da-id="property-details"]')
  const detailsText = detailsTable?.textContent?.replace(/\s+/g, " ").trim() ?? ""
  if (detailsText.length > 30) return detailsText.substring(0, 3000)

  return ""
}

function injectDetailTags(result: ListingResult): void {
  document.querySelectorAll(".propsight-tags").forEach((el) => el.remove())
  if (isAllUnknown(result.tags)) return

  const tags = tagsToDisplay(result.tags)
  if (tags.length === 0) return
  const header = document.querySelector('h1, [class*="title"], [class*="listing-name"]')
  if (header) {
    header.parentElement?.insertBefore(createTagContainer(tags), header.nextSibling)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAG INJECTION (Search page)
// ═══════════════════════════════════════════════════════════════════════════════

function removeAllPropsightElements(listingId: string): void {
  document.querySelectorAll(`[data-listing-id="${listingId}"]`).forEach((el) => {
    el.querySelectorAll(".propsight-tags").forEach((t) => t.remove())
  })
  document.getElementById(`propsight-loading-${listingId}`)?.remove()
}

function findBestCardElement(listingId: string): Element | null {
  const all = document.querySelectorAll(`[data-listing-id="${listingId}"]`)
  if (all.length === 0) {
    const link = document.querySelector(`a[href*="-${listingId}"]`)
    return link?.closest(
      'div[class*="card"], div[class*="Card"], div[class*="listing"], li, article'
    ) ?? null
  }
  if (all.length === 1) return all[0]
  let best: Element = all[0]
  for (const el of Array.from(all)) {
    if (el.contains(best)) best = el
  }
  return best
}

function injectSearchResultTags(result: ListingResult): void {
  removeAllPropsightElements(result.id)

  if (isAllUnknown(result.tags)) {
    console.log(`[PropSight] ${result.id}: all unknown, skip display`)
    return
  }

  const tags = tagsToDisplay(result.tags)
  if (tags.length === 0) {
    console.log(`[PropSight] ${result.id}: tagsToDisplay empty, skip`)
    return
  }

  const card = findBestCardElement(result.id)
  if (!card) {
    console.warn(`[PropSight] ${result.id}: card element not found in DOM`)
    return
  }

  if (!card.hasAttribute("data-listing-id")) {
    card.setAttribute("data-listing-id", result.id)
  }

  const compact = isMapViewPage()
  card.appendChild(createTagContainer(tags, compact))
  console.log(`[PropSight] ${result.id}: injected ${tags.length} tags${compact ? " (compact)" : ""}`)
}
