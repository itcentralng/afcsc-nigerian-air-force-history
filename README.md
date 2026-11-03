# Air Marshal S.K. Aneke Hall of Fame

**History of the Nigerian Air Force · Armed Forces Command and Staff College, Jaji**

Touch-screen kiosk telling the story of the Nigerian Air Force: the
moments, the Chiefs of the Air Staff, the College, the Department of Air
Warfare, the bases and the aircraft. It is a static, offline web app (no
build step, no framework, no internet needed) designed for a 1920×1080
landscape display and scaled to fit any screen. It follows the same pattern
as the Timbuktu Triangle, Our Leaders and Directorate of Procurement kiosks.

The content was extracted from the earlier web prototype at
<https://aneke-hall-of-fame.netlify.app> and rebuilt here.

## Screens

- **Welcome**: the intro film loops behind the title (falling back to a slow
  slideshow of archive photographs when the film is missing), with a rotating
  "From the archive" fact, or "On this day" when an event shares today's date.
  Any touch begins.
- **Home**: eight stories as picture tiles, the key numbers, a rotating archive
  moment that opens its year, and a progress line showing what the visitor has
  explored.
- **I · History of the Nigerian Air Force**: six decades as chips, and a
  1961–2026 year ruler you sweep with a finger (dot size shows how much
  happened). A decade shows its summary, its films and every year with events;
  a year shows the Chief of the Air Staff at the time, each event with its
  photographs, and the film that tells it.
- **Films**: seven short films in a full-screen player with scrubbing,
  "Next film" and a "Read the story" link back into the history. Any film not
  yet copied to `assets/video/` shows as "Coming soon" (see
  `assets/video/README.txt` for the file names); it appears automatically once
  the file is in place.
- **II · Past Chiefs of the Air Staff**: every tenure drawn to scale on a
  1963–today ribbon, and a portrait gallery to sweep through. Each Chief has a
  biography page: tenure, time in office, birth, state of origin, notable
  achievements, sources, and everything that happened under his command.
- **III · History of the College** and **IV · Department of Air Warfare**:
  illustrated chronicles along a vertical spine, linked to each other.
- **V · Fleet & Bases**: a map of Nigeria with 20 bases (tap a pin or a name)
  and an aircraft hangar of 20 types, filterable by decade of entry.
- **VI · Find your connection**: pick your state, your birth year (decade,
  then year) or a Chief, and see the Chiefs, bases and moments connected to it.
- **VII · Photo archive**: all 242 photographs in one grid, filterable by
  collection, each opening full screen with its caption and a link to its story.

Every photograph opens in the photo viewer (swipe or use the arrows; tap
"Read the story" to jump to where it belongs).

**Accessibility**: the **A A** button enlarges body text; **Reach** moves the
top bar to the bottom of the screen for children and wheelchair users.

After 90 seconds without a touch a "Still exploring?" prompt counts down
10 seconds, then the kiosk resets to the welcome screen (it waits while a film
is playing). Timings are at the top of `script.js`.

## Running on the kiosk

1. Copy the whole folder onto the kiosk PC, including `assets/`.
2. Run `prepare.bat` once to create a Desktop shortcut (then pin it to the taskbar).
3. Launch with the shortcut or `run.bat`. It opens Microsoft Edge in full-screen kiosk mode.

For development, open `index.html` in any modern browser.

## Media

The photos and films live under `assets/history`, `assets/photos`,
`assets/college` and `assets/video`, at the exact paths named in
`data/content.js`. Anything missing shows a quiet placeholder (and films show
"Coming soon"), so the kiosk never breaks.

To fetch them from the original site:

- From a Mac without this repository: `bash tools/get-hall-of-fame-media.sh`
  downloads everything to `~/Desktop/hof-media` and zips it.
- Inside this repository: `bash tools/fetch-media.sh` downloads anything
  missing straight into `assets/`.

Optional background music: drop a loop at `assets/audio/ambient.mp3` and a
mute button appears; it ducks while a film plays.

## Updating content

Everything lives in `data/content.js` (`window.HOF_CONTENT`):

| Key | What it holds |
| --- | --- |
| `meta` | Titles and tagline |
| `decades` | `from`, `to`, `title`, `summary` for the six decade chips |
| `events` | Timeline moments, oldest first: `year`, `date` (as displayed), `title`, `text` (paragraphs), `photos`, `caption` (for the first photo), optional `film` (a film `id`) and `state` (links it to *Find your connection*) |
| `chiefs` | In order: `no`, `name`, `shortName`, `rank`, `from`/`to` (`YYYY-MM-DD`, `to: null` while serving), `born`, `died`, `state`, `serving`, `bio`, `achievements`, `sources`, `photo` |
| `bases` | `id`, `city`, `state`, `lon`/`lat` (map position), `role`, `photo`, `caption`, `text`, optional `labelDx`/`labelDy` to nudge the map label |
| `aircraft` | `name`, `origin`, `role`, `inService`, `note`, `photo`, `caption` |
| `films` | `id`, `title`, `subtitle`, `src`, `description`, and `year` or `section` for the "Read the story" link |
| `chronicles` | `college` and `daw`: `eyebrow`, `title`, `intro`, `hero`, `heroCaption`, `items` (`date`, `title`, `text`, `photos`, `caption`) |
| `states` | The 36 states and FCT for the state picker |
| `nigeriaOutline` | Country outline as `[lon, lat]` points |

Counts on the home screen, the archive, the lineage ribbon and the
connections are all worked out from this file, so adding an event, a Chief or
a photo needs no code change.

`docs/naf-history-llm-context.txt` is the same history as a clean reference
document for use as LLM context (facts and narrative only: no photos,
captions, films or kiosk wording). Regenerate it after editing with
`node tools/export-llm-context.js`.

## Source archive

`source/aneke-hall-of-fame/` keeps the page as downloaded from the Netlify
prototype. `node tools/extract-content.js` rebuilds `data/content.js` from it;
only re-run that if the archive is replaced, since it overwrites hand edits.

## Fonts

Playfair Display, Source Sans 3 and IBM Plex Mono are bundled in
`assets/fonts` (SIL Open Font License) so nothing loads from the internet.
