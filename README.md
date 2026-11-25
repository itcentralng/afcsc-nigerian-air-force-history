# SK Aneke Hall of Fame

**Department of Air Warfare · Armed Forces Command and Staff College, Nigeria**

Touch-screen kiosk covering the history of the Nigerian Air Force, its Chiefs of
the Air Staff, the College and the Department of Air Warfare.

It is a static, offline web app (no build step, no framework, no internet
needed) designed for a 1920×1080 landscape display and scaled to fit any
screen. The presentation layer — colours, typography, layout and motion —
follows the AFCSC *History Experience* exhibition: warm ivory paper, deep navy
for strong moments, aviation blue for interaction, olive for military
character and brass for dates and highlights.

The content was extracted from the earlier web prototype at
<https://aneke-hall-of-fame.netlify.app>, lives in `data/content.js` and is
untouched by this rework.

## The exhibition

Six galleries, with a welcome screen and a contents page. The numbers match the
dock at the foot of every gallery.

| # | Gallery | Route | What it holds |
| --- | --- | --- | --- |
| 01 | Welcome | `#/welcome` | The exhibition entrance: the NAF crest, the title, the gallery links and the figures |
| — | Home | `#/home` | A rotating archive moment and a card for every gallery (reached from Welcome and the top bar) |
| 02 | History | `#/history` | The six decades as a deck of cards; each moment links straight to the timeline |
| 03 | Nigerian Air Force | `#/naf` | The era explorer and the full 1961–2026 timeline |
| 04 | Chiefs of the Air Staff | `#/chiefs` | All 23 commanders and chiefs, 1963 to today, in one swipeable row |
| 05 | The College | `#/college` | The 17 records from the history of the College on a light table |
| 06 | Film Archive | `#/films` | The seven films in a theatre with a player |
| 07 | Air Warfare | `#/daw` | The Department's history as flip cards and a ribbon |

### History — the deck of six chapters

The six decades are dealt as a deck. The open card shows its chapter — the
photograph, the range, the title, the summary and its first moments — and the
others are folded away showing their backs, the Roman numeral and the range.
Cards before the open one stack to its left and the rest to its right. Touch a
folded card and it turns face up while the open one turns over and folds into
the stack (`#/history?chapter=3` opens the deck at a given card). Each card also
carries an **Open this era on the timeline** button.

### Nigerian Air Force — eras and timeline

This gallery merges what used to be the era explorer and the timeline.

- **Eras** (`#/naf`) — the six decades as full-height folders. The open folder
  shows its brief, its moment count and its first record; the others stand
  collapsed with their title running up the side. Touch a folder to open it.
