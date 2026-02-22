#!/usr/bin/env python3
"""Copy built frontend files to dist/ root with correct names.

If static/dist/assets/ exists (Vite default), copy drafter.* from there.
Otherwise assume Vite wrote drafter.js and drafter.css directly to static/dist/.
Run from project root or from frontend/; static/dist is relative to script directory (project root).
"""
import shutil
from pathlib import Path

_project_root = Path(__file__).resolve().parent
static_dist = _project_root / "static" / "dist"
assets_dir = static_dist / "assets"

if assets_dir.exists():
    # Vite put files in assets/ (e.g. drafter-abc123.js)
    drafter_js = None
    drafter_css = None
    for file in assets_dir.iterdir():
        if file.name.startswith("drafter") and file.suffix == ".js":
            drafter_js = file
        elif file.name.startswith("drafter") and file.suffix == ".css":
            drafter_css = file
    if drafter_js:
        shutil.copy2(drafter_js, static_dist / "drafter.js")
        print(f"Copied {drafter_js.name} -> drafter.js")
    else:
        print("Warning: drafter.js not found in assets/")
    if drafter_css:
        shutil.copy2(drafter_css, static_dist / "drafter.css")
        print(f"Copied {drafter_css.name} -> drafter.css")
    else:
        print("Warning: drafter.css not found in assets/")
else:
    # Vite with assetsDir: "" writes drafter.js and drafter.css directly to static/dist
    js_file = static_dist / "drafter.js"
    css_file = static_dist / "drafter.css"
    if js_file.exists():
        print("drafter.js already in place")
    else:
        print("Warning: drafter.js not found in static/dist")
    if css_file.exists():
        print("drafter.css already in place")
    else:
        print("Warning: drafter.css not found in static/dist")

print("Done!")

