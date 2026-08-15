const fs = require('fs'), vm = require('vm');

const VALID = 'https://support.google.com/docs/answer/3093342';
const DEAD  = 'https://support.google.com/docs/answer/999999999';

const sandbox = {
  console: { warn(){}, error(){}, log(){} },
  UrlFetchApp: { fetch(url){ return { getResponseCode: () => url === VALID ? 200 : 404, getHeaders: () => ({}), getContentText: () => '' }; } },
  PropertiesService: (() => { const store = {}; const svc = { getProperty: k => store[k] || null, setProperty: (k,v) => { store[k]=v; } };
    return { getScriptProperties: () => svc, getUserProperties: () => svc }; })(),
  Utilities: { sleep(){}, getUuid: () => 'aaaaaaaa-bbbb' },
  SpreadsheetApp: { newRichTextValue: () => ({ setText(){ return this; }, build(){ return {}; } }) },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('gas/Config.gs','utf8'), sandbox);
vm.runInContext(fs.readFileSync('gas/Gemini.gs','utf8'), sandbox);

let fails = 0;
const check = (name, actual, predicate, detail) => {
  const ok = predicate(actual);
  if (!ok) fails++;
  console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + name);
  if (!ok) console.log('        obtenu : ' + JSON.stringify(actual) + (detail ? '\n        ' + detail : ''));
};

console.log('\n1. Nettoyage des URL — les deux-points legitimes doivent survivre');
const candidate = { groundingMetadata: { groundingChunks: [{ web: { uri: VALID } }] } };
const input = [
  'Pour recuperer ces donnees, procedez comme suit :',
  '- ouvrez la feuille',
  '- collez la formule',
  '',
  'Voir aussi : ' + DEAD,
  'Utiliser IMPORTXML : ' + VALID
].join('\n');
const cleaned = sandbox.cleanAndValidateUrls(input, candidate);
check('« procedez comme suit : » conserve son deux-points', cleaned, t => t.includes('procedez comme suit :'));
check('la ligne de source morte est supprimee',              cleaned, t => !t.includes('999999999') && !t.includes('Voir aussi'));
check('la source valide est conservee',                      cleaned, t => t.includes('Utiliser IMPORTXML : ' + VALID));

console.log('\n2. Anti-tics stylistiques');
const tics = "Bien sûr ! Voici les étapes à suivre :\n- premiere etape\n\nIl est important de noter que le partage doit etre actif. J'espère que cela vous aidera.";
const human = sandbox.humanizeBody_(tics);
['Bien sûr','Voici les étapes à suivre','Il est important de noter',"J'espère que cela"].forEach(t =>
  check('« ' + t + ' » supprime', human, x => !x.includes(t)));
check('le fond technique est preserve', human, x => x.includes('premiere etape') && x.includes('partage doit etre actif'));
check('la phrase tronquee est recapitalisee', human, x => x.includes('Le partage'));

console.log('\n3. Analyse de l\'en-tete structure');
const env = sandbox.parseModelEnvelope_('LANG: en\nSTATUT: CLARIFICATION\nCONFIANCE: FAIBLE\n---\nWhich page are you pulling from?');
check('langue', env.lang, v => v === 'en');
check('statut', env.status, v => v === 'CLARIFICATION');
check('confiance', env.confidence, v => v === 'FAIBLE');
check('corps isole de l\'en-tete', env.body, v => v === 'Which page are you pulling from?');
const noEnv = sandbox.parseModelEnvelope_('Reponse sans en-tete du tout.');
check('repli si en-tete absent', noEnv.body, v => v === 'Reponse sans en-tete du tout.');

console.log('\n4. Coquilles : variation, prenom unique, produit inconnu');
const seen = new Set();
for (let i = 0; i < 30; i++) seen.add(sandbox.buildFormattedResponse('fr','Marie','Google Sheets','Corps technique.','REPONSE'));
check('les messages varient d\'un appel a l\'autre', seen.size, v => v > 1, 'variantes distinctes : ' + seen.size);
const one = [...seen][0];
check('le prenom n\'apparait qu\'une seule fois', (one.match(/Marie/g)||[]).length, v => v === 1);
check('la signature est presente', one, t => t.trim().endsWith('Fabrice'));
const unknown = sandbox.buildFormattedResponse('fr','Marie','Inconnu','Corps.','REPONSE');
check('aucun « bienvenue ... Inconnu »', unknown, t => !t.includes('Inconnu'));
const clarif = sandbox.buildFormattedResponse('fr','Marie','Google Sheets','Quelle page ?','CLARIFICATION');
check('pas de message de bienvenue sur une clarification', clarif, t => !t.toLowerCase().includes('bienvenue'));

console.log('\n5. Garde-fous de securite');
check('la cle API est masquee dans les messages', sandbox.redactSecrets_('Request failed for https://x.com/v1?key=AIzaSyABCDEFGHIJKLMNOP'), t => !t.includes('AIzaSyABCDEFGHIJKLMNOP'));
check('domaine autorise accepte', (()=>{ try { sandbox.assertAllowedHost_('https://support.google.com/x/thread/1'); return 'ok'; } catch(e){ return e.message; } })(), v => v === 'ok');
check('domaine tiers rejete',     (()=>{ try { sandbox.assertAllowedHost_('https://evil.example.com/'); return 'ok'; } catch(e){ return 'rejete'; } })(), v => v === 'rejete');
check('requete sans secret rejetee', (()=>{ try { sandbox.assertAuthorized_(''); return 'ok'; } catch(e){ return 'rejete'; } })(), v => v === 'rejete');
sandbox.setSharedSecret('s3cr3t');
check('bon secret accepte',     (()=>{ try { sandbox.assertAuthorized_('s3cr3t'); return 'ok'; } catch(e){ return 'rejete'; } })(), v => v === 'ok');
check('mauvais secret rejete',  (()=>{ try { sandbox.assertAuthorized_('autre'); return 'ok'; } catch(e){ return 'rejete'; } })(), v => v === 'rejete');

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en echec.'));
process.exit(fails ? 1 : 0);
