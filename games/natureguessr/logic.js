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
    for (const [day, ids] of Object.entries(value.schedule)) {
      if (!validDate(day) || !Array.isArray(ids) || ids.length!==3 || new Set(ids).size!==3) throw new Error('Each scheduled day needs a real date and three different puzzles.');
      for (const id of ids) {
        if (!approved.has(id)) throw new Error('Scheduled puzzles must be approved.');
      }
    }
    for (const id of value.queue) {
      if (!approved.has(id)) throw new Error('Queue entries must be approved.');
    }
    return {version:1,approved:[...approved],rejected:[...rejected],queue:[...value.queue],schedule:JSON.parse(JSON.stringify(value.schedule))};
  }
  function scheduleQueue(plan, firstDay) {
    if (!validDate(firstDay)) throw new Error('Choose a valid start date.');
    const next=JSON.parse(JSON.stringify(plan));let day=firstDay,editions=0;
    for (;;) {
      const selected = new Set();
      const positions = [];
      for (const [index, id] of next.queue.entries()) {
        if (selected.has(id)) continue;
        selected.add(id);
        positions.push(index);
        if (selected.size === 3) break;
      }
      if (selected.size < 3) break;
      while (next.schedule[day]) day=addDays(day,1);
      next.schedule[day] = [...selected];
      for (const index of positions.reverse()) next.queue.splice(index, 1);
      editions++;
      day=addDays(day,1);
    }
    return {plan:next,editions};
  }
  function roundScore(puzzle, guesses) { return guesses.length && guesses[guesses.length-1]===puzzle.countryId ? Math.max(0,6000-1000*guesses.length) : 0; }
  function proximityScore(guesses, feedback) {
    if (guesses.length < 5) return 0;
    const closeStart = distanceBands.find(band => band.tone === 'close').minimum;
    return Math.max(0, ...guesses.map(id => {
      const result = feedback[id];
      if (!result) return 0;
      const { tone } = distanceBand(result);
      if (tone === 'borders') return 500;
      if (tone === 'very-close') {
        return Math.max(101, 499 - Math.floor(398 * result.km / (closeStart - 1)));
      }
      if (tone === 'close') return Math.max(0, 100 - Math.floor(result.km - closeStart));
      return 0;
    }));
  }
  return {normalize,distanceBands,distanceBand,direction,today,addDays,validDate,emptyPlan,validatePlan,scheduleQueue,roundScore,proximityScore};
});
