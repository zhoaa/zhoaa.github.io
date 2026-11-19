# NatureGuessr — curator prototype

Run `npm run dev` from the repository root and open `/games/natureguessr/`. This is a normal standalone HTML/CSS/JS app; it also opens directly from `index.html`. It does not depend on the chat visualization renderer. Fonts and openly licensed observation photographs load from their original providers.

## Review first, publish later

The bank now stores **126 sets: 100 newly added candidates plus the original 26**. Nine original sets are archived because a displayed species name contains the answer country or its adjective, leaving **117 eligible candidates**. Existing IDs are retained so curation records are not silently deleted. Archived entries cannot be approved, scheduled, or published. None is pre-approved or pre-scheduled.

1. Use **Curator desk** to search, inspect photos and evidence, playtest, approve, or reject sets.
2. **Approve & queue** adds a set to your ordered, unscheduled queue. Reorder or remove entries in **Queue**.
3. Choose a start date and schedule complete groups of three. Existing dates are preserved and leftover sets remain queued. Return an edition to the queue to change it.
4. The separate **public Daily game** at `daily/` uses only `published-schedule.js` for the current Toronto date. It ignores browser-local curator drafts, so all players receive the same reviewed edition. Use **Preview edition** in the queue to play a local draft before publishing. No unreviewed fallback is used.
5. Export curation as JSON to back it up or hand it off for later ordering/publishing. Import restores the exported approval, rejection, queue, and calendar state.

Curation is stored in this browser's local storage, not synced to a server. Export a backup before changing browsers or clearing storage. Import replaces the local draft. `/games/natureguessr/?qa=1` uses a separate QA storage namespace; it does not change the ordinary curator state.

When explicitly ready to prepare a reviewed schedule for this static site:

```sh
node games/natureguessr/scripts/publish-curation.js /absolute/path/to/natureguessr-curation.json
```

This validates the plan and updates `published-schedule.js`. It does **not** deploy, commit, or publish anything. A normal repository deployment is still needed to share the edition with others. The current published schedule is empty.

## Country-first picking and image permissions

Every species-candidate query starts with the chosen country's iNaturalist `place_id`. Observation/photo selection uses the same country filter, never a global pool followed by country assignment.

Shared filters: Research Grade, wild, photo present, species or finer, open observer/taxon geoprivacy, reported positional accuracy below 100 m, and **CC0 or CC BY for both observation data and photographs**. The specific selected photo and observation licenses are checked separately. Country place tags and public coordinates inside the country polygon are additional consistency safeguards after the upstream country filter.

Each image displays the poster and the API's original photo attribution, plus its license link. Cropped thumbnails open in an uncropped viewer. Player observation links appear only after the answer is known (correct answer, exhausted guesses, or explicit reveal); curator review keeps its sources available. No separate photo-source link is shown.

Actual observation/photo identifiers, original image URLs, credits, license codes, selection queries, and country-support evidence are in `data.js`. No OAuth tokens or credentials are used. Photos are loaded directly, rather than copied into the repository. License/availability changes can be reflected by rebuilding the bank and reviewing affected sets.

## What uniqueness means

