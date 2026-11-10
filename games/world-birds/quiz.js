"use strict";

const storageKey = "world-birds:avilist-v2026";
const byId = (id) => document.getElementById(id);
const normalize = (name) => name.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const birdGroups = {
  "Waterfowl": ["Anatidae"],
  "Birds of prey": ["Accipitriformes", "Cathartiformes", "Falconiformes", "Strigiformes"],
  "Hummingbirds": ["Trochilidae"],
};

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
  const orderFilter = byId("order-filter");
  const regionFilter = byId("region-filter");
  const groupFilter = byId("group-filter");
  const regionSpecies = new Map();

  for (const [code, label, members] of regions) {
    regionFilter.add(new Option(label, code));
    regionSpecies.set(code, new Set(members));
  }
  for (const label of Object.keys(birdGroups)) {
    groupFilter.add(new Option(label, label));
  }

  function updateScore() {
    let named = 0;
    for (const id of found) {
      if (visible.has(id)) named++;
    }
    byId("score").textContent = `${named.toLocaleString()} / ${visible.size.toLocaleString()} named`;
  }

  function applyFilters() {
    const selectedOrder = orderFilter.value;
    const selectedRegion = regionSpecies.get(regionFilter.value);
    const selectedGroup = birdGroups[groupFilter.value];
    visible.clear();
    for (const [id, { row, order, family }] of rows) {
      row.hidden = (selectedOrder !== "" && order !== selectedOrder)
        || (selectedRegion !== undefined && !selectedRegion.has(id))
        || (selectedGroup !== undefined && !selectedGroup.includes(order) && !selectedGroup.includes(family));
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
  for (const [order, label, families] of orders) {
    orderFilter.add(new Option(label ? `${order} (${label})` : order, order));
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

  for (const filter of [orderFilter, regionFilter, groupFilter]) {
    filter.addEventListener("change", applyFilters);
  }
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
