import type { ListingTags } from "./types"

type Rule<T extends string> = [RegExp, T]

function firstMatch<T extends string>(text: string, rules: Rule<T>[]): T | null {
  for (const [re, val] of rules) {
    if (re.test(text)) return val
  }
  return null
}

const COOKING_RULES: Rule<ListingTags["cooking_policy"]>[] = [
  [/\bno\s*cook(ing)?\b/i, "no_cooking"],
  [/\bcooking\s*(is\s*)?(not|never)\s*allow/i, "no_cooking"],
  [/\bstrictly\s*no\s*cook/i, "no_cooking"],
  [/\bnot\s*allow(ed)?\s*to\s*cook/i, "no_cooking"],
  [/\blight\s*cook(ing)?\s*(only)?\b/i, "light_cooking_only"],
  [/\bsimple\s*cook(ing)?\b/i, "light_cooking_only"],
  [/\bcook(ing)?\s*(is\s*)?allow(ed)?\b/i, "heavy_cooking_ok"],
  [/\bheavy\s*cook(ing)?\b/i, "heavy_cooking_ok"],
  [/\bcan\s*cook\b/i, "heavy_cooking_ok"],
  [/\bfree\s*to\s*cook\b/i, "heavy_cooking_ok"],
]

const OWNER_RULES: Rule<ListingTags["owner_occupancy"]>[] = [
  [/\bowner\s*(is\s*)?(not|doesn'?t|wont|won'?t|never)\s*stay/i, "owner_not_staying"],
  [/\bowner\s*(is\s*)?overseas\b/i, "owner_not_staying"],
  [/\bwithout\s*owner\b/i, "owner_not_staying"],
  [/\bno\s*(live[\s-]*in\s*)?(?:owner|landlord)\b/i, "owner_not_staying"],
  [/\bowner\s*(is\s*)?(stay|liv|resid|occupy)/i, "owner_stays"],
  [/\b(live[\s-]*in|staying)\s*(owner|landlord)\b/i, "owner_stays"],
  [/\blandlord\s*(is\s*)?(stay|liv|resid)/i, "owner_stays"],
]

const ROOM_RULES: Rule<ListingTags["room_type"]>[] = [
  [/\bmaster\s*(bed)?room\b/i, "master_room"],
  [/\bmaster\s*bed\b/i, "master_room"],
  [/\bcommon\s*room\b/i, "common_room"],
  [/\bsingle\s*room\b/i, "common_room"],
  [/\bspare\s*room\b/i, "common_room"],
  [/\bstudio\b/i, "studio"],
  [/\bwhole\s*unit\b/i, "whole_unit"],
  [/\bentire\s*(unit|apartment|flat|house)\b/i, "whole_unit"],
  [/\bfull\s*unit\b/i, "whole_unit"],
  [/\bpartition(ed)?\b/i, "partition"],
]

const BATHROOM_RULES: Rule<ListingTags["bathroom"]>[] = [
  [/\b(attached|private|own|ensuite|en[\s-]*suite)\s*(bath|toilet|washroom|shower)/i, "private"],
  [/\b(bath|toilet|washroom)\s*(is\s*)?(attached|private|ensuite)/i, "private"],
  [/\b(shared?|common|sharing)\s*(bath|toilet|washroom|shower)/i, "shared"],
  [/\b(bath|toilet|washroom)\s*(is\s*)?(shared?|common)/i, "shared"],
]

const AGENT_RULES: Rule<ListingTags["agent_fee"]>[] = [
  [/\bno\s*(agent|agency)\s*(fee|commission)\b/i, "no_agent_fee"],
  [/\b(agent|agency)\s*(fee|commission)\s*:?\s*(no|zero|nil|none|free|waive)/i, "no_agent_fee"],
  [/\bzero\s*(agent|agency|commission)\b/i, "no_agent_fee"],
  [/\bdirect\s*(from\s*)?owner\b/i, "no_agent_fee"],
  [/\bowner\s*direct\b/i, "no_agent_fee"],
  [/\b(half|0\.?5)\s*month\s*(agent|commission|fee)/i, "half_month"],
  [/\b(agent|agency)\s*(fee|commission)\s*:?\s*(half|0\.?5)\s*month/i, "half_month"],
]

const GENDER_RULES: Rule<ListingTags["gender_preference"]>[] = [
  [/\b(female|ladies|lady|girl|woman|women)\s*only\b/i, "female_only"],
  [/\bonly\s*(female|ladies|lady|girl|woman|women)\b/i, "female_only"],
  [/\bprefer(red|ably)?\s*(female|ladies|lady|girl|women)\b/i, "female_only"],
  [/\b(male|guys?|gentlem[ae]n|boy|men|man)\s*only\b/i, "male_only"],
  [/\bonly\s*(male|guys?|gentlem[ae]n|boy|men|man)\b/i, "male_only"],
  [/\bprefer(red|ably)?\s*(male|guys?|men|man)\b/i, "male_only"],
  [/\bcouples?\s*(ok|welcome|accepted|allowed)\b/i, "couples_ok"],
  [/\b(accept|allow|welcome)\s*couples?\b/i, "couples_ok"],
  [/\bany\s*gender\b/i, "any"],
  [/\b(no|without)\s*gender\s*pref/i, "any"],
  [/\ball\s*(are\s*)?welcome\b/i, "any"],
]

