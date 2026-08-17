/* Logique de l'application : rendu des écrans, navigation, événements. */

const GROUPES = ['Pecs', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Jambes', 'Abdos', 'Autre'];

let DATA = loadData();
let currentScreen = 'accueil';
let currentJourDate = todayISO();
let currentCaloriesDate = todayISO();
let cameFromScreen = 'accueil';
let screenBeforeSettings = 'accueil';
let calCursor = { year: new Date().getFullYear(), month: new Date().getMonth() };

/* ===== Helpers ===== */

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), 1800);
}

function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-content').innerHTML = '';
}

/* ===== Statut des jours (streak / calendrier) ===== */

function getDayStatus(dateISO) {
  const dayKey = getDayKey(dateISO);
  const plan = DATA.program[dayKey];
  const log = DATA.logs[dateISO];
  const exIds = log ? Object.keys(log.exercises) : plan.exercises.map(e => e.id);
  if (exIds.length === 0) return 'rest';
  if (dateISO > todayISO()) return 'future';
  let done = 0;
  const total = exIds.length + 1;
  if (log) {
    exIds.forEach(id => { if (log.exercises[id] && log.exercises[id].done) done++; });
    if (log.cardio && log.cardio.done) done++;
  }
  if (done >= total) return 'complete';
  if (done > 0) return 'partial';
  return 'missed';
}

function isDayFullyDone(dateISO) {
  const log = DATA.logs[dateISO];
  if (!log) return false;
  const cardioOk = !!(log.cardio && log.cardio.done);
  const exIds = Object.keys(log.exercises);
  if (exIds.length === 0) return cardioOk;
  return exIds.every(id => log.exercises[id].done) && cardioOk;
}

function computeStreak() {
  let count = 0;
  let d = todayISO();
  if (!isDayFullyDone(d)) d = addDays(d, -1);
  while (isDayFullyDone(d)) {
    count++;
    d = addDays(d, -1);
  }
  return count;
}

function syncLogWithPlan(dateISO) {
  const log = ensureLog(DATA, dateISO);
  const dayKey = getDayKey(dateISO);
  const plan = DATA.program[dayKey];
  plan.exercises.forEach(e => {
    if (!log.exercises[e.id]) {
      const lastSets = findLastSetsByName(DATA, e.name, dateISO);
      log.exercises[e.id] = { done: false, sets: lastSets || [], name: e.name, groupe: e.groupe };
    }
  });
}

function upsertWeight(dateISO, val) {
  const existing = DATA.weights.find(w => w.date === dateISO);
  if (existing) existing.poids = val;
  else DATA.weights.push({ date: dateISO, poids: val });
  DATA.weights.sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = DATA.weights[DATA.weights.length - 1];
  DATA.profile.poidsActuel = latest.poids;
  saveData(DATA);
}

/* ===== Graphiques SVG ===== */

function buildWeightChartSVG() {
  const profile = DATA.profile;
  const pts = [...DATA.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (pts.length === 0) return '<p class="history-empty">Ajoute une pesée pour voir ton évolution.</p>';

  const startDate = profile.dateDebut;
  const endDate = addDays(profile.dateDebut, profile.dureeSemaines * 7);
  let minDate = startDate, maxDate = endDate;
  pts.forEach(p => { if (p.date < minDate) minDate = p.date; if (p.date > maxDate) maxDate = p.date; });
  if (todayISO() > maxDate) maxDate = todayISO();

  const allWeights = pts.map(p => p.poids).concat([profile.poidsDepart, profile.poidsObjectif]);
  const minW = Math.min(...allWeights) - 1;
  const maxW = Math.max(...allWeights) + 1;

  const W = 320, H = 170, padL = 34, padR = 10, padT = 10, padB = 24;
  const xSpan = Math.max(1, diffDays(maxDate, minDate));
  const x = d => padL + (diffDays(d, minDate) / xSpan) * (W - padL - padR);
  const y = v => padT + (1 - (v - minW) / (maxW - minW)) * (H - padT - padB);

  const accent = cssVar('--accent', '#111111');
  const muted3 = cssVar('--muted-3', '#D8E0DC');
  const mutedTxt = cssVar('--muted', '#5C6E67');

  const targetPath = `M ${x(startDate).toFixed(1)} ${y(profile.poidsDepart).toFixed(1)} L ${x(endDate).toFixed(1)} ${y(profile.poidsObjectif).toFixed(1)}`;
  const realPath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + x(p.date).toFixed(1) + ' ' + y(p.poids).toFixed(1)).join(' ');
  const dots = pts.map(p => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.poids).toFixed(1)}" r="3.2" fill="${accent}"/>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="${muted3}" stroke-width="1"/>
    <path d="${targetPath}" fill="none" stroke="${muted3}" stroke-width="2" stroke-dasharray="4 3"/>
    <path d="${realPath}" fill="none" stroke="${accent}" stroke-width="2.5"/>
    ${dots}
    <text x="${padL}" y="${padT + 8}" font-size="9" fill="${mutedTxt}">${maxW.toFixed(1)}</text>
    <text x="${padL}" y="${H - padB - 2}" font-size="9" fill="${mutedTxt}">${minW.toFixed(1)}</text>
  </svg>`;
}

function collectExerciseHistory(name) {
  const target = (name || '').trim().toLowerCase();
  const rows = [];
  Object.keys(DATA.logs).sort().forEach(date => {
    const log = DATA.logs[date];
    let sets = null;
    Object.keys(log.exercises).forEach(exId => {
      const e = log.exercises[exId];
      if (!sets && e.done && e.sets && e.sets.length > 0 && (e.name || '').trim().toLowerCase() === target) {
        sets = e.sets;
      }
    });
    if (!sets) return;
    const weights = sets.map(s => Number(s.poids) || 0).filter(v => v > 0);
    if (weights.length === 0) return;
    rows.push({ date, sets, top: Math.max(...weights) });
  });
  return rows;
}

function buildSimpleLineChartSVG(points) {
  if (points.length === 0) return '';
  const accent = cssVar('--accent', '#111111');
  const mutedTxt = cssVar('--muted', '#5C6E67');
  const W = 320, H = 140, padL = 30, padR = 10, padT = 10, padB = 20;
  const vals = points.map(p => p.val);
  let minV = Math.min(...vals), maxV = Math.max(...vals);
  if (minV === maxV) { minV -= 5; maxV += 5; } else { const pad = (maxV - minV) * 0.15; minV -= pad; maxV += pad; }
  const n = points.length;
  const x = i => (n === 1 ? W / 2 : padL + (i / (n - 1)) * (W - padL - padR));
  const y = v => padT + (1 - (v - minV) / (maxV - minV)) * (H - padT - padB);
  const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + x(i).toFixed(1) + ' ' + y(p.val).toFixed(1)).join(' ');
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.val).toFixed(1)}" r="3.2" fill="${accent}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}">
    <path d="${path}" fill="none" stroke="${accent}" stroke-width="2.5"/>
    ${dots}
    <text x="${padL}" y="${padT + 8}" font-size="9" fill="${mutedTxt}">${maxV.toFixed(1)}</text>
    <text x="${padL}" y="${H - padB - 2}" font-size="9" fill="${mutedTxt}">${minV.toFixed(1)}</text>
  </svg>`;
}

