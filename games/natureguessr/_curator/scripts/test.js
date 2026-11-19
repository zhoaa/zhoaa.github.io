const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const L=require('../../logic.js');const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../data.js'),'utf8'),context);
const D=JSON.parse(JSON.stringify(context.window.NATURE_DATA));
const countryIds=D.countries.map(c=>c.id),ids=D.puzzles.map(p=>p.id);
assert.equal(new Set(countryIds).size,countryIds.length,'one entity per country code');
assert.equal(new Set(ids).size,ids.length);
const previousIds=new Set(D.generation?.existingIds||[]),added=D.puzzles.filter(p=>!previousIds.has(p.id));
if(D.generation?.requestedAdditional){assert.equal(added.length,D.generation.requestedAdditional);assert.equal(D.generation.addedCount,added.length);}
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
assert.equal(L.distanceTone(199),'distance-near');assert.equal(L.distanceTone(200),'distance-hot');assert.equal(L.distanceTone(800),'distance-warm');assert.equal(L.distanceTone(2000),'distance-cool');assert.equal(L.distanceTone(5000),'distance-cold');assert.equal(L.distanceTone(0,true),'distance-correct');
assert.equal(L.today(new Date('2026-11-20T02:00:00Z')),'2026-11-19','Toronto day boundary');
assert.equal(L.addDays('2026-12-31',1),'2027-01-01');assert.equal(L.validDate('2026-02-30'),false);
let plan=L.emptyPlan();plan.approved=ids.slice(0,8);plan.queue=ids.slice(0,8);
plan=L.validatePlan(plan,ids);
let result=L.scheduleQueue(plan,'2026-12-31');assert.equal(result.editions,2);assert.deepEqual(result.plan.schedule['2026-12-31'],ids.slice(0,3));assert.deepEqual(result.plan.schedule['2027-01-01'],ids.slice(3,6));assert.deepEqual(result.plan.queue,ids.slice(6,8));
L.validatePlan(result.plan,ids);
const existing=L.emptyPlan();existing.approved=ids.slice(0,6);existing.queue=ids.slice(3,6);existing.schedule['2026-12-31']=ids.slice(0,3);
result=L.scheduleQueue(existing,'2026-12-31');assert.deepEqual(result.plan.schedule['2026-12-31'],ids.slice(0,3));assert.deepEqual(result.plan.schedule['2027-01-01'],ids.slice(3,6),'existing editions preserved');
for(const bad of [
  {...plan,queue:['unknown']},
  {...plan,rejected:[ids[0]]},
  {...plan,queue:[],schedule:{'2026-12-31':ids.slice(0,2)}},
  {...plan,queue:[],schedule:{'2026-12-31':[ids[0],ids[0],ids[1]]}},
])assert.throws(()=>L.validatePlan(bad,ids));
const [first,second,third]=ids;
const repeat=L.validatePlan({...L.emptyPlan(),approved:[first,second,third],queue:[first,first,second,second,third,third,first]},ids);
const repeated=L.scheduleQueue(repeat,'2026-12-31');
assert.deepEqual(repeated.plan.schedule,{'2026-12-31':[first,second,third],'2027-01-01':[first,second,third]});
assert.deepEqual(repeated.plan.queue,[first]);
L.validatePlan(repeated.plan,ids);
assert.equal(L.roundScore(D.puzzles[0],[D.puzzles[0].countryId]),5000);
assert.equal(L.roundScore(D.puzzles[0],['USA',D.puzzles[0].countryId]),4000);
assert.equal(L.roundScore(D.puzzles[0],['USA']),0);
console.log(`Passed: ${D.puzzles.length} unique-country sets, ${D.countries.length} country entities, licensing/source filters, border feedback, curation validation, calendar scheduling, and scoring.`);
