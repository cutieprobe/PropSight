from enum import Enum
from typing import Optional

from pydantic import BaseModel


# ── Tag Enums ──────────────────────────────────────────────────────────────────


class CookingPolicy(str, Enum):
    HEAVY_COOKING_OK = "heavy_cooking_ok"
    LIGHT_COOKING_ONLY = "light_cooking_only"
    NO_COOKING = "no_cooking"
    UNKNOWN = "unknown"


class OwnerOccupancy(str, Enum):
    OWNER_STAYS = "owner_stays"
    OWNER_NOT_STAYING = "owner_not_staying"
    UNKNOWN = "unknown"


class AllowanceStatus(str, Enum):
    ALLOWED = "allowed"
    NOT_ALLOWED = "not_allowed"
    UNKNOWN = "unknown"


class RoomType(str, Enum):
    MASTER_ROOM = "master_room"
    COMMON_ROOM = "common_room"
    STUDIO = "studio"
    WHOLE_UNIT = "whole_unit"
    PARTITION = "partition"
    UNKNOWN = "unknown"


class BathroomType(str, Enum):
    PRIVATE = "private"
    SHARED = "shared"
    UNKNOWN = "unknown"


class AgentFee(str, Enum):
    NO_AGENT_FEE = "no_agent_fee"
    HAS_AGENT_FEE = "has_agent_fee"
    HALF_MONTH = "half_month"
    UNKNOWN = "unknown"


class GenderPreference(str, Enum):
    MALE_ONLY = "male_only"
    FEMALE_ONLY = "female_only"
    COUPLES_OK = "couples_ok"
    ANY = "any"
    UNKNOWN = "unknown"


class VisitorPolicy(str, Enum):
    ALLOWED = "allowed"
    RESTRICTED = "restricted"
    NOT_ALLOWED = "not_allowed"
    UNKNOWN = "unknown"


# ── Tag Model ──────────────────────────────────────────────────────────────────


class ListingTags(BaseModel):
    cooking_policy: CookingPolicy = CookingPolicy.UNKNOWN
    owner_occupancy: OwnerOccupancy = OwnerOccupancy.UNKNOWN
    address_registration: AllowanceStatus = AllowanceStatus.UNKNOWN
    room_type: RoomType = RoomType.UNKNOWN
    bathroom: BathroomType = BathroomType.UNKNOWN
    agent_fee: AgentFee = AgentFee.UNKNOWN
    lease_term_months: Optional[int] = None
    gender_preference: GenderPreference = GenderPreference.UNKNOWN
    visitor_policy: VisitorPolicy = VisitorPolicy.UNKNOWN
    additional_flags: list[str] = []

    def is_all_unknown(self) -> bool:
        """Return True if every field is at its default/unknown value.

        This indicates a failed analysis (e.g. rate-limited or errored)
        and such results should NOT be cached.
        """
        return (
            self.cooking_policy == CookingPolicy.UNKNOWN
            and self.owner_occupancy == OwnerOccupancy.UNKNOWN
            and self.address_registration == AllowanceStatus.UNKNOWN
            and self.room_type == RoomType.UNKNOWN
            and self.bathroom == BathroomType.UNKNOWN
            and self.agent_fee == AgentFee.UNKNOWN
            and self.lease_term_months is None
            and self.gender_preference == GenderPreference.UNKNOWN
            and self.visitor_policy == VisitorPolicy.UNKNOWN
            and len(self.additional_flags) == 0
        )


# ── API Request / Response ─────────────────────────────────────────────────────


class ListingInput(BaseModel):
    id: str
    text: str


class AnalyzeRequest(BaseModel):
    listings: list[ListingInput]


class ListingResult(BaseModel):
    id: str
    tags: ListingTags
    cached: bool = False


class AnalyzeResponse(BaseModel):
    results: list[ListingResult]
