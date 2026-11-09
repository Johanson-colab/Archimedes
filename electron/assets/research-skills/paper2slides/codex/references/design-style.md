# Design Style

The visual decision guide for you in Stage 3 when expanding `slide_outline.json` into `slide_spec.json`. This file
is **self-contained**: the general deck-design fundamentals (palettes, fonts, layout, spacing, and the "Avoid"
taboos) are all below, followed by the special cases and trade-offs **unique to the paper scenario**.

## Design fundamentals

**Don't create boring slides.** Plain bullets on a white background won't impress anyone. Before choosing per-slide
content, settle four things:

- **Pick a bold, content-informed color palette**: it should feel designed for THIS paper. If swapping your colors
  into a completely different presentation would still "work", you haven't made specific enough choices. (The 10
  palettes below are inspiration; matching one to the paper's topic is in "Matching the palette to the paper topic".)
- **Dominance over equality**: one color dominates (60–70% visual weight), with 1–2 supporting tones and one sharp
  accent. Never give all colors equal weight.
- **Dark/light contrast**: dark backgrounds for title + conclusion slides, light for content (the "sandwich"
  structure, §5). Or commit to dark throughout for a premium feel.
- **Commit to a visual motif**: pick ONE distinctive element and repeat it across every slide — rounded image
  frames, icons in colored circles, thick single-side borders.

Use visual evidence when it helps explain the argument; a text-only slide is acceptable when appropriate. Layout options to draw from: two-column (text left, illustration right) · icon +
text rows (icon in a colored circle, bold header, description below) · 2×2 / 2×3 grid · half-bleed image with
content overlay · large stat callouts (big 60–72pt numbers with small labels) · comparison columns. These are
design ideas to draw from; the legal values of `slide_spec.json/layout_kind` are governed by
[schemas.md](schemas.md) (anything not in the enum is composed freely via element x/y/w/h).

**Type sizes**: slide title ≥36pt bold · section header 20–24pt bold · body ≥16pt (≤14pt is unreadable from the back rows, see §4) · captions 10–12pt muted.
**Spacing**: ≥0.5" margins · 0.3–0.5" between content blocks · leave breathing room, don't fill every inch.

### Avoid (common mistakes — taboos)

- **Don't repeat the same layout** — vary columns, cards, and callouts across slides
- **Don't center body text** — left-align paragraphs and lists; center only titles
- **Don't skimp on size contrast** — titles need 36pt+ to stand out from 16–18pt body
- **Don't default to blue** — pick colors that reflect the specific paper topic
- **Don't mix spacing randomly** — choose 0.3" or 0.5" gaps and use them consistently
- **Don't style one slide and leave the rest plain** — commit fully, or keep it simple throughout
- **Don't create text-only slides** — add images, icons, charts, or visual elements
- **Don't forget text-box padding** — when aligning lines or shapes with text edges, set `margin: 0` on the text box or offset the shape to account for padding
- **Don't use low-contrast elements** — icons AND text need strong contrast against the background
- **NEVER use accent lines under titles** — a hallmark of AI-generated decks; use whitespace or background color instead

For the PptxGenJS API, pitfalls, and **icon generation** (react-icons → SVG → sharp → base64), see this repo's
copy [pptxgenjs.md](pptxgenjs.md) — when writing a spec and choosing icons, consult its "Icons" section (which includes a table of high-frequency academic icon names).

Below adds the rules **unique to the paper scenario**.

---

## Matching the palette to the paper topic

**First read `config.json/color_scheme`** (written to disk in Stage 0.5):

- `null` (the user chose "auto"): pick on your own from the 10 in the table below according to the paper's temperament — the default path of this section.
- non-`null` (the user's color-scheme description):
  the user's intent **takes priority**. If the description directly names a specific palette, use that one; if it is a color-family / directional description, pick the most fitting one from the 10
  in the table below. Still obey the principles below (coordinate with the main figure's dominant color, don't mindlessly pile on blue) and the visual-consistency
  hard rules in §0.

The 10 palettes below are only **inspiration**, not a constraint — you may use them directly, or build your own coordinated palette according to the paper's temperament /
the user's `color_scheme` description. Color codes are 6-digit hex (the `theme.*` written into the
spec needs a `#`):

