import type { FilterState, FilterableKey, ListingTags } from "./types"
import { DEFAULT_FILTER_STATE, FILTER_DIMENSIONS } from "./types"
import { getAllEntries, subscribe } from "./tag-store"

const STORAGE_KEY = "propsight_filters"
const PANEL_ID = "propsight-filter-panel"
const HIDDEN_CLASS = "propsight-filtered-out"

let state: FilterState = { ...DEFAULT_FILTER_STATE }
let panelEl: HTMLElement | null = null
let counterEl: HTMLElement | null = null
let collapsed = false

// ── Persistence ──────────────────────────────────────────────────────────────

async function loadState(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      const saved = data[STORAGE_KEY] as FilterState | undefined
      if (saved) state = { ...DEFAULT_FILTER_STATE, ...saved }
      resolve()
    })
  })
}

function saveState(): void {
  chrome.storage.local.set({ [STORAGE_KEY]: state })
}

// ── Filter logic ─────────────────────────────────────────────────────────────

function cardMatchesFilter(tags: ListingTags): boolean {
  for (const dim of FILTER_DIMENSIONS) {
    const filterVal = state[dim.key]
    if (filterVal === "all") continue

    const tagVal = tags[dim.key] as string
    if (tagVal !== filterVal) return false
  }

  if (state.hide_unknown) {
    const allUnknown = FILTER_DIMENSIONS.every(
      (dim) => (tags[dim.key] as string) === "unknown"
    )
    if (allUnknown) return false
  }

  return true
}

function isFilterActive(): boolean {
  if (state.hide_unknown) return true
  for (const dim of FILTER_DIMENSIONS) {
    if (state[dim.key] !== "all") return true
  }
  return false
}

/**
 * Walk up from the card element to find the actual layout unit —
 * the nearest ancestor whose parent is a flex/grid container.
 * That ancestor is the flex/grid item that controls the slot in the layout.
 */
function getFilterTarget(el: HTMLElement): HTMLElement {
  let current: HTMLElement = el
  for (let i = 0; i < 10; i++) {
    if (current.tagName === "LI") return current

    const parent = current.parentElement
    if (!parent || parent === document.body) break

    const display = getComputedStyle(parent).display
    if (display.includes("grid") || display.includes("flex")) {
      return current
    }

    current = parent
  }
  return el
}

export function applyFilters(): void {
  const entries = getAllEntries()
  let visible = 0
  let total = 0

  entries.forEach(({ tags, el }) => {
    total++
    const match = cardMatchesFilter(tags)
    const target = getFilterTarget(el)

    if (match) {
      target.classList.remove(HIDDEN_CLASS)
      visible++
    } else {
      target.classList.add(HIDDEN_CLASS)
    }
  })

  if (counterEl) {
    if (isFilterActive()) {
      counterEl.textContent = `${visible} / ${total}`
    } else {
      counterEl.textContent = `${total} listings`
    }
  }
}

// ── UI construction ──────────────────────────────────────────────────────────

function buildPanel(): HTMLElement {
  const panel = document.createElement("div")
  panel.id = PANEL_ID

  const header = document.createElement("div")
  header.className = "psf-header"

  const title = document.createElement("span")
  title.className = "psf-title"
  title.textContent = "🔍 PropSight Filter"
  header.appendChild(title)

  counterEl = document.createElement("span")
  counterEl.className = "psf-counter"
  header.appendChild(counterEl)

  const collapseBtn = document.createElement("button")
  collapseBtn.className = "psf-collapse-btn"
  collapseBtn.textContent = "−"
  collapseBtn.title = "Collapse"
  collapseBtn.addEventListener("click", () => toggleCollapse())
  header.appendChild(collapseBtn)

  panel.appendChild(header)

  const body = document.createElement("div")
  body.className = "psf-body"

  const grid = document.createElement("div")
  grid.className = "psf-grid"

  for (const dim of FILTER_DIMENSIONS) {
    const group = document.createElement("div")
    group.className = "psf-group"

    const label = document.createElement("label")
    label.className = "psf-label"
    label.textContent = dim.label

    const select = document.createElement("select")
    select.className = "psf-select"
    select.dataset.key = dim.key

    for (const opt of dim.options) {
      const option = document.createElement("option")
      option.value = opt.value
      option.textContent = opt.label
      if (state[dim.key] === opt.value) option.selected = true
      select.appendChild(option)
    }

    select.addEventListener("change", () => {
      state[dim.key as FilterableKey] = select.value
      syncSelectHighlight(select)
      saveState()
      applyFilters()
    })
    syncSelectHighlight(select)

    group.appendChild(label)
    group.appendChild(select)
    grid.appendChild(group)
  }

  body.appendChild(grid)

  const toggleRow = document.createElement("div")
  toggleRow.className = "psf-toggle-row"

  const checkbox = document.createElement("input")
  checkbox.type = "checkbox"
  checkbox.id = "psf-hide-unknown"
  checkbox.checked = state.hide_unknown
  checkbox.addEventListener("change", () => {
    state.hide_unknown = checkbox.checked
    saveState()
    applyFilters()
  })

  const toggleLabel = document.createElement("label")
  toggleLabel.htmlFor = "psf-hide-unknown"
  toggleLabel.textContent = "Hide unanalyzed"

  toggleRow.appendChild(checkbox)
  toggleRow.appendChild(toggleLabel)
  body.appendChild(toggleRow)

  const clearBtn = document.createElement("button")
  clearBtn.className = "psf-clear-btn"
  clearBtn.textContent = "Clear Filters"
  clearBtn.addEventListener("click", () => {
    state = { ...DEFAULT_FILTER_STATE }
    saveState()
    syncAllControls()
    applyFilters()
  })
  body.appendChild(clearBtn)

  panel.appendChild(body)
  return panel
}

