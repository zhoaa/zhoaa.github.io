(function () {
  'use strict';
  const mode=document.body.dataset.mode, publicPlayer=mode==='public'||mode==='preview';
  const D=window.NATURE_DATA,L=window.NatureLogic,$=id=>document.getElementById(id);
  if (!D || !L) {
    if(publicPlayer){
      $('game-view').hidden=false;$('game-content').hidden=true;$('game-empty').hidden=false;
      $('game-empty').querySelector('h1').textContent='The game could not load.';
    } else {
      $('candidate-list').textContent='The candidate bank could not load. Please reload the page.';
    }
    return;
  }
  const puzzles=new Map(D.puzzles.map(p=>[p.id,p])),countries=new Map(D.countries.map(c=>[c.id,c]));
  const qa=new URLSearchParams(location.search).has('qa');
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
    if (!plan.schedule[day] && ids.length===3 && ids.every(id=>puzzles.has(id))) {
      plan.schedule[day]=ids;for(const id of ids){if(!plan.approved.includes(id))plan.approved.push(id);plan.rejected=plan.rejected.filter(x=>x!==id);}
    }
  }
  function approve(id) {
    if(puzzles.get(id)?.archived){toast('This set no longer meets the country-name rule. Choose another set.');return;}
    plan.rejected=plan.rejected.filter(x=>x!==id);if(!plan.approved.includes(id))plan.approved.push(id);plan.queue.push(id);
    persist();toast('Approved and added to your queue.');
  }
  function reject(id) {
    if(scheduledDay(id)){toast('Remove this set from the schedule before rejecting it.');return;}
    plan.queue=plan.queue.filter(x=>x!==id);plan.approved=plan.approved.filter(x=>x!==id);
    if(plan.rejected.includes(id))plan.rejected=plan.rejected.filter(x=>x!==id);else plan.rejected.push(id);
    persist();
  }
  function showView(next) {
    view=next;
    $('site-photo-attribution').hidden=next==='game'||next==='daily';
    for(const id of ['curate','queue','game'])$(id+'-view') && ($(id+'-view').hidden=id!==(next==='daily'?'game':next));
    document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
    document.title=(publicPlayer?'natGuessr Beta · ':'natGuessr · ')+({curate:'Curator desk',queue:'Approved queue',daily:'Daily game',game:'Playtest'}[next]||'Daily game');
    if(next==='daily')startDaily();if(next==='queue')renderQueue();window.scrollTo({top:0,behavior:'instant'});
  }
  function licenseLink(code) { return code==='cc0'?'https://creativecommons.org/publicdomain/zero/1.0/':'https://creativecommons.org/licenses/by/4.0/'; }
  function licenseName(code) { return code==='cc0'?'CC0':'CC BY 4.0'; }
  function creditHtml(c, showObservation, linkObserver) {
    const o=c.observation,p=o.photo;
    const observerName = esc(o.observerName || o.observer);
    const observer = linkObserver
      ? `<a href="https://www.inaturalist.org/people/${encodeURIComponent(o.observer)}" target="_blank" rel="noopener noreferrer">${observerName}</a>`
      : observerName;
    const poster = `<p>Posted by ${observer}</p>`;
    const copyright = p.attribution.replace(/^\(c\) /i, '© ').replace(/, some rights reserved \(CC BY\)$/i, '');
    return poster+`<div class="deferred-credit${showObservation?'':' credit-concealed'}"${showObservation?'':' aria-hidden="true" inert'}><p><a class="photo-attribution" href="${licenseLink(p.license)}" title="Photo license" target="_blank" rel="noopener noreferrer">${esc(copyright)}</a></p><div class="photo-license"><a class="observation-button" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">See Observation <span aria-hidden="true">↗</span><span class="visually-hidden"> (opens in a new tab)</span></a></div></div>`;
  }
  function photoCards(p, showObservation=true, revealNames=true, linkObserver=true) {
    return p.clues.map((c,i)=>`<article class="photo-card"><button class="photo-button" data-photo-puzzle="${p.id}" data-photo-index="${i}" data-name-visible="${revealNames}" aria-label="${revealNames?'Zoom in on '+esc(c.name):'Zoom in on observation photo '+(i+1)}"><img src="${esc(c.observation.photo.url)}" alt="${revealNames?esc(c.name):'Observation photo'}${showObservation?' posted by '+esc(c.observation.observer):''}" loading="lazy" decoding="async"><span class="image-expand" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"></circle><path d="m15 15 6 6M10 7v6M7 10h6"></path></svg></span></button><div class="photo-info"><h3>${revealNames?esc(c.name):'<span class="concealed-name"><span class="reserved-name" aria-hidden="true">'+esc(c.name)+'</span><span class="censored" aria-label="Species name hidden">██████████</span></span>'}</h3><p class="scientific">${revealNames?esc(c.scientific):'<span class="concealed-name"><span class="reserved-name" aria-hidden="true">'+esc(c.scientific)+'</span><span class="censored" aria-label="Scientific name hidden">████ ███████</span></span>'}</p><div class="photo-credit">${creditHtml(c,showObservation,linkObserver)}</div></div></article>`).join('');
  }
  function distanceBadge({ tone, label, icon }) {
    return `<span class="guess-distance distance-${tone}">${label}${icon ? ` <span aria-hidden="true">${icon}</span>` : ''}</span>`;
  }

  function alignPhotoRows(container) {
    const grids=container.matches?.('.photo-grid')?[container]:[...container.querySelectorAll('.photo-grid')];
    for(const grid of grids){
      if(!grid.getBoundingClientRect().width)continue;
      grid.style.removeProperty('--name-row');grid.style.removeProperty('--scientific-row');
      const names=[...grid.querySelectorAll('.photo-info h3')],scientific=[...grid.querySelectorAll('.photo-info .scientific')];
      grid.style.setProperty('--name-row',Math.ceil(Math.max(0,...names.map(e=>e.getBoundingClientRect().height)))+'px');
      grid.style.setProperty('--scientific-row',Math.ceil(Math.max(0,...scientific.map(e=>e.getBoundingClientRect().height)))+'px');
      if (grid.id === 'game-clues') {
        grid.classList.add('measuring-credits');
        const credits = [...grid.querySelectorAll('.deferred-credit')];
        grid.style.setProperty('--credit-row', Math.max(0, ...credits.map(credit => credit.scrollHeight)) + 'px');
        grid.classList.remove('measuring-credits');
      }
    }
  }
  window.addEventListener('resize',()=>requestAnimationFrame(()=>alignPhotoRows(document)));
  document.fonts?.ready.then(()=>alignPhotoRows(document));
  function installPhotoFallbacks(container) {
    container.querySelectorAll('img').forEach(image=>image.addEventListener('error',()=>{const fallback=document.createElement('span');fallback.className='photo-error';fallback.textContent='Photo unavailable. The species name is shown below.';image.replaceWith(fallback);},{once:true}));
  }
  function renderBank() {
    if(publicPlayer)return;
    const archived=D.puzzles.length-activePuzzles.length;
    $('bank-archive-note').hidden=!archived;
    $('bank-archive-note').textContent=archived+' older sets were archived because a species name gives away the answer country. Saved records are retained; replace archived sets in any existing queues or scheduled games.';
    $('bank-count').textContent=activePuzzles.length;$('all-count').textContent=activePuzzles.length;
    $('bank-country-count').textContent=new Set(activePuzzles.map(p=>p.countryId)).size+' countries · 5 observations per set';
    const query=L.normalize($('bank-search').value);
    const shown=activePuzzles.filter(p=>(filter==='all'||status(p.id)===filter)&&(!query||L.normalize(p.country+' '+p.clues.map(c=>c.name+' '+c.scientific).join(' ')).includes(query)));
    $('candidate-list').innerHTML=shown.map(p=>{
      const state=status(p.id),queued=plan.queue.includes(p.id);
      return `<article class="candidate"><div class="candidate-heading"><div><h2>${esc(p.country)}</h2><span class="status-badge ${state}">${state==='new'?'UNREVIEWED':state.toUpperCase()}</span><p class="candidate-id">${p.id}${queued?' · In your queue':''}</p></div><div class="candidate-heading-right"><button class="button secondary small" data-action="preview-user" data-id="${p.id}">Preview as player</button><button class="button secondary small" data-action="playtest" data-id="${p.id}">Playtest</button><button class="button primary small" data-action="approve" data-id="${p.id}" >${state==='approved'?'Add to queue':'Approve & queue'}</button><button class="button ghost small" data-action="reject" data-id="${p.id}">${state==='rejected'?'Restore':'Reject'}</button></div></div><div class="candidate-clues">${p.clues.map(c=>`<div class="candidate-thumb"><img src="${esc(c.observation.photo.url)}" alt="${esc(c.name)}" loading="lazy" decoding="async"><div><strong>${esc(c.name)}</strong><small class="thumb-credit"><a href="${esc(c.observation.url)}" target="_blank" rel="noopener noreferrer">${esc(c.observation.observer)}</a> · <a href="${licenseLink(c.observation.photo.license)}" target="_blank" rel="noopener noreferrer">${licenseName(c.observation.photo.license)}</a><span>${esc(c.observation.photo.attribution)}</span></small></div></div>`).join('')}</div><div class="candidate-footer"><span>1 matching country in the model index · Country-filtered · Open licenses</span><button class="text-button" data-action="review" data-id="${p.id}">Review photos, credits & evidence</button></div></article>`;
    }).join('');
    $('bank-empty').hidden=shown.length>0;installPhotoFallbacks($('candidate-list'));$('queue-count').textContent=plan.queue.length;
  }
  function review(id) {
    const p=puzzles.get(id);$('detail-title').textContent=p.country+' · '+p.id;
    $('detail-body').innerHTML=`<div class="photo-grid">${photoCards(p)}</div><section class="detail-evidence"><h3>Why this set was offered</h3><p>All five observation searches start with <strong>place_id=${p.placeId}</strong> (${esc(p.country)}). Their photo and observation licenses are individually restricted to CC0 or CC BY. Public coordinates and country tags are checked as safeguards after that country-first selection.</p><p><strong>Modeled country intersection: ${esc(p.country)} only.</strong> Every country with non-trivial modeled land overlap counts as supporting a species. The five country-support sets intersect in one country; they need not all occur at the same spot within it.</p><div class="table-wrap"><table class="evidence-table"><thead><tr><th>Clue</th><th>Country support in the model</th><th>Source & selection</th></tr></thead><tbody>${p.clues.map((c,i)=>`<tr><td>${esc(c.name)}<br><span class="scientific">${esc(c.scientific)}</span></td><td><details><summary>${c.supportedCountries.length} ${c.supportedCountries.length===1?'country':'countries'}</summary>${c.supportedCountries.map(id=>esc(countries.get(id)?.name||id)).join(', ')}</details></td><td><a href="${esc(c.observation.query)}" target="_blank" rel="noopener noreferrer">Country-filtered photo query</a><br><a href="${esc(c.rangeUrl)}" target="_blank" rel="noopener noreferrer">Modeled range</a><br><span class="small-copy">Observed ${esc(c.observation.date)} · ${esc(c.observation.location[1].toFixed(4))}, ${esc(c.observation.location[0].toFixed(4))}<br>Observation data: ${licenseName(c.observation.license)} · Model ${esc(c.modelVersion)}</span></td></tr>`).join('')}</tbody></table></div><p>Models are incomplete. A singleton in this index is not proof that no other country has these species. Check distribution surprises, identification quality, and whether common names give away the answer before approval.</p><details><summary>Upstream species-selection queries</summary><ul>${p.selectionQueries.map((q,i)=>`<li><a href="${esc(q)}" target="_blank" rel="noopener noreferrer">${esc(p.clues[i].category)} candidates · place_id=${p.placeId}</a></li>`).join('')}</ul></details><div class="review-actions"><button class="button secondary" data-action="preview-user" data-id="${p.id}">Preview as player</button><button class="button secondary" data-action="playtest" data-id="${p.id}">Playtest this set</button><button class="button primary" data-action="approve" data-id="${p.id}">Approve & queue</button><button class="button danger" data-action="reject" data-id="${p.id}">${status(id)==='rejected'?'Restore to unreviewed':'Reject this set'}</button></div></section>`;
    installPhotoFallbacks($('detail-body'));$('detail-dialog').showModal();alignPhotoRows($('detail-body'));
  }
  function renderQueue() {
    if(publicPlayer)return;
    $('queue-count').textContent=plan.queue.length;$('queue-meta').textContent=plan.queue.length+' queued';
    $('queue-list').innerHTML=plan.queue.map((id,i)=>{const p=puzzles.get(id);return `<li class="queue-item"><span class="queue-position">${String(i+1).padStart(2,'0')}</span><div class="queue-info"><strong>${esc(p.country)}</strong><small>${p.id}${p.archived?' · Needs replacement: country name in a clue':''}</small></div><div class="queue-actions"><button data-queue="up" data-position="${i}" ${i===0?'disabled':''} aria-label="Move ${esc(p.country)} earlier">Earlier</button><button data-queue="down" data-position="${i}" ${i===plan.queue.length-1?'disabled':''} aria-label="Move ${esc(p.country)} later">Later</button><button data-queue="remove" data-position="${i}">Remove</button></div></li>`;}).join('');
    $('queue-empty').hidden=plan.queue.length>0;$('schedule-button').disabled=new Set(plan.queue).size<3||plan.queue.some(id=>puzzles.get(id)?.archived);
    const editions=Object.entries(plan.schedule).sort(([a],[b])=>a.localeCompare(b));
    $('schedule-list').innerHTML=editions.length?editions.map(([day,ids])=>`<div class="edition"><strong>${esc(day)}</strong>${ids.map((id,i)=>`<span>${i+1}. ${esc(puzzles.get(id).country)}${puzzles.get(id).archived?' · Needs replacement':''}</span>`).join('')}<button class="button ghost small" data-player-edition="${day}" ${ids.some(id=>puzzles.get(id).archived)?'disabled':''}>Preview as player</button><button class="button ghost small" data-preview-edition="${day}" ${ids.some(id=>puzzles.get(id).archived)?'disabled':''}>Playtest game</button><button class="button ghost small" data-unschedule="${day}">Return game to queue</button></div>`).join(''):'<p class="small-copy">No games scheduled yet.</p>';
  }
  function saveDaily() { if(game?.mode==='daily')try{localStorage.setItem(DAILY_KEY,JSON.stringify(game));}catch{} }
  function startPlayerPreview(ids,date=L.today()) {
    if(!Array.isArray(ids)||!ids.length||ids.some(id=>!puzzles.has(id)||puzzles.get(id).archived)){toast('Choose eligible puzzles to preview.');return;}
    const token=crypto.randomUUID();
    try{sessionStorage.setItem('natureguessr-player-preview',JSON.stringify({token,ids,date,createdAt:Date.now()}));location.assign(new URL('preview/?preview='+encodeURIComponent(token),location.href));}
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
    if(!ids || ids.length!==3 || ids.some(id=>!puzzles.has(id)||puzzles.get(id).archived)){game=null;$('game-progress').hidden=false;$('game-empty').hidden=false;$('game-content').hidden=true;$('game-mode').textContent='DAILY GAME';$('game-progress').textContent=day;return;}
    $('game-empty').hidden=true;$('game-content').hidden=false;
    let saved;try{saved=JSON.parse(localStorage.getItem(DAILY_KEY)||'null');}catch{}
    const valid=saved?.date===day&&JSON.stringify(saved.ids)===JSON.stringify(ids)&&Number.isInteger(saved.round)&&saved.round>=0&&saved.round<=ids.length&&Array.isArray(saved.rounds)&&saved.rounds.length===ids.length&&saved.rounds.every(r=>Array.isArray(r.guesses)&&r.guesses.length<=5&&new Set(r.guesses).size===r.guesses.length&&r.guesses.every(id=>countries.has(id))&&typeof r.revealed==='boolean');
    game=valid?saved:{mode:'daily',date:day,ids:[...ids],round:0,rounds:ids.map(()=>({guesses:[],revealed:false}))};renderGame();
  }
  function guessHistory(p, guesses) {
    return guesses.map((id,i)=>{
      const c=countries.get(id),correct=id===p.countryId,f=D.feedback[p.countryId][id];
      const marker = correct ? '<span class="guess-correct" aria-hidden="true">✓</span>' :
        `<span class="compass mini-compass" role="img" aria-label="Direction ${L.direction(f.bearing)}"><i class="compass-needle" style="--bearing:${f.bearing}deg"></i><span aria-hidden="true">${L.direction(f.bearing)}</span></span>`;
      return `<li class="guess-row"><span class="guess-number">${i+1}</span><span class="guess-country">${esc(c.name)}</span>${distanceBadge(L.distanceBand(f, correct))}${marker}</li>`;
    }).join('');
  }

  function renderGameResults(rounds, total) {
    const results = $('round-result');
    const preview = game.mode === 'player-preview';
    const date = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(game.date + 'T12:00:00Z'));
    const score = fmt(total) + ' / ' + fmt(rounds.length * 5000);
    const entries = rounds.map(({ puzzle, guesses, points }, index) => {
      const feedback = D.feedback[puzzle.countryId];
      const won = guesses.at(-1) === puzzle.countryId;
      const icons = guesses.map(id => id === puzzle.countryId ? '🌿' : L.distanceBand(feedback[id]).icon);
      const trail = [...icons, ...Array(5 - icons.length).fill('▫️')].join(' ');
      const label = 'Round ' + (index + 1);
      return { label, puzzle, guesses, points, won, trail };
    });
    const shareText = [
      `🌎 natGuessr ${preview ? 'Preview' : 'Daily'} · ${date}`,
      `${score} points`,
      '',
      ...entries.map(({label, trail, points}) => `${label}  ${trail}  ${fmt(points)}`),
      '',
      'https://zhoaa.github.io/games/natureguessr/daily/',
    ].join('\n');

    $('site-photo-attribution').hidden = false;
    results.hidden = false;
    results.innerHTML = `
      <header class="results-header">
        <div>
          <h2 id="results-title" tabindex="-1">Your ${preview ? 'preview' : 'daily'} score</h2>
          <p class="results-score"><strong>${fmt(total)}</strong> / ${fmt(rounds.length * 5000)} points</p>
        </div>
        <button type="button" class="button" id="copy-score">Copy score</button>
      </header>
      <p id="copy-score-status" class="results-copy-status" role="status" hidden></p>
      <textarea id="share-score-text" aria-label="Score to copy" rows="7" readonly hidden></textarea>
      <div class="results-rounds">
        ${entries.map(({ label, puzzle, guesses, points, won, trail }) => `
          <details class="results-round">
            <summary>
              <span><small>${label}</small><strong>${esc(puzzle.country)}</strong></span>
              <span class="results-trail" aria-hidden="true">${trail}</span>
              <span class="results-round-points">${fmt(points)} pts</span>
            </summary>
            <div class="results-round-body">
              <ol class="guess-history" aria-label="${label} guesses">${guessHistory(puzzle, guesses)}</ol>
              <div class="photo-grid" aria-label="${label} observations">${photoCards(puzzle, true, true, won)}</div>
            </div>
          </details>`).join('')}
      </div>
      ${mode === 'public' ? '<p class="results-footer">Come back tomorrow for more!</p>' :
        !preview ? '<button class="button" data-view="curate">Back to curator desk</button>' : ''}
    `;

    installPhotoFallbacks(results);
    results.querySelectorAll('details').forEach(round => {
      round.addEventListener('toggle', () => {
        if (round.open) alignPhotoRows(round);
      });
    });
    $('copy-score').addEventListener('click', async () => {
      const status = $('copy-score-status');
      const field = $('share-score-text');
      try {
        await navigator.clipboard.writeText(shareText);
        field.hidden = true;
        status.textContent = 'Score copied.';
      } catch {
        field.hidden = false;
        field.value = shareText;
        field.focus();
        field.select();
        status.textContent = 'Select and copy the score below.';
      }
      status.hidden = false;
    });
  }

  function renderGame() {
    if(!game)return;$('game-empty').hidden=true;$('game-content').hidden=false;
    $('game-mode').textContent=game.mode==='playtest'?'CURATOR PLAYTEST':(game.mode==='player-preview'?'PLAYER PREVIEW':'DAILY GAME')+' · '+game.date;
    const done = game.round >= game.ids.length;
    const rounds = game.ids.map((id, index) => {
      const puzzle = puzzles.get(id);
      const guesses = game.rounds[index].guesses;
      const solvedPoints = L.roundScore(puzzle, guesses);
      const points = solvedPoints || (done ? L.proximityScore(guesses, D.feedback[puzzle.countryId]) : 0);
      return { puzzle, guesses, points };
    });
    const score = rounds.reduce((sum, round) => sum + round.points, 0);
    $('game-progress').hidden = done;
    $('game-progress').textContent = done ? '' : 'Set '+(game.round+1)+' / '+game.ids.length+' · '+fmt(score)+' points';
    $('game-clues').hidden = done;
    document.querySelector('.guess-layout').hidden = done;
    document.querySelector('.game-title').hidden = done;
    $('round-result').classList.toggle('game-results', done);
    if (done) {
      renderGameResults(rounds, score);
      saveDaily();
      return;
    }
    const p=puzzles.get(game.ids[game.round]),r=game.rounds[game.round],won=r.guesses.at(-1)===p.countryId,ended=won||r.revealed||r.guesses.length>=5;
    $('site-photo-attribution').hidden=!ended;
    const clues = $('game-clues');
    const revealing = ended && clues.querySelector('.credit-concealed') &&
      clues.querySelector('.photo-button')?.dataset.photoPuzzle === p.id;
    const before = revealing && !matchMedia('(prefers-reduced-motion: reduce)').matches
      ? [...clues.querySelectorAll('.photo-button')].map(photo => photo.getBoundingClientRect().height)
      : [];
    clues.innerHTML = photoCards(p, ended, ended || r.guesses.length >= 2, won);
    installPhotoFallbacks(clues);
    alignPhotoRows(clues);
    if (before.length) {
      [...clues.querySelectorAll('.photo-button')].forEach((photo, index) => {
        photo.animate(
          [{ height: before[index] + 'px' }, { height: photo.getBoundingClientRect().height + 'px' }],
          { duration: 360, easing: 'cubic-bezier(.2,.65,.3,1)' },
        );
      });
      clues.querySelectorAll('.deferred-credit').forEach(credit => {
        credit.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360 });
      });
    }
    $('country-input').value='';selectedCountry=null;closeOptions();$('guess-error').textContent='';
    $('country-input').disabled=ended;$('guess-form').querySelector('button[type=submit]').disabled=ended;
    $('guesses-left').textContent=ended?(won?'Country found':'Country revealed'):(5-r.guesses.length)+' guesses left';
    $('no-guesses').hidden=r.guesses.length>0;$('guess-history').innerHTML=guessHistory(p,r.guesses);
    const feedback = D.feedback[p.countryId][r.guesses.at(-1)];
    const compass = $('trail-compass');
    compass.querySelector('.compass-needle').style.setProperty('--bearing', (feedback?.bearing || 0) + 'deg');
    compass.setAttribute('aria-label', feedback && !won ? 'Direction ' + L.direction(feedback.bearing) : 'Compass');
    if (feedback) {
      $('trail-heading').innerHTML = distanceBadge(L.distanceBand(feedback, won));
    } else {
      $('trail-heading').textContent = '???';
    }
    $('round-result').hidden=!ended;
    if(ended){$('round-result').innerHTML=`<div><p class="eyebrow">${won?'CORRECT':'ANSWER'}</p><h2>${esc(p.country)}</h2><p>${won?fmt(L.roundScore(p,r.guesses))+' points · ':''}${r.guesses.length} ${r.guesses.length===1?'guess':'guesses'}</p></div><div class="review-actions">${game.mode==='playtest'?`<button class="button" data-action="approve" data-id="${p.id}" >${status(p.id)==='approved'?'Add to queue':'Approve & queue'}</button><button class="button" data-view="curate">Back to desk</button>`:`<button class="button" id="next-round">${game.round===game.ids.length-1?'See results':'Next country'}</button>`}</div>`;}
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
  if(!publicPlayer){
    $('game-back').addEventListener('click',()=>showView('curate'));
    $('bank-search').addEventListener('input',renderBank);
    $('schedule-start').value=L.addDays(L.today(),1);$('schedule-start').min=L.today();
    $('schedule-button').addEventListener('click',()=>{
      if($('schedule-start').value<L.today()){toast('Choose today or a future date.');return;}
      try {const result=L.scheduleQueue(plan,$('schedule-start').value);plan=result.plan;persist();toast(result.editions+' daily '+(result.editions===1?'game':'games')+' scheduled.');}catch(e){toast(e.message);}
    });
    $('export-button').addEventListener('click',()=>{
      const exported={...plan,exportedAt:new Date().toISOString(),bankBuiltAt:D.builtAt};
      const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='natguessr-curation-'+L.today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    $('import-file').addEventListener('change',async event=>{
      const file=event.target.files[0];if(!file)return;
      try{const imported=L.validatePlan(JSON.parse(await file.text()),[...puzzles.keys()]);plan=imported;persist();toast('Saved curation imported.');}catch(e){toast(e.message);}event.target.value='';
    });
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target)return;
    if(target.dataset.view){event.preventDefault();showView(target.dataset.view);}
    if(target.dataset.filter){filter=target.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});renderBank();}
    if(target.dataset.action){const {action,id}=target.dataset;if(!puzzles.has(id))return;if(action==='preview-user'){startPlayerPreview([id]);}if(action==='playtest'){$('detail-dialog').close();startPlaytest(id);}if(action==='review')review(id);if(action==='approve'){approve(id);if($('detail-dialog').open)$('detail-dialog').close();if(game&&view==='game')renderGame();}if(action==='reject'){reject(id);if($('detail-dialog').open)$('detail-dialog').close();}}
    if(target.dataset.queue){const i=Number(target.dataset.position);if(!Number.isInteger(i)||i<0||i>=plan.queue.length)return;const action=target.dataset.queue;if(action==='remove')plan.queue.splice(i,1);else{const j=i+(action==='up'?-1:1);if(j>=0&&j<plan.queue.length)[plan.queue[i],plan.queue[j]]=[plan.queue[j],plan.queue[i]];}persist();}
    if(target.dataset.unschedule){const ids=plan.schedule[target.dataset.unschedule];if(ids){delete plan.schedule[target.dataset.unschedule];plan.queue.push(...ids);persist();toast('Game returned to the queue.');}}
    if(target.dataset.playerEdition&&!publicPlayer)startPlayerPreview(plan.schedule[target.dataset.playerEdition],target.dataset.playerEdition);
    if(target.dataset.previewEdition&&!publicPlayer){showView('game');startDaily(target.dataset.previewEdition);}
    if(target.dataset.country)chooseCountry(target.dataset.country);
    if(target.dataset.photoPuzzle){const c=puzzles.get(target.dataset.photoPuzzle)?.clues[+target.dataset.photoIndex];if(c){$('full-photo').src=c.observation.photo.url;$('full-photo').alt=(target.dataset.nameVisible==='true'?c.name:'Observation photo')+' · uncropped';$('photo-dialog').showModal();}}
    if(target.hasAttribute('data-close-dialog'))target.closest('dialog').close();
    if(target.id==='help-button')$('help-dialog').showModal();
    if(target.id==='report-button')$('report-dialog').showModal();
    if(target.id==='next-round'&&game){game.round++;renderGame();$('results-title')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  });
  document.addEventListener('click',event=>{if(!event.target.closest('.country-picker'))closeOptions();});
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
  if(!publicPlayer){renderBank();renderQueue();}
  let playerPreview=null;
  if(mode==='preview'){try{const token=new URLSearchParams(location.search).get('preview'),saved=JSON.parse(sessionStorage.getItem('natureguessr-player-preview')||'null');if(token&&saved?.token===token&&Date.now()-saved.createdAt<86400000&&Array.isArray(saved.ids)&&saved.ids.length>0&&saved.ids.length<=3&&saved.ids.every(id=>puzzles.has(id)&&!puzzles.get(id).archived))playerPreview=saved;}catch{}}
  if(playerPreview){showView('game');game={mode:'player-preview',date:playerPreview.date||L.today(),ids:playerPreview.ids,round:0,rounds:playerPreview.ids.map(()=>({guesses:[],revealed:false}))};renderGame();document.title='natGuessr Beta · Player preview';}
  else showView(publicPlayer?'daily':'curate');
  if (publicPlayer) {
    const helpKey = 'natguessr-help-seen-' + mode;
    let seen = false;
    try { seen = localStorage.getItem(helpKey) === '1'; } catch {}
    if (!seen) {
      $('help-dialog').showModal();
      try { localStorage.setItem(helpKey, '1'); } catch {}
    }
  }
})();
