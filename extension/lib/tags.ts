import type { ListingTags, TagDisplay } from "./types"

// ── Condo-level amenity filter (safety net) ───────────────────────────────────
// These are development/condo features that PropertyGuru already displays.
// We only want unit-specific tags from PropSight.
const CONDO_AMENITY_KEYWORDS = [
  "swimming pool", "pool", "gymnasium", "gym", "bbq", "barbeque",
  "jacuzzi", "tennis", "playground", "function room", "clubhouse",
  "sauna", "car park", "parking", "shuttle bus", "covered walkway",
  "24 hour", "24-hour", "24h", "security", "guard",
  "near mrt", "near school", "near mall", "near shopping",
  "near bus", "near highway", "mrt station",
  "badminton", "basketball", "squash", "jogging",
  "multi-purpose", "multipurpose",
]

function isCondoAmenity(flag: string): boolean {
  const lower = flag.toLowerCase()
  return CONDO_AMENITY_KEYWORDS.some((kw) => lower.includes(kw))
}

// ── Map raw tags → display pills ──────────────────────────────────────────────
//
// Priority order (most important first):
// 1. Cooking policy      — deal-breaker for many tenants
// 2. Owner occupancy     — major quality-of-life factor
// 3. Address registration — critical for work pass holders
// 4. Visitor policy       — lifestyle restriction
// 5. Agent fee            — cost factor
// 6. Room type            — basic info
// 7. Bathroom             — basic info
// 8. Lease term           — contract info
// 9. Gender preference    — restriction
// 10. Additional flags    — extra insights
//
// Colors:
//   🔴 red    = negative / restriction / deal-breaker
//   🟢 green  = positive / benefit
//   🟡 yellow = caution / conditional
//   🔵 blue   = neutral info

export function tagsToDisplay(tags: ListingTags): TagDisplay[] {
  const display: TagDisplay[] = []

  // ── 1. Cooking policy (MOST IMPORTANT) ──
  if (tags.cooking_policy === "heavy_cooking_ok") {
    display.push({ label: "🍳 Heavy Cooking OK", color: "green" })
  } else if (tags.cooking_policy === "light_cooking_only") {
    display.push({ label: "🥗 Light Cooking Only", color: "yellow" })
  } else if (tags.cooking_policy === "no_cooking") {
    display.push({ label: "🚫 No Cooking", color: "red" })
  }

  // ── 2. Owner occupancy (MOST IMPORTANT) ──
  if (tags.owner_occupancy === "owner_stays") {
    display.push({ label: "👤 Landlord Lives In", color: "red" })
  } else if (tags.owner_occupancy === "owner_not_staying") {
    display.push({ label: "🏠 No Landlord", color: "green" })
  }

  // ── 3. Address registration ──
  if (tags.address_registration === "allowed") {
    display.push({ label: "📍 Address Reg OK", color: "green" })
  } else if (tags.address_registration === "not_allowed") {
    display.push({ label: "⛔ No Address Reg", color: "red" })
  }

  // ── 4. Visitor policy ──
  if (tags.visitor_policy === "not_allowed") {
    display.push({ label: "🚷 No Visitors", color: "red" })
  } else if (tags.visitor_policy === "restricted") {
    display.push({ label: "⏰ Visitor Restrictions", color: "yellow" })
  }

  // ── 5. Agent fee ──
  if (tags.agent_fee === "no_agent_fee") {
    display.push({ label: "💰 No Agent Fee", color: "green" })
  } else if (tags.agent_fee === "has_agent_fee") {
    display.push({ label: "💸 Agent Fee", color: "yellow" })
  }

  // ── 6. Room type ──
  if (tags.room_type === "partition") {
    display.push({ label: "⚠️ Partition Room", color: "red" })
  } else if (tags.room_type !== "unknown") {
    const roomLabels: Record<string, string> = {
      master_room: "🛏️ Master Room",
      common_room: "🛏️ Common Room",
      studio: "🏢 Studio",
      whole_unit: "🏠 Whole Unit",
    }
    if (roomLabels[tags.room_type]) {
      display.push({ label: roomLabels[tags.room_type], color: "blue" })
    }
  }

  // ── 7. Bathroom ──
  if (tags.bathroom === "private") {
    display.push({ label: "🚿 Private Bath", color: "green" })
  } else if (tags.bathroom === "shared") {
    display.push({ label: "🚿 Shared Bath", color: "blue" })
  }

  // ── 8. Lease term ──
  if (tags.lease_term_months !== null && tags.lease_term_months !== undefined && tags.lease_term_months > 0) {
    display.push({
      label: `📅 ${tags.lease_term_months}mo Lease`,
      color: "blue",
    })
  }

  // ── 9. Gender preference ──
  if (tags.gender_preference === "male_only") {
    display.push({ label: "♂️ Males Only", color: "yellow" })
  } else if (tags.gender_preference === "female_only") {
    display.push({ label: "♀️ Females Only", color: "yellow" })
  }

  // ── 10. Additional flags (dynamic, unit-level only) ──
  if (tags.additional_flags && Array.isArray(tags.additional_flags)) {
    for (const flag of tags.additional_flags) {
      if (flag && flag.length > 0 && !isCondoAmenity(flag)) {
        display.push({ label: `ℹ️ ${flag}`, color: "blue" })
      }
    }
  }

  return display
}