Each species gets a set of countries with modeled land overlap from the [iNaturalist Open Range Map Dataset](https://www.inaturalist.org/pages/range_maps), CC BY. The intersection of the **five country-support sets** must contain exactly the answer country. This is a country-wide assemblage: the species need not all occur at one point. Country boundaries are Natural Earth 1:10m, public domain; features sharing a country code are unioned before comparisons.

The final check uses full country boundaries and counts modeled land overlaps greater than 0.01 km². The bank records all supporting country IDs per clue and exposes them in review. There are 238 country/territory entities in this boundary index. Countries without five suitable categories, model coverage, or a unique combination are skipped.

This establishes **uniqueness within a defined modeled distribution index**, not proof that no other country truly has these species. Ranges are incomplete predictions, wild observations can include introduced species, and names may make puzzles too easy. These are reasons for human review before approval. Sri Lanka and Indonesia were skipped for insufficient eligible fungus model coverage; the tested Costa Rica pool did not yield a unique set.

## Game feedback

Five guesses per country. Wrong guesses show only approximate nearest-border distance and a compass bearing toward the answer. There are no temperature labels or category badges. Distances include islands/territories assigned to each country entity, not just mainland centers. Neighboring polygons have zero distance and display “Borders touch”; their compass points toward the shared border from an interior point of the guessed country.

For separated countries, closest border samples are found on a sphere (segments densified to at most 15 km), then the nearest neighboring segments are refined in a local equidistant projection and measured on WGS84. Values are rounded and displayed as approximate. Offshore islands can make the compass differ from an intuitive mainland-to-mainland direction.

Correct first guesses score 5,000; each additional guess costs 1,000. Five misses scores zero; there is no manual reveal option. Daily progress persists locally, separately from curator playtests. Daily editions use `America/Toronto` dates.

## Rebuild and checks

`scripts/build_bank.py` requires Python with numpy, scipy, shapely, and pyproj:

```sh
python scripts/build_bank.py --work-dir /absolute/path/to/public-data-cache
node scripts/test.js
```

The builder uses anonymous, cached requests, at most one API request per 1.12 seconds. It caches published range maps and Natural Earth geometry, selects country-scoped candidate pools, rejects ambiguous support intersections, and emits `data.js`. No scraping of personal/private data or authentication is involved.

Tests cover all bank entries' five distinct categories/taxa/photos, source country filters, both license types, supporting-country intersection, complete border feedback, curation import validation, duplicate/reused schedule rejection, three-per-day grouping, calendar boundaries, preservation of existing dates, and scoring. Browser checks cover actual loaded/credited images, duplicate/wrong/correct guesses, shared borders and distant-country feedback, photo expansion, source-link timing, approval/queue ordering, scheduling, daily progression, export, and mobile overflow.

## Expanded-bank filters

The 100 new sets exclude answer-country names and recognizable adjective/Latin variants from both common and scientific names. Names of other countries remain allowed. The normalized per-country rules are recorded in `data.js`.

New animal-photo queries use `term_id_or_unknown=17&without_term_value_id=19`, which excludes observations explicitly annotated **Dead** while retaining unannotated observations. Selected responses are also checked for that annotation. This does not establish that an unannotated animal is alive; curators still inspect the pictures. No computer-vision or extensive extra screening is performed.

To append another bank batch while preserving IDs:

```sh
python games/natureguessr/scripts/build_bank.py --work-dir /absolute/path/to/public-data-cache --add 100 --per-country 10
python games/natureguessr/scripts/build_player.py
```

`build_player.py` generates the player-only `daily/index.html` shell. The public route excludes curator navigation and never reads the visitor's curator approval/queue from local storage. A day with no published, eligible edition stays empty rather than selecting sample or unreviewed sets.

## Player preview and presentation

**Preview as player** on a candidate or scheduled edition opens the public player interface with an isolated, session-scoped preview. It has no curator approval controls, does not approve or publish anything, and does not overwrite daily progress. **Exit player preview** returns to the curator desk. Preview tokens only work in the browser tab that created them, and expire after one day.

Species cards have equal heights across all responsive rows. The zoom-in button and the image/card surface open an uncropped photo; attribution links remain separate links. Correct guesses trigger a brief confetti/result animation, disabled for reduced-motion preferences.

Guess history shows a right-aligned, color-coded distance box with no approximation symbol or temperature words. The color thresholds are explained only in How to play. Distances remain approximate boundary measurements despite their compact display.

`build_player.py` versions application assets by content hash to prevent stale CSS/JavaScript after deployment; publishing a curation automatically rebuilds those references.

Species-card name rows, scientific-name rows, and attribution dividers align across the grid, including after font loading and responsive resizing. In player views, common and scientific names are censored until two valid guesses have been submitted (before guess three), or until the round ends. The same rule covers zoom-dialog titles, image alt text, and zoom-button labels; curator evidence views retain the names.
