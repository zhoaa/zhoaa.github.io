const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const L=require('../../logic.js');const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../data.js'),'utf8'),context);
const D=JSON.parse(JSON.stringify(context.window.NATURE_DATA));
const countryIds=D.countries.map(c=>c.id),ids=D.puzzles.map(p=>p.id);
assert.equal(new Set(countryIds).size,countryIds.length,'one entity per country code');
assert.equal(new Set(ids).size,ids.length);
const previousIds=new Set(D.generation?.existingIds||[]),added=D.puzzles.filter(p=>!previousIds.has(p.id));
if(D.generation?.requestedAdditional){assert.ok(added.length<=D.generation.requestedAdditional);assert.equal(D.generation.addedCount,added.length);}
for(const p of D.puzzles){
  assert.equal(p.clues.length,5);assert.equal(new Set(p.clues.map(c=>c.category)).size,5);
  assert.equal(new Set(p.clues.map(c=>c.taxonId)).size,5);
  assert.equal(new Set(p.clues.map(c=>c.observation.photo.id)).size,5);
  let common=new Set(countryIds);
  for(const c of p.clues){
    if(!p.archived){const text=L.normalize(c.name+' '+c.scientific).replace(/ /g,'');assert.ok(!(D.method.countryNameRules[p.country]||[]).some(t=>text.includes(t)),p.id+' gives away '+p.country);}
    if(previousIds.size&&!previousIds.has(p.id)&&['Bird','Mammal','Reptile / amphibian'].includes(c.category)){
      const query=new URL(c.observation.query);assert.equal(query.searchParams.get('term_id_or_unknown'),'17');assert.equal(query.searchParams.get('without_term_value_id'),'19');assert.equal(c.observation.deadExcluded,true);
    }
    common=new Set([...common].filter(id=>c.supportedCountries.includes(id)));
    assert.ok(['cc0','cc-by'].includes(c.observation.license));
    assert.ok(['cc0','cc-by'].includes(c.observation.photo.license));
    assert.ok(c.observation.observer&&c.observation.photo.attribution);
    assert.ok(c.observation.photo.url.includes('/medium.'));
    assert.equal(c.observation.placeId,p.placeId);
    for(const raw of [c.observation.query,...p.selectionQueries]){
      const url=new URL(raw);assert.equal(url.searchParams.get('place_id'),String(p.placeId),'country filter is upstream');
      assert.equal(url.searchParams.get('photo_license'),'cc0,cc-by');assert.equal(url.searchParams.get('license'),'cc0,cc-by');
    }
  }
  assert.deepEqual([...common],[p.countryId],'no other modeled country supports all five');
  const feedback=D.feedback[p.countryId];assert.equal(Object.keys(feedback).length,countryIds.length);
  for(const [id,f] of Object.entries(feedback)){
    assert.ok(Number.isFinite(f.km)&&f.km>=0&&f.km<21000);
    if(id!==p.countryId)assert.ok(Number.isFinite(f.bearing)&&f.bearing>=0&&f.bearing<360);
    if(f.touching)assert.equal(f.km,0);
  }
}
assert.equal(D.feedback.ZAF.NAM.km,0);assert.equal(D.feedback.ZAF.NAM.touching,true);
assert.ok(D.feedback.ZAF.USA.km>5000,'distant countries cannot be hot');
assert.equal(L.direction(0),'N');assert.equal(L.direction(90),'E');assert.equal(L.direction(225),'SW');assert.equal(L.direction(359),'N');
for (const [km, tone] of [[0,'very-close'],[799,'very-close'],[800,'close'],[1999,'close'],[2000,'far'],[4999,'far'],[5000,'very-far']]) {
  assert.equal(L.distanceBand({km}).tone,tone);
}
assert.equal(L.distanceBand({km:0,touching:true}).tone,'borders');
assert.equal(L.distanceBand({km:0},true).tone,'correct');
assert.equal(L.today(new Date('2026-11-20T02:00:00Z')),'2026-11-19','Toronto day boundary');
assert.equal(L.addDays('2026-12-31',1),'2027-01-01');assert.equal(L.validDate('2026-02-30'),false);
const plan=L.validatePlan({...L.emptyPlan(),approved:ids.slice(0,8),queue:ids.slice(0,8)},ids);
for(const bad of [
  {...plan,queue:['unknown']},
  {...plan,rejected:[ids[0]]},
  {...plan,queue:[],schedule:{'2026-12-31':ids.slice(0,2)}},
  {...plan,queue:[],schedule:{'2026-12-31':[ids[0],ids[0],ids[1]]}},
])assert.throws(()=>L.validatePlan(bad,ids));

