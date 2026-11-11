"use strict";

const storageKey = "world-birds:avilist-v2026";
const birdGroups = {
  "Waterfowl": ["Anatidae"],
  "Birds of prey": ["Accipitriformes", "Cathartiformes", "Falconiformes", "Strigiformes"],
  "Fish": [],
};


function loadQuiz(orders, extraAnswers, regions) {
  const species = orders.flatMap(([, , families]) => families.flatMap(([, , birds]) => birds));
  const ids = new Set(species.map(([id]) => id));
  const official = new Map();
  const scientificNames = new Map();
  const alternate = new Map();
  const banding = new Map();

  function indexName(index, name, id) {
    const key = normalize(name);
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(id);
  }

  for (const [id, english, scientific, ...aliases] of species) {
    indexName(official, english, id);
    indexName(scientificNames, scientific, id);
    for (const alias of aliases) indexName(alternate, alias, id);
  }
  for (const [id, aliases, codes] of extraAnswers) {
    for (const alias of aliases) indexName(alternate, alias, id);
    for (const code of codes) indexName(banding, code, id);
  }

  // When one answer begins with another, wait for Enter so either can be typed.
  const keys = [...new Set([...official.keys(), ...scientificNames.keys(), ...alternate.keys(), ...banding.keys()])].sort();
  const prefixes = new Set(keys.filter((key, i) => keys[i + 1]?.startsWith(key)));

  let standardFound = new Set();
  let evilFound = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved?.found)) standardFound = new Set(saved.found.filter((id) => ids.has(id)));
    if (Array.isArray(saved?.evilFound)) evilFound = new Set(saved.evilFound.filter((id) => ids.has(id)));
  } catch {
    // Storage can be unavailable. The quiz remains playable for this visit.
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ found: [...standardFound], evilFound: [...evilFound] }));
    } catch {
      // Keep this session in memory.
    }
  }

  const feedback = byId("feedback");
  const guess = byId("guess");
  const form = byId("guess-form");
  const resetProgress = byId("reset-progress");
  const evilMode = byId("evil-mode");
  const table = byId("checklist");
  const instructions = byId("guess-instructions");
  const standardInstructions = instructions.textContent;
  let found = standardFound;
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
    resetProgress.disabled = found.size === 0;
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

  function renderAnswer(id) {
    const { row, english, scientific } = rows.get(id);
    const solved = found.has(id);
    row.cells[0].textContent = evilMode.checked || solved ? english : "—";
    row.cells[1].textContent = !evilMode.checked || solved ? scientific : "—";
    row.classList.toggle("solved", solved);
  }

  const checklist = document.createDocumentFragment();
  for (const [order, , families] of orders) {
    for (const [family, , birds] of families) {
      for (const [id, english, scientific] of birds) {
        const row = document.createElement("tr");
        for (const value of ["", "", order, family]) {
          const cell = row.insertCell();
          cell.textContent = value;
        }
        rows.set(id, { row, english, scientific, order, family });
        checklist.append(row);
      }
    }
  }
  byId("birds").append(checklist);

  function acceptGuess(submitted) {
    const key = normalize(guess.value);
    if (!key || (!submitted && prefixes.has(key))) return;
    // Require Enter for codes so a short code can't interrupt a name being typed.
    const codes = evilMode.checked ? undefined : banding.get(key);
    if (codes && !submitted) return;
    const matches = evilMode.checked ? (scientificNames.get(key) ?? new Set()) : new Set([
      ...(official.get(key) ?? []),
      ...(scientificNames.get(key) ?? []),
      ...(alternate.get(key) ?? []),
      ...(codes ?? []),
    ]);
    if (matches.size !== 1) {
      if (submitted) {
        feedback.textContent = matches.size > 1 ? "There are multiple possible birds." :
          evilMode.checked ? "No match. Try another scientific name." : "No match. Try another bird name or code.";
        guess.select();
      }
      return;
    }

    const [id] = matches;
    const { english, scientific } = rows.get(id);
    const name = evilMode.checked ? scientific : english;
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
    renderAnswer(id);
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
  resetProgress.addEventListener("click", () => {
    if (!window.confirm("Clear saved progress for this mode across all regions and groups?")) return;
    const cleared = [...found];
    found.clear();
    for (const id of cleared) renderAnswer(id);
    save();
    updateScore();
    guess.value = "";
    feedback.textContent = "Progress reset.";
    guess.focus();
  });
  for (const checkbox of document.querySelectorAll(".column-controls input")) {
    const updateColumn = () => table.classList.toggle(`hide-${checkbox.value}`, checkbox.checked);
    checkbox.addEventListener("change", updateColumn);
    updateColumn();
  }

  function updateMode() {
    found = evilMode.checked ? evilFound : standardFound;
    table.classList.toggle("evil-mode", evilMode.checked);
    instructions.textContent = evilMode.checked ? "Use the English names as clues and enter the scientific names." : standardInstructions;
    guess.placeholder = evilMode.checked ? "Enter a scientific name" : "Enter a bird name or code";
    guess.value = "";
    for (const id of rows.keys()) renderAnswer(id);
    applyFilters();
    if (found.size === species.length) feedback.textContent = "You named every species!";
  }
  evilMode.addEventListener("change", updateMode);
  updateMode();
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