// ── DOM element factories ─────────────────────────────────────────────────────

export function createTagElement(tag: TagDisplay): HTMLElement {
  const el = document.createElement("span")
  el.className = `propsight-tag propsight-tag--${tag.color}`
  el.textContent = tag.label
  el.title = tag.label
  return el
}

export function createTagContainer(tags: TagDisplay[], compact = false): HTMLElement {
  const container = document.createElement("div")
  container.className = compact ? "propsight-tags propsight-tags--compact" : "propsight-tags"
  tags.forEach((tag) => container.appendChild(createTagElement(tag)))
  return container
}

export function createLoadingEl(listingId: string): HTMLElement {
  const wrapper = document.createElement("div")
  wrapper.className = "propsight-tags propsight-loading-wrapper"
  wrapper.id = `propsight-loading-${listingId}`

  const el = document.createElement("span")
  el.className = "propsight-loading"
  el.textContent = "Analyzing\u2026"
  wrapper.appendChild(el)

  return wrapper
}

// ── Inject stylesheet ─────────────────────────────────────────────────────────

export function injectStyles(): void {
  if (document.getElementById("propsight-styles")) return

  const style = document.createElement("style")
  style.id = "propsight-styles"
  style.textContent = `
    .propsight-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 6px 0;
      align-items: center;
    }
    .propsight-tags::before {
      content: '🔍 PropSight';
      font-size: 10px;
      color: #6B7280;
      font-weight: 600;
      margin-right: 4px;
      opacity: 0.7;
    }
    .propsight-tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.4;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    /* 🔴 Red = negative / restriction */
    .propsight-tag--red {
      background: #FEE2E2;
      color: #DC2626;
      border: 1px solid #FECACA;
    }
    /* 🟢 Green = positive / benefit */
    .propsight-tag--green {
      background: #DCFCE7;
      color: #16A34A;
      border: 1px solid #BBF7D0;
    }
    /* 🟡 Yellow = caution / conditional */
    .propsight-tag--yellow {
      background: #FEF3C7;
      color: #D97706;
      border: 1px solid #FDE68A;
    }
    /* 🔵 Blue = neutral info */
    .propsight-tag--blue {
      background: #DBEAFE;
      color: #2563EB;
      border: 1px solid #BFDBFE;
    }
    .propsight-loading-wrapper {
      /* inherits propsight-tags flex layout, so it looks like a tag row */
    }
    .propsight-loading {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      font-size: 11px;
      color: #9CA3AF;
      font-style: italic;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .propsight-loading::before {
      content: '';
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid #E5E7EB;
      border-top-color: #6366F1;
      border-radius: 50%;
      animation: propsight-spin 0.8s linear infinite;
      margin-right: 6px;
      flex-shrink: 0;
    }
    @keyframes propsight-spin {
      to { transform: rotate(360deg); }
    }
    /* Compact layout for map-view sidebar cards */
    .propsight-tags--compact {
      gap: 3px;
      padding: 4px 0;
    }
    .propsight-tags--compact::before {
      font-size: 9px;
      margin-right: 2px;
    }
    .propsight-tags--compact .propsight-tag {
      padding: 1px 5px;
      font-size: 10px;
      border-radius: 8px;
    }
  `
  document.head.appendChild(style)
}
