(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NatureLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const distanceBands = [
    { tone: 'very-far', label: 'Very Far', icon: '🦗', minimum: 5000 },
    { tone: 'far', label: 'Far', icon: '📍', minimum: 2000 },
    { tone: 'close', label: 'Close', icon: '🤏', minimum: 800 },
    { tone: 'very-close', label: 'Very Close', icon: '❗', minimum: 0 },
    { tone: 'borders', label: 'Borders', icon: '‼️' },
  ];
  function distanceBand(feedback, correct = false) {
    if (correct) return { tone: 'correct', label: 'Correct' };
    return feedback.touching ? distanceBands.at(-1) : distanceBands.find(band => feedback.km >= band.minimum);
  }
  function direction(bearing) { return ['N','NE','E','SE','S','SW','W','NW'][Math.round(((bearing % 360) + 360) % 360 / 45) % 8]; }
  function today(now = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
  function addDays(day, count) { const date = new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10); }
  function validDate(day) { return /^\d{4}-\d{2}-\d{2}$/.test(day) && !isNaN(Date.parse(day+'T12:00:00Z')) && new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day; }
  function emptyPlan() { return {version:1,approved:[],rejected:[],queue:[],schedule:{}}; }
  function validatePlan(value, puzzleIds) {
    if (!value || value.version!==1 || !Array.isArray(value.approved) || !Array.isArray(value.rejected) || !Array.isArray(value.queue) || !value.schedule || typeof value.schedule!=='object' || Array.isArray(value.schedule)) throw new Error('This is not a natGuessr curation file.');
    const known = new Set(puzzleIds);
    for (const key of ['approved','rejected']) {
      if (value[key].some(id=>!known.has(id)) || new Set(value[key]).size!==value[key].length) throw new Error('The curation contains unknown or duplicate puzzles.');
    }
    const approved = new Set(value.approved), rejected = new Set(value.rejected);
    if ([...approved].some(id=>rejected.has(id))) throw new Error('A puzzle cannot be approved and rejected.');
    const allocated = new Set();
    for (const [day, ids] of Object.entries(value.schedule)) {
      if (!validDate(day) || !Array.isArray(ids) || ids.length!==3 || new Set(ids).size!==3) throw new Error('Each scheduled day needs a real date and three different puzzles.');
      for (const id of ids) {
        if (!approved.has(id)) throw new Error('Scheduled puzzles must be approved.');
        allocated.add(id);
      }
    }
    for (const id of value.queue) {
      if (!approved.has(id)) throw new Error('Queue entries must be approved.');
    }
    return {version:1,approved:[...approved],rejected:[...rejected],queue:[...new Set(value.queue)].filter(id => !allocated.has(id)),schedule:JSON.parse(JSON.stringify(value.schedule))};
  }
  // Older banks predate the continent field.
  const continents = {
    ZAF: 'Africa', MDG: 'Africa', AUS: 'Oceania', NZL: 'Oceania',
    JPN: 'Asia', TWN: 'Asia', LKA: 'Asia', IDN: 'Asia', IND: 'Asia',
    MEX: 'North America', CRI: 'North America',
    BRA: 'South America', ECU: 'South America', CHL: 'South America', COL: 'South America',
    ESP: 'Europe',
  };

  function continentCount(puzzles) {
    return new Set(puzzles.map(p => p.continent || continents[p.countryId]).filter(Boolean)).size;
  }

  function shuffle(items, random) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function schedulePile(plan, firstDay, puzzles, random = Math.random) {
    if (!validDate(firstDay)) throw new Error('Choose a valid start date.');
    const next = validatePlan(plan, puzzles.keys());
    const buckets = new Map();
    for (const id of shuffle([...next.queue], random)) {
      const puzzle = puzzles.get(id);
      if (puzzle.archived) continue;
      if (!buckets.has(puzzle.countryId)) buckets.set(puzzle.countryId, []);
      buckets.get(puzzle.countryId).push(id);
    }

    const selected = new Set();
    let day = firstDay;
    let games = 0;
    for (;;) {
      const available = [...buckets.keys()].filter(id => buckets.get(id).length);
      const draws = [];
      let totalWeight = 0;
      for (let i = 0; i < available.length - 2; i++) {
        for (let j = i + 1; j < available.length - 1; j++) {
          for (let k = j + 1; k < available.length; k++) {
            const trio = [available[i], available[j], available[k]];
            const diversity = continentCount(trio.map(id => puzzles.get(buckets.get(id)[0])));
            if (diversity < 2) continue;
            // Sampling accepted draws directly gives the same odds as rerolling,
            // even when the only viable draws span two continents.
            totalWeight += diversity === 3 ? 4 : 1;
            draws.push({ trio, upperBound: totalWeight });
          }
        }
      }
      if (!draws.length) break;
      const roll = random() * totalWeight;
      const { trio } = draws.find(draw => roll < draw.upperBound);

      while (next.schedule[day]) day = addDays(day, 1);
      next.schedule[day] = shuffle(trio, random).map(id => buckets.get(id).pop());
      next.schedule[day].forEach(id => selected.add(id));
      day = addDays(day, 1);
      games++;
    }
    next.queue = next.queue.filter(id => !selected.has(id));
    return { plan: next, games };
  }
  function rangePreference(clues) {
    const supports = clues.map(clue => new Set(clue.supportedCountries));
    const widths = supports.map(countries => countries.size);
    let required = supports.length;
    for (let mask = 1; mask < (1 << supports.length) - 1; mask++) {
      const subset = supports.filter((_, index) => mask & (1 << index));
      if (subset.length >= required) continue;
      const common = [...subset[0]].filter(id => subset.every(countries => countries.has(id)));
      if (common.length === 1) required = subset.length;
    }
    return [widths.filter(width => width === 1).length, -required, -Math.min(...widths),
      -widths.reduce((total, width) => total + width, 0)];
  }

  function roundScore(puzzle, guesses) { return guesses.length && guesses[guesses.length-1]===puzzle.countryId ? Math.max(0,6000-1000*guesses.length) : 0; }
  function proximityScore(wrongGuesses, feedback) {
    const closeStart = distanceBands.find(band => band.tone === 'close').minimum;
    return wrongGuesses.reduce((total, id) => {
      const result = feedback[id];
      if (!result) return total;
      const { tone } = distanceBand(result);
      if (tone === 'borders') return total + 500;
      if (tone === 'very-close') {
        return total + Math.max(101, 499 - Math.floor(398 * result.km / (closeStart - 1)));
      }
      if (tone === 'close') return total + Math.max(0, 100 - Math.floor(result.km - closeStart));
      return total;
    }, 0);
  }
  return {normalize,distanceBands,distanceBand,direction,today,addDays,validDate,emptyPlan,validatePlan,schedulePile,continentCount,rangePreference,roundScore,proximityScore};
});
