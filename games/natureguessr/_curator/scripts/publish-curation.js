// Export the current Toronto day from a private curation plan.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const L = require('../../logic.js');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node publish-curation.js /path/to/exported-curation.json');
  process.exit(1);
}

const bankSource = fs.readFileSync(path.join(__dirname, '../data.js'), 'utf8');
const bank = JSON.parse(bankSource.trim().replace(/^window\.NATURE_DATA = /, '').replace(/;$/, ''));
const plan = L.validatePlan(JSON.parse(fs.readFileSync(input, 'utf8')), bank.puzzles.map(p => p.id));
const day = L.today();
const ids = plan.schedule[day];
if (!ids) throw new Error(`Schedule three approved rounds for ${day} (Toronto) before releasing.`);

const puzzles = ids.map(id => bank.puzzles.find(p => p.id === id));
if (puzzles.some(p => p.archived)) throw new Error('Replace archived sets before releasing.');
const playerPuzzles = puzzles.map(({ id, country, countryId, clues }) => ({
  id, country, countryId,
  clues: clues.map(({ name, scientific, observation }) => ({
    name, scientific,
    observation: {
      url: observation.url,
      observer: observation.observer,
      observerName: observation.observerName,
      photo: observation.photo,
    },
  })),
}));
const data = {
  countries: bank.countries,
  puzzles: playerPuzzles,
  feedback: Object.fromEntries(puzzles.map(p => [p.countryId, bank.feedback[p.countryId]])),
};
const output = path.join(__dirname, '../../daily/edition.js');
fs.writeFileSync(output,
  `window.NATURE_DATA = ${JSON.stringify(data)};\n` +
  `window.NATURE_PUBLISHED_SCHEDULE = ${JSON.stringify({ [day]: ids })};\n`);
execFileSync('python3', [path.join(__dirname, 'build_player.py')]);
console.log(`Prepared ${day} for GitHub Pages. Commit and push daily/edition.js and daily/index.html.`);
