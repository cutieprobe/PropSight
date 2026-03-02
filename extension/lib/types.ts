// ── Tag types (mirror backend models) ─────────────────────────────────────────

export interface ListingTags {
  cooking_policy:
    | "heavy_cooking_ok"
    | "light_cooking_only"
    | "no_cooking"
    | "unknown"
  owner_occupancy: "owner_stays" | "owner_not_staying" | "unknown"
  address_registration: "allowed" | "not_allowed" | "unknown"
  room_type:
    | "master_room"
    | "common_room"
    | "studio"
    | "whole_unit"
    | "partition"
    | "unknown"
  bathroom: "private" | "shared" | "unknown"
  agent_fee: "no_agent_fee" | "has_agent_fee" | "half_month" | "unknown"
  lease_term_months: number | null
  gender_preference:
    | "male_only"
    | "female_only"
    | "couples_ok"
    | "any"
    | "unknown"
  visitor_policy: "allowed" | "restricted" | "not_allowed" | "unknown"
  additional_flags: string[]
}

export function isAllUnknown(tags: ListingTags): boolean {
  return (
    tags.cooking_policy === "unknown" &&
    tags.owner_occupancy === "unknown" &&
    tags.address_registration === "unknown" &&
    tags.room_type === "unknown" &&
    tags.bathroom === "unknown" &&
    tags.agent_fee === "unknown" &&
    tags.lease_term_months == null &&
    tags.gender_preference === "unknown" &&
    tags.visitor_policy === "unknown" &&
    (!tags.additional_flags || tags.additional_flags.length === 0)
  )
}

export interface ListingResult {
  id: string
  tags: ListingTags
  cached: boolean
}

export interface TagDisplay {
  label: string
  color: "red" | "green" | "yellow" | "blue"
}

// ── Filter types (Phase 2a) ──────────────────────────────────────────────────

export type FilterableKey =
  | "cooking_policy"
  | "owner_occupancy"
  | "bathroom"
  | "room_type"
  | "address_registration"
  | "gender_preference"
  | "visitor_policy"

export interface FilterState {
  cooking_policy: string
  owner_occupancy: string
  bathroom: string
  room_type: string
  address_registration: string
  gender_preference: string
  visitor_policy: string
  hide_unknown: boolean
}

export const DEFAULT_FILTER_STATE: FilterState = {
  cooking_policy: "all",
  owner_occupancy: "all",
  bathroom: "all",
  room_type: "all",
  address_registration: "all",
  gender_preference: "all",
  visitor_policy: "all",
  hide_unknown: false,
}

export interface FilterDimension {
  key: FilterableKey
  label: string
  options: { value: string; label: string }[]
}

export const FILTER_DIMENSIONS: FilterDimension[] = [
  {
    key: "cooking_policy",
    label: "Cooking",
    options: [
      { value: "all", label: "All" },
      { value: "heavy_cooking_ok", label: "Heavy OK" },
      { value: "light_cooking_only", label: "Light Only" },
      { value: "no_cooking", label: "No Cooking" },
    ],
  },
  {
    key: "owner_occupancy",
    label: "Owner",
    options: [
      { value: "all", label: "All" },
      { value: "owner_not_staying", label: "No Landlord" },
      { value: "owner_stays", label: "Lives In" },
    ],
  },
  {
    key: "bathroom",
    label: "Bathroom",
    options: [
      { value: "all", label: "All" },
      { value: "private", label: "Private" },
      { value: "shared", label: "Shared" },
    ],
  },
  {
    key: "room_type",
    label: "Room",
    options: [
      { value: "all", label: "All" },
      { value: "master_room", label: "Master" },
      { value: "common_room", label: "Common" },
      { value: "studio", label: "Studio" },
      { value: "whole_unit", label: "Whole Unit" },
    ],
  },
  {
    key: "address_registration",
    label: "Addr Reg",
    options: [
      { value: "all", label: "All" },
      { value: "allowed", label: "Allowed" },
      { value: "not_allowed", label: "Not Allowed" },
    ],
  },
  {
    key: "gender_preference",
    label: "Gender",
    options: [
      { value: "all", label: "All" },
      { value: "any", label: "Any Gender" },
      { value: "male_only", label: "Male Only" },
      { value: "female_only", label: "Female Only" },
      { value: "couples_ok", label: "Couples OK" },
    ],
  },
  {
    key: "visitor_policy",
    label: "Visitors",
    options: [
      { value: "all", label: "All" },
      { value: "allowed", label: "Allowed" },
      { value: "restricted", label: "Restricted" },
      { value: "not_allowed", label: "Not Allowed" },
    ],
  },
]