| Palette | Primary | Secondary | Accent |
|---|---|---|---|
| **Midnight Executive** | `1E2761` navy | `CADCFC` ice blue | `FFFFFF` white |
| **Forest & Moss** | `2C5F2D` forest | `97BC62` moss | `F5F5F5` cream |
| **Coral Energy** | `F96167` coral | `F9E795` gold | `2F3C7E` navy |
| **Warm Terracotta** | `B85042` terracotta | `E7E8D1` sand | `A7BEAE` sage |
| **Ocean Gradient** | `065A82` deep blue | `1C7293` teal | `21295C` midnight |
| **Charcoal Minimal** | `36454F` charcoal | `F2F2F2` off-white | `212121` black |
| **Teal Trust** | `028090` teal | `00A896` seafoam | `02C39A` mint |
| **Berry & Cream** | `6D2E46` berry | `A26769` dusty rose | `ECE2D0` cream |
| **Sage Calm** | `84B59F` sage | `69A297` eucalyptus | `50808E` slate |
| **Cherry Bold** | `990011` cherry | `FCF6F5` off-white | `2F3C7E` navy |

**Principles**:

- Is the paper's main figure's dominant color X? When picking a palette, make primary **coordinate** with X (same color family or complementary), rather than clash
- **Don't pick blue for every paper**. This is AI's default lazy behavior; blue has already been overused by OpenAI/Anthropic/Google and the like

## Fonts

Font pairings are only **inspiration**, not a constraint — pick a header + body pair on your own according to the paper's tone. Below are pairing options (use them directly, or pair your own):

| Header | Body |
|---|---|
| Georgia | Calibri |
| Arial Black | Arial |
| Calibri | Calibri Light |
| Cambria | Calibri |
| Trebuchet MS | Calibri |
| Impact | Arial |
| Palatino | Garamond |
| Consolas | Calibri |

