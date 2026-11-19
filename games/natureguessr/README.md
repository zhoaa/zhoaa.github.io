# natGuessr Beta

The Games card opens the [daily player](https://zhoaa.github.io/games/natureguessr/daily/). The public game uses the current date in America/Toronto and serves three rounds for that date.

## Make and release a daily game

1. From the repository root, run `npm run natguessr:curate`. Leave the terminal running and open `http://localhost:8000/games/natureguessr/_curator/` on your computer. Use the same browser and address each time to keep your saved curation.
2. In **Curator desk**, search the candidate bank. Each set has five observations, one per species. Review the photos and evidence. Use **Preview as player** to try a set, then click **Approve & queue** for each set you want.
3. Open **Queue**, reorder the sets, and choose a **First day**. Click **Schedule queued sets**. Each day takes three distinct sets. Click **Add to queue** again to reuse a set on a later date. You can schedule several days in one sitting and use **Preview as player** next to a date to test the full edition.
4. Click **Export curation** and save the JSON somewhere private, such as Downloads. Export again after making changes. Use **Import a saved curation** in Queue to restore a backup or continue on another computer.
5. Upload your export once for the whole batch. This requires GitHub CLI (`gh`) signed into an account that can manage this repository's Actions secrets.

   ```sh
   npm run natguessr:schedule -- "$HOME/Downloads/natguessr-curation-YYYY-MM-DD.json"
   ```

GitHub Actions checks every 20 minutes and publishes only the three rounds assigned to the current Toronto date. Allow time for GitHub's scheduler and the Pages build. To check immediately, run **Release natGuessr daily edition** from the repository's Actions tab.

The curator has no fixed queue length. Each upload replaces the private release schedule and includes only dates from today onward. GitHub limits the compressed release schedule to 48 KB. Keep your latest JSON export, import it if you switch browsers, and include any future dates you still want to use when you upload again. For example, queue nine sets and choose Monday as your start date to schedule Monday through Wednesday in one upload.

The loopback server gives you a curator desk on your own computer. Your browser stores your drafts and the export is your private backup. GitHub stores your uploaded plan in the `NATGUESSR_SCHEDULE` Actions secret. Keep the exported plan outside any public web root and out of Git. The Pages build excludes the `_curator` directory. Released answers are readable in browser source because scoring runs in the browser.

## Country-first picking and image permissions

Every species-candidate query starts with the chosen country's iNaturalist `place_id`. Observation/photo selection uses the same country filter, never a global pool followed by country assignment.

Shared filters: Research Grade, wild, photo present, species or finer, open observer/taxon geoprivacy, reported positional accuracy below 100 m, and **CC0 or CC BY for both observation data and photographs**. The specific selected photo and observation licenses are checked separately. Country place tags and public coordinates inside the country polygon are additional consistency safeguards after the upstream country filter.

Each image displays the poster and the API's original photo attribution, plus its license link. Cropped thumbnails open in an uncropped viewer. Player observation links appear only after the answer is known (correct answer, exhausted guesses, or explicit reveal); curator review keeps its sources available. No separate photo-source link is shown.

Actual observation/photo identifiers, original image URLs, credits, license codes, selection queries, and country-support evidence are in `_curator/data.js`. No OAuth tokens or credentials are used. Photos are loaded directly, rather than copied into the repository. License/availability changes can be reflected by rebuilding the bank and reviewing affected sets.

## What uniqueness means

Each species gets a set of countries with modeled land overlap from the [iNaturalist Open Range Map Dataset](https://www.inaturalist.org/pages/range_maps), CC BY. The intersection of the **five country-support sets** must contain exactly the answer country. This is a country-wide assemblage: the species need not all occur at one point. Country boundaries are Natural Earth 1:10m, public domain; features sharing a country code are unioned before comparisons.

The final check uses full country boundaries and counts modeled land overlaps greater than 0.01 km². The bank records all supporting country IDs per clue and exposes them in review. There are 238 country/territory entities in this boundary index. Countries without five suitable categories, model coverage, or a unique combination are skipped.

This establishes **uniqueness within a defined modeled distribution index**, not proof that no other country truly has these species. Ranges are incomplete predictions, wild observations can include introduced species, and names may make puzzles too easy. These are reasons for human review before approval. Sri Lanka and Indonesia were skipped for insufficient eligible fungus model coverage; the tested Costa Rica pool did not yield a unique set.

## Game feedback

Five guesses per country. Wrong guesses show **Very Far 🦗**, **Far 📍**, **Close 🤏**, **Very Close ❗**, or **Borders ‼️** alongside a compass bearing. The first four bands start at 5,000, 2,000, 800, and 0 km respectively. A shared border takes precedence. The proximity calculation includes islands and territories assigned to each country. For touching countries, the compass points toward the shared border from an interior point of the guessed country.

For separated countries, closest border samples are found on a sphere (segments densified to at most 15 km), then the nearest neighboring segments are refined in a local equidistant projection and measured on WGS84. Values are rounded and displayed as approximate. Offshore islands can make the compass differ from an intuitive mainland-to-mainland direction.

Correct first guesses score 5,000; each additional guess costs 1,000. Five misses scores zero; there is no manual reveal option. Daily progress persists locally, separately from curator playtests. Daily editions use `America/Toronto` dates.

## Rebuild and checks

`_curator/scripts/build_bank.py` requires Python with numpy, scipy, shapely, and pyproj:

```sh
python games/natureguessr/_curator/scripts/build_bank.py --work-dir /absolute/path/to/public-data-cache
node games/natureguessr/_curator/scripts/test.js
```

The builder uses anonymous, cached requests, at most one API request per 1.12 seconds. It caches published range maps and Natural Earth geometry, selects country-scoped candidate pools, rejects ambiguous support intersections, and emits `data.js`. No scraping of personal/private data or authentication is involved.

Tests cover all bank entries' five distinct categories/taxa/photos, source country filters, both license types, supporting-country intersection, complete border feedback, curation import validation, same-day duplicate rejection and cross-day reuse, three-per-day grouping, calendar boundaries, preservation of existing dates, and scoring. Browser checks cover actual loaded/credited images, duplicate/wrong/correct guesses, shared borders and distant-country feedback, photo expansion, source-link timing, approval/queue ordering, scheduling, daily progression, export, and mobile overflow.

## Expanded-bank filters

The 100 new sets exclude answer-country names and recognizable adjective/Latin variants from both common and scientific names. Names of other countries remain allowed. The normalized per-country rules are recorded in `data.js`.

New animal-photo queries use `term_id_or_unknown=17&without_term_value_id=19`, which excludes observations explicitly annotated **Dead** while retaining unannotated observations. Selected responses are also checked for that annotation. This does not establish that an unannotated animal is alive; curators still inspect the pictures. No computer-vision or extensive extra screening is performed.

To append another bank batch while preserving IDs:

```sh
python games/natureguessr/_curator/scripts/build_bank.py --work-dir /absolute/path/to/public-data-cache --add 100 --per-country 10
python games/natureguessr/_curator/scripts/build_player.py
```

`build_player.py` generates the player-only `daily/index.html` shell. The public route excludes curator navigation and never reads the visitor's curator approval/queue from local storage. A day with no published, eligible edition stays empty rather than selecting sample or unreviewed sets.

## Player preview and presentation

**Preview as player** on a candidate or scheduled edition opens the public player interface with an isolated, session-scoped preview. It has no curator approval controls, does not approve or publish anything, and does not overwrite daily progress. **Exit player preview** returns to the curator desk. Preview tokens only work in the browser tab that created them, and expire after one day.

Species cards have equal heights across all responsive rows. The image and its zoom icon open an uncropped photo; attribution links remain separate links. Correct guesses trigger a brief confetti/result animation, disabled for reduced-motion preferences.

The proximity palette runs from blue through purple to red. The guess history and compass panel use the same labels as the How to play legend.

`build_player.py` versions application assets by content hash to prevent stale CSS/JavaScript after deployment; publishing a curation automatically rebuilds those references.

Species-card name rows, scientific-name rows, and attribution dividers align across the grid, including after font loading and responsive resizing. In player views, common and scientific names are censored until two valid guesses have been submitted (before guess three), or until the round ends. The same rule covers zoom-dialog titles, image alt text, and zoom-button labels; curator evidence views retain the names.

Typography uses fluid viewport-relative sizes with readable minimums and card-container-relative text sizing. Photo grids reflow from five to three, two, or one column as space narrows. Inputs retain at least the browser's base text size; text respects browser font settings. Layout checks at 320, 390, 768, and 1440 CSS pixels confirmed no horizontal overflow and equal card heights/divider positions.

At window widths of 1100px and below, the composition centers the brand, game text, controls, feedback, results, and card groups. Partial rows are centered, including a lone fifth card on mobile. Copyright/license details in player views are deferred until a win or five misses; post-round source links are full-width green “See Observation ↗” buttons. Curator evidence retains attribution. The visible brand is natGuessr; existing URLs, storage keys, and exported-plan compatibility are preserved.

Candidate discovery and selection use no LLM calls or language-model services. The “script-checked” label refers to deterministic Python geometry and set intersections over published ecological range maps. The curator page includes runnable generation commands; dependencies are in `_curator/scripts/requirements.txt`. Run the bank builder in a terminal. “Posted by” is visible on cards throughout player rounds, and the observer’s name becomes a profile link after a correct guess; copyright, license, and observation links appear only after the round ends.

During guessing, the photographs use a square crop. At the end, the photos shrink slightly and the details slide up into place. The copyright attribution links to the photo license. Reduced-motion preferences disable the animation. The uncropped preview displays the photo and its close control.