function openExerciseHistory(name) {
  const rows = collectExerciseHistory(name);
  const chart = rows.length
    ? buildSimpleLineChartSVG(rows.map(r => ({ date: r.date, val: r.top })))
    : '<p class="history-empty">Pas encore de séries enregistrées pour cet exercice.</p>';
  const list = rows.length
    ? rows.slice().reverse().map(r => `
      <li>
        <div class="history-item-main"><span class="h-title">${fmtDateShortFR(r.date)}</span><span class="h-sub">${r.sets.map(s => `${s.poids || 0}kg×${s.reps || 0}`).join(', ')}</span></div>
        <div class="history-item-side">${r.top} kg</div>
      </li>`).join('')
    : '';
  openModal(`
    <div class="modal-title">${escapeHtml(name)} — progression</div>
    <div class="chart-wrap">${chart}</div>
    <ul class="history-list">${list}</ul>
  `);
}

/* ===== Navigation ===== */

function navigate(route) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + route).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.route === route));
  window.scrollTo(0, 0);
  currentScreen = route;
  if (route === 'accueil') renderAccueil();
  if (route === 'calendrier') renderCalendrier();
  if (route === 'poids') renderPoids();
  if (route === 'calories') renderCalories();
}

function openJour(dateISO, from) {
  cameFromScreen = from || currentScreen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-jour').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  window.scrollTo(0, 0);
  currentScreen = 'jour';
  renderJour(dateISO);
}

function openReglages() {
  screenBeforeSettings = currentScreen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-reglages').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  window.scrollTo(0, 0);
  currentScreen = 'reglages';
  renderReglages();
}

/* ===== Écran Accueil ===== */

