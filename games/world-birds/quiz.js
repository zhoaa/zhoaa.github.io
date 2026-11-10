"use strict";

const storageKey = "world-birds:avilist-v2026";
const byId = (id) => document.getElementById(id);
const normalize = (name) => name.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function loadQuiz(orders, extraAnswers) {
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
  const total = species.length.toLocaleString();
  const rows = new Map();

  function updateScore() {
    byId("score").textContent = `${found.size.toLocaleString()} / ${total} named`;
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
        rows.set(id, { row, english });
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
  updateScore();
  if (found.size === species.length) feedback.textContent = "You named every species!";
  byId("loading").hidden = true;
  byId("console").hidden = false;
  byId("checklist").hidden = false;
}

try {
  loadQuiz(aviListV2026, birdAnswerAliases);
} catch (error) {
  console.error("Could not initialize the bird quiz", error);
  byId("loading").textContent = "The checklist couldn’t load. Refresh the page to try again.";
}
