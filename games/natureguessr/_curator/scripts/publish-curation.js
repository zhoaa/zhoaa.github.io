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

const repository = 'zhoaa/zhoaa.github.io';
const day = L.today();

function writeEdition(data) {
  const ids = data.puzzles.map(puzzle => puzzle.id);
  const output = path.join(__dirname, '../../daily/edition.js');
  fs.writeFileSync(output,
    `window.NATURE_DATA = ${JSON.stringify(data)};\n` +
    `window.NATURE_PUBLISHED_SCHEDULE = ${JSON.stringify({ [day]: ids })};\n`);
  execFileSync('python3', [path.join(__dirname, 'build_player.py')]);
}

if (automated) {
  const secret = process.env.NATGUESSR_RELEASE;
  if (!secret) {
    console.log('No private release is scheduled for today.');
    process.exit(0);
  }
  let payload;
  try {
    payload = JSON.parse(gunzipSync(Buffer.from(secret, 'base64')).toString('utf8'));
  } catch {
    throw new Error('Today’s private release could not be decoded.');
  }
  if (payload.date !== day || !Array.isArray(payload.data?.puzzles) || payload.data.puzzles.length !== 3 ||
      new Set(payload.data.puzzles.map(p => p.countryId)).size !== 3 ||
      !Array.isArray(payload.data.countries) || !payload.data.feedback) {
    throw new Error('Today’s private release is invalid or is for a different Toronto date.');
  }
  writeEdition(payload.data);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'ready=true\n');
  console.log(`Prepared the Toronto game for ${day}.`);
  process.exit(0);
}

const bankFile = path.join(__dirname, '../data.js');
if (!fs.existsSync(bankFile)) throw new Error('Restore or generate the local candidate bank before scheduling.');
const bankSource = fs.readFileSync(bankFile, 'utf8');
const bank = JSON.parse(bankSource.trim().replace(/^window\.NATURE_DATA = /, '').replace(/;$/, ''));
const byId = new Map(bank.puzzles.map(puzzle => [puzzle.id, puzzle]));
let exported;
try {
  exported = JSON.parse(fs.readFileSync(upload ? exportPath : argument, 'utf8'));
} catch {
  throw new Error('The curation plan file could not be read as JSON.');
}
const plan = L.validatePlan(exported, [...byId.keys()]);
if (Object.values(plan.schedule).flat().some(id => byId.get(id).archived)) {
  throw new Error('Replace archived sets in the schedule before releasing.');
}

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
function playerData(ids) {
  const puzzles = ids.map(id => byId.get(id));
  const playerPuzzles = puzzles.map(({ id, country, countryId, clues }) => ({
    id, country, countryId,
    clues: clues.map(({ name, scientific, observation }) => ({
      name, scientific,
      observation: {
        url: observation.url,
        observer: observation.observer,
        observerName: observation.observerName,
        location: observation.location,
        photo: observation.photo,
      },
    })),
  }));
  return {
    countries: bank.countries,
    puzzles: playerPuzzles,
    feedback: Object.fromEntries(puzzles.map(p => [p.countryId, bank.feedback[p.countryId]])),
  };
}

if (upload) {
  const releases = Object.entries(plan.schedule).filter(([date]) => date >= day).sort(([a], [b]) => a.localeCompare(b));
  if (!releases.length) throw new Error('Schedule at least one game for today or a future Toronto date.');
  const uploads = releases.map(([date, ids]) => {
    const secret = gzipSync(JSON.stringify({date, data:playerData(ids)})).toString('base64');
    if (Buffer.byteLength(secret) > 48 * 1024) throw new Error(`The private release for ${date} exceeds GitHub’s secret size limit.`);
    return [`NATGUESSR_DAY_${date.replaceAll('-', '_')}`, secret];
  });
  const existing = JSON.parse(execFileSync('gh', ['secret', 'list', '--repo', repository, '--json', 'name'],
    {encoding:'utf8'})).map(secret => secret.name);
  const todayName = `NATGUESSR_DAY_${day.replaceAll('-', '_')}`;
  const expired = existing.filter(name => /^NATGUESSR_DAY_\d{4}_\d{2}_\d{2}$/.test(name) && name < todayName);
  const kept = new Set(existing.filter(name => !expired.includes(name)));
  uploads.forEach(([name]) => kept.add(name));
  if (kept.size > 100) throw new Error('Too many future games for GitHub’s repository secret limit. Upload fewer dates.');
  for (const name of expired) {
    execFileSync('gh', ['secret', 'delete', name, '--repo', repository], {stdio:'inherit'});
  }
  for (const [name, secret] of uploads) {
    execFileSync('gh', ['secret', 'set', name, '--repo', repository], {
      input: secret,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  }
  console.log(`Synced ${uploads.length} daily game(s) to encrypted GitHub Actions secrets.`);
  if (plan.schedule[day]) {
    execFileSync('gh', ['workflow', 'run', 'natguessr-daily.yml', '--repo', repository, '--ref', 'main'], {
      stdio: 'inherit',
    });
  }
  process.exit(0);
}

const ids = plan.schedule[day];
if (!ids) throw new Error(`Schedule three approved sets for ${day} (Toronto) before releasing.`);
writeEdition(playerData(ids));
console.log(`Prepared ${day} for GitHub Pages. Commit and push daily/edition.js and daily/index.html.`);