const candidates = new Map(Object.entries({
  a: {countryId:'AUS'}, b: {countryId:'AUS'}, c: {countryId:'ZAF'}, d: {countryId:'ZAF'},
  e: {countryId:'MEX'}, f: {countryId:'CRI'}, g: {countryId:'AUS',archived:true},
}));
const pile={...L.emptyPlan(),approved:[...candidates.keys()],queue:['a','a','b','c','d','e','f','g']};
let randomCalls = 0;
const result=L.schedulePile(pile,'2026-12-31',candidates,()=>randomCalls++===6?0:.99);
assert.equal(result.games,2);
assert.deepEqual(result.plan.queue,['g']);
assert.deepEqual(Object.keys(result.plan.schedule),['2026-12-31','2027-01-01']);
for (const sets of Object.values(result.plan.schedule)) {
  assert.equal(new Set(sets.map(id=>candidates.get(id).countryId)).size,3);
  assert.ok(L.continentCount(sets.map(id=>candidates.get(id))) >= 2);
}
assert.equal(new Set(Object.values(result.plan.schedule).flat()).size,6);
const legacy={...pile,schedule:{'2026-12-31':['a','c','e']}};
const continued=L.schedulePile(legacy,'2026-12-31',candidates,()=>.99);
assert.deepEqual(continued.plan.schedule['2026-12-31'],['a','c','e']);
assert.deepEqual(continued.plan.schedule['2027-01-01'],['b','d','f']);
const drawFrom = (countryIds, roll) => {
  const bank = new Map(countryIds.map(id => [id, {countryId:id}]));
  let draws = 0;
  return L.schedulePile({...L.emptyPlan(),approved:countryIds,queue:countryIds},'2026-12-31',bank,()=>{
    // Keep the initial pile order, then select a weighted trio.
    return draws++ === countryIds.length - 1 ? roll : .99;
  });
};
assert.equal(drawFrom(['JPN','IND','TWN'],0).games,0);
assert.equal(drawFrom(['JPN','IND','MEX'],.99).games,1);
const worldwide = new Map([['fra',{countryId:'FRA',continent:'Europe'}],['per',{countryId:'PER',continent:'South America'}],['ken',{countryId:'KEN',continent:'Africa'}]]);
const worldIds = [...worldwide.keys()];
assert.equal(L.schedulePile({...L.emptyPlan(),approved:worldIds,queue:worldIds},'2026-12-31',worldwide).games,1);
const mixed = ['JPN','IND','MEX','ESP'];
// Four equally likely proposals have acceptance weights 1, 1, 4, 4.
for (const [roll, continents] of [[0,2],[.199,2],[.2,3],[.999,3]]) {
  const drawn = drawFrom(mixed, roll);
  assert.equal(L.continentCount(drawn.plan.schedule['2026-12-31'].map(countryId=>({countryId}))),continents);
}
const rangeClues = groups => groups.map(supportedCountries => ({supportedCountries}));
const fiveNeeded = ['a','b','c','d','e'].map(excluded =>
  ['target','a','b','c','d','e'].filter(country=>country!==excluded));
assert.deepEqual(L.rangePreference(rangeClues(fiveNeeded)),[0,-5,-5,-25]);
assert.deepEqual(L.rangePreference(rangeClues([['target'],...fiveNeeded.slice(1)])),[1,-1,-1,-21]);
assert.deepEqual(L.rangePreference(rangeClues([['target','a'],['target','b'],...fiveNeeded.slice(2)])),[0,-2,-2,-19]);
assert.equal(L.roundScore(D.puzzles[0],[D.puzzles[0].countryId]),5000);
assert.equal(L.roundScore(D.puzzles[0],['USA',D.puzzles[0].countryId]),4000);
assert.equal(L.roundScore(D.puzzles[0],['USA']),0);
const misses = ['border', 'near', 'far', 'farther', 'furthest'];
const proximity = {
  border: {km: 0, touching: true},
  near: {km: 123},
  far: {km: 800},
  farther: {km: 2400},
  furthest: {km: 9000},
};
assert.equal(L.proximityScore([], proximity), 0);
assert.equal(L.proximityScore(misses.slice(0, 4), proximity), 500);
assert.equal(L.proximityScore(misses, proximity), 500);
assert.equal(L.proximityScore(misses, {...proximity, border: {km: 799}}), 438);
const pointsAt = km => L.proximityScore(misses, {...proximity, border: {km}, near: {km: 2000}, far: {km: 2000}});
for (const [km, points] of [[0,499],[400,300],[799,101],[800,100],[873,27],[900,0],[1999,0],[2000,0]]) {
  assert.equal(pointsAt(km), points, `partial score at ${km} km`);
}
console.log(`Passed: ${D.puzzles.length} unique-country sets, ${D.countries.length} country entities, licensing/source filters, border feedback, curation validation, calendar scheduling, and scoring.`);
