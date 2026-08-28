# Falcon scroll sequence

Fly-in → perch with natural head movement → scroll-scrubbed fly-out, with page 1
lifting and page 2 entering on the same progress value.

    node server.js        →  http://localhost:3025
    R                     →  replay the entrance

## The realistic answer

Code cannot draw photoreal feathers. Realism has to come from **rendered assets**.
So the page is built as a compositor, not an illustrator:

| layer | what it is | why |
|---|---|---|
| `plate.jpg` | the painting with the falcon **removed** | static, full quality, ~70 KB |
| `falcon-in.webm` | alpha video, plays once | flies in and lands |
| `falcon-idle.webm` | alpha video, seamless loop | head turns, blinks, breathing |
| `out/0000.webp …` | alpha frame sequence | the exit, **scroll-scrubbed** |

The exit is a frame sequence, not a video, because scrubbing needs frame-accurate
random access — seeking a compressed video on every scroll event stutters badly.
Preloaded images do not.

**Two paths, chosen automatically.** `assets/plate.jpg` + `assets/falcon-idle.webm`
both present → the photoreal path. Otherwise the built-in vector rig runs so the
page is never blank. A plate on its own is still used as the backdrop.

## Asset spec

- **Plate**: 1400×1130 (or 2× for retina). Paint out the falcon; the wall and the
  sofa crest behind it must be complete.
- **Region**: all falcon clips are cropped to the box the bird ever occupies —
  `region: [880, 240, 460, 420]` in `js/falcon-media.js`, given in *plate pixels*.
  A 460×420 clip instead of a full 1400×1130 one is roughly an 8× saving.
  Set `region: null` to author full-frame clips instead.
- Every clip must be **rendered against the plate's own coordinates**, so the bird
  is already in the right place. The page cover-fits the plate and maps the region
  into it — verified sub-pixel accurate across viewport sizes. No offset tuning.
- Author the exit so the bird **leaves frame exactly on the last frame**; trailing
  empty frames are wasted bytes.

## Producing the assets

Three routes. All three output PNG sequences, so the encoding step is the same.

**1. AI video (ComfyUI at `C:\000comfyui`) — fastest**
Cut the falcon out of the painting, use it as the init image, and generate the
fly-in / idle / fly-out with an image-to-video model. Keeps the painting's exact
look because it *is* the painting. Weakness: seamless looping of the idle needs a
first-frame = last-frame constraint, and clip-to-clip continuity takes attempts.

**2. 3D (3ds Max + Corona) — most control**
A rigged falcon, lit to match the plate, rendered as PNG+alpha. Wings actually
work, camera is fixed, timing is exact, and you can re-render any beat. Slowest to
set up, but it is the only route that gives you a genuinely correct wingbeat.

**3. Cut-out 2.5D — cheapest, idle only**
Layered PNGs (head / body / tail / wings) driven by the rig already in `falcon.js`.
Good enough for the *perched idle*; the flight needs spread wings that do not exist
in the painting, so it cannot cover fly-in or fly-out on its own.

**Recommended: 3 for the idle, 1 or 2 for the two flights.** The perch is what the
visitor stares at, and a cut-out of the real painting is unbeatable there.

### Encoding

```bash
# alpha WebM — Chrome / Firefox / Edge. -auto-alt-ref 0 is REQUIRED or alpha is dropped.
ffmpeg -i in_%04d.png -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 -auto-alt-ref 0 falcon-idle.webm
```

```bash
# the scrubbed exit — alpha WebP frames
ffmpeg -i out_%04d.png -vf scale=460:420 -lossless 0 -q:v 82 assets/out/%04d.webp
```

Safari does not play alpha WebM; it needs HEVC-with-alpha, which on Windows means
Adobe Media Encoder ("HEVC with Alpha"). Drop it in as `falcon-idle.mp4` beside the
`.webm` — the player already lists both sources. If you would rather not deal with
that, author all three phases as WebP frame sequences: alpha WebP works everywhere,
it just costs more bytes.

## Files

    index.html            page 1 + page 2, and the vector fallback scene
    js/falcon.js          vector rig — placeholder bird, and the motion reference
    js/falcon-media.js    the photoreal path: plate, alpha clips, scrubbed frames
    js/main.js            scroll driver + page transition, picks the path
    server.js             static server; also a dev-only POST /__shot frame dump
    comfy/                MiniMax H3 workflow generator + matting pipeline
    assets/               REAL assets, generated 2026-08-24

## Status: photoreal path is live

All three clips generated locally with MiniMax H3 (FL2V) and composited over the
real painting. Total payload **2.2 MB**.

| asset | size | notes |
|---|---|---|
| `plate.jpg` | 605 KB | the painting with only the falcon patched out |
| `falcon-in.webm` | 403 KB | VP9 alpha, 5.1s fly-in and landing |
| `falcon-idle.webm` | 102 KB | VP9 alpha, seamless loop, head turns |
| `assets/out/` | 1.1 MB | 105 alpha WebP frames, scroll-scrubbed exit |

Measured:

- generated frame 1 vs the plate — mean diff **7.4**, only 1.2% of pixels off by
  >40. H3 reproduced the painting faithfully.
- landing position: bird bbox `(631,214)-(810,319)` against the original
  falcon's `(637,214)-(825,319)`. The last-frame keyframe nailed it.
- idle loop closure: frame 1 vs frame 124 — mean diff **2.81**.
- idle motion is confined to the bird: bird area peaks at 12.9 mean diff while
  the rest of the frame sits at ~2.5, which is VAE noise, not movement.
- exit scrub: frames 26 / 52 / 78 / 104 track the bird from (712,260) out
  through (15,14) at the top-left corner.
