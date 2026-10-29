// Configuration "web" du projet Firebase (console Firebase > Paramètres du projet > Vos applications).
// Ces valeurs ne sont PAS secrètes : elles identifient le projet. La sécurité repose sur les
// règles Firestore (lecture publique, écriture réservée à ton UID) : voir firestore.rules.
// Si apiKey est vide, le site lit dev-films.json (aperçu local uniquement).
export const firebaseConfig = {
  apiKey: 'AIzaSyDtReiuw8lrQ9iTA1rQxsGEMuT1D1fQi6I',
  authDomain: 'films-2db40.firebaseapp.com',
  projectId: 'films-2db40',
  appId: '1:850611610771:web:1ecb2c813dff3119341966',
};
