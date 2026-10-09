"""Writes SEO metadata into each PNG and saves a 1270x760 copy in 1x/.
Run with: python3 -I src/meta.py (from the gallery folder)."""
import pathlib
from PIL import Image
from PIL.PngImagePlugin import PngInfo

ROOT = pathlib.Path(__file__).resolve().parent.parent
COMMON_KW = "41prompts, prompt engineering, prompt management, LLM prompt testing, prompt versioning, GPT, Claude, Gemini"
ITEMS = {
    "01": ("Stop guessing which prompt works",
           "41prompts breaks a prompt into typed bloks and tests it on GPT, Claude and Gemini. When a check fails, it points at the blok that caused it.",
           "prompt testing, LLM evaluation, prompt debugging"),
    "02": ("From a wall of text to parts you can name",
           "Paste a prompt, shape it into context, constraint, example and expects bloks, and copy the compiled prompt in one click.",
           "prompt editor, prompt templates, prompt variables"),
    "03": ("Know which blok broke it",
           "Failure attribution traces each failed check to the blok most likely to have caused it, with a confidence score per model.",
           "LLM failure analysis, prompt regression testing, LLM evals"),
    "04": ("Find what nothing checks",
           "The prompt linter flags repeated rules, contradictions and untestable lines, each with a severity and a suggested fix.",
           "prompt linter, prompt quality, prompt review"),
    "05": ("One prompt, every model",
           "Run the same test suite on GPT, Claude and Gemini side by side with your own keys, and compare pass rate, cost and p50 latency.",
           "cross-model evaluation, LLM comparison, model benchmarking"),
    "06": ("Free, with no caps",
           "The Free plan has unlimited prompts, bloks and versions, a private prompt library and full version history. No card, your own keys.",
           "free prompt library, prompt version control, prompt history"),
}
(ROOT / "1x").mkdir(exist_ok=True)
for png in sorted(ROOT.glob("0*.png")):
    n = png.name[:2]
    title, desc, kw = ITEMS[n]
    info = PngInfo()
    info.add_itxt("Title", f"41prompts · {title}")
    info.add_itxt("Description", desc)
    info.add_itxt("Keywords", f"{kw}, {COMMON_KW}")
    info.add_itxt("Author", "41prompts")
    info.add_itxt("Copyright", "© 2026 41Prompts Inc.")
    info.add_itxt("Source", "https://41prompts.ai")
    im = Image.open(png).convert("RGB")
    im.save(png, pnginfo=info, optimize=True)
    im.resize((1270, 760), Image.LANCZOS).save(ROOT / "1x" / png.name, pnginfo=info, optimize=True)
    print(png.name, im.size, f"{png.stat().st_size/1e6:.2f} MB")
