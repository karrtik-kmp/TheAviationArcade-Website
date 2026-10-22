"""Reproduce checked-in optimized assets; original client files remain untouched."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "work" / "font-compression"))
from PIL import Image
from fontTools.ttLib import TTFont

for source in (ROOT / "public" / "fonts").glob("*.ttf"):
    font = TTFont(source)
    font.flavor = "woff2"
    font.save(source.with_suffix(".woff2"))

for source in (ROOT / "public" / "media").glob("*.jpg"):
    with Image.open(source) as image:
        image.convert("RGB").save(source.with_suffix(".webp"), "WEBP", quality=82, method=6)

with Image.open(ROOT / "public" / "media" / "logo-256.png") as image:
    image.thumbnail((144, 144))
    image.save(ROOT / "public" / "media" / "logo-144.webp", "WEBP", lossless=True)
    image.thumbnail((48, 48))
    image.save(ROOT / "public" / "media" / "favicon.png", optimize=True)
print("Optimized brand fonts, photographs and logo derivatives.")
