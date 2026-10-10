# YouTube upload

For the launch film `41prompts-launch-film.mp4`.

## Thumbnails (1280×720, under 2 MB)

- `41prompts-youtube-thumbnail-stop-guessing.png` · upload this one. A messy `prompt_FINAL_v7_real.txt` turns into four bloks.
- `41prompts-youtube-thumbnail-never-lose.png` · the second option for YouTube's Test & Compare. v5 "works on Claude" restored as v19.

Rebuild: `cd src && node thumbnail.mjs && python3 -I thumbnail.py`.

## Title (63 characters)

41prompts: split, version and run your AI prompts | Launch film

Alternatives:
- `Stop guessing which prompt works | 41prompts launch film` (56)
- `41prompts | Free workbench for writing and versioning LLM prompts` (65)

## Description

Replace the three bracketed links before publishing.

```
41prompts is a free workbench for the prompts you depend on. Split a prompt into typed bloks, keep every version, and run it on your own models.

Try it free, no card: https://41prompts.ai
Support the launch on Product Hunt: [Product Hunt link]

Chapters
0:00 A prompt is a wall of text
0:10 Compile, copy and keep every version
0:20 Run it on your own model

What you see in the film
A long prompt grows one rule at a time until nobody can tell which line does what. 41prompts breaks it into four kinds of blok: context, constraint, example and expects. Each blok owns an exact span of the prompt you ship. The compiled prompt rebuilds as you edit, fills {{variables}}, and copies in one click as text, Markdown or JSON. Every save becomes a version you can name ("works on Claude") and restore without overwriting anything. When you want to see a reply, run the prompt once on your own model and watch the tokens, time and cost come in.

What's free
- Unlimited prompts, bloks and versions
- A bloks editor with a live compiled prompt
- One-click copy, as a template or with variables filled
- Runs on 20+ hosted providers (OpenAI, Anthropic, Google, OpenRouter, Azure, Bedrock, Mistral, Groq and more), any OpenAI-compatible endpoint, or a local model through Ollama or LM Studio
- A private library with search by name
- Export everything as Markdown and JSON

Keys are encrypted at rest and never logged. Hosted providers bill you directly, and local models run straight from your browser.

How this film was made
All 30 seconds are code. The film is one HTML page built from the 41prompts Blueprint design system, with a render(t) function that draws any frame from its timestamp. Playwright captured 1,800 frames at 1920×1080 and 60 fps, and ffmpeg encoded them. There are no stock clips and no editing timeline.

The score is code too. A Python script synthesises every kick, clap, click and chime from the same cue sheet that drives the picture, so each sound starts on its frame. The music drops to digital silence for a second and a half before the logo lands.

The motion follows a few rules. Type resolves word by word out of a blur. There are no hard cuts between scenes until the silence: the prompt splits into bloks, the bloks fold into the editor, the saved badge becomes a version timeline, and the timeline becomes the run panel. Arrivals use a fast ease-out curve, and scene changes sit on a 120 BPM grid.

The film, its score and the cue sheet are public: https://github.com/soroushamdg/41prompts/tree/main/docs/launch/product-hunt-video

Credits
Product: 41prompts, made in Montréal
Film and score: made with Claude Code
Fonts: Archivo, IBM Plex Sans and Martian Mono, under the SIL Open Font License
Music and sound: original, synthesised for this film
The prompt, reply and numbers in the film are examples.

Follow along
X: [your X profile]
LinkedIn: [your LinkedIn profile]
Code: https://github.com/soroushamdg/41prompts

#PromptEngineering #LLM #AITools
```

## Tags (386 of 500 characters)

```
41prompts, prompt engineering, prompt management, prompt versioning, LLM prompts, AI prompt tool, system prompt, prompt editor, ChatGPT prompts, Claude prompts, Gemini prompts, Ollama, LM Studio, local LLM, OpenAI API, bring your own key, developer tools, AI tools 2026, Product Hunt launch, launch video, motion graphics, motion design, product video, SaaS launch video, made with code
```

## Settings

- Category: Science & Technology
- Language: English, captions: none needed (the film has no speech)
- Made for kids: No
- Altered or synthetic content: the film is motion graphics drawn in code, with no realistic people or places, so this does not apply.
- License: Standard YouTube License
