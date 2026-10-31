# Image replacement — DONE 2026-10-31

All 14 mismatched service photographs were replaced. Every candidate was
downloaded and **actually viewed** before use, because Unsplash alt text is
auto-generated and unreliable: a search for "jump starting car battery"
returned a photo of shoes, and one for "post office parcel counter" returned
sixteen building exteriors and letterboxes.

## What replaced what

| Service | Now shows | Replaced |
|---|---|---|
| `elder-assistance` | Two women laughing while gardening, no clinical clothing | A woman in a clinical white coat |
| `package-delivery` | A parcel passing hand to hand | A fulfilment warehouse |
| `tv-mounting` | A television mounted on a wall, screen off | A TV on a stand, covered in broadcaster logos |
| `car-battery-jump` | Hands holding jumper clamps over an engine bay | A humanoid robot |
| `furniture-assembly` | A screwdriver at a flat-pack cam-lock fitting | Window cleaning in a respirator |
| `appliance-repair` | A washing machine opened to its motor and belt | Engineering drawings on a desk |
| `moving-help` | People loading boxes into a van | A house exterior at dusk |
| `wait-in-line` | A line of people waiting along a rail | A business handshake |
| `errand-runner` | Someone on a street carrying a collected bag | A couple cooking at home |
| `date-companion` | Two people talking across a restaurant table | A cookbook |
| `listening-service` | A woman on a phone call at home | Five people at a co-working table |
| `sleep-call-companion` | A telephone beside a bed at night | A woman lying in a lavender field |
| `package-return` | A taped parcel ready to go | Empty gift bags |
| `tech-setup` | One person helping another with a laptop at home | A meeting with notebooks |

## Rules applied

- Free **Unsplash Licence** only (`images.unsplash.com/photo-*`). Never
  `plus.unsplash.com/premium_photo-*`, which is the paid Unsplash+ tier.
- **No third-party brand marks as the subject.** The labelling shot that read
  best for Package Return was dropped because a cartoon character sat large on
  the hoodie and a product brand sat in the next crop — the same objection that
  condemned the old TV photo, so it had to apply here too.
- URLs carry `crop=entropy&w=800&h=480`, which pre-frames each image to the 5:3
  card. Several originals are portrait; a plain centre crop sliced the subject
  out of them.
- Nothing is presented as a Helpward customer, helper or completed job. No
  caption, alt text or copy claims otherwise.
- Alt text stays `alt=""`. These remain decorative: each sits beside a heading
  that already names the service. Give a photograph real alt text when it is
  carrying information the heading does not.

## Where applied

`services.image_url` in Supabase, which feeds **both** the website and the iOS
app. 26 of 26 active services have an image; 14 now carry `crop=entropy` and the
other 12 were already appropriate.

## Reference

- Findings for the original 26: `contact-sheet-findings.json`
- Pre-replacement URLs: `current-images.json`
- Designer contact sheet (shows the OLD images and why they failed):
  https://claude.ai/code/artifact/237986a2-f89e-4d72-828e-71900b698e8e
- Downloaded originals and candidates: `~/Documents/helpward-image-work/`
