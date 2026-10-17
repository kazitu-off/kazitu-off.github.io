from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
for path in (ROOT / "games").glob("*/index.js"):
    source = path.read_text(encoding="utf-8")
    source = source.replace("${score}", "${Math.round(score)}")
    source = source.replace("${moves}", "${Math.round(moves)}")
    source = source.replace("${level}", "${Math.round(level)}")
    source = source.replace("${matched.size/2}", "${Math.round(matched.size/2)}")
    source = re.sub(r"\$\{score\[(\d)\]\}", r"${Math.round(score[\1])}", source)
    path.write_text(source, encoding="utf-8", newline="\n")
