# 41prompts · Product Hunt gallery

Six 1270×760 images in the Blueprint style. The top-level PNGs are 2x (2540×1520); `1x/` has the same images at 1270×760.

Upload in this order. The first image is the one people see in shares.

| # | File | Alt text |
|---|---|---|
| 1 | `01-41prompts-prompt-testing-gpt-claude-gemini.png` | A support-reply prompt exploded into four typed bloks. A test run shows GPT and Claude passing 40 of 40 checks and Gemini passing 31, with a line tracing the failure to the example blok, B3, at 82% confidence. |
| 2 | `02-41prompts-prompt-editor-bloks-compiled-prompt.png` | A pasted prompt split into context, constraint, example and expects bloks, each linked to its span in the compiled prompt, with a Copy prompt button and the expects blok turned into tests. |
| 3 | `03-41prompts-llm-failure-attribution.png` | A test matrix of four checks across GPT, Claude and Gemini. The failing Gemini cell links to the example blok that caused it, beside a failing reply that repeats the blok's phrase and an attribution chart. |
| 4 | `04-41prompts-prompt-linter.png` | A prompt with three lint findings marked in the text: a repeated rule, a conflict between two lines, and an untestable line, each with a severity and a suggested fix. |
| 5 | `05-41prompts-cross-model-llm-evaluation.png` | Three side-by-side cards comparing GPT, Claude and Gemini on 200 checks, with pass count, cost, p50 latency and a latency dot plot for each model. |
| 6 | `06-41prompts-free-prompt-library-version-control.png` | The Free plan as a bill of materials with unlimited prompts, bloks and versions, a version history showing v5 restored as v8, and the 41 to AI logo morph. |

All prompts, numbers and results are example data, labelled "Example" on the images, as on the landing page.

## Rebuild

```sh
cd src
node render.mjs          # all six, or: node render.mjs 03
python3 -I meta.py       # run after every render: writes title, description and keywords into each PNG and refreshes 1x/
```

`render.mjs` uses the repo's Playwright. The pages load the bundled fonts from `docs/assets/fonts` (OFL).
