import base64

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services import mobile_auth
from services.network import primary_lan_ipv4
from services.mobile_web import mobile_web_ready

router = APIRouter(prefix="/api/mobile")


class PairRequest(BaseModel):
    token: str
    pin: str = Field(pattern=r"^\d{6}$")


def _local(request: Request) -> bool:
    return request.client is not None and request.client.host in {"127.0.0.1", "::1", "localhost"}


@router.post("/pairings")
async def create_pairing(request: Request) -> dict:
    if not _local(request):
        raise HTTPException(status_code=403, detail="Create pairings from the desktop app only.")
    if not mobile_web_ready():
        raise HTTPException(
            status_code=503,
            detail="手機遙控頁面尚未準備好。請重新啟動 ArcWayfarer；若是開發環境，請先執行 frontend 的 npm run build。",
        )
    ip = primary_lan_ipv4()
    if not ip:
        raise HTTPException(status_code=400, detail="No private LAN IPv4 address is available.")
    pairing = mobile_auth.create_pairing()
    url = f"http://{ip}:8787/mobile/#pair={pairing.token}"
    # Keep QR generation local; no third-party service receives the pairing URL.
    import qrcode
    import qrcode.image.svg

    image = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage)
    svg = image.to_string(encoding="utf-8")
    qr_data_url = "data:image/svg+xml;base64," + base64.b64encode(svg).decode("ascii")
    return {"url": url, "pin": pairing.pin, "expires_in": mobile_auth.PAIRING_TTL_SECONDS, "qr_data_url": qr_data_url}


@router.post("/exchange")
async def exchange_pairing(body: PairRequest) -> dict:
    session = mobile_auth.exchange(body.token, body.pin)
    if not session:
        raise HTTPException(status_code=401, detail="The QR code or PIN is invalid, expired, or locked.")
    return {"session": session, "expires_in": mobile_auth.SESSION_IDLE_SECONDS}


@router.get("/status")
async def get_status(request: Request) -> dict:
    if not _local(request):
        raise HTTPException(status_code=403, detail="View mobile status from the desktop app only.")
    return mobile_auth.connection_status()


@router.delete("/sessions")
async def revoke_sessions(request: Request) -> dict:
    if not _local(request):
        raise HTTPException(status_code=403, detail="Revoke sessions from the desktop app only.")
    mobile_auth.revoke_all()
    return {"status": "ok"}
