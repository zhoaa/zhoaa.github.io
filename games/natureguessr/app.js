(function () {
  'use strict';
  const D=window.NATURE_DATA,L=window.NatureLogic,$=id=>document.getElementById(id);
  if (!D || !L) { $('candidate-list').textContent='The candidate bank could not load. Please reload the page.';return; }
  const puzzles=new Map(D.puzzles.map(p=>[p.id,p])),countries=new Map(D.countries.map(c=>[c.id,c]));
  const qa=new URLSearchParams(location.search).has('qa'), publicPlayer=document.body.dataset.mode==='public';
  const activePuzzles=D.puzzles.filter(p=>!p.archived);
  const PLAN_KEY='natureguessr-curation-v1'+(qa?'-qa':''),DAILY_KEY='natureguessr-daily-v1'+(qa?'-qa':'');
  let plan=L.emptyPlan(),filter='all',view='curate',game=null,selectedCountry=null,suggestions=[],highlight=-1,toastTimer;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Math.round(n).toLocaleString();
  function toast(message) { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500); }
  function scheduledDay(id) { return Object.keys(plan.schedule).find(day=>plan.schedule[day].includes(id)); }
  function status(id) { return plan.rejected.includes(id)?'rejected':plan.approved.includes(id)?'approved':'new'; }
  function persist() {
    plan=L.validatePlan(plan,[...puzzles.keys()]);
    try { localStorage.setItem(PLAN_KEY,JSON.stringify(plan)); } catch { toast('Browser storage is unavailable. Export your curation to keep it.'); }
    renderBank();renderQueue();
  }
  try { const saved=publicPlayer?null:localStorage.getItem(PLAN_KEY);if(saved)plan=L.validatePlan(JSON.parse(saved),[...puzzles.keys()]); } catch { toast('Your saved curation could not be loaded. Import a backup if you have one.'); }
  for (const [day,ids] of Object.entries(window.NATURE_PUBLISHED_SCHEDULE||{})) {
    if (!plan.schedule[day] && ids.length===3 && ids.every(id=>puzzles.has(id)) && !ids.some(scheduledDay)) {
      plan.schedule[day]=ids;for(const id of ids){if(!plan.approved.includes(id))plan.approved.push(id);plan.rejected=plan.rejected.filter(x=>x!==id);plan.queue=plan.queue.filter(x=>x!==id);}
    }
  }
  function approve(id) {
    if(puzzles.get(id)?.archived){toast('This set no longer meets the country-name rule. Choose another set.');return;}
    if(scheduledDay(id)){toast('This set is already scheduled.');return;}
    plan.rejected=plan.rejected.filter(x=>x!==id);if(!plan.approved.includes(id))plan.approved.push(id);if(!plan.queue.includes(id))plan.queue.push(id);
    persist();toast('Approved and added to your queue.');
  }
  function reject(id) {
    if(scheduledDay(id)){toast('Unschedule its daily edition before rejecting this set.');return;}
    plan.queue=plan.queue.filter(x=>x!==id);plan.approved=plan.approved.filter(x=>x!==id);
    if(plan.rejected.includes(id))plan.rejected=plan.rejected.filter(x=>x!==id);else plan.rejected.push(id);
    persist();
  }
  function showView(next) {
    view=next;
    for(const id of ['curate','queue','game'])$(id+'-view').hidden=id!==(next==='daily'?'game':next);
    document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
    document.title='NatureGuessr · '+({curate:'Curator desk',queue:'Approved queue',daily:'Daily game',game:'Playtest'}[next]||'Daily game');
    if(next==='daily')startDaily();if(next==='queue')renderQueue();window.scrollTo({top:0,behavior:'instant'});
  }
  function licenseLink(code) { return code==='cc0'?'https://creativecommons.org/publicdomain/zero/1.0/':'https://creativecommons.org/licenses/by/4.0/'; }
  function licenseName(code) { return code==='cc0'?'CC0':'CC BY 4.0'; }
  function creditHtml(c, showObservation=true) {
    const o=c.observation,p=o.photo;
    return `<p>Posted by <a href="https://www.inaturalist.org/people/${encodeURIComponent(o.observer)}" target="_blank" rel="noopener noreferrer">${esc(o.observerName||o.observer)}</a></p><p>${esc(p.attribution)}</p><div class="photo-license"><a href="${licenseLink(p.license)}" target="_blank" rel="noopener noreferrer">${licenseName(p.license)}</a>${showObservation?`<a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Observation</a>`:''}</div>`;
  }
  function photoCards(p, showObservation=true) {
    return p.clues.map((c,i)=>`<article class="photo-card"><button class="photo-button" data-photo-puzzle="${p.id}" data-photo-index="${i}" data-observation-visible="${showObservation}" aria-label="Zoom in on ${esc(c.name)}"><img src="${esc(c.observation.photo.url)}" alt="${esc(c.name)} observed by ${esc(c.observation.observer)}" loading="lazy" decoding="async"><span class="image-expand" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"></circle><path d="m15 15 6 6M10 7v6M7 10h6"></path></svg></span></button><div class="photo-info"><h3>${esc(c.name)}</h3><p class="scientific">${esc(c.scientific)}</p><div class="photo-credit">${creditHtml(c,showObservation)}</div></div></article>`).join('');
  }
  function installPhotoFallbacks(container) {
    container.querySelectorAll('img').forEach(image=>image.addEventListener('error',()=>{const fallback=document.createElement('span');fallback.className='photo-error';fallback.textContent='Photo unavailable. The species name is shown below.';image.replaceWith(fallback);},{once:true}));
  }
  function renderBank() {
    if(publicPlayer)return;
    const archived=D.puzzles.length-activePuzzles.length;
    $('bank-archive-note').hidden=!archived;
    $('bank-archive-note').textContent=archived+' older sets were archived because a species name gives away the answer country. Saved records are retained; replace archived sets in any existing queues or editions.';
    $('bank-count').textContent=activePuzzles.length;$('all-count').textContent=activePuzzles.length;
    $('bank-country-count').textContent=new Set(activePuzzles.map(p=>p.countryId)).size+' countries · 5 observations per set';
    const query=L.normalize($('bank-search').value);
    const shown=activePuzzles.filter(p=>(filter==='all'||status(p.id)===filter)&&(!query||L.normalize(p.country+' '+p.clues.map(c=>c.name+' '+c.scientific).join(' ')).includes(query)));
    $('candidate-list').innerHTML=shown.map(p=>{
      const state=status(p.id),queued=plan.queue.includes(p.id),day=scheduledDay(p.id);
      return `<article class="candidate"><div class="candidate-heading"><div><h2>${esc(p.country)}</h2><span class="status-badge ${state}">${state==='new'?'UNREVIEWED':state.toUpperCase()}</span><p class="candidate-id">${p.id}${day?' · Scheduled '+esc(day):queued?' · In your queue':''}</p></div><div class="candidate-heading-right"><button class="button secondary small" data-action="preview-user" data-id="${p.id}">Preview as player</button><button class="button secondary small" data-action="playtest" data-id="${p.id}">Playtest</button><button class="button primary small" data-action="approve" data-id="${p.id}" ${queued||day?'disabled':''}>${day?'Scheduled':queued?'In queue':'Approve & queue'}</button><button class="button ghost small" data-action="reject" data-id="${p.id}">${state==='rejected'?'Restore':'Reject'}</button></div></div><div class="candidate-clues">${p.clues.map(c=>`<div class="candidate-thumb"><img src="${esc(c.observation.photo.url)}" alt="${esc(c.name)}" loading="lazy" decoding="async"><div><strong>${esc(c.name)}</strong><small class="thumb-credit"><a href="${esc(c.observation.url)}" target="_blank" rel="noopener noreferrer">${esc(c.observation.observer)}</a> · <a href="${licenseLink(c.observation.photo.license)}" target="_blank" rel="noopener noreferrer">${licenseName(c.observation.photo.license)}</a><span>${esc(c.observation.photo.attribution)}</span></small></div></div>`).join('')}</div><div class="candidate-footer"><span>1 matching country in the model index · Country-filtered · Open licenses</span><button class="text-button" data-action="review" data-id="${p.id}">Review photos, credits & evidence</button></div></article>`;
    }).join('');
    $('bank-empty').hidden=shown.length>0;installPhotoFallbacks($('candidate-list'));$('queue-count').textContent=plan.queue.length;
  }
  function review(id) {
    const p=puzzles.get(id);$('detail-title').textContent=p.country+' · '+p.id;
    $('detail-body').innerHTML=`<div class="photo-grid">${photoCards(p)}</div><section class="detail-evidence"><h3>Why this set was offered</h3><p>All five observation searches start with <strong>place_id=${p.placeId}</strong> (${esc(p.country)}). Their photo and observation licenses are individually restricted to CC0 or CC BY. Public coordinates and country tags are checked as safeguards after that country-first selection.</p><p><strong>Modeled country intersection: ${esc(p.country)} only.</strong> Every country with non-trivial modeled land overlap counts as supporting a species. The five country-support sets intersect in one country; they need not all occur at the same spot within it.</p><div class="table-wrap"><table class="evidence-table"><thead><tr><th>Clue</th><th>Country support in the model</th><th>Source & selection</th></tr></thead><tbody>${p.clues.map((c,i)=>`<tr><td>${esc(c.name)}<br><span class="scientific">${esc(c.scientific)}</span></td><td><details><summary>${c.supportedCountries.length} ${c.supportedCountries.length===1?'country':'countries'}</summary>${c.supportedCountries.map(id=>esc(countries.get(id)?.name||id)).join(', ')}</details></td><td><a href="${esc(c.observation.query)}" target="_blank" rel="noopener noreferrer">Country-filtered photo query</a><br><a href="${esc(c.rangeUrl)}" target="_blank" rel="noopener noreferrer">Modeled range</a><br><span class="small-copy">Observed ${esc(c.observation.date)} · ${esc(c.observation.location[1].toFixed(4))}, ${esc(c.observation.location[0].toFixed(4))}<br>Observation data: ${licenseName(c.observation.license)} · Model ${esc(c.modelVersion)}</span></td></tr>`).join('')}</tbody></table></div><p>Models are incomplete. A singleton in this index is not proof that no other country has these species. Check distribution surprises, identification quality, and whether common names give away the answer before approval.</p><details><summary>Upstream species-selection queries</summary><ul>${p.selectionQueries.map((q,i)=>`<li><a href="${esc(q)}" target="_blank" rel="noopener noreferrer">${esc(p.clues[i].category)} candidates · place_id=${p.placeId}</a></li>`).join('')}</ul></details><div class="review-actions"><button class="button secondary" data-action="preview-user" data-id="${p.id}">Preview as player</button><button class="button secondary" data-action="playtest" data-id="${p.id}">Playtest this set</button><button class="button primary" data-action="approve" data-id="${p.id}">Approve & queue</button><button class="button danger" data-action="reject" data-id="${p.id}">${status(id)==='rejected'?'Restore to unreviewed':'Reject this set'}</button></div></section>`;
    installPhotoFallbacks($('detail-body'));$('detail-dialog').showModal();
  }
  function renderQueue() {
    if(publicPlayer)return;
    $('queue-count').textContent=plan.queue.length;$('queue-meta').textContent=plan.queue.length+' ready · '+Math.floor(plan.queue.length/3)+' full days';
    $('queue-list').innerHTML=plan.queue.map((id,i)=>{const p=puzzles.get(id);return `<li class="queue-item"><span class="queue-position">${String(i+1).padStart(2,'0')}</span><div class="queue-info"><strong>${esc(p.country)}</strong><small>${p.id}${p.archived?' · Needs replacement: country name in a clue':''}</small></div><div class="queue-actions"><button data-queue="up" data-id="${id}" ${i===0?'disabled':''} aria-label="Move ${esc(p.country)} earlier">Earlier</button><button data-queue="down" data-id="${id}" ${i===plan.queue.length-1?'disabled':''} aria-label="Move ${esc(p.country)} later">Later</button><button data-queue="remove" data-id="${id}">Remove</button></div></li>`;}).join('');
    $('queue-empty').hidden=plan.queue.length>0;$('schedule-button').disabled=plan.queue.length<3||plan.queue.some(id=>puzzles.get(id)?.archived);
    const editions=Object.entries(plan.schedule).sort(([a],[b])=>a.localeCompare(b));
    $('schedule-list').innerHTML=editions.length?editions.map(([day,ids])=>`<div class="edition"><strong>${esc(day)}</strong>${ids.map((id,i)=>`<span>${i+1}. ${esc(puzzles.get(id).country)}${puzzles.get(id).archived?' · Needs replacement':''}</span>`).join('')}<button class="button ghost small" data-player-edition="${day}" ${ids.some(id=>puzzles.get(id).archived)?'disabled':''}>Preview as player</button><button class="button ghost small" data-preview-edition="${day}" ${ids.some(id=>puzzles.get(id).archived)?'disabled':''}>Preview edition</button><button class="button ghost small" data-unschedule="${day}">Return edition to queue</button></div>`).join(''):'<p class="small-copy">No editions scheduled yet.</p>';
  }
  function saveDaily() { if(game?.mode==='daily')try{localStorage.setItem(DAILY_KEY,JSON.stringify(game));}catch{} }
  function startPlayerPreview(ids,date=L.today()) {
    if(!Array.isArray(ids)||!ids.length||ids.some(id=>!puzzles.has(id)||puzzles.get(id).archived)){toast('Choose eligible puzzles to preview.');return;}
    const token=crypto.randomUUID();
    try{sessionStorage.setItem('natureguessr-player-preview',JSON.stringify({token,ids,date,createdAt:Date.now()}));location.assign(new URL('daily/?preview='+encodeURIComponent(token),location.href));}
    catch{toast('Player preview requires browser session storage.');}
  }
  function celebrateWin() {
    const overlay=$('win-celebration');overlay.replaceChildren();
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    for(let i=0;i<48;i++){const piece=document.createElement('i');piece.style.setProperty('--x',(Math.random()*100)+'vw');piece.style.setProperty('--drift',((Math.random()-.5)*220)+'px');piece.style.setProperty('--delay',(Math.random()*.3)+'s');piece.style.setProperty('--spin',((Math.random()-.5)*1000)+'deg');piece.style.setProperty('--tone',String(i%4));piece.className='confetti tone-'+i%4;overlay.append(piece);}
    $('round-result').classList.remove('win-pop');void $('round-result').offsetWidth;$('round-result').classList.add('win-pop');
    setTimeout(()=>{overlay.replaceChildren();$('round-result').classList.remove('win-pop');},2600);
  }
  function startPlaytest(id) {
    game={mode:'playtest',ids:[id],round:0,rounds:[{guesses:[],revealed:false}]};showView('game');renderGame();
  }
  function startDaily(previewDate) {
    const day=publicPlayer?L.today():(previewDate||L.today()),ids=plan.schedule[day];
    if(!ids || ids.length!==3 || ids.some(id=>!puzzles.has(id)||puzzles.get(id).archived)){game=null;$('game-empty').hidden=false;$('game-content').hidden=true;$('game-mode').textContent='DAILY EDITION';$('game-progress').textContent=day;return;}
    $('game-empty').hidden=true;$('game-content').hidden=false;
    let saved;try{saved=JSON.parse(localStorage.getItem(DAILY_KEY)||'null');}catch{}
    const valid=saved?.date===day&&JSON.stringify(saved.ids)===JSON.stringify(ids)&&Number.isInteger(saved.round)&&saved.round>=0&&saved.round<=ids.length&&Array.isArray(saved.rounds)&&saved.rounds.length===ids.length&&saved.rounds.every(r=>Array.isArray(r.guesses)&&r.guesses.length<=5&&new Set(r.guesses).size===r.guesses.length&&r.guesses.every(id=>countries.has(id))&&typeof r.revealed==='boolean');
    game=valid?saved:{mode:'daily',date:day,ids:[...ids],round:0,rounds:ids.map(()=>({guesses:[],revealed:false}))};renderGame();
  }
  function renderGame() {
    if(!game)return;$('game-empty').hidden=true;$('game-content').hidden=false;
    $('game-mode').textContent=game.mode==='playtest'?'CURATOR PLAYTEST':'DAILY EDITION · '+game.date;
    const done=game.round>=game.ids.length,score=game.ids.reduce((sum,id,i)=>sum+L.roundScore(puzzles.get(id),game.rounds[i].guesses),0);
    $('game-progress').textContent=(done?'Edition complete':'Puzzle '+(game.round+1)+' / '+game.ids.length)+' · '+fmt(score)+' points';
    $('game-clues').hidden=done;document.querySelector('.guess-layout').hidden=done;document.querySelector('.game-title').hidden=done;
    if(done){$('round-result').hidden=false;$('round-result').innerHTML=`<div><p class="eyebrow">RESULT</p><h2>${fmt(score)} / ${fmt(game.ids.length*5000)} points</h2><p>${game.ids.map(id=>esc(puzzles.get(id).country)).join(' · ')}</p></div>${publicPlayer?'<p>Next game tomorrow.</p>':'<button class="button" data-view="curate">Back to curator desk</button>'}`;return;}
    const p=puzzles.get(game.ids[game.round]),r=game.rounds[game.round],won=r.guesses.at(-1)===p.countryId,ended=won||r.revealed||r.guesses.length>=5;
    $('game-clues').innerHTML=photoCards(p,ended);installPhotoFallbacks($('game-clues'));
    $('country-input').value='';selectedCountry=null;closeOptions();$('guess-error').textContent='';
    $('country-input').disabled=ended;$('guess-form').querySelector('button[type=submit]').disabled=ended;
    $('guesses-left').textContent=ended?(won?'Country found':'Country revealed'):(5-r.guesses.length)+' guesses left';
    $('no-guesses').hidden=r.guesses.length>0;$('guess-history').innerHTML=r.guesses.map((id,i)=>{
      const c=countries.get(id),correct=id===p.countryId,f=D.feedback[p.countryId][id];
      return `<li class="guess-row"><span class="guess-number">${i+1}</span><span class="guess-country">${esc(c.name)}</span><span class="guess-distance ${L.distanceTone(f.km,correct)}">${correct?'Correct':fmt(f.km)+' km'}</span>${correct?'<span class="mini-compass" aria-label="Correct">✓</span>':`<span class="mini-compass" role="img" aria-label="Travel ${L.direction(f.bearing)}, bearing ${f.bearing} degrees"><b style="transform:rotate(${f.bearing}deg)"></b><span>${L.direction(f.bearing)}</span></span>`}</li>`;
    }).join('');
    const last=r.guesses.at(-1),f=last?D.feedback[p.countryId][last]:null;
    $('trail-compass').querySelector('.compass-needle').style.transform='rotate('+(f?.bearing||0)+'deg)';
    if(won){$('trail-heading').textContent='Correct';$('trail-copy').textContent=p.country;}
    else if(f){$('trail-heading').textContent=fmt(f.km)+' km'+' · '+L.direction(f.bearing);$('trail-copy').textContent=f.touching?'Shared border with '+countries.get(last).name+'.':'From '+countries.get(last).name+' to the nearest border.';}
    else{$('trail-heading').textContent='Direction';$('trail-copy').textContent='Each guess shows distance between borders and direction.';}
    $('round-result').hidden=!ended;
    if(ended){const scheduled=scheduledDay(p.id),queued=plan.queue.includes(p.id);$('round-result').innerHTML=`<div><p class="eyebrow">${won?'CORRECT':'ANSWER'}</p><h2>${esc(p.country)}</h2><p>${fmt(L.roundScore(p,r.guesses))} points · ${r.guesses.length} ${r.guesses.length===1?'guess':'guesses'}</p></div><div class="review-actions">${game.mode==='playtest'?`<button class="button" data-action="approve" data-id="${p.id}" ${queued||scheduled?'disabled':''}>${queued?'In your queue':scheduled?'Already scheduled':'Approve & queue'}</button><button class="button" data-view="curate">Back to desk</button>`:`<button class="button" id="next-round">${game.round===game.ids.length-1?'See edition result':'Next country'}</button>`}</div>`;}
    saveDaily();
  }
  const aliases={'usa':'USA','us':'USA','united states':'USA','america':'USA','uk':'GBR','britain':'GBR','great britain':'GBR','south korea':'KOR','north korea':'PRK','czechia':'CZE','ivory coast':'CIV','east timor':'TLS'};
  function resolveCountry(text) { const value=L.normalize(text);return countries.get(aliases[value])||D.countries.find(c=>L.normalize(c.name)===value||L.normalize(c.id)===value||L.normalize(c.iso2)===value); }
  function closeOptions() {$('country-options').hidden=true;$('country-input').setAttribute('aria-expanded','false');$('country-input').removeAttribute('aria-activedescendant');suggestions=[];highlight=-1;}
  function updateOptions() {
    const query=L.normalize($('country-input').value);selectedCountry=null;highlight=-1;
    if(!query){closeOptions();return;}
    suggestions=D.countries.filter(c=>L.normalize(c.name).includes(query)||L.normalize(c.id)===query||aliases[query]===c.id).sort((a,b)=>Number(L.normalize(b.name).startsWith(query))-Number(L.normalize(a.name).startsWith(query))).slice(0,8);
    $('country-options').innerHTML=suggestions.map((c,i)=>`<li role="presentation"><button id="country-option-${i}" type="button" role="option" aria-selected="false" data-country="${c.id}" tabindex="-1">${esc(c.name)}<small>${c.id}</small></button></li>`).join('');
    $('country-options').hidden=!suggestions.length;$('country-input').setAttribute('aria-expanded',String(!!suggestions.length));
  }
  function chooseCountry(id) {selectedCountry=countries.get(id);$('country-input').value=selectedCountry.name;closeOptions();$('country-input').focus();}
  $('country-input').addEventListener('input',updateOptions);
  $('country-input').addEventListener('keydown',event=>{
    if(event.key==='Escape'){closeOptions();return;}
    if((event.key==='ArrowDown'||event.key==='ArrowUp')&&suggestions.length){event.preventDefault();highlight=(highlight+(event.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;$('country-options').querySelectorAll('button').forEach((b,i)=>{b.classList.toggle('highlighted',i===highlight);b.setAttribute('aria-selected',String(i===highlight));});$('country-input').setAttribute('aria-activedescendant','country-option-'+highlight);}
    if(event.key==='Enter'&&highlight>=0&&suggestions[highlight]){event.preventDefault();chooseCountry(suggestions[highlight].id);}
  });
  $('guess-form').addEventListener('submit',event=>{
    event.preventDefault();if(!game||game.round>=game.ids.length)return;
    const p=puzzles.get(game.ids[game.round]),r=game.rounds[game.round],c=selectedCountry||resolveCountry($('country-input').value);
    if(r.revealed||r.guesses.length>=5||r.guesses.at(-1)===p.countryId)return;
    if(!c){$('guess-error').textContent='Choose a country from the suggestions.';return;}
    if(r.guesses.includes(c.id)){$('guess-error').textContent='You already tried '+c.name+'. Try somewhere else.';return;}
    if(!D.feedback[p.countryId]?.[c.id]){$('guess-error').textContent='Border feedback is unavailable for that country.';return;}
    r.guesses.push(c.id);renderGame();if(c.id===p.countryId)celebrateWin();if(r.guesses.at(-1)!==p.countryId&&r.guesses.length<5)$('country-input').focus();
  });
  $('game-back').addEventListener('click',()=>showView('curate'));
  $('bank-search').addEventListener('input',renderBank);
  $('schedule-start').value=L.addDays(L.today(),1);$('schedule-start').min=L.today();
  $('schedule-button').addEventListener('click',()=>{
    if($('schedule-start').value<L.today()){toast('Choose today or a future date.');return;}
    try {const result=L.scheduleQueue(plan,$('schedule-start').value);plan=result.plan;persist();toast(result.editions+' daily '+(result.editions===1?'edition':'editions')+' scheduled.');}catch(e){toast(e.message);}
  });
  $('export-button').addEventListener('click',()=>{
    const exported={...plan,exportedAt:new Date().toISOString(),bankBuiltAt:D.builtAt};
    const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='natureguessr-curation-'+L.today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>1000000)throw new Error('That file is too large for a curation plan.');const imported=L.validatePlan(JSON.parse(await file.text()),[...puzzles.keys()]);plan=imported;persist();toast('Saved curation imported.');}catch(e){toast(e.message);}event.target.value='';
  });
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a')||event.target.closest('.photo-card')?.querySelector('.photo-button');if(!target)return;
    if(target.dataset.view){event.preventDefault();showView(target.dataset.view);}
    if(target.dataset.filter){filter=target.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});renderBank();}
    if(target.dataset.action){const {action,id}=target.dataset;if(!puzzles.has(id))return;if(action==='preview-user'){startPlayerPreview([id]);}if(action==='playtest'){$('detail-dialog').close();startPlaytest(id);}if(action==='review')review(id);if(action==='approve'){approve(id);if($('detail-dialog').open)$('detail-dialog').close();if(game&&view==='game')renderGame();}if(action==='reject'){reject(id);if($('detail-dialog').open)$('detail-dialog').close();}}
    if(target.dataset.queue){const id=target.dataset.id,i=plan.queue.indexOf(id);if(i<0)return;const action=target.dataset.queue;if(action==='remove')plan.queue.splice(i,1);else{const j=i+(action==='up'?-1:1);if(j>=0&&j<plan.queue.length)[plan.queue[i],plan.queue[j]]=[plan.queue[j],plan.queue[i]];}persist();}
    if(target.dataset.unschedule){const ids=plan.schedule[target.dataset.unschedule];if(ids){delete plan.schedule[target.dataset.unschedule];plan.queue.push(...ids);persist();toast('Edition returned to the queue.');}}
    if(target.dataset.playerEdition&&!publicPlayer)startPlayerPreview(plan.schedule[target.dataset.playerEdition],target.dataset.playerEdition);
    if(target.dataset.previewEdition&&!publicPlayer){showView('game');startDaily(target.dataset.previewEdition);}
    if(target.dataset.country)chooseCountry(target.dataset.country);
    if(target.dataset.photoPuzzle){const c=puzzles.get(target.dataset.photoPuzzle)?.clues[+target.dataset.photoIndex];if(c){$('full-photo').src=c.observation.photo.url;$('full-photo').alt=c.name+' · uncropped observation photo';$('full-photo-credit').innerHTML='<strong>'+esc(c.name)+'</strong><div>'+creditHtml(c,target.dataset.observationVisible==='true')+'</div>';$('photo-dialog').showModal();}}
    if(target.hasAttribute('data-close-dialog'))target.closest('dialog').close();
    if(target.id==='help-button')$('help-dialog').showModal();
    if(target.id==='next-round'&&game){game.round++;renderGame();window.scrollTo({top:0,behavior:'instant'});}
  });
  document.addEventListener('click',event=>{if(!event.target.closest('.country-picker'))closeOptions();});
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
  renderBank();renderQueue();
  let playerPreview=null;
  if(publicPlayer){try{const token=new URLSearchParams(location.search).get('preview'),saved=JSON.parse(sessionStorage.getItem('natureguessr-player-preview')||'null');if(token&&saved?.token===token&&Date.now()-saved.createdAt<86400000&&Array.isArray(saved.ids)&&saved.ids.length>0&&saved.ids.length<=3&&saved.ids.every(id=>puzzles.has(id)&&!puzzles.get(id).archived))playerPreview=saved;}catch{}}
  if(playerPreview){showView('game');$('exit-player-preview').hidden=false;game={mode:'player-preview',date:playerPreview.date||L.today(),ids:playerPreview.ids,round:0,rounds:playerPreview.ids.map(()=>({guesses:[],revealed:false}))};renderGame();document.title='NatureGuessr · Player preview';}
  else showView(publicPlayer?'daily':'curate');
})();
