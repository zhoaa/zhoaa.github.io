"use strict";

const storageKey = "world-birds:avilist-v2026";
const byId = (id) => document.getElementById(id);
const normalize = (name) => name.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const birdGroups = {
  "Waterfowl": ["Anatidae"],
  "Birds of prey": ["Accipitriformes", "Cathartiformes", "Falconiformes", "Strigiformes"],
  "Fish": [],
};

function createFilter(label, allLabel, entries, onChange) {
  const details = document.createElement("details");
  details.className = "filter";
  details.setAttribute("name", "quiz-filters");
  const summary = document.createElement("summary");
  summary.textContent = `${label}: ${allLabel}`;
  const panel = document.createElement("div");
  panel.className = "filter-panel";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = `Search ${label.toLowerCase()}`;
  search.setAttribute("aria-label", search.placeholder);
  const results = document.createElement("div");
  results.className = "filter-options";
  panel.append(search, results);
  details.append(summary, panel);
  byId("filters").append(details);

  let selected = "";
  function showOptions() {
    const query = normalize(search.value);
    results.replaceChildren();
    for (const [value, title] of [["", allLabel], ...entries]) {
      if (!normalize(title).includes(query)) continue;
      const option = document.createElement("button");
      option.type = "button";
      option.textContent = title;
      option.setAttribute("aria-pressed", String(selected === value));
      option.addEventListener("click", () => {
        selected = value;
        summary.textContent = `${label}: ${title}`;
        details.open = false;
        summary.focus();
        onChange();
      });
      results.append(option);
    }
    if (!results.childElementCount) results.textContent = "No matching options.";
  }

  details.addEventListener("toggle", () => {
    if (!details.open) return;
    search.value = "";
    showOptions();
    search.focus();
  });
  search.addEventListener("input", showOptions);
  details.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && details.open) {
      details.open = false;
      summary.focus();
    } else if (event.target === search && event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      results.firstElementChild?.click();
    }
  });
  details.addEventListener("focusout", (event) => {
    if (event.relatedTarget && !details.contains(event.relatedTarget)) details.open = false;
  });
  return { get value() { return selected; } };
}

