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
