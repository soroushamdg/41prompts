# 41prompts · 30-second launch film

A 30-second, 1920×1080, 60 fps motion piece for the Product Hunt launch. It shows only what ships on the Free plan today (M01 to M10), in the Blueprint style.

## Rules taken from the brief

| Brief | How this film uses it |
|---|---|
| Hero scale reveal | Opens on one registration corner filling the screen, tilting slowly in perspective. Closes on the logo plate slamming in from hero scale. |
| Per-word blur stagger | Every line of type enters word by word: blur 18px → 0, opacity 0 → 1, rise 24px, 70 ms apart. |
| Material luminescence | Software has no titanium, so light does the work: specular sweeps cross the chalk logo plate, blok frames and the wall of text. |
| Monochromatic canvas | Deep ground blue `#050C1A`, chalk `#E9F1FF` and the four blok colours. Nothing else. |
| Zero-cut seamlessness | No hard cuts until the silence. The wall of text becomes the bloks; the bloks become the editor; the saved badge becomes the version timeline; the timeline becomes the run panel's input line. |
| Macro-to-micro pacing | Slow orbit of the exploded bloks (6–8 s), then fast compile ticks; slow decel onto v5, then the fast manifesto. |
| Cubic-bezier deceleration | Arrivals use `cubic-bezier(.16, 1, .3, 1)` and the brand curve `(.32, .72, 0, 1)`; the logo morph keeps its own cubic in-out. |
| Spatial zoom ramp | 14.0 s: the camera punches into the "v7" saved badge until its dot becomes a node on an endless version timeline. |
| Hyper-synced foley | Each blok snaps with a pitched clack, every timeline node ticks, the copy button clicks, the reply streams with soft keystrokes. |
| Percussive minimal beat | 120 BPM, D minor / F major, kick, claps, snaps, short sub bass, pluck stabs. |
| Acoustic dropoff | 25.5–27.0 s: dead silence while "Stop guessing which prompt works." resolves on black. |
| BPM kinematics | One beat is 0.5 s, one bar is 2 s. Every scene change lands on a bar line; every word lands on an 8th or 16th note. |
| Spec-to-benefit arc | "4 blok types." → "Know what every line does." · "Every save is a version." → "Never lose the one that worked." · "Your key. Your provider." → "They bill you directly." |
| "One more thing" climax | The fastest section (manifesto, 22–25.5 s) and the biggest hit (logo, 27 s) sit in the last 8 seconds. |
| Manifesto typography | Twelve verbs at one per 8th note: Paste. Split. Name. Reorder. Compile. Copy. Version. Restore. Run. Search. Export. Ship. |

Photosensitivity: no full-screen colour inversions faster than one per bar.

## Storyboard

| Time (s) | Bars | Scene | Picture | Sound |
|---|---|---|---|---|
| 0.0–2.0 | 1 | Monument | Black. A light sweep finds one chalk registration corner at hero scale, tilting in perspective. At 1.0 the camera pulls back fast and the corner becomes the corner of a panel full of blurred prompt text. | Sub swell, air, a metallic tink at 0.25, reverse whoosh into the pull-back. |
| 2.0–4.0 | 2 | Wall | "Your prompt is a wall of text." resolves word by word over the blurred wall. | Heartbeat kick on each beat, soft tick per word, pad enters. |
| 4.0–6.0 | 3 | Split | A scan line sweeps the wall and tints its spans in the four blok colours. At 5.0 the wall explodes into four bloks in an isometric stack, one per 16th note. | Full groove. Scan zip. Four rising clacks. |
| 6.0–8.0 | 4 | Orbit | Slow orbit of the stack. Context, Constraint, Example, Expects flash beside their bloks, one per beat. | Snap on each label. |
| 8.0–10.0 | 5 | Spec → benefit | "4 blok types." then "Know what every line does." | Word ticks; bass gets busier. |
| 10.0–12.0 | 6 | Compile | The stack folds flat into the editor. Compiled lines assemble at 16ths; the expects blok stays out. Template flips to Filled: `{{customer_name}}` becomes "Sam". | Fold whoosh, compile ticks, a flip. |
| 12.0–14.0 | 7 | Copy | The cursor glides to Copy prompt and clicks on the downbeat at 13.0. "Copied". "One click. Paste it anywhere." | Mechanical click, two-note chime. |
| 14.0–16.0 | 8 | Zoom ramp | The camera dives into the "Saved · v7" badge; its dot becomes a node on a timeline racing past v1…v12. "Every save is a version." | Whoosh-in, impact, a rising tick per node. |
| 16.0–18.0 | 9 | Restore | Deceleration onto v5, "works on Claude". An arc restores v5 as v13. "Never lose the one that worked." | Chime on the name, swoosh and arpeggio on restore. |
| 18.0–20.0 | 10 | Run | The timeline becomes the Test message underline. "Claude · runs on your key". Run once at 18.5; the reply streams; tokens, time and cost count up. | Click, soft keystroke ticks. |
| 20.0–22.0 | 11 | Keys | "OpenAI. Anthropic. Google." then "Your key. They bill you directly." | Groove with movement in the bass. |
| 22.0–25.5 | 12–13 | Manifesto | Twelve verbs, one per 8th note, each set huge with a micro-glyph. One inversion at 24.0. | Clap and snap on every word, riser, accelerating roll. |
| 25.5–27.0 | — | Dropoff | Hard cut to black. "Stop guessing which prompt works." in silence. | Dead silence. |
| 27.0–30.0 | 14–15 | Climax | The logo plate slams in from hero scale with a light sweep, morphs 41 → AI → 41 with every vertex marked, then "prompts", "Free. Unlimited. No card." and "41prompts.ai". | Massive hit, morph shimmer, a held F major add9 that rings out. |

## Files

- `cues.json` · every timed event, shared by the picture and the score.
- `src/` · the film as one HTML page driven by `render(t)`, and the frame renderer.
- `audio/` · the score, synthesised in code so every hit lands on its frame.