function syncSelectHighlight(select: HTMLSelectElement): void {
  if (select.value !== "all") {
    select.classList.add("psf-select--active")
  } else {
    select.classList.remove("psf-select--active")
  }
}

function syncAllControls(): void {
  if (!panelEl) return
  const selects = panelEl.querySelectorAll<HTMLSelectElement>(".psf-select")
  selects.forEach((sel) => {
    const key = sel.dataset.key as FilterableKey
    if (key) {
      sel.value = state[key]
      syncSelectHighlight(sel)
    }
  })
  const cb = panelEl.querySelector<HTMLInputElement>("#psf-hide-unknown")
  if (cb) cb.checked = state.hide_unknown
}

function toggleCollapse(): void {
  collapsed = !collapsed
  if (!panelEl) return
  const body = panelEl.querySelector(".psf-body") as HTMLElement | null
  const btn = panelEl.querySelector(".psf-collapse-btn") as HTMLElement | null
  if (body) body.style.display = collapsed ? "none" : ""
  if (btn) btn.textContent = collapsed ? "+" : "−"
}

// ── Styles ───────────────────────────────────────────────────────────────────

function injectFilterStyles(): void {
  if (document.getElementById("propsight-filter-styles")) return

  const css = document.createElement("style")
  css.id = "propsight-filter-styles"
  css.textContent = `
    .${HIDDEN_CLASS} {
      display: none !important;
    }
    #${PANEL_ID} {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 99999;
      width: 320px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      color: #1F2937;
      overflow: hidden;
      transition: opacity 0.15s;
    }
    .psf-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: #4F46E5;
      color: #FFFFFF;
      cursor: default;
      user-select: none;
    }
    .psf-title {
      font-weight: 700;
      font-size: 13px;
      flex: 1;
    }
    .psf-counter {
      font-size: 11px;
      font-weight: 600;
      opacity: 0.9;
      background: rgba(255,255,255,0.2);
      padding: 1px 8px;
      border-radius: 10px;
    }
    .psf-collapse-btn {
      background: none;
      border: none;
      color: #FFFFFF;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 0 2px;
      opacity: 0.8;
    }
    .psf-collapse-btn:hover { opacity: 1; }
    .psf-body {
      padding: 12px 14px;
    }
    .psf-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .psf-group {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .psf-label {
      font-size: 10px;
      font-weight: 600;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .psf-select {
      appearance: none;
      -webkit-appearance: none;
      padding: 5px 24px 5px 8px;
      border: 1px solid #D1D5DB;
      border-radius: 6px;
      background: #F9FAFB url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236B7280'/%3E%3C/svg%3E") no-repeat right 8px center;
      font-size: 12px;
      color: #374151;
      cursor: pointer;
      transition: border-color 0.15s;
      font-family: inherit;
    }
    .psf-select:focus {
      outline: none;
      border-color: #4F46E5;
      box-shadow: 0 0 0 2px rgba(79,70,229,0.15);
    }
    .psf-select--active {
      border-color: #4F46E5;
      background-color: #EEF2FF;
      color: #4338CA;
      font-weight: 600;
    }
    .psf-toggle-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #F3F4F6;
    }
    .psf-toggle-row input[type="checkbox"] {
      accent-color: #4F46E5;
      width: 14px;
      height: 14px;
      cursor: pointer;
    }
    .psf-toggle-row label {
      font-size: 12px;
      color: #374151;
      cursor: pointer;
    }
    .psf-clear-btn {
      display: block;
      width: 100%;
      margin-top: 10px;
      padding: 6px 0;
      background: none;
      border: 1px solid #D1D5DB;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      color: #6B7280;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
    }
    .psf-clear-btn:hover {
      background: #F3F4F6;
      color: #374151;
    }
  `
  document.head.appendChild(css)
}

// ── Init ─────────────────────────────────────────────────────────────────────

export async function initFilterPanel(): Promise<void> {
  injectFilterStyles()
  await loadState()

  panelEl = buildPanel()
  document.body.appendChild(panelEl)

  subscribe(() => applyFilters())

  applyFilters()
}
