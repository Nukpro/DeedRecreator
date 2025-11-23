#!/usr/bin/env python3
"""Copy built frontend files from assets/ to dist/ root with correct names."""
import shutil
from pathlib import Path

static_dist = Path("static/dist")
assets_dir = static_dist / "assets"

if not assets_dir.exists():
    print(f"Assets directory not found: {assets_dir}")
    exit(1)

# Find drafter files
drafter_js = None
drafter_css = None

for file in assets_dir.iterdir():
    if file.name.startswith("drafter") and file.suffix == ".js":
        drafter_js = file
    elif file.name.startswith("drafter") and file.suffix == ".css":
        drafter_css = file

if drafter_js:
    target_js = static_dist / "drafter.js"
    shutil.copy2(drafter_js, target_js)
    print(f"Copied {drafter_js.name} -> drafter.js")
else:
    print("Warning: drafter.js not found in assets/")

if drafter_css:
    target_css = static_dist / "drafter.css"
    shutil.copy2(drafter_css, target_css)
    print(f"Copied {drafter_css.name} -> drafter.css")
else:
    print("Warning: drafter.css not found in assets/")

print("Done!")

