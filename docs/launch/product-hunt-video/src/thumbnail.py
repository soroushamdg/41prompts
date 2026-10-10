"""Downscales the 2x thumbnail renders to YouTube's 1280x720 and writes title,
description and keywords into each PNG. Run after `node thumbnail.mjs`:
python3 -I thumbnail.py"""
import pathlib
from PIL import Image
from PIL.PngImagePlugin import PngInfo

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
KW = "41prompts, prompt engineering, prompt management, prompt versioning, LLM prompts, AI prompt tool, Ollama, LM Studio"
OUT = {
    "a": ("41prompts-youtube-thumbnail-stop-guessing.png", "Stop guessing",
          "A messy prompt file turns into four typed bloks: context, constraint, example and expects."),
    "b": ("41prompts-youtube-thumbnail-never-lose.png", "Never lose the prompt that worked",
          "A version timeline where v5, named works on Claude, is restored as v19."),
}
for v, (name, title, desc) in OUT.items():
    info = PngInfo()
    info.add_itxt("Title", f"41prompts · {title}")
    info.add_itxt("Description", desc)
    info.add_itxt("Keywords", KW)
    info.add_itxt("Author", "41prompts")
    info.add_itxt("Source", "https://41prompts.ai")
    im = Image.open(ROOT / "preview" / f"thumb-{v}@2x.png").convert("RGB").resize((1280, 720), Image.LANCZOS)
    im.save(ROOT / name, pnginfo=info, optimize=True)
    print(name, f"{(ROOT / name).stat().st_size / 1e6:.2f} MB")
