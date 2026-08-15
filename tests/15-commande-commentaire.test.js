/**
 * Choix de la commande d'insertion selon le contexte.
 *
 * Dans la Community Console, « Répondre » ouvre une NOUVELLE réponse au fil : c'est la
 * commande de la première intervention. Une relance se traite en commentant sous sa
 * propre réponse. Employer « Répondre » pour une relance crée une seconde réponse
 * au lieu de poursuivre l'échange là où la personne a écrit.
 */
const fs = require('fs');
const source = fs.readFileSync('extension/content.js', 'utf8');

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a).slice(0, 200)); };

console.log('\nDeux commandes distinctes');
check('recherche du bouton Répondre conservée',       source, t => /function trouverBoutonRepondre\s*\(/.test(t));
check('recherche du bouton Commenter ajoutée',        source, t => /function trouverBoutonCommenter\s*\(/.test(t));
check('libellés français reconnus',                   source, t => t.includes('ajouter un commentaire'));
check('libellés anglais reconnus',                    source, t => t.includes('add a comment'));

console.log('\nAiguillage de l\'insertion');
check('injecterReponse accepte un mode',              source, t => /async function injecterReponse\(text, mode, messageCible\)/.test(t));
check('la relance passe en mode commentaire',         source, t => t.includes("injecterReponse(texte, 'commentaire', dernier ? dernier.element : null)"));
check('la première réponse reste en mode par défaut', source, t => /await injecterReponse\(summaryText\)/.test(t));

console.log('\nCiblage : la commande qui suit le message du demandeur');
check('sélection par position dans le document',      source, t => t.includes('compareDocumentPosition'));
check('la première commande postérieure est retenue', source, t => t.includes('return apres[0]'));
check('repli sur la commande la plus récente',        source, t => t.includes('candidats[candidats.length - 1]'));
check('l\'élément DOM des cartes est conservé',       source, t => /element: carte/.test(t));
check('le dernier message du fil sert de repère',     source, t => t.includes('isolation.messages[isolation.messages.length - 1]'));
check('ce n\'est plus la carte du Product Expert qui est visée', source, t => !t.includes('trouverBoutonCommenter(nomPe)'));

console.log('\nEn mode commentaire, l\'éditeur ouvert est ignoré');
const bloc = source.slice(source.indexOf('async function injecterReponse'), source.indexOf('async function injecterReponse') + 1400);
check('aucune réutilisation d\'un éditeur préexistant', bloc, t => t.includes('enCommentaire ? null : trouverEditeurReponse()'));
check('échec explicite si la commande est absente',    bloc, t => t.includes('Commande « Ajouter un commentaire » introuvable'));

console.log('\nLa commande de commentaire ne doit pas être prise pour un bouton de publication');
const filtres = source.slice(source.indexOf('LIBELLES_EXCLUS'), source.indexOf('LIBELLES_EXCLUS') + 200);
check('« Ajouter un commentaire » ne commence par aucun verbe de publication',
  ['publier','envoyer','poster','publish','post','send','submit'].some(v => 'ajouter un commentaire'.startsWith(v)),
  v => v === false);

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
