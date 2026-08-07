import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import device, favorites, history, location, multi_stop, navigate, random_walk, route_loop, websocket
from config import API_HOST, API_PORT, ensure_app_data_dir
from core import events


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_app_data_dir()
    events.on_position = websocket.broadcast_position
    events.on_state_change = websocket.broadcast_state
    yield


app = FastAPI(title="ArcWayfarer Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(device.router)
app.include_router(location.router)
app.include_router(history.router)
app.include_router(favorites.router)
app.include_router(navigate.router)
app.include_router(route_loop.router)
app.include_router(multi_stop.router)
app.include_router(random_walk.router)
app.include_router(websocket.router)


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