function renderAccueil() {
  const today = todayISO();
  const dayKey = getDayKey(today);
  const plan = DATA.program[dayKey];
  const log = ensureLog(DATA, today);
  saveData(DATA);

  document.getElementById('home-seance-type').textContent = 'Séance du jour — ' + JOURS_LABELS[dayKey];
  document.getElementById('home-seance-badge').textContent = plan.exercises.length ? plan.type : 'Repos';

  const list = document.getElementById('home-seance-list');
  const btnSeance = document.getElementById('home-btn-seance');
  if (plan.exercises.length === 0) {
    list.innerHTML = "<li>Pas de musculation aujourd'hui — jour de repos.</li>";
    btnSeance.textContent = 'Voir le cardio du jour';
  } else {
    list.innerHTML = plan.exercises.map(e => {
      const done = log.exercises[e.id] && log.exercises[e.id].done;
      return `<li class="${done ? 'done' : ''}"><span class="dot-small"></span>${escapeHtml(e.name)}</li>`;
    }).join('');
    btnSeance.textContent = 'Commencer la séance';
  }

  const cardioLabel = log.cardio.kind === 'corde'
    ? `Corde à sauter — ${log.cardio.dureeMin} min (15 à 30 min conseillé)`
    : `${log.cardio.label} — ${log.cardio.dureeMin} min`;
  document.getElementById('home-cardio-info').textContent = cardioLabel;
  document.getElementById('home-cardio-check').checked = !!log.cardio.done;

  const profile = DATA.profile;
  const sortedW = [...DATA.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const currentWeight = sortedW.length ? sortedW[sortedW.length - 1].poids : profile.poidsActuel;
  const start = profile.poidsDepart, goal = profile.poidsObjectif;
  let pct = start !== goal ? Math.round(((start - currentWeight) / (start - goal)) * 100) : 0;
  pct = Math.max(0, Math.min(100, pct));
  document.getElementById('home-weight-pct').textContent = pct + '%';
  document.getElementById('home-weight-bar').style.width = pct + '%';
  document.getElementById('home-weight-current').textContent = currentWeight + ' kg';
  document.getElementById('home-weight-goal').textContent = goal + ' kg';

  const totalKcal = log.meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
  const calGoal = profile.objectifCalories;
  document.getElementById('home-cal-total').textContent = Math.round(totalKcal) + ' kcal';
  document.getElementById('home-cal-goal').textContent = calGoal + ' kcal';
  document.getElementById('home-cal-bar').style.width = Math.min(100, calGoal ? (totalKcal / calGoal) * 100 : 0) + '%';

  const waterMl = log.water.ml || 0;
  const waterGoal = profile.objectifEauMl || 2500;
  document.getElementById('home-water-badge').textContent = (waterMl / 1000).toFixed(1) + ' L';
  document.getElementById('home-water-bar').style.width = Math.min(100, waterGoal ? (waterMl / waterGoal) * 100 : 0) + '%';

  document.getElementById('home-streak-num').textContent = computeStreak();
}

/* ===== Écran Calendrier ===== */

function renderCalendrier() {
  document.getElementById('cal-month-label').textContent = MOIS_LABELS[calCursor.month] + ' ' + calCursor.year;
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  const firstOfMonth = new Date(calCursor.year, calCursor.month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // 0 = lundi
  const daysInMonth = new Date(calCursor.year, calCursor.month + 1, 0).getDate();
  const today = todayISO();

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateISO = `${calCursor.year}-${pad2(calCursor.month + 1)}-${pad2(day)}`;
    const cell = document.createElement('div');
    cell.className = 'cal-day' + (dateISO === today ? ' today' : '');
    const status = getDayStatus(dateISO);
    const dotClass = { complete: 'dot-complete', partial: 'dot-partial', missed: 'dot-missed', rest: 'dot-rest' }[status];
    cell.innerHTML = `<span>${day}</span>${dotClass ? `<span class="dot ${dotClass}"></span>` : ''}`;
    cell.addEventListener('click', () => openJour(dateISO, 'calendrier'));
    grid.appendChild(cell);
  }
}

/* ===== Écran Poids ===== */

function renderPoids() {
  document.getElementById('poids-date').value = todayISO();
  document.getElementById('poids-chart').innerHTML = buildWeightChartSVG();
  const list = document.getElementById('poids-history');
  const sorted = [...DATA.weights].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (sorted.length === 0) {
    list.innerHTML = '<li class="history-empty">Aucune pesée enregistrée.</li>';
    return;
  }
  list.innerHTML = sorted.map((w, i) => {
    const prev = sorted[i + 1];
    let deltaHtml = '';
    if (prev) {
      const d = +(w.poids - prev.poids).toFixed(1);
      deltaHtml = `<span class="muted small">${d > 0 ? '+' : ''}${d} kg</span>`;
    }
    return `<li>
      <div class="history-item-main"><span class="h-title">${w.poids} kg</span><span class="h-sub">${capitalize(fmtDateFR(w.date))}</span></div>
      <div class="history-item-side">${deltaHtml}<button class="btn-icon-del" data-action="del-weight" data-date="${w.date}">🗑</button></div>
    </li>`;
  }).join('');
}

/* ===== Écran Calories ===== */

function renderCalories() {
  document.getElementById('cal2-date-label').textContent = currentCaloriesDate === todayISO()
    ? "Aujourd'hui" : capitalize(fmtDateFR(currentCaloriesDate));
  const log = ensureLog(DATA, currentCaloriesDate);
  saveData(DATA);

  const totals = log.meals.reduce((acc, m) => {
    acc.kcal += Number(m.kcal) || 0;
    acc.prot += Number(m.prot) || 0;
    acc.gluc += Number(m.gluc) || 0;
    acc.lip += Number(m.lip) || 0;
    return acc;
  }, { kcal: 0, prot: 0, gluc: 0, lip: 0 });

  const goal = DATA.profile.objectifCalories;
  document.getElementById('cal2-total-badge').textContent = Math.round(totals.kcal) + ' kcal';
  document.getElementById('cal2-bar').style.width = Math.min(100, goal ? (totals.kcal / goal) * 100 : 0) + '%';
  document.getElementById('cal2-macros').innerHTML = `
    <div class="macro-pill"><strong>${Math.round(totals.prot)} g</strong>Protéines / ${DATA.profile.objectifProteines} g</div>
    <div class="macro-pill"><strong>${Math.round(totals.gluc)} g</strong>Glucides</div>
    <div class="macro-pill"><strong>${Math.round(totals.lip)} g</strong>Lipides</div>
  `;

  const list = document.getElementById('cal2-meals-list');
  list.innerHTML = log.meals.length === 0
    ? '<li class="history-empty">Aucun aliment ajouté ce jour.</li>'
    : log.meals.map(m => `
      <li>
        <div class="history-item-main"><span class="h-title">${escapeHtml(m.nom)}</span><span class="h-sub">${[m.prot ? `${m.prot}g P` : '', m.gluc ? `${m.gluc}g G` : '', m.lip ? `${m.lip}g L` : ''].filter(Boolean).join(' · ')}</span></div>
        <div class="history-item-side">${Math.round(m.kcal)} kcal <button class="btn-icon-del" data-action="del-meal" data-id="${m.id}">🗑</button></div>
      </li>`).join('');
}

function openAddMealModal(dateISO) {
  openModal(`
    <div class="modal-title">Ajouter un aliment — ${capitalize(fmtDateFR(dateISO))}</div>
    <form id="form-add-meal" class="form-grid">
      <label>Nom<input type="text" id="m-nom" required placeholder="ex : Poulet riz"></label>
      <label>Calories (kcal)<input type="number" id="m-kcal" min="0" inputmode="numeric" required></label>
      <label>Protéines (g)<input type="number" id="m-prot" min="0" step="0.1" inputmode="decimal"></label>
      <label>Glucides (g)<input type="number" id="m-gluc" min="0" step="0.1" inputmode="decimal"></label>
      <label>Lipides (g)<input type="number" id="m-lip" min="0" step="0.1" inputmode="decimal"></label>
      <button type="submit" class="btn btn-primary btn-block">Ajouter</button>
    </form>
  `);
  document.getElementById('form-add-meal').addEventListener('submit', e => {
    e.preventDefault();
    const log = ensureLog(DATA, dateISO);
    log.meals.push({
      id: uid('meal'),
      nom: document.getElementById('m-nom').value.trim() || 'Aliment',
      kcal: Number(document.getElementById('m-kcal').value) || 0,
      prot: Number(document.getElementById('m-prot').value) || 0,
      gluc: Number(document.getElementById('m-gluc').value) || 0,
      lip: Number(document.getElementById('m-lip').value) || 0
    });
    saveData(DATA);
    closeModal();
    if (currentScreen === 'calories') renderCalories();
    if (currentScreen === 'accueil') renderAccueil();
    showToast('Aliment ajouté');
  });
}

/* ===== Écran Jour / Séance ===== */

function renderJour(dateISO) {
  currentJourDate = dateISO;
  if (dateISO >= todayISO()) syncLogWithPlan(dateISO);
  const log = ensureLog(DATA, dateISO);
  saveData(DATA);
  const dayKey = getDayKey(dateISO);
  const plan = DATA.program[dayKey];

  document.getElementById('jour-date-label').textContent = capitalize(fmtDateFR(dateISO));
  const exIds = Object.keys(log.exercises);
  document.getElementById('jour-type-label').textContent = exIds.length
    ? JOURS_LABELS[dayKey] + ' · ' + plan.type
    : JOURS_LABELS[dayKey] + ' · Repos';

  const container = document.getElementById('jour-exercises');
  if (exIds.length === 0) {
    container.innerHTML = '<p class="muted">Jour de repos — pas de musculation prévue. Pense au cardio ci-dessous !</p>';
  } else {
    container.innerHTML = exIds.map(id => {
      const e = log.exercises[id];
      return `
      <div class="exercise-block">
        <div class="exercise-head">
          <button type="button" class="exercise-name-btn" data-action="history" data-ex-id="${id}" data-ex-name="${escapeHtml(e.name)}">
            ${escapeHtml(e.name)}<span class="groupe">${escapeHtml(e.groupe || '')}</span>
          </button>
          <input type="checkbox" data-action="toggle-done" data-ex-id="${id}" ${e.done ? 'checked' : ''}>
        </div>
        <div class="sets-table">
          ${e.sets.map((s, idx) => `
            <div class="set-row">
              <span class="set-idx">${idx + 1}</span>
              <input type="number" inputmode="decimal" placeholder="kg" step="0.5" min="0" value="${s.poids === '' || s.poids === undefined ? '' : s.poids}" data-action="set-poids" data-ex-id="${id}" data-idx="${idx}">
              <input type="number" inputmode="numeric" placeholder="reps" min="0" value="${s.reps === '' || s.reps === undefined ? '' : s.reps}" data-action="set-reps" data-ex-id="${id}" data-idx="${idx}">
              <button type="button" class="btn-del" data-action="del-set" data-ex-id="${id}" data-idx="${idx}">✕</button>
            </div>`).join('')}
        </div>
        <div class="exercise-actions">
          <button type="button" class="btn btn-secondary btn-small" data-action="add-set" data-ex-id="${id}">+ Série</button>
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('jour-cardio-label').textContent = log.cardio.label;
  document.getElementById('jour-cardio-check').checked = !!log.cardio.done;
  document.getElementById('jour-cardio-text').textContent = log.cardio.kind === 'corde' ? 'Fait (objectif 15 à 30 min)' : 'Fait';
  const slider = document.getElementById('jour-cardio-duree');
  slider.value = log.cardio.dureeMin;
  document.getElementById('jour-cardio-duree-val').textContent = log.cardio.dureeMin + ' min';
}

/* ===== Écran Réglages ===== */

function renderReglages() {
  const p = DATA.profile;
  document.getElementById('p-sexe').value = p.sexe;
  document.getElementById('p-age').value = p.age;
  document.getElementById('p-taille').value = p.tailleCm;
  document.getElementById('p-poids').value = p.poidsActuel;
  document.getElementById('p-poids-obj').value = p.poidsObjectif;
  document.getElementById('p-duree').value = p.dureeSemaines;
  document.getElementById('p-activite').value = p.niveauActivite;
  document.getElementById('p-cal').value = p.objectifCalories;
  document.getElementById('p-prot').value = p.objectifProteines;
  document.getElementById('p-eau').value = ((p.objectifEauMl || 2500) / 1000).toFixed(1);
  document.getElementById('suggest-box').classList.remove('visible');
  renderProgramEditor();
  renderSecuritySection();
}

function renderProgramEditor() {
  const container = document.getElementById('program-editor');
  const order = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  container.innerHTML = order.map(dayKey => {
    const plan = DATA.program[dayKey];
    return `<div class="day-editor" data-day="${dayKey}">
      <div class="day-editor-head">
        <strong>${JOURS_LABELS[dayKey]}</strong>
        <input type="text" data-action="rename-type" data-day="${dayKey}" value="${escapeHtml(plan.type)}" placeholder="Type de séance">
      </div>
      <div class="day-editor-cardio">
        <select data-action="cardio-kind" data-day="${dayKey}">
          <option value="marche" ${plan.cardio.kind === 'marche' ? 'selected' : ''}>Marche inclinée</option>
          <option value="corde" ${plan.cardio.kind === 'corde' ? 'selected' : ''}>Corde à sauter</option>
        </select>
        <input type="number" min="5" max="45" step="5" data-action="cardio-duree" data-day="${dayKey}" value="${plan.cardio.dureeMin}">
        <span>min</span>
      </div>
      ${plan.exercises.map(e => `
        <div class="ex-edit-row">
          <div class="ex-name-wrap">
            <input type="text" data-action="ex-rename" data-day="${dayKey}" data-ex-id="${e.id}" value="${escapeHtml(e.name)}">
            <button type="button" class="btn-copy-ex" data-action="ex-copy" data-ex-id="${e.id}" title="Copier le nom"><svg class="icon-copy" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><svg class="icon-check" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
          </div>
          <select data-action="ex-groupe" data-day="${dayKey}" data-ex-id="${e.id}">
            ${GROUPES.map(g => `<option value="${g}" ${g === e.groupe ? 'selected' : ''}>${g}</option>`).join('')}
          </select>
          <button type="button" class="btn-del-ex" data-action="ex-del" data-day="${dayKey}" data-ex-id="${e.id}">✕</button>
        </div>`).join('')}
      <button type="button" class="btn-add-ex" data-action="add-ex" data-day="${dayKey}">+ Ajouter un exercice</button>
    </div>`;
  }).join('');
}

/* ===== Écran Évolution (photos/vidéos verrouillées) ===== */

let evoUnlocked = false;
let screenBeforeEvolution = 'accueil';
let evoObjectUrls = [];

function openEvolution() {
  screenBeforeEvolution = currentScreen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-evolution').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  window.scrollTo(0, 0);
  currentScreen = 'evolution';
  evoUnlocked = false;
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-error').textContent = '';
  renderEvolutionGate();
}

function renderEvolutionGate() {
  const lockCard = document.getElementById('evolution-lock-card');
  const gallery = document.getElementById('evolution-gallery');
  if (!DATA.security.enabled) {
    lockCard.classList.add('hidden');
    gallery.classList.remove('hidden');
    evoUnlocked = true;
    renderEvoGallery();
    return;
  }
  lockCard.classList.remove('hidden');
  gallery.classList.add('hidden');
  const bioBtn = document.getElementById('btn-unlock-biometric');
  if (DATA.security.webauthnId && isBiometricAvailable()) {
    bioBtn.classList.remove('hidden');
    attemptBiometricUnlock();
  } else {
    bioBtn.classList.add('hidden');
  }
}

async function attemptBiometricUnlock() {
  const ok = await verifyBiometric(DATA.security.webauthnId);
  if (ok) unlockEvolution();
}

function unlockEvolution() {
  evoUnlocked = true;
  document.getElementById('evolution-lock-card').classList.add('hidden');
  document.getElementById('evolution-gallery').classList.remove('hidden');
  renderEvoGallery();
}

function revokeEvoObjectUrls() {
  evoObjectUrls.forEach(u => URL.revokeObjectURL(u));
  evoObjectUrls = [];
}

async function renderEvoGallery() {
  const grid = document.getElementById('evo-grid');
  const empty = document.getElementById('evo-empty');
  revokeEvoObjectUrls();
  let items = [];
  try {
    items = await getAllMediaItems();
  } catch (e) {
    items = [];
  }
  if (items.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = items.map(item => {
    const url = URL.createObjectURL(item.blob);
    evoObjectUrls.push(url);
    const media = item.type === 'video'
      ? `<video src="${url}" muted playsinline></video><span class="evo-play">▶</span>`
      : `<img src="${url}" alt="">`;
    return `<div class="evo-item" data-action="evo-open" data-id="${item.id}">${media}<span class="evo-date">${fmtDateShortFR(item.date)}</span></div>`;
  }).join('');
}

async function openEvoViewer(id) {
  const items = await getAllMediaItems();
  const item = items.find(i => i.id === id);
  if (!item) return;
  const url = URL.createObjectURL(item.blob);
  evoObjectUrls.push(url);
  const media = item.type === 'video'
    ? `<video src="${url}" controls playsinline autoplay></video>`
    : `<img src="${url}" alt="">`;
  openModal(`
    <div class="modal-title">${capitalize(fmtDateFR(item.date))}</div>
    <div class="evo-viewer">
      ${media}
      <button type="button" class="btn btn-danger btn-block" id="btn-evo-delete" data-id="${item.id}">Supprimer</button>
    </div>
  `);
  document.getElementById('btn-evo-delete').addEventListener('click', async () => {
    if (!confirm('Supprimer cette photo/vidéo ? Cette action est définitive.')) return;
    await deleteMediaItem(item.id);
    closeModal();
    renderEvoGallery();
    showToast('Supprimé');
  });
}

async function addEvoFiles(fileList) {
  const files = Array.from(fileList);
  for (const file of files) {
    const type = file.type.startsWith('video') ? 'video' : 'photo';
    await addMediaItem({ date: todayISO(), type, blob: file, mimeType: file.type });
  }
  renderEvoGallery();
  showToast(files.length > 1 ? 'Ajoutés' : 'Ajouté');
}

async function exportEvoMedia() {
  const items = await getAllMediaItems();
  if (items.length === 0) { showToast('Rien à exporter'); return; }
  const files = items.map((item, i) => {
    const ext = item.type === 'video' ? (item.mimeType.split('/')[1] || 'mp4') : (item.mimeType.split('/')[1] || 'jpg');
    return new File([item.blob], `fittrack-${item.date}-${i}.${ext}`, { type: item.mimeType });
  });
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: 'FitTrack — Évolution' });
      return;
    } catch (e) { /* annulé ou échoué, on retente en téléchargement */ }
  }
  files.forEach((file, i) => {
    setTimeout(() => {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, i * 300);
  });
  showToast('Téléchargement en cours…');
}

/* ===== Réglages : Sécurité ===== */

function renderSecuritySection() {
  const sec = DATA.security;
  const container = document.getElementById('security-section');
  if (!sec.enabled) {
    container.innerHTML = `<button type="button" class="btn btn-primary btn-block" id="btn-security-enable">Activer le verrouillage</button>`;
    document.getElementById('btn-security-enable').addEventListener('click', openPinSetupModal);
    return;
  }
  const bioAvailable = isBiometricAvailable();
  const bioStatus = sec.webauthnId ? "Face ID / Touch ID activé ✓" : (bioAvailable ? "Face ID / Touch ID non configuré" : "Face ID / Touch ID indisponible sur cet appareil");
  container.innerHTML = `
    <p class="muted small">Verrouillage activé — code défini${sec.webauthnId ? ' + biométrie' : ''}.</p>
    <p class="muted small">${bioStatus}</p>
    ${!sec.webauthnId && bioAvailable ? '<button type="button" class="btn btn-secondary btn-block" id="btn-security-bio">Activer Face ID / Touch ID</button>' : ''}
    <button type="button" class="btn btn-secondary btn-block" id="btn-security-pin">Modifier le code</button>
    <button type="button" class="btn btn-danger btn-block" id="btn-security-disable">Désactiver le verrouillage</button>
  `;
  const bioBtn = document.getElementById('btn-security-bio');
  if (bioBtn) bioBtn.addEventListener('click', async () => {
    const credId = await registerBiometric();
    if (credId) {
      DATA.security.webauthnId = credId;
      saveData(DATA);
      showToast('Face ID / Touch ID activé');
      renderSecuritySection();
    } else {
      showToast("Échec de l'activation");
    }
  });
  document.getElementById('btn-security-pin').addEventListener('click', openPinSetupModal);
  document.getElementById('btn-security-disable').addEventListener('click', () => {
    if (!confirm('Désactiver le verrouillage de la section Évolution ?')) return;
    DATA.security = defaultSecurity();
    saveData(DATA);
    renderSecuritySection();
    showToast('Verrouillage désactivé');
  });
}

function openPinSetupModal() {
  openModal(`
    <div class="modal-title">Définir un code à 4 chiffres</div>
    <form id="form-pin-setup" class="form-grid">
      <label>Nouveau code
        <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="pin-new" required autocomplete="off">
      </label>
      <label>Confirme le code
        <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="pin-confirm" required autocomplete="off">
      </label>
      <p class="pin-error" id="pin-setup-error"></p>
      <button type="submit" class="btn btn-primary btn-block">Enregistrer</button>
    </form>
  `);
  document.getElementById('form-pin-setup').addEventListener('submit', async e => {
    e.preventDefault();
    const a = document.getElementById('pin-new').value.trim();
    const b = document.getElementById('pin-confirm').value.trim();
    const err = document.getElementById('pin-setup-error');
    if (!/^\d{4}$/.test(a)) { err.textContent = 'Le code doit faire 4 chiffres.'; return; }
    if (a !== b) { err.textContent = 'Les deux codes ne correspondent pas.'; return; }
    try {
      const hash = await hashPin(a);
      DATA.security.pinHash = hash;
      DATA.security.enabled = true;
      saveData(DATA);
      if (!DATA.security.enabled || DATA.security.pinHash !== hash) {
        throw new Error('Échec de la sauvegarde locale.');
      }
      closeModal();
      renderSecuritySection();
      showToast('Code enregistré — verrouillage activé');
    } catch (err2) {
      err.textContent = 'Erreur : ' + err2.message + ' — réessaie.';
    }
  });
}

/* ===== Câblage des événements (une seule fois) ===== */

function wireEvents() {
  document.getElementById('btn-open-settings').addEventListener('click', openReglages);
  document.getElementById('reglages-back').addEventListener('click', () => navigate(screenBeforeSettings));
  document.getElementById('jour-back').addEventListener('click', () => navigate(cameFromScreen));

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  /* --- Accueil --- */
  document.getElementById('home-cardio-check').addEventListener('change', e => {
    const log = ensureLog(DATA, todayISO());
    log.cardio.done = e.target.checked;
    saveData(DATA);
    renderAccueil();
  });
  document.getElementById('home-btn-seance').addEventListener('click', () => openJour(todayISO(), 'accueil'));
  document.getElementById('home-btn-pesee').addEventListener('click', () => navigate('poids'));
  document.getElementById('home-btn-repas').addEventListener('click', () => {
    navigate('calories');
    currentCaloriesDate = todayISO();
    renderCalories();
    openAddMealModal(currentCaloriesDate);
  });
  document.getElementById('home-water-add250').addEventListener('click', () => {
    const log = ensureLog(DATA, todayISO());
    log.water.ml = (log.water.ml || 0) + 250;
    saveData(DATA);
    renderAccueil();
  });
  document.getElementById('home-water-add500').addEventListener('click', () => {
    const log = ensureLog(DATA, todayISO());
    log.water.ml = (log.water.ml || 0) + 500;
    saveData(DATA);
    renderAccueil();
  });
  document.getElementById('home-water-reset').addEventListener('click', () => {
    const log = ensureLog(DATA, todayISO());
    log.water.ml = 0;
    saveData(DATA);
    renderAccueil();
  });
  document.getElementById('home-btn-evolution').addEventListener('click', openEvolution);

  /* --- Évolution --- */
  document.getElementById('evolution-back').addEventListener('click', () => navigate(screenBeforeEvolution));
  document.getElementById('btn-unlock-biometric').addEventListener('click', attemptBiometricUnlock);
  document.getElementById('btn-unlock-pin').addEventListener('click', async () => {
    const val = document.getElementById('pin-input').value.trim();
    const err = document.getElementById('pin-error');
    if (!/^\d{4}$/.test(val)) { err.textContent = 'Code à 4 chiffres.'; return; }
    const h = await hashPin(val);
    if (h === DATA.security.pinHash) {
      unlockEvolution();
    } else {
      err.textContent = 'Code incorrect.';
      document.getElementById('pin-input').value = '';
    }
  });
  document.getElementById('pin-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-unlock-pin').click();
  });
  document.getElementById('btn-lock-now').addEventListener('click', () => {
    evoUnlocked = false;
    revokeEvoObjectUrls();
    document.getElementById('pin-input').value = '';
    document.getElementById('pin-error').textContent = '';
    renderEvolutionGate();
  });
  document.getElementById('btn-evo-camera').addEventListener('click', () => document.getElementById('evo-camera-input').click());
  document.getElementById('btn-evo-gallery').addEventListener('click', () => document.getElementById('evo-gallery-input').click());
  document.getElementById('evo-camera-input').addEventListener('change', e => {
    if (e.target.files.length) addEvoFiles(e.target.files);
    e.target.value = '';
  });
  document.getElementById('evo-gallery-input').addEventListener('change', e => {
    if (e.target.files.length) addEvoFiles(e.target.files);
    e.target.value = '';
  });
  document.getElementById('btn-evo-export').addEventListener('click', exportEvoMedia);
  document.getElementById('evo-grid').addEventListener('click', e => {
    const item = e.target.closest('[data-action="evo-open"]');
    if (!item) return;
    openEvoViewer(item.dataset.id);
  });

  /* --- Calendrier --- */
  document.getElementById('cal-prev').addEventListener('click', () => {
    calCursor.month--; if (calCursor.month < 0) { calCursor.month = 11; calCursor.year--; }
    renderCalendrier();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calCursor.month++; if (calCursor.month > 11) { calCursor.month = 0; calCursor.year++; }
    renderCalendrier();
  });

  /* --- Poids --- */
  document.getElementById('form-poids').addEventListener('submit', e => {
    e.preventDefault();
    const date = document.getElementById('poids-date').value || todayISO();
    const val = parseFloat(document.getElementById('poids-valeur').value);
    if (!val || val <= 0) return;
    upsertWeight(date, val);
    document.getElementById('poids-valeur').value = '';
    renderPoids();
    showToast('Pesée ajoutée');
  });
  document.getElementById('poids-history').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="del-weight"]');
    if (!btn) return;
    if (!confirm('Supprimer cette pesée ?')) return;
    DATA.weights = DATA.weights.filter(w => w.date !== btn.dataset.date);
    if (DATA.weights.length > 0) {
      const sorted = [...DATA.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
      DATA.profile.poidsActuel = sorted[sorted.length - 1].poids;
    }
    saveData(DATA);
    renderPoids();
  });

  /* --- Calories --- */
  document.getElementById('cal2-prev').addEventListener('click', () => { currentCaloriesDate = addDays(currentCaloriesDate, -1); renderCalories(); });
  document.getElementById('cal2-next').addEventListener('click', () => { currentCaloriesDate = addDays(currentCaloriesDate, 1); renderCalories(); });
  document.getElementById('cal2-date-label').addEventListener('click', () => { currentCaloriesDate = todayISO(); renderCalories(); });
  document.getElementById('cal2-add-btn').addEventListener('click', () => openAddMealModal(currentCaloriesDate));
  document.getElementById('cal2-meals-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="del-meal"]');
    if (!btn) return;
    if (!confirm('Supprimer cet aliment ?')) return;
    const log = ensureLog(DATA, currentCaloriesDate);
    log.meals = log.meals.filter(m => m.id !== btn.dataset.id);
    saveData(DATA);
    renderCalories();
  });

  /* --- Jour / Séance --- */
  document.getElementById('jour-prev').addEventListener('click', () => renderJour(addDays(currentJourDate, -1)));
  document.getElementById('jour-next').addEventListener('click', () => renderJour(addDays(currentJourDate, 1)));
  document.getElementById('jour-date-label').addEventListener('click', () => renderJour(todayISO()));

  document.getElementById('jour-exercises').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const log = ensureLog(DATA, currentJourDate);
    const exId = btn.dataset.exId;
    if (action === 'history') {
      openExerciseHistory(btn.dataset.exName);
    } else if (action === 'add-set') {
      log.exercises[exId].sets.push({ poids: '', reps: '' });
      saveData(DATA);
      renderJour(currentJourDate);
    } else if (action === 'del-set') {
      log.exercises[exId].sets.splice(Number(btn.dataset.idx), 1);
      saveData(DATA);
      renderJour(currentJourDate);
    }
  });
  document.getElementById('jour-exercises').addEventListener('change', e => {
    const t = e.target;
    const action = t.dataset.action;
    if (!action) return;
    const log = ensureLog(DATA, currentJourDate);
    const exId = t.dataset.exId;
    if (action === 'toggle-done') log.exercises[exId].done = t.checked;
    else if (action === 'set-poids') log.exercises[exId].sets[Number(t.dataset.idx)].poids = t.value === '' ? '' : Number(t.value);
    else if (action === 'set-reps') log.exercises[exId].sets[Number(t.dataset.idx)].reps = t.value === '' ? '' : Number(t.value);
    saveData(DATA);
  });

  document.getElementById('jour-cardio-check').addEventListener('change', e => {
    const log = ensureLog(DATA, currentJourDate);
    log.cardio.done = e.target.checked;
    saveData(DATA);
  });
  const slider = document.getElementById('jour-cardio-duree');
  slider.addEventListener('input', e => {
    document.getElementById('jour-cardio-duree-val').textContent = e.target.value + ' min';
  });
  slider.addEventListener('change', e => {
    const log = ensureLog(DATA, currentJourDate);
    log.cardio.dureeMin = Number(e.target.value);
    saveData(DATA);
  });

  /* --- Réglages : profil --- */
  document.getElementById('btn-recalc').addEventListener('click', () => {
    const temp = {
      sexe: document.getElementById('p-sexe').value,
      age: Number(document.getElementById('p-age').value) || DATA.profile.age,
      tailleCm: Number(document.getElementById('p-taille').value) || DATA.profile.tailleCm,
      poidsActuel: Number(document.getElementById('p-poids').value) || DATA.profile.poidsActuel,
      niveauActivite: document.getElementById('p-activite').value
    };
    const bmr = computeBMR(temp);
    const tdee = computeTDEE(temp);
    const cal = suggestedCalorieTarget(temp);
    const prot = suggestedProteinTarget(temp);
    const box = document.getElementById('suggest-box');
    box.innerHTML = `BMR estimé : <strong>${bmr} kcal</strong><br>Dépense totale (TDEE, ${ACTIVITY_LABELS[temp.niveauActivite]}) : <strong>${tdee} kcal</strong><br>Objectif suggéré : <strong>${cal} kcal</strong> et <strong>${prot} g</strong> de protéines/jour.
      <button type="button" class="btn btn-secondary btn-small" id="btn-apply-suggest" style="margin-top:8px;">Appliquer ces valeurs</button>`;
    box.classList.add('visible');
    document.getElementById('btn-apply-suggest').addEventListener('click', () => {
      document.getElementById('p-cal').value = cal;
      document.getElementById('p-prot').value = prot;
      showToast('Valeurs appliquées — enregistre le profil');
    });
  });

  document.getElementById('form-profil').addEventListener('submit', e => {
    e.preventDefault();
    const p = DATA.profile;
    p.sexe = document.getElementById('p-sexe').value;
    p.age = Number(document.getElementById('p-age').value);
    p.tailleCm = Number(document.getElementById('p-taille').value);
    p.poidsObjectif = Number(document.getElementById('p-poids-obj').value);
    p.dureeSemaines = Number(document.getElementById('p-duree').value);
    p.niveauActivite = document.getElementById('p-activite').value;
    p.objectifCalories = Number(document.getElementById('p-cal').value);
    p.objectifProteines = Number(document.getElementById('p-prot').value);
    p.objectifEauMl = Math.round(Number(document.getElementById('p-eau').value) * 1000);
    const poidsVal = Number(document.getElementById('p-poids').value);
    upsertWeight(todayISO(), poidsVal);
    saveData(DATA);
    showToast('Profil enregistré');
    navigate('accueil');
  });

  /* --- Réglages : programme --- */
  const programEditor = document.getElementById('program-editor');
  programEditor.addEventListener('change', e => {
    const t = e.target;
    const action = t.dataset.action;
    if (!action) return;
    const plan = DATA.program[t.dataset.day];
    if (action === 'rename-type') plan.type = t.value.trim() || plan.type;
    else if (action === 'cardio-kind') { plan.cardio.kind = t.value; plan.cardio.label = t.value === 'corde' ? 'Corde à sauter' : 'Marche inclinée'; }
    else if (action === 'cardio-duree') plan.cardio.dureeMin = Number(t.value) || 15;
    else if (action === 'ex-rename') { const ex2 = plan.exercises.find(x => x.id === t.dataset.exId); if (ex2) ex2.name = t.value.trim() || ex2.name; }
    else if (action === 'ex-groupe') { const ex2 = plan.exercises.find(x => x.id === t.dataset.exId); if (ex2) ex2.groupe = t.value; }
    saveData(DATA);
  });
  programEditor.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const plan = DATA.program[btn.dataset.day];
    if (btn.dataset.action === 'ex-del') {
      plan.exercises = plan.exercises.filter(x => x.id !== btn.dataset.exId);
      saveData(DATA);
      renderProgramEditor();
    } else if (btn.dataset.action === 'add-ex') {
      const newEx = ex('Nouvel exercice', 'Autre');
      plan.exercises.push(newEx);
      saveData(DATA);
      renderProgramEditor();
      const newInput = programEditor.querySelector(`input[data-ex-id="${newEx.id}"]`);
      if (newInput) { newInput.focus(); newInput.select(); }
    } else if (btn.dataset.action === 'ex-copy') {
      const wrap = btn.closest('.ex-name-wrap');
      const input = wrap.querySelector('input[type="text"]');
      const text = input.value;
      const flashCheck = () => {
        const iconCopy = btn.querySelector('.icon-copy');
        const iconCheck = btn.querySelector('.icon-check');
        iconCopy.style.display = 'none';
        iconCheck.style.display = '';
        clearTimeout(btn._resetTimer);
        btn._resetTimer = setTimeout(() => { iconCopy.style.display = ''; iconCheck.style.display = 'none'; }, 1200);
      };
      const legacyCopy = () => {
        input.focus();
        input.setSelectionRange(0, text.length);
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
        input.blur();
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
        if (ok) flashCheck();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(flashCheck, legacyCopy);
      } else {
        legacyCopy();
      }
    }
  });

  /* --- Réglages : sauvegarde --- */
  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fittrack-sauvegarde-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Sauvegarde téléchargée');
  });

  document.getElementById('input-import').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.profile || !parsed.program) throw new Error('format invalide');
        if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
        if (!parsed.logs) parsed.logs = {};
        if (!parsed.weights) parsed.weights = [];
        DATA = parsed;
        saveData(DATA);
        showToast('Sauvegarde importée');
        renderReglages();
        navigate('accueil');
      } catch (err) {
        alert("Fichier invalide : impossible d'importer cette sauvegarde.");
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Cette action supprimera définitivement toutes tes données (séances, poids, calories). Continuer ?')) return;
    DATA = defaultData();
    saveData(DATA);
    showToast('Données réinitialisées');
    renderReglages();
    navigate('accueil');
  });
}

/* ===== Service worker ===== */

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

/* ===== Démarrage ===== */

wireEvents();
navigate('accueil');
registerServiceWorker();
