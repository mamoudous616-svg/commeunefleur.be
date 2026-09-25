"""Allège les polices variables (vitesse de chargement).

- limite l'axe de graisse aux valeurs réellement utilisées ;
- ne garde que les caractères du français (+ ponctuation typographique, €, flèches) ;
- réécrit en WOFF2.

Usage (une seule fois, résultat versionné dans src/assets/fonts) :
    pip install fonttools brotli
    python3 tools/subset-fonts.py
"""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "node_modules" / "@fontsource-variable"
OUT = ROOT / "frontend" / "src" / "assets" / "fonts"

UNICODES = (
    list(range(0x20, 0x7F))  # ASCII
    + list(range(0xA0, 0x100))  # Latin-1 : é è à ç ô « » · …
    + [0x152, 0x153, 0x178]  # Œ œ Ÿ
    + [0x2009, 0x202F, 0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E]
    + [0x2022, 0x2026, 0x2039, 0x203A, 0x20AC, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2197]
)

FONTS = [
    ("newsreader/files/newsreader-latin-wght-normal.woff2", "newsreader-300-500.woff2", (300, 500)),
    ("newsreader/files/newsreader-latin-wght-italic.woff2", "newsreader-italic-300.woff2", (300, 300)),
    ("inter/files/inter-latin-wght-normal.woff2", "inter-400-600.woff2", (400, 600)),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for source, target, (lo, hi) in FONTS:
        font = TTFont(SRC / source)
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "lnum", "case"]
        options.name_IDs = ["*"]
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=UNICODES)
        subsetter.subset(font)
        font = instancer.instantiateVariableFont(font, {"wght": lo if lo == hi else (lo, hi)})
        path = OUT / target
        font.flavor = "woff2"
        font.save(path)
        before = (SRC / source).stat().st_size
        print(f"{target}: {before // 1024} Ko → {path.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