**Taboos**: don't use casual fonts like Comic Sans, Papyrus, Brush Script; don't use the same font for both header
and body (unless it's a minimalist style and you strictly distinguish by weight).

## Mixing layout_kind

`layout_kind` is decided by you in Stage 3 according to slide role + content form on your own, with no preset mandatory pairing.

**Repeating the same layout is another typical fingerprint of AI generation** — a set of slides should mix at least 4 or more layout_kinds.

## 0. Visual-consistency hard rules (obey **before all other rules**)

The 4 items below are the **highest-priority** hard constraints to execute when writing a spec in Stage 3. The other design suggestions (palette, fonts, layout choices) are all second-order choices made on the premise of satisfying these 4.

### 0.1 Subtitle font size, font, and position consistent within the deck

**All `role: "title"` text elements on non-title-slide / non-conclusion-class (including qna) slides must use the same style** — `fontSize`, `fontFace`, `color`, `x`, `y`, `w`, `h`, `bold` are all identical.

**The concrete values are chosen by you in Stage 3 on your own according to the paper / theme / average title length** (fontSize anywhere in the 36-40pt range, y anywhere within 0.3-0.5), **but once chosen the entire deck is strictly consistent**: whatever s02 uses, s03 / s04 / s05 / ... / s11 all use the same set of values.

**Implementation point**: when writing the subtitle of the first non-title slide, fix a style dict (e.g. `{"fontFace": "Georgia", "fontSize": 32, "color": "<theme.primary>", "x": 0.5, "y": 0.4, "w": 9.0, "h": 0.9, "bold": true}`), and for every subsequent non-title/conclusion slide directly **reuse the fields of the same dict**, don't estimate each one separately.

**The only exceptions**:

- The title slide's (s01) main title: usually a larger font size (44-48pt) and a more centered position — this is the title-slide class's own style
- The conclusion / qna slide's main title: may match the title slide (dark background + large text), forming a sandwich structure

**Within** each class it must be consistent within the deck (not every slide being different).

### 0.2 Avoiding title orphans

When PptxGenJS textbox text is too long it wraps automatically; render_pptx.py already automatically adds `autoFit: true` to `role: "title"` text elements, which in most cases automatically shrinks the font size to keep a single line. Even so, Stage 3 must still proactively avoid orphans:

- The pairing of title word count and textbox width should let "the vast majority of" titles fit on a single line; rely on autoFit as a fallback only for the very few extra-long titles
- **Don't** specially change the `fontSize` of one extra-long title just for it — that breaks 0.1's consistency. The handling of a long title is to rewrite it shorter, or let autoFit shrink it automatically
- When the title slide's paper title is especially long (> 8 words), just lower the main title's font size one notch from the default large size (e.g. 48 → 36) — but all titles within the title-slide class use the same font size

### 0.3 Image proportional scaling (never distorted)

Before generating the `.pptx`, `render_pptx.py` **reads each image's real dimensions with PIL**, treats the `(x, y, w, h)` given in the spec as a "maximum box", automatically computes "the actual footprint after proportional scaling by the original image's ratio + centering within the original box", and then feeds it to PptxGenJS. This step happens on the Python side of the render pipeline, **independent of PptxGenJS's sizing field**, so **no image is ever stretched horizontally/vertically** — the aspect ratio of letters and numbers in a table always stays consistent with the original PNG.

When Stage 3 assigns an image's `(w, h)`, still try to stay as close to the original image's ratio as possible (so the whitespace after proportional scaling is minimal):

1. **First look at the original image's actual aspect ratio**: `Image.open(path).size` or eyeball the relative proportions of the figure/table in the full-page PNG
2. Choose an available box within the layout (e.g. the right half of `image_half_bleed`, a cell of `grid_2x2`)
3. **Make the box's aspect ratio as close to the original image's ratio as possible** — this way the image fills the box, whitespace is minimal, and it looks visually full
4. When you don't know the original image's ratio, **using a square box** (`w == h`) is safest — render will automatically scale by the original ratio and center it, never distorted

Note: the spec **does not need** a `sizing` field — the render side ignores it (because (w, h) has already been adjusted to the actual footprint on the Python side, independent of PptxGenJS's sizing). Writing it is harmless; it gets popped automatically.

### 0.4 Visual hierarchy and balance

Prioritize faithful evidence, projection readability and a clear reading order. Intentional whitespace is welcome; evaluate imbalance in context, not by fixed geometric thresholds. Never add unsupported text merely to fill space. Fix crowding by reducing text or splitting slides; fix a weak visual by enlarging, splitting or annotating the source while retaining context. Visually obvious misalignment or clipped content should be fixed.

## Visual-Richness Recommendations

The two items below are **aesthetic tips, not hard rules** — they don't enter the section-0 hard checks, and QA won't fail because of them; but they can lift a "correct but plain" page to having a professional feel.

### A. Give bullets a leader marker (**strongly recommended**)

Don't leave body list items as unmarked plain-text lines (like a wall of text). Each bullet should have a
list-item leader marker in front — **use a standalone `kind:"icon"` element** as the leader marker (a semantic icon is best;
when you only want a neutral marker, use small geometric icons like `FaCircle` / `FaSquare` / `FaAngleRight`,
see [pptxgenjs.md](pptxgenjs.md) "Icons").

- **Disable PptxGenJS's default `bullet: true`** — the default dots it produces are too ugly; a custom
  `bullet:{code}` top-level boolean isn't passed through either, so don't take this route at all
- **Don't** hand-type `"• "` / `"- "` in the text (pptxgenjs.md pitfall: it becomes a double bullet)

Compatible with the **splitting into multiple standalone text elements** of §0.4: after splitting, give **each**
single-line element its own marker icon; don't lose the leader markers after splitting.

**The leader marker and the text must be vertically center-aligned (iron rule)**: the marker icon's box is short (e.g. `h≈0.2`),
while the paired text box is tall and often `valign:"middle"` (`h≈0.5–0.66`) — both have a visual center of `y+h/2`,
and casually using the same `y` makes the whole row of leader markers sit too high, where "the markers aren't aligned" is visible to the naked eye (the visual QA subagent easily misses reporting this,
so rely on the quantitative self-check below to catch it).

- **Formula**: `icon_y = text_y + (text_h − icon_h) / 2` (the icon's vertical center == the text box's
  center; the same goes for multi-line bullets, the icon lands at the midpoint of the text block)
- Horizontal: leave a ~0.1" gap between the icon's right edge and the text's left edge
- **At the wrap-up, use a script to batch-self-check each leader+text pair** `icon.y+icon.h/2 ≈ text.y+text.h/2`
  (a difference > 0.02" is a naked-eye-visible offset), don't rely on eyeballing

### B. Underlay a rounded rectangle beneath structural groupings (recommended)

For grouped structures like a non-title "large text + small text" (e.g. a KPI number + caption) or "icon + phrase",
you can underlay a low-key rounded rectangle beneath it (`ROUNDED_RECTANGLE` + `rectRadius`, light fill, `z` placed below the content) to add layering and a card feel.

- For the API see [pptxgenjs.md](pptxgenjs.md); **note its pitfall #8**: don't stack a rectangular
  accent bar on top of a rounded rectangle (it can't cover the rounded corners); to stroke it, use the ROUNDED_RECTANGLE's own `line`

## Design trade-offs unique to the paper scenario

### 1. Formulas

PptxGenJS is not good at rendering math. **First look at `paper_meta.json/equations[]`** (the mineru backend fills it automatically):

```json
{"id": "eq_5", "page": 6,
 "bbox": [0.18, 0.34, 0.50, 0.04],
 "latex": "PE _ {(pos, 2 i)} = \\sin (pos / 1 0 0 0 0 ^ {2 i / d _ {\\mathrm {model}}})"}
```

#### Processing priority (must judge in order, **don't default straight to cropping the image**)

**Step one: judge whether the latex is "simple"**: the cleaned latex string contains **none of** the keywords below → simple:

```
\sum   \int   \prod   \begin{matrix}   \begin{cases}   \begin{align}   \\\\
```

**Step two: choose one of the two below** (doing "both" is not allowed):

| Formula type | Handling | Form written into the spec |
|---|---|---|
| **Simple** (default) | **Unicode rewrite**, write a text element | a single-line string, fontFace uses Cambria, e.g.: `Attention(Q,K,V) = softmax(QK^T / √d_k) V` or `PE(pos, 2i) = sin(pos / 10000^(2i/d))` |
| **Complex** | `equations[i].bbox` + `page_screenshot.py` to crop the original PDF line, as an image element | the image element points to the cropped PNG |

**Step three** (independent of the above): **always** write the original `latex` string into `speaker_notes` as a fallback — so a later revision or a renderer swap can still recover the original content.

#### No double display (**most common error**)

**The same formula is expressed on the deck only once (one of the two)**: a bullet already wrote Unicode → don't add that formula's image element, and use the saved space for a visualization; cropped image → the bullet does **not** repeat writing the formula.

### 2. The size of paper figures

Figures in papers are usually 4:3 or closer to square. A `LAYOUT_16x9` slide is 10×5.625"; when stuffing a figure
into `image_half_bleed`:

- Single figure: width 4.5–5", height auto-fit (keep the ratio, don't stretch)
- Multi-panel composite figure (e.g. the paper's Figure 1 is composed of 6 subfigures): consider cropping only **a part** of the paper figure
  as a slide element (give a bbox with `page_screenshot.py`); stuffing 6 onto a slide will be a blur
- The source of the crop bbox and the QA re-crop rule are **the same as the §3 table below**: do directional fine-tuning based on mineru's original box, don't eyeball out of thin air

### 3. Tables

A paper's result table usually has many columns + dense text. **Don't rebuild it with a PptxGenJS table** (hand-writing
50 rows of cells, tuning alignment until you break down). Just:

- Crop the result table region from the full-page PNG → use it as an image element
- Next to it, use a sentence or two of bullets to highlight "our method is +X.Y better than the baseline"

**Crop bbox (figures and tables follow the same rule): the first cut must be mineru's original box itself, and QA re-cropping also only moves that one edge on the original box — throughout, don't eyeball the full page out of thin air**

> ⚠️ **This skill's most common execution derailment in testing**: the Agent "takes it upon itself" to skip step 1 below and, before cropping
> the first version, goes to look at `pages/page-NN.png` to estimate the box → the figure cuts off the title, the table sweeps in the caption /
> misses key rows, and re-cropping two or three times still doesn't crop accurately. The rule was laid down long ago; derailment is almost always due to jumping the gun without following step 1.
> **Iron rule: the bbox of the first `page_screenshot.py` call must equal `captions[i].bbox` value by value,
> eyeballing first is not allowed.** Thinking "the original box is surely inaccurate, looking at the page first and then estimating is faster" — that very thought is the derailment point;
> the original box's first cut + single-edge fine-tuning is almost always faster and more accurate than re-estimating.

1. **First cut = original box's original values (not allowed to eyeball first)**: pass the four-tuple of `figures_index.json/captions[i].bbox` (detected by `mineru:vlm`) **unchanged** to `page_screenshot.py` to crop the first version, **and before cropping this version you are not allowed to look at `pages/page-NN.png`**. **`bbox_confidence == high` does not equal clean edges** — in testing, mineru often presses the `y` start point onto the subfigure title / caption line, causing the title to be cut or the caption to be swept in; this is expected, solved by step 2's fine-tuning of that one edge, **not a reason to abandon the original box and re-estimate**.
2. **When QA finds the crop isn't clean — don't abandon the original box and re-eyeball**. Look at the QA-rendered image to judge **which edge has too much / too little**, and only do directional incremental fine-tuning of that edge on the original bbox:
   - Top cuts off content (subfigure title, first line is cut) → decrease `y`, increase `h` in sync (expand upward)
   - Bottom / a side sweeps in the caption or body text → decrease the corresponding `h` / `w` (pull inward)
   - Move only one edge by a small amount at a time (≈0.01–0.03), re-crop → look again, usually converging in one or two rounds. **The original box's x/w and rough position are usually already correct; the wrong thing is just one edge** — change that edge, don't re-estimate the whole thing
   - **Tables must keep their own top and bottom rule lines** (booktabs `\toprule` / `\bottomrule`). When pulling the top edge down to remove the caption, **stop at the upper edge of `\toprule`**, don't pull too far and crop the top line away; a table missing the top/bottom rule lines looks "open / broken"
3. Only when the `bbox` field is entirely missing (neither the script nor mineru located it, rare) do you fall back to looking at `pages/page-NN.png` to estimate the box, still **err tight rather than loose**, with `--pad 0.005` as a fallback

**Figures and tables are the same**: this rule applies equally to the `page_screenshot.py` cropping of paper figures.

### 4. Text and visual density

Use the minimum text needed to explain the slide's argument and evidence. Maintain readable type and sufficient contrast; split crowded slides. Intentional whitespace is acceptable. Prefer a meaningful paper figure, table, diagram or chart when it adds evidence; simple text may be appropriate when the content warrants it. Avoid filling the page with decorative cards or unsupported assertions.

### 5. Sandwich structure

A dark-palette `title` and `conclusion`/`qna`, with the middle content using a light palette. This "dark-light-dark"
structure gives the audience a psychological sense of rhythm of "opening—body—closing". The `theme` is still a single palette, but
the title/conclusion slide just uses a `shape` to full-screen fill the primary color as the background.

### 6. Things to avoid (be especially wary in a paper deck)

- ❌ Adding horizontal line decoration under a title (a typical AI fingerprint — see the "Avoid" taboo "NEVER use accent lines under titles" above)
- ❌ Writing the paper title in the footer of every slide (repetitive noise; writing it once on the title slide is enough)
- ❌ Copying a whole page of formulas directly (can't be read clearly)
- ❌ A purely ceremonial slide like "Thanks for listening" (takes up space, the conclusion already wrapped up)
- ❌ All slides using the same layout_kind
- ❌ Default PowerPoint template colors (Office blue-and-white)

## Visual review and fixes

Follow [qa.md](qa.md). Compare the original source with each cropped or redrawn visual; verify important labels, comparison conditions, axes and legend. Review actual visual diversity and reading hierarchy, not layout labels alone. Fix clipping, misleading representations and genuinely distracting misalignment; avoid forcing uniform geometric occupancy. Rerender after changes, recheck affected slides, then perform a final full-deck pass. Record unresolved limitations instead of claiming a pass.
