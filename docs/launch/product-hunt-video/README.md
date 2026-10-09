# 41prompts · launch film

A 30-second, 1920×1080, 60 fps motion piece for the Product Hunt launch. The storyboard and the reasoning are in [PLAN.md](PLAN.md).

- `41prompts-launch-film.mp4` · the film with its score (H.264 + AAC).
- `cues.json` · every timed event. The picture and the score both read it, so a hit and its frame cannot drift apart.
- `src/film.html`, `src/engine.js`, `src/film.js` · the film as one page. `render(t)` draws the frame at `t` seconds, with no CSS transitions, so every frame is reproducible.
- `audio/synth.py` · the score, synthesised in Python from the same cue sheet.

The film shows only what ships on the Free plan (M01 to M10). Every prompt, number and reply in it is example content.

## Rebuild

```sh
cd src
python3 -I ../audio/synth.py          # writes ../audio/score.wav
node render.mjs                       # renders every frame, muxes the score → ../41prompts-launch-film.mp4
node render.mjs --stills 5.8,27.75    # single frames → ../preview/
node render.mjs --from 22 --to 27     # a slice, for checking one section
```

`render.mjs` uses the repo's Playwright and needs `ffmpeg` with libx264 on the PATH. Fonts come from `docs/assets/fonts`.
