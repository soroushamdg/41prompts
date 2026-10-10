"""Contact sheet of preview stills: python3 -I src/sheet.py out.png still1.png still2.png ..."""
import sys
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
cols = 2; w, h = 960, 540
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w + (cols - 1) * 8, rows * h + (rows - 1) * 8), (40, 40, 40))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((w, h), Image.LANCZOS)
    x, y = (i % cols) * (w + 8), (i // cols) * (h + 8)
    sheet.paste(im, (x, y))
    d.rectangle([x, y, x + 110, y + 26], fill=(0, 0, 0))
    d.text((x + 6, y + 6), f.split("still-")[-1].replace(".png", "s"), fill=(255, 255, 0))
sheet.save(out)