const ADDR_RULES: Rule<ListingTags["address_registration"]>[] = [
  [/\b(no|cannot|can'?t|not)\s*(address|addr)\s*reg/i, "not_allowed"],
  [/\b(address|addr)\s*reg(istration)?\s*(is\s*)?(not|no)\s*(allowed|available|possible)/i, "not_allowed"],
  [/\b(address|addr)\s*reg(istration)?\s*(allowed|available|ok|yes|possible|can)/i, "allowed"],
  [/\b(can|allow(ed)?)\s*(to\s*)?(register|reg)\s*(address|addr)/i, "allowed"],
  [/\baddress\s*registration\b/i, "allowed"],
]

const VISITOR_RULES: Rule<ListingTags["visitor_policy"]>[] = [
  [/\bno\s*(visitor|guest|overnight)/i, "not_allowed"],
  [/\b(visitor|guest)(s)?\s*(is\s*)?(not|never)\s*allow/i, "not_allowed"],
  [/\b(visitor|guest)(s)?\s*(is\s*)?(allowed|welcome|ok)\b/i, "allowed"],
  [/\b(allow|welcome)\s*(visitor|guest)/i, "allowed"],
  [/\b(limit|restrict)(ed)?\s*(visitor|guest)/i, "restricted"],
  [/\b(visitor|guest)(s)?\s*(with\s*)?(prior|advance)\s*(approval|notice|permission)/i, "restricted"],
]

const LEASE_PATTERNS: [RegExp, (m: RegExpMatchArray) => number][] = [
  [/\b(\d{1,2})\s*(months?|mths?)\b/i, (m) => parseInt(m[1])],
  [/\bmin(imum)?\s*(\d{1,2})\s*(months?|mths?|m)\b/i, (m) => parseInt(m[2])],
  [/\b(\d{1,2})\s*(months?|mths?)\s*(min|minimum|lease)/i, (m) => parseInt(m[1])],
  [/\b(\d)\s*year(s)?\b/i, (m) => parseInt(m[1]) * 12],
  [/\bmin(imum)?\s*(\d)\s*year/i, (m) => parseInt(m[2]) * 12],
]

const FLAG_PATTERNS: [RegExp, string][] = [
  [/\b(aircon|air[\s-]*con(ditioning?)?|a\/c)\b/i, "aircon"],
  [/\b(wifi|wi[\s-]*fi|internet|broadband)\b/i, "wifi included"],
  [/\bfully\s*furnish/i, "fully furnished"],
  [/\bpartially\s*furnish/i, "partially furnished"],
  [/\b(furnished|furnish)\b/i, "furnished"],
  [/\bhigh\s*floor\b/i, "high floor"],
  [/\blow\s*floor\b/i, "low floor"],
  [/\b(newly\s*)?renovat(ed|ion)\b/i, "newly renovated"],
  [/\bno\s*pets?\b/i, "no pets"],
  [/\bpets?\s*(allowed|welcome|ok|friendly)\b/i, "pets allowed"],
  [/\bnear\s*(mrt|train|subway)\b/i, "near MRT"],
  [/\butilities?\s*(included|incl)/i, "utilities included"],
  [/\b(patio|balcony)\b/i, "balcony"],
  [/\bwash(ing)?\s*machine\b/i, "washing machine"],
  [/\bdryer\b/i, "dryer"],
  [/\bcleaning\s*(service|included)/i, "cleaning included"],
  [/\b(gym|swimming\s*pool|pool)\s*(access|available|included)?\b/i, "gym/pool"],
]

function extractLeaseTerm(text: string): number | null {
  for (const [re, extract] of LEASE_PATTERNS) {
    const m = text.match(re)
    if (m) {
      const months = extract(m)
      if (months > 0 && months <= 60) return months
    }
  }
  return null
}

function extractFlags(text: string): string[] {
  const seen = new Set<string>()
  const flags: string[] = []
  for (const [re, label] of FLAG_PATTERNS) {
    if (re.test(text) && !seen.has(label)) {
      if (label === "furnished" && (seen.has("fully furnished") || seen.has("partially furnished"))) {
        continue
      }
      seen.add(label)
      flags.push(label)
    }
  }
  return flags
}

export function extractTagsFromText(text: string): ListingTags {
  const t = text.replace(/\s+/g, " ")

  return {
    cooking_policy: firstMatch(t, COOKING_RULES) ?? "unknown",
    owner_occupancy: firstMatch(t, OWNER_RULES) ?? "unknown",
    room_type: firstMatch(t, ROOM_RULES) ?? "unknown",
    bathroom: firstMatch(t, BATHROOM_RULES) ?? "unknown",
    agent_fee: firstMatch(t, AGENT_RULES) ?? "unknown",
    gender_preference: firstMatch(t, GENDER_RULES) ?? "unknown",
    address_registration: firstMatch(t, ADDR_RULES) ?? "unknown",
    visitor_policy: firstMatch(t, VISITOR_RULES) ?? "unknown",
    lease_term_months: extractLeaseTerm(t),
    additional_flags: extractFlags(t),
  }
}