- **More info** (`#/naf?era=2&year=1984`) — the folders shrink to a strip at
  the top of the screen and the detailed timeline opens below it: the floating
  print stack (the moment's photograph, its neighbours and a film card) on the
  left, the text on the right, and the year cards along the bottom. The strip
  switches era; the year cards and the arrows move through the moments.

### Records

The Chiefs wall and the light table both open the **record viewer**: a navy
stage with the full photograph, and a paper panel carrying the title, dates,
facts, biography, achievements and sources, with previous/next through the
collection. Every photograph can be opened full screen in the **photo viewer**,
which carries a counter, a caption and a thumbnail strip.

## Screens and controls

- **Top bar** — both crests (AFCSC and the Nigerian Air Force) and the gallery
  name; the section number and title in the centre; **Back** (retraces the
  visitor's own path), **Home** and **Close** (closes the kiosk window).
- **Dock** — the six galleries with their numbers, plus previous/next ends that
  name where they lead. The welcome and home screens are reached from the
  **Home** button and the entrance, so they are not in the dock.
- **Flight curtain** — every change of gallery is covered by a brass panel
  chased by a navy one carrying a jet and the gallery title.
- **Keyboard** — `Esc` closes an overlay; `←`/`→` step through the timeline and
  the photo viewer.
- **Idle** — after 120 seconds without a touch a "Are you still exploring?"
  prompt counts down 10 seconds, then the kiosk returns to the welcome screen.

Timings (`IDLE_MS`, `IDLE_COUNT`, `MOMENT_ROTATE_MS`) are at the top of
`script.js`.

## Files

```
index.html            the shell: top bar, screen, dock, viewers, player, idle
styles.css            the design system and every screen
script.js             the router, the views and the overlays
data/content.js       all of the content (window.HOF_CONTENT)
assets/               photographs, portraits, films, crests, fonts
docs/                 the history as a plain reference document
tools/                media fetching, content extraction, portrait cropping
source/               the archive of the original prototype
run.bat               launch the kiosk in Edge kiosk mode
prepare.bat           create the Desktop shortcut
update.bat            pull the latest version and restart
```

## Running on the kiosk

1. Copy the whole folder onto the kiosk PC, including `assets/`.
2. Run `prepare.bat` once to create a Desktop shortcut (then pin it to the taskbar).
3. Launch with the shortcut or `run.bat`. It opens Microsoft Edge in full-screen kiosk mode.
4. To update later, run `update.bat`. It closes the kiosk, fast-forwards from the configured GitHub branch, and restarts it. Git and an internet connection are required; local changes that prevent a safe update are left untouched.

For development, open `index.html` in any modern browser.

## Media

The photos and films live under `assets/history`, `assets/photos`,
`assets/college`, `assets/portraits` and `assets/video`, at the exact paths
named in `data/content.js`. Anything missing disappears quietly (and a film
shows "Coming soon"), so the kiosk never breaks.

To fetch them from the original site:

- From a Mac without this repository: `bash tools/get-hall-of-fame-media.sh`
  downloads everything to `~/Desktop/hof-media` and zips it.
- Inside this repository: `bash tools/fetch-media.sh` downloads anything
  missing straight into `assets/`.

## Updating content

Everything lives in `data/content.js` (`window.HOF_CONTENT`):

| Key | What it holds |
| --- | --- |
| `meta` | Titles, host line and tagline |
| `decades` | `from`, `to`, `title`, `summary` for the six eras |
| `events` | Timeline moments, oldest first: `year`, `date` (as displayed), `title`, `text` (paragraphs), `photos`, `caption` (for the first photo), optional `state` |
| `chiefs` | In order: `no`, `name`, `shortName`, `rank`, `from`/`to` (`YYYY-MM-DD`, `to: null` while serving), `born`, `died`, `state`, `bio`, `achievements`, `sources`, `photo` (archive scan), `portrait` (even crop) |
| `films` | `id`, `title`, `subtitle`, `src`, `description`, and `year` or `section` |
| `chronicles` | `college` and `daw`: `eyebrow`, `title`, `intro`, `hero`, `heroCaption`, `items` (`date`, `title`, `text`, `photos`, `caption`) |
| `bases`, `aircraft`, `states`, `nigeriaOutline` | Still in the file for the original prototype; the kiosk no longer shows them |

Counts on the welcome screen, the era folders and the wall are worked out from
this file, so adding an event, a Chief or a College record needs no code
change. Adding an event to a decade also adds it to that era's timeline and
year cards.

`docs/naf-history-llm-context.txt` is the same history as a clean reference
document for use as LLM context (facts and narrative only: no photos,
captions, films or kiosk wording). Regenerate it after editing with
`node tools/export-llm-context.js`.

## Chief portraits

The archive photos of the Chiefs vary a lot: some are tight head shots, others
are framed certificates with the name printed underneath, and the early ones
carry long captions. So every Chief also has an evenly cropped `portrait` in
`assets/portraits/` (4:5, the face the same size and at the same height in
each). The wall and the record viewer use the portrait.

To redo them (for example after replacing a photo), install Pillow and
`opencv-python-headless` (version 4) and run
`python3 tools/crop-chief-portraits.py`. It finds each face automatically;
`OVERRIDES` in the script holds a hand-set face box for the three it misses,
and `BOUNDS` keeps the crop clear of printed captions and borders.

## Source archive

`source/aneke-hall-of-fame/` keeps the page as downloaded from the Netlify
prototype. `node tools/extract-content.js` rebuilds `data/content.js` from it;
only re-run that if the archive is replaced, since it overwrites hand edits.

## Fonts and colours

Manrope (interface) and Playfair Display (titles) are bundled in
`assets/fonts` under the SIL Open Font License and loaded by
`assets/fonts/fonts.css`, so nothing loads from the internet. The earlier
Source Sans 3 files stay in place as the fallback in the font stack.

The palette, gradients, shadows, radii and easing curves are defined once at
the top of `styles.css` as custom properties; change them there and the whole
kiosk follows.
