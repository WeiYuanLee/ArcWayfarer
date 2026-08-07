# PyInstaller spec for the ArcWayfarer FastAPI backend.
# Build with: pyinstaller arcwayfarer-backend.spec --noconfirm --distpath ../dist-py --workpath ../build-py/backend

from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata

datas = []
binaries = []
hiddenimports = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "websockets.legacy",
    "websockets.legacy.client",
    "websockets.legacy.server",
    "gpxpy",
    "httpx",
    "multipart",
    "pyimg4",
]

for pkg in ("pymobiledevice3", "pytun_pmd3", "developer_disk_image", "pyimg4"):
    try:
        pkg_datas, pkg_binaries, pkg_hiddenimports = collect_all(pkg)
        datas += pkg_datas
        binaries += pkg_binaries
        hiddenimports += pkg_hiddenimports
    except Exception:
        pass

for package in ("pyimg4", "readchar"):
    try:
        datas += copy_metadata(package)
    except Exception:
        pass

hiddenimports += collect_submodules("uvicorn")
hiddenimports += collect_submodules("fastapi")

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "PIL", "numpy", "scipy", "pandas"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="arcwayfarer-backend",
    debug=False,
    strip=False,
    upx=False,
    console=True,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="arcwayfarer-backend",
)
