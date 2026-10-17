from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "previews"
OUT.mkdir(parents=True, exist_ok=True)

games = [
    ("snake", "#2dd4bf", "#0f766e", "snake"),
    ("2048", "#60a5fa", "#1d4ed8", "grid"),
    ("minesweeper", "#f59e0b", "#b45309", "mine"),
    ("memory", "#c084fc", "#7e22ce", "cards"),
    ("tic-tac-toe", "#fb7185", "#be123c", "cross"),
    ("tetris", "#38bdf8", "#0369a1", "blocks"),
    ("pong", "#a78bfa", "#6d28d9", "pong"),
    ("flappy", "#fbbf24", "#b45309", "bird"),
    ("breakout", "#fb7185", "#be123c", "breakout"),
    ("fifteen", "#34d399", "#047857", "tiles"),
    ("sudoku", "#818cf8", "#4338ca", "sudoku"),
    ("wordle", "#22c55e", "#15803d", "word"),
    ("platformer", "#f97316", "#c2410c", "platform"),
    ("clicker", "#f472b6", "#be185d", "click"),
    ("maze", "#14b8a6", "#0f766e", "maze"),
    ("reaction", "#facc15", "#a16207", "reaction"),
    ("match3", "#e879f9", "#a21caf", "match"),
    ("shooter", "#60a5fa", "#1e40af", "shooter"),
    ("rps", "#fb923c", "#c2410c", "rps"),
    ("dodge", "#4ade80", "#15803d", "dodge"),
]

def rounded(draw, box, fill, radius=18, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def render(slug, accent, deep, kind):
    image = Image.new("RGB", (640, 360), "#0f172a")
    draw = ImageDraw.Draw(image)
    for y in range(360):
        mix = y / 360
        color = tuple(round(int(accent[1 + i:3 + i], 16) * (1 - mix) + int(deep[1 + i:3 + i], 16) * mix) for i in range(0, 6, 2))
        draw.line((0, y, 640, y), fill=color)
    rounded(draw, (28, 28, 612, 332), "#111827", 30, "#334155", 3)
    rounded(draw, (52, 52, 588, 308), "#172033", 24, "#475569", 2)
    cx, cy = 320, 180
    if kind in {"grid", "tiles", "sudoku", "cards", "match"}:
        for row in range(3):
            for col in range(3):
                x, y = 205 + col * 78, 85 + row * 66
                fill = accent if (row + col) % 2 else deep
                rounded(draw, (x, y, x + 58, y + 46), fill, 12, "#e2e8f0", 2)
    elif kind == "snake":
        for i in range(5): rounded(draw, (178 + i * 48, 150, 218 + i * 48, 190), accent if i else "#fde68a", 16)
        draw.ellipse((430, 128, 460, 158), fill="#fb7185")
    elif kind in {"pong", "breakout"}:
        rounded(draw, (108, 150, 126, 232), accent, 9)
        rounded(draw, (514, 128, 532, 210), "#fbbf24", 9)
        draw.ellipse((298, 150, 342, 194), fill="#f8fafc")
        for i in range(5): rounded(draw, (178 + i * 58, 85, 218 + i * 58, 110), accent, 8)
    elif kind in {"mine", "shooter", "dodge"}:
        rounded(draw, (270, 120, 370, 220), accent, 28)
        draw.ellipse((292, 142, 308, 158), fill="#f8fafc")
        draw.ellipse((332, 142, 348, 158), fill="#f8fafc")
        rounded(draw, (296, 182, 344, 194), "#f8fafc", 6)
    elif kind == "bird":
        draw.ellipse((270, 135, 370, 235), fill=accent, outline="#f8fafc", width=3)
        draw.ellipse((332, 158, 348, 174), fill="#0f172a")
        draw.polygon((365, 178, 420, 195, 365, 212), fill="#fbbf24")
    elif kind == "platform":
        rounded(draw, (120, 228, 520, 252), deep, 12)
        rounded(draw, (272, 145, 368, 235), accent, 28)
        draw.ellipse((296, 164, 312, 180), fill="#f8fafc")
        draw.ellipse((328, 164, 344, 180), fill="#f8fafc")
    elif kind == "maze":
        for box in [(160, 95, 178, 260), (160, 95, 450, 113), (430, 95, 448, 220), (260, 190, 448, 208)]: rounded(draw, box, accent, 8)
        draw.ellipse((195, 225, 235, 265), fill="#fbbf24")
    elif kind == "cross":
        rounded(draw, (250, 110, 288, 250), accent, 18)
        rounded(draw, (212, 148, 326, 188), accent, 18)
    elif kind == "blocks":
        for x, y, color in [(250, 110, accent), (290, 110, deep), (330, 110, "#fbbf24"), (270, 150, "#f8fafc"), (310, 150, accent), (290, 190, deep)]: rounded(draw, (x, y, x + 34, y + 34), color, 9)
    elif kind == "word":
        for i, color in enumerate([accent, deep, "#fbbf24", accent]): rounded(draw, (175 + i * 70, 145, 230 + i * 70, 200), color, 12)
    elif kind == "click":
        draw.ellipse((240, 95, 400, 255), fill=accent, outline="#f8fafc", width=4)
        rounded(draw, (285, 150, 355, 205), "#f8fafc", 18)
    elif kind == "reaction":
        draw.ellipse((245, 105, 395, 255), fill=accent, outline="#f8fafc", width=4)
        draw.ellipse((285, 145, 305, 165), fill="#0f172a")
        draw.ellipse((335, 145, 355, 165), fill="#0f172a")
    elif kind == "rps":
        rounded(draw, (210, 130, 285, 230), accent, 26)
        rounded(draw, (295, 110, 370, 230), deep, 26)
        rounded(draw, (380, 130, 455, 230), "#fbbf24", 26)
    image.save(OUT / f"{slug}.webp", "WEBP", quality=88, method=6)

for item in games:
    render(*item)
