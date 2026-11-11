"use strict";

const storageKey = "plants:fsus-2026";

function loadPlantQuiz(checklist) {
  const rows = new Map();
  const answers = new Map();
  const visible = new Set();
  const feedback = byId("feedback");
  const guess = byId("guess");
  const reset = byId("reset-progress");
  const table = byId("checklist");
  const ids = new Set(checklist.plants.map(([id]) => id));
  let found = new Set();

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved?.found)) found = new Set(saved.found.filter((id) => ids.has(id)));
  } catch {
    // Continue with this visit's progress when storage is unavailable.
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ found: [...found] }));
    } catch {
      // Keep this visit's progress in memory.
    }
  }

  const familyNames = [...new Set(checklist.plants.map(([, , family]) => family))].sort();
  const genusNames = [...new Set(checklist.plants.map(([, scientific]) => scientific.split(" ")[0]))].sort();
  const familyFilter = createFilter("Family", "All families", familyNames.map((name) => [name, name]), applyFilters);
  const genusFilter = createFilter("Genus", "All genera", genusNames.map((name) => [name, name]), applyFilters);

  function updateScore() {
    let named = 0;
    for (const id of found) {
      if (visible.has(id)) named++;
    }
    byId("score").textContent = `${named.toLocaleString()} / ${visible.size.toLocaleString()} named`;
    reset.disabled = found.size === 0;
  }

  function applyFilters() {
    visible.clear();
    for (const [id, { row, family, genus }] of rows) {
      row.hidden = (familyFilter.value !== "" && family !== familyFilter.value)
        || (genusFilter.value !== "" && genus !== genusFilter.value);
      if (!row.hidden) visible.add(id);
    }
    feedback.textContent = visible.size ? "" : "No plants match these filters.";
    updateScore();
  }

  function renderAnswer(id) {
    const { row, scientific } = rows.get(id);
    row.cells[0].textContent = found.has(id) ? scientific : "—";
    row.classList.toggle("solved", found.has(id));
  }

  const fragment = document.createDocumentFragment();
  for (const [id, scientific, family] of checklist.plants) {
    const genus = scientific.split(" ")[0];
    const row = document.createElement("tr");
    for (const value of ["", genus, family]) {
      row.insertCell().textContent = value;
    }
    rows.set(id, { row, scientific, family, genus });
    renderAnswer(id);
    fragment.append(row);
    const key = normalize(scientific);
    if (!answers.has(key)) answers.set(key, new Set());
    answers.get(key).add(id);
  }
  byId("plants").append(fragment);

  const keys = [...answers.keys()].sort();
  const prefixes = new Set(keys.filter((key, i) => keys[i + 1]?.startsWith(key)));

  function acceptGuess(submitted) {
    const key = normalize(guess.value);
    if (!key || (!submitted && prefixes.has(key))) return;
    const matches = answers.get(key);
    if (matches?.size !== 1) {
      if (submitted) {
        feedback.textContent = matches ? "There are multiple possible plants." : "No match. Enter a full scientific name.";
        guess.select();
      }
      return;
    }
    const [id] = matches;
    if (!visible.has(id)) {
      if (submitted) feedback.textContent = "That plant is outside the current filters.";
      return;
    }
    if (found.has(id)) {
      if (submitted) {
        feedback.textContent = `${rows.get(id).scientific} is already on your list.`;
        guess.select();
      }
      return;
    }
    found.add(id);
    renderAnswer(id);
    updateScore();
    save();
    guess.value = "";
    feedback.textContent = found.size === ids.size ? "You named every plant!" : `✓ ${rows.get(id).scientific}`;
    if (submitted) guess.focus();
  }

  guess.addEventListener("input", (event) => {
    if (!event.isComposing) acceptGuess(false);
  });
  byId("guess-form").addEventListener("submit", (event) => {
    event.preventDefault();
    acceptGuess(true);
  });
  reset.addEventListener("click", () => {
    if (!window.confirm("Clear saved plant quiz progress across all families and genera?")) return;
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
  applyFilters();
  if (found.size === ids.size) feedback.textContent = "You named every plant!";
  byId("loading").hidden = true;
  byId("console").hidden = false;
  table.hidden = false;
}

try {
  loadPlantQuiz(floraChecklist);
} catch (error) {
  console.error("Could not initialize the plant quiz", error);
  byId("loading").textContent = "The checklist couldn’t load. Refresh the page to try again.";
}
