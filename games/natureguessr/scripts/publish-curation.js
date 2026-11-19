// Prepare a reviewed schedule for the existing static site. This never deploys.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const L=require('../logic.js');const input=process.argv[2];
if(!input){console.error('Usage: node scripts/publish-curation.js /absolute/path/to/exported-curation.json');process.exit(1);}
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../data.js'),'utf8'),ctx);
const bank=ctx.window.NATURE_DATA.puzzles;
const plan=L.validatePlan(JSON.parse(fs.readFileSync(input,'utf8')),bank.map(p=>p.id));
const archived=new Set(bank.filter(p=>p.archived).map(p=>p.id));
if(Object.values(plan.schedule).flat().some(id=>archived.has(id)))throw new Error('A scheduled set has been archived by the country-name rule. Replace it before publishing.');
const schedule=Object.fromEntries(Object.entries(plan.schedule).sort(([a],[b])=>a.localeCompare(b)));
const file=path.join(__dirname,'../published-schedule.js');
fs.writeFileSync(file,'// Explicitly reviewed daily editions. Generated from an exported curation plan.\nwindow.NATURE_PUBLISHED_SCHEDULE = '+JSON.stringify(schedule,null,2)+';\n');
require('node:child_process').execFileSync('python3',[path.join(__dirname,'build_player.py')],{stdio:'inherit'});
console.log(`Prepared ${Object.keys(schedule).length} reviewed daily editions in ${file}. Nothing was deployed.`);
