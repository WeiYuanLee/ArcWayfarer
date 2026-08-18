from typing import Literal, Optional

from pydantic import BaseModel, Field

Transport = Literal["lockdown", "rsd"]
DeviceStatus = Literal["ready", "mounting", "tunnel_required", "error"]


class DeviceInfo(BaseModel):
    udid: str
    name: str
    ios_version: str
    transport: Transport
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
    custom_speed_kmh: Optional[float] = None


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
