import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from api import device, favorites, history, location, mobile, multi_stop, navigate, random_walk, route_loop, websocket
from config import API_HOST, API_PORT, ensure_app_data_dir
from core import events
from services.mobile_auth import valid_session
from services.mobile_web import mobile_web_dir, mobile_web_ready


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_app_data_dir()
    events.on_position = websocket.broadcast_position
    events.on_state_change = websocket.broadcast_state
    yield


app = FastAPI(title="ArcWayfarer Backend", lifespan=lifespan)


def _is_loopback(request: Request) -> bool:
    return request.client is not None and request.client.host in {"127.0.0.1", "::1", "localhost"}


@app.middleware("http")
async def protect_lan_api(request: Request, call_next):
    """Keep desktop loopback calls unchanged; require a paired session on LAN."""
    path = request.url.path
    public = path in {"/health", "/favicon.ico", "/api/mobile/exchange"} or path.startswith("/mobile")
    if request.method == "OPTIONS" or public or _is_loopback(request):
        return await call_next(request)
    authorization = request.headers.get("authorization", "")
    token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else None
    if not valid_session(token):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=401, content={"detail": "A paired mobile session is required."})
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(device.router)
app.include_router(mobile.router)
app.include_router(location.router)
app.include_router(history.router)
app.include_router(favorites.router)
app.include_router(navigate.router)
app.include_router(route_loop.router)
app.include_router(multi_stop.router)
app.include_router(random_walk.router)
app.include_router(websocket.router)

# Development serves the mobile bundle from the repository. Packaged Electron
# sets ARCWAYFARER_WEB_DIR to its copied mobile build directory.
_web_dir = mobile_web_dir()
if mobile_web_ready():
    app.mount("/mobile", StaticFiles(directory=str(_web_dir), html=True), name="mobile")
else:
    @app.get("/mobile/{path:path}", response_class=HTMLResponse, include_in_schema=False)
    async def mobile_not_ready(path: str) -> HTMLResponse:
        return HTMLResponse(
            "<main style='font-family:-apple-system,sans-serif;padding:32px;line-height:1.6'>"
            "<h1>手機遙控頁面尚未準備好</h1>"
            "<p>請回到電腦端重新啟動 ArcWayfarer，再重新掃描 QR Code。</p>"
            "</main>",
            status_code=503,
        )


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    if "--tunneld" in sys.argv:
        # The packaged application invokes this mode from the same PyInstaller
        # executable, so pymobiledevice3 and its tunnel dependencies are always
        # available on both Windows and macOS.
        from pymobiledevice3.cli.remote import cli_tunneld

        cli_tunneld()
        raise SystemExit(0)

    import uvicorn

    uvicorn.run(app, host=API_HOST, port=API_PORT)
