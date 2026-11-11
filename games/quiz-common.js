"use strict";

const byId = (id) => document.getElementById(id);
const normalize = (name) => name.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

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

