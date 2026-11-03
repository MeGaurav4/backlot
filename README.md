# Backlot — a five-agent film studio

One line of a film idea goes in. Five agents argue about it, on the record.
A production packet comes out: a treatment, a shot list, storyboard frames,
and the full transcript of who won each argument and why.

Built for the Meta Global AI Developer Hackathon, theme **Build for Your World**
(film pre-production). Indie track.

## Run it

No build step, no install, no network needed:

- Open `index.html` in a browser, or
- `python3 -m http.server` in this folder, then visit `http://localhost:8000`

Type an idea (the demo line is prefilled), press **Roll camera**, and watch
the meeting. Playback can be paused, sped up, or skipped to the verdict.

## How it works

| File | Job |
| --- | --- |
| `index.html` | Layout: slate header, idea input, debate stage, decision log, packet sections |
| `styles.css` | Dark cinematic theme, film-strip framing, system fonts only |
| `app.js` | Playback engine (play/pause/skip/speed), rendering, export downloads |
| `providers.js` | Provider layer: LocalEngine (default) and an optional Meta Model API provider |
| `engine.js` | The LocalEngine: idea parsing, the staged debate, treatment, shot list, previz SVG frames, Markdown export |

### The debate

Fourteen capped turns in three rounds:

1. **Positions** — Writer, Director, Cinematographer, Producer, Critic each stake a claim.
2. **Clashes** — Critic vs Writer on story (the Writer must answer with a binding rule),
   Director vs Producer on scope (the set piece is cut; one signature shot is protected),
   and the Cinematographer shows the cut improves the look.
3. **Resolution** — The Critic spends one veto on an element of the ending; the Writer
   revises it on the spot; the Producer locks scope; the Director takes the final image.

Decisions are not decoration: the adopted rule, the cut set piece, and the vetoed
ending all change the compiled treatment, shot list and frames. The decision log
shows each winner and the terms.

### The LocalEngine

The default provider is a structured local generation engine, not a template
dump. It parses the idea (protagonist, setting, motif, hook, genre, tone),
builds distinct argument strategies per agent whose lines react to the idea
and to each other, and compiles the outputs from the *resolved* positions.
It is deterministic per idea (seeded by the line itself), so a demo rehearses
identically every run.

### Optional: Meta Model API

Paste your own key in **Studio settings** and the provider layer voices each
agent turn with **Muse Spark** and generates frames with **Muse Image** from the
locked look-bible prompts. The key stays in the session only and is never
saved. Any failed call falls back to the local result for that stage, recorded
in the packet's provenance line, so the app never dead-ends. Nothing in the
app depends on the API being present.

### Storyboard frames

Each frame is briefed from the shot list against a locked **look bible**
(character, wardrobe, palette, light, era). Without the API, frames render as
stylised SVG previz boards composed from the shot data — silhouette style,
consistent palette, and the hero's rust-red scarf as the continuity marker in
every board. With the API, generated images replace the boards shot by shot.

### Export

The full packet downloads as Markdown or JSON: seed idea, decision log,
treatment (logline, synopsis, themes, characters), look bible, shot list,
frame prompts, and the complete debate transcript.

## Design rules honoured

- Everything written fresh for this entry; original work.
- No paid services, no accounts, fully local by default.
- Capped everything: 14 turns, 9 shots, 4 frames, 2 locations.
