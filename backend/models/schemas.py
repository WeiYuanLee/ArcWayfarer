from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator

Transport = Literal["lockdown", "rsd"]
DeviceConnectionType = Literal["usb", "wifi", "unknown"]
DeviceStatus = Literal["ready", "mounting", "tunnel_required", "error"]


class DeviceInfo(BaseModel):
    udid: str
    name: str
    ios_version: str
    transport: Transport
    # The physical path used to discover the device. This is intentionally
    # separate from ``transport``, which selects the location-service API.
    connection_type: DeviceConnectionType = "unknown"
    status: DeviceStatus
    detail: Optional[str] = None


class SetLocationRequest(BaseModel):
    udid: str
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)


class ClearLocationRequest(BaseModel):
    udid: str


class GoldDittoRequest(BaseModel):
    udid: str
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)


class LatLng(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)


NavMode = Literal["walk", "bike", "drive"]


class NavigateStartRequest(BaseModel):
    udid: str
    nav_mode: NavMode
    start: LatLng
    end: LatLng
    custom_speed_kmh: Optional[float] = None


class NavigatePreviewRequest(BaseModel):
    nav_mode: NavMode
    start: LatLng
    end: LatLng


class NavigateStopRequest(BaseModel):
    udid: str


class RouteLoopStartRequest(BaseModel):
    udid: str
    nav_mode: NavMode
    waypoints: list[LatLng]
    pause_enabled: bool = False
    pause_min: float = 5.0
    pause_max: float = 20.0
    straight_line: bool = False
    # Leg indexes whose endpoint is reached by an instantaneous jump rather
    # than interpolation/routing.  The last index may jump back to waypoint 0.
    jump_leg_indices: list[int] = Field(default_factory=list)
    custom_speed_kmh: Optional[float] = None


class FlowerOptions(BaseModel):
    radius_m: float = Field(30.0, ge=5.0, le=100.0)
    circles: float = Field(1.0, ge=0.5, le=10.0)
    segments: int = Field(8, ge=4, le=64)
    # Center spiral is the safe default: it crosses the flower center and
    # changes radius between rings instead of replaying one perimeter.
    path_strategy: Literal["center_spiral", "perimeter"] = "center_spiral"
    inner_radius_m: Optional[float] = Field(None, ge=5.0, le=100.0)
    jitter_m: float = Field(1.5, ge=0.0, le=3.0)
    pre_wait_seconds: float = Field(0.0, ge=0.0, le=300.0)
    post_wait_seconds: float = Field(2.0, ge=0.0, le=300.0)
    route_type: Literal["stop_at_end", "return_to_start", "loop_forever"] = "stop_at_end"
    rounds: Union[int, Literal["infinite"]] = 1

    @field_validator("rounds")
    @classmethod
    def valid_rounds(cls, value):
        if value != "infinite" and value < 1:
            raise ValueError("rounds must be at least 1")
        return value


class MultiStopStartRequest(BaseModel):
    udid: str
    nav_mode: NavMode
    waypoints: list[LatLng]
    pause_enabled: bool = False
    pause_min: float = 5.0
    pause_max: float = 20.0
    straight_line: bool = False
    jump_mode: bool = False
    jump_pre_delay: float = 0.0
    jump_post_delay: float = 0.0
    custom_speed_kmh: Optional[float] = None
    mode: Literal["basic", "flower"] = "basic"
    flower: Optional[FlowerOptions] = None


class FlowerMultiStopStartRequest(MultiStopStartRequest):
    # Keep this required.  If omitted, a legacy/basic request must resolve to
    # MultiStopStartRequest rather than silently selecting the Flower branch.
    mode: Literal["flower"]
    flower: FlowerOptions = Field(default_factory=FlowerOptions)


class RandomWalkStartRequest(BaseModel):
    udid: str
    nav_mode: NavMode
    center: LatLng
    radius_m: float
    pause_enabled: bool = False
    pause_min: float = 5.0
    pause_max: float = 20.0
    custom_speed_kmh: Optional[float] = None
    straight_line: bool = True


class JoystickStartRequest(BaseModel):
    udid: str
    nav_mode: NavMode
    lat: float
    lng: float
    custom_speed_kmh: Optional[float] = None


class JoystickStopRequest(BaseModel):
    udid: str


HistoryKind = Literal["teleport", "navigate", "route_loop", "multi_stop", "random_walk", "joystick"]


class HistoryEntry(BaseModel):
    lat: float
    lng: float
    kind: HistoryKind
    name: Optional[str] = None
    ts: int


class HistoryPushRequest(BaseModel):
    lat: float
    lng: float
    kind: HistoryKind
    name: Optional[str] = None


class Favorite(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    created_at: int
    group: str = ""
    notes: str = ""
    order: int = 0


class FavoriteCreateRequest(BaseModel):
    name: str
    lat: float
    lng: float
    group: str = ""
    notes: str = ""


class FavoriteUpdateRequest(BaseModel):
    name: Optional[str] = None
    group: Optional[str] = None
    notes: Optional[str] = None


class FavoriteGroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class FavoriteReorderItem(BaseModel):
    id: str
    order: int


class FavoriteReorderRequest(BaseModel):
    items: list[FavoriteReorderItem]


class FavoriteExportItem(BaseModel):
    """Portable favorite representation. IDs are intentionally excluded."""

    name: str = Field(min_length=1, max_length=80)
    lat: float = Field(ge=-90.0, le=90.0)
    lng: float = Field(ge=-180.0, le=180.0)
    group: str = Field(default="", max_length=40)
    notes: str = Field(default="", max_length=200)
    created_at: int = Field(ge=0)
    order: int = Field(ge=0)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Favorite name cannot be empty.")
        return normalized

    @field_validator("group", "notes")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()


class FavoriteExportDocument(BaseModel):
    format: Literal["arcwayfarer-favorites"] = "arcwayfarer-favorites"
    schema_version: Literal[1] = 1
    exported_at: str
    groups: list[Annotated[str, Field(max_length=40)]] = Field(default_factory=list, max_length=500)
    favorites: list[FavoriteExportItem] = Field(default_factory=list, max_length=10_000)

    @field_validator("groups")
    @classmethod
    def normalize_groups(cls, values: list[str]) -> list[str]:
        return [value.strip() for value in values if value.strip()]


class FavoriteImportPreview(BaseModel):
    total: int
    additions: int
    duplicates: int
    groups_to_add: list[str]


class FavoriteImportResult(FavoriteImportPreview):
    imported: int