function loadQuiz(orders, extraAnswers, regions) {
  const species = orders.flatMap(([, , families]) => families.flatMap(([, , birds]) => birds));
  const ids = new Set(species.map(([id]) => id));
  const official = new Map();
  const alternate = new Map();
  const banding = new Map();

  function indexName(index, name, id) {
    const key = normalize(name);
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(id);
  }

  const names = new Map();
  for (const [id, english, scientific, ...aliases] of species) {
    names.set(id, english);
    indexName(official, english, id);
    indexName(official, scientific, id);
    for (const alias of aliases) indexName(alternate, alias, id);
  }
  for (const [id, aliases, codes] of extraAnswers) {
    for (const alias of aliases) indexName(alternate, alias, id);
    for (const code of codes) indexName(banding, code, id);
  }

  // When one answer begins with another, wait for Enter so either can be typed.
  const keys = [...new Set([...official.keys(), ...alternate.keys(), ...banding.keys()])].sort();
  const prefixes = new Set(keys.filter((key, i) => keys[i + 1]?.startsWith(key)));

  let found = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved?.found)) found = new Set(saved.found.filter((id) => ids.has(id)));
  } catch {
    // Storage can be unavailable. The quiz remains playable for this visit.
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ found: [...found] }));
    } catch {
      // Keep this session in memory.
    }
  }

  const feedback = byId("feedback");
  const guess = byId("guess");
  const form = byId("guess-form");
  const rows = new Map();
  const visible = new Set();
  const taxonOptions = (taxa) => taxa.map(([name, label]) => [
    name, label && label !== name ? `${name} (${label})` : name,
  ]);
  const families = orders.flatMap(([, , orderFamilies]) => orderFamilies);
  const familyOptions = taxonOptions(families).sort(([a], [b]) => a.localeCompare(b));
  const regionSpecies = new Map(regions.map(([code, , members]) => [code, new Set(members)]));
  const orderFilter = createFilter("Order", "All orders", taxonOptions(orders), applyFilters);
  const familyFilter = createFilter("Family", "All families", familyOptions, applyFilters);
  const regionFilter = createFilter("Region", "Worldwide", regions.map(([code, label]) => [code, label]), applyFilters);
  const groupFilter = createFilter("Custom group", "All groups", Object.keys(birdGroups).map((label) => [label, label]), applyFilters);

  function updateScore() {
    let named = 0;
    for (const id of found) {
      if (visible.has(id)) named++;
    }
    byId("score").textContent = `${named.toLocaleString()} / ${visible.size.toLocaleString()} named`;
  }

  function applyFilters() {
    const selectedOrder = orderFilter.value;
    const selectedFamily = familyFilter.value;
    const selectedRegion = regionSpecies.get(regionFilter.value);
    const selectedGroup = birdGroups[groupFilter.value];
    visible.clear();
    for (const [id, { row, order, family }] of rows) {
      row.hidden = (selectedOrder !== "" && order !== selectedOrder)
        || (selectedFamily !== "" && family !== selectedFamily)
        || (selectedRegion !== undefined && !selectedRegion.has(id))
        || (selectedGroup?.length > 0 && !selectedGroup.includes(order) && !selectedGroup.includes(family));
      if (!row.hidden) visible.add(id);
    }
    feedback.textContent = visible.size ? "" : "No species match these filters.";
    updateScore();
  }

  function fillAnswer(id) {
    const { row, english } = rows.get(id);
    row.cells[0].textContent = english;
    row.classList.add("solved");
  }

  const checklist = document.createDocumentFragment();
  for (const [order, , families] of orders) {
    for (const [family, , birds] of families) {
      for (const [id, english, scientific] of birds) {
        const row = document.createElement("tr");
        for (const value of ["—", scientific, order, family]) {
          const cell = row.insertCell();
          cell.textContent = value;
        }
        rows.set(id, { row, english, order, family });
        if (found.has(id)) fillAnswer(id);
        checklist.append(row);
      }
    }
  }
  byId("birds").append(checklist);

  function acceptGuess(submitted) {
    const key = normalize(guess.value);
    if (!key || (!submitted && prefixes.has(key))) return;
    // Require Enter for codes so a short code can't interrupt a name being typed.
    const codes = banding.get(key);
    if (codes && !submitted) return;
    const matches = official.get(key) ?? (codes
      ? new Set([...codes, ...(alternate.get(key) ?? [])])
      : alternate.get(key));
    if (matches?.size !== 1) {
      if (submitted) {
        feedback.textContent = matches ? "possibly multiple names" : "No match. Try another bird name or code.";
        guess.select();
      }
      return;
    }

    const [id] = matches;
    const name = names.get(id);
    if (!visible.has(id)) {
      if (submitted) {
        feedback.textContent = "That bird is outside the current filters.";
        guess.select();
      }
      return;
    }
    if (found.has(id)) {
      if (submitted) {
        feedback.textContent = `${name} is already on your list.`;
        guess.select();
      }
      return;
    }

    found.add(id);
    fillAnswer(id);
    guess.value = "";
    feedback.textContent = found.size === species.length ? "You named every species!" : `✓ ${name}`;
    updateScore();
    save();
    if (submitted) guess.focus();
  }

  guess.addEventListener("input", (event) => {
    if (!event.isComposing) acceptGuess(false);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    acceptGuess(true);
  });
  const hideTaxonomy = byId("hide-taxonomy");
  const table = byId("checklist");
  function updateColumns() {
    table.classList.toggle("hide-taxonomy", hideTaxonomy.checked);
  }
  hideTaxonomy.addEventListener("change", updateColumns);
  updateColumns();

  applyFilters();
  if (found.size === species.length) feedback.textContent = "You named every species!";
  byId("loading").hidden = true;
  byId("console").hidden = false;
  table.hidden = false;
}

try {
  loadQuiz(aviListV2026, birdAnswerAliases, ebirdRegions);
} catch (error) {
  console.error("Could not initialize the bird quiz", error);
  byId("loading").textContent = "The checklist couldn’t load. Refresh the page to try again.";
}
