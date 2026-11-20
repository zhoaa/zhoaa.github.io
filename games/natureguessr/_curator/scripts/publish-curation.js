// Export the current Toronto day from a private curation plan.
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync, gunzipSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const L = require('../../logic.js');

const [argument, exportPath] = process.argv.slice(2);
const automated = argument === '--scheduled';
const upload = argument === '--upload';

if (!argument || (upload && !exportPath)) {
  console.error('Usage: publish-curation.js [--upload] /path/to/exported-curation.json');
  process.exit(1);
}

if (automated && !process.env.NATGUESSR_SCHEDULE) {
  console.log('No private curation plan is configured.');
  process.exit(0);
}

const bankSource = fs.readFileSync(path.join(__dirname, '../data.js'), 'utf8');
const bank = JSON.parse(bankSource.trim().replace(/^window\.NATURE_DATA = /, '').replace(/;$/, ''));
const byId = new Map(bank.puzzles.map(puzzle => [puzzle.id, puzzle]));
const source = automated ? process.env.NATGUESSR_SCHEDULE : fs.readFileSync(upload ? exportPath : argument, 'utf8');
let exported;
try {
  const json = automated && source.startsWith('gzip:')
    ? gunzipSync(Buffer.from(source.slice(5), 'base64')).toString('utf8')
    : source;
  exported = JSON.parse(json);
} catch {
  throw new Error('The curation plan is invalid JSON.');
}
const plan = L.validatePlan(exported, [...byId.keys()]);
if (Object.values(plan.schedule).flat().some(id => byId.get(id).archived)) {
  throw new Error('Replace archived sets in the schedule before releasing.');
}

const day = L.today();
// Keep legacy past games as history, but prevent repeat sets or countries in future releases.
const used = new Set(Object.entries(plan.schedule).filter(([date]) => date < day).flatMap(([, ids]) => ids));
for (const [date, ids] of Object.entries(plan.schedule)) {
  if (date < day) continue;
  const sets = ids.map(id => byId.get(id));
  if (new Set(sets.map(p => p.countryId)).size !== 3) {
    throw new Error(`The game for ${date} needs three different countries. Return its sets to the pile and redraw it.`);
  }
  if (L.continentCount(sets) < 2) {
    throw new Error(`The game for ${date} needs at least two continents. Return its sets to the pile and redraw it.`);
  }
  if (ids.some(id => used.has(id))) {
    throw new Error(`The game for ${date} repeats a set. Return the affected games to the pile and redraw them.`);
  }
  ids.forEach(id => used.add(id));
}
if (upload) {
  const schedule = Object.fromEntries(
    Object.entries(plan.schedule).filter(([date]) => date >= day).sort(([a], [b]) => a.localeCompare(b)),
  );
  const count = Object.keys(schedule).length;
  if (!count) throw new Error('Schedule at least one edition for today or a future Toronto date.');
  const releasePlan = {...L.emptyPlan(), approved: [...new Set(Object.values(schedule).flat())], schedule};
  const secret = 'gzip:' + gzipSync(JSON.stringify(releasePlan)).toString('base64');
  if (Buffer.byteLength(secret) > 48 * 1024) {
    throw new Error('The compressed schedule exceeds GitHub’s 48 KB secret limit. Keep the full backup and upload fewer future dates at a time.');
  }
  execFileSync('gh', ['secret', 'set', 'NATGUESSR_SCHEDULE', '--repo', 'zhoaa/zhoaa.github.io'], {
    input: secret,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log(`Saved ${count} scheduled edition(s) in the private GitHub Actions schedule.`);
  process.exit(0);
}

const ids = plan.schedule[day];
if (!ids) {
  if (!automated) throw new Error(`Schedule three approved rounds for ${day} (Toronto) before releasing.`);
  console.log('No edition is scheduled for today.');
  process.exit(0);
}

const puzzles = ids.map(id => byId.get(id));
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
if (automated) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'ready=true\n');
  console.log(`Prepared the Toronto edition for ${day}.`);
} else {
  console.log(`Prepared ${day} for GitHub Pages. Commit and push daily/edition.js and daily/index.html.`);
}
