/* Couche de données : tout est lu/écrit dans localStorage. Aucune donnée ne quitte l'appareil. */

const DB_KEY = 'fittrack_v1';

function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function ex(name, groupe) {
  return { id: uid('ex'), name, groupe };
}

function defaultProgram() {
  return {
    lundi: {
      type: 'Push',
      cardio: { kind: 'marche', label: 'Marche inclinée', dureeMin: 15 },
      exercises: [
        ex('Développé couché', 'Pecs'),
        ex('Développé incliné haltères', 'Pecs'),
        ex('Dips', 'Pecs'),
        ex('Extension triceps à la poulie', 'Triceps'),
        ex('Barre au front', 'Triceps'),
        ex('Élévations latérales', 'Épaules')
      ]
    },
    mardi: {
      type: 'Pull',
      cardio: { kind: 'marche', label: 'Marche inclinée', dureeMin: 15 },
      exercises: [
        ex('Tractions', 'Dos'),
        ex('Rowing barre', 'Dos'),
        ex('Tirage horizontal', 'Dos'),
        ex('Curl barre', 'Biceps'),
        ex('Curl marteau', 'Biceps'),
        ex('Oiseau (élévations arrière)', 'Épaules')
      ]
    },
    mercredi: {
      type: 'Repos',
      cardio: { kind: 'corde', label: 'Corde à sauter', dureeMin: 20 },
      exercises: []
    },
    jeudi: {
      type: 'Push/Pull',
      cardio: { kind: 'marche', label: 'Marche inclinée', dureeMin: 15 },
      exercises: [
        ex('Rowing haltère', 'Dos'),
        ex('Tirage vertical', 'Dos'),
        ex('Développé couché', 'Pecs'),
        ex('Écarté couché', 'Pecs')
      ]
    },
    vendredi: {
      type: 'Arms',
      cardio: { kind: 'marche', label: 'Marche inclinée', dureeMin: 15 },
      exercises: [
        ex('Extension triceps à la poulie', 'Triceps'),
        ex('Barre au front', 'Triceps'),
        ex('Curl barre', 'Biceps'),
        ex('Curl marteau', 'Biceps'),
        ex('Curl pupitre', 'Biceps'),
        ex('Élévations latérales', 'Épaules')
      ]
    },
    samedi: {
      type: 'Repos',
      cardio: { kind: 'corde', label: 'Corde à sauter', dureeMin: 20 },
      exercises: []
    },
    dimanche: {
      type: 'Repos',
      cardio: { kind: 'corde', label: 'Corde à sauter', dureeMin: 20 },
      exercises: []
    }
  };
}

function defaultProfile() {
  const poids = 81.2;
  return {
    sexe: 'homme',
    age: 20,
    tailleCm: 176,
    poidsDepart: poids,
    poidsActuel: poids,
    poidsObjectif: 77.2,
    dateDebut: todayISO(),
    dureeSemaines: 6,
    niveauActivite: 'leger', // sedentaire, leger, modere, actif, tres_actif
    objectifCalories: 1950,
    objectifProteines: 160,
    objectifsManuels: true // valeurs par défaut déjà calculées ; l'utilisateur peut les changer librement
  };
}

function defaultData() {
  const profile = defaultProfile();
  return {
    version: 1,
    profile,
    program: defaultProgram(),
    logs: {},   // { 'YYYY-MM-DD': { exercises:{[exId]:{done,sets:[{poids,reps}],name,groupe}}, cardio:{done,dureeMin,kind,label}, meals:[{id,nom,kcal,prot,gluc,lip}] } }
    weights: [{ date: todayISO(), poids: profile.poidsActuel }]
  };
}

function loadData() {
  let raw;
  try {
    raw = localStorage.getItem(DB_KEY);
  } catch (e) {
    raw = null;
  }
  if (!raw) {
    const fresh = defaultData();
    saveData(fresh);
    return fresh;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.profile || !parsed.program) throw new Error('structure invalide');
    if (!parsed.logs) parsed.logs = {};
    if (!parsed.weights) parsed.weights = [];
    return parsed;
  } catch (e) {
    console.warn('Données corrompues, réinitialisation.', e);
    const fresh = defaultData();
    saveData(fresh);
    return fresh;
  }
}

function saveData(data) {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
}

function getDayKey(dateISO) {
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const d = new Date(dateISO + 'T12:00:00');
  return jours[d.getDay()];
}

function ensureLog(data, dateISO) {
  if (!data.logs[dateISO]) {
    const dayKey = getDayKey(dateISO);
    const plan = data.program[dayKey];
    const exercises = {};
    plan.exercises.forEach(e => {
      exercises[e.id] = { done: false, sets: [], name: e.name, groupe: e.groupe };
    });
    data.logs[dateISO] = {
      date: dateISO,
      exercises,
      cardio: { done: false, dureeMin: plan.cardio.dureeMin, kind: plan.cardio.kind, label: plan.cardio.label },
      meals: []
    };
  }
  return data.logs[dateISO];
}
