/* Calculs métaboliques et helpers de dates. */

const ACTIVITY_FACTORS = {
  sedentaire: 1.2,
  leger: 1.375,
  modere: 1.55,
  actif: 1.725,
  tres_actif: 1.9
};

const ACTIVITY_LABELS = {
  sedentaire: 'Sédentaire',
  leger: 'Légèrement actif',
  modere: 'Modérément actif',
  actif: 'Actif',
  tres_actif: 'Très actif'
};

// Formule de Mifflin-St Jeor
function computeBMR(profile) {
  const { sexe, poidsActuel, tailleCm, age } = profile;
  const base = 10 * poidsActuel + 6.25 * tailleCm - 5 * age;
  return Math.round(sexe === 'homme' ? base + 5 : base - 161);
}

function computeTDEE(profile) {
  const bmr = computeBMR(profile);
  const facteur = ACTIVITY_FACTORS[profile.niveauActivite] || 1.2;
  return Math.round(bmr * facteur);
}

function suggestedCalorieTarget(profile) {
  return Math.round(computeTDEE(profile) - 500);
}

function suggestedProteinTarget(profile) {
  return Math.round(profile.poidsActuel * 2);
}

function fmtDateFR(dateISO) {
  const d = new Date(dateISO + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtDateShortFR(dateISO) {
  const d = new Date(dateISO + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function addDays(dateISO, n) {
  const d = new Date(dateISO + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffDays(aISO, bISO) {
  const a = new Date(aISO + 'T00:00:00');
  const b = new Date(bISO + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}

const JOURS_LABELS = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi',
  vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche'
};

const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];
