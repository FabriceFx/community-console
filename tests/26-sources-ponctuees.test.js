/**
 * Sources du Centre d'aide citées en fin de phrase.
 *
 * La ponctuation qui termine la phrase n'appartient pas à l'URL. La validation la
 * laissait pourtant collée : un article pourtant remonté par googleSearch était
 * interrogé sous la forme « .../answer/8253. », le serveur répondait 404, et le lien
 * était supprimé comme s'il était mort — en emportant la fin de la phrase qui
 * l'introduisait. Le message publié se terminait sur « la marche à suivre est
 * décrite sur », sans rien derrière.
 *
 * Le retrait de la ponctuation n'existait que dans la branche des liens de confiance
 * (g.co/recover) ; la branche générale, celle qui traite toutes les sources du Centre
 * d'aide, en était dépourvue.
 */
const fs = require('fs'), vm = require('vm');

const interrogees = [];
const sandbox = {
  console: { log(){}, warn(){}, error(){} },
  // Serveur réaliste : l'URL exacte répond 200, la même suffixée d'une ponctuation
  // répond 404, et un article volontairement inexistant répond 404 dans tous les cas.
  UrlFetchApp: {
    fetch(url) {
      interrogees.push(url);
      const code = (/[.,;:!?]$/.test(url) || url.includes('inexistant')) ? 404 : 200;
      return { getResponseCode: () => code, getHeaders: () => ({}), getContentText: () => '' };
    }
  },
  PropertiesService: (() => { const s={}; const o={getProperty:k=>s[k]||null,setProperty:(k,v)=>{s[k]=v;},deleteProperty(k){delete s[k];}}; return {getScriptProperties:()=>o,getUserProperties:()=>o}; })(),
  Utilities: { sleep(){}, getUuid: () => 'x' },
  SpreadsheetApp: { newRichTextValue: () => ({ setText(){return this;}, build(){return {};} }) },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('gas/Config.gs', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('gas/Gemini.gs', 'utf8'), sandbox);

let fails = 0;
const check = (n, a, p) => { const ok = p(a); if (!ok) fails++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); if (!ok) console.log('        obtenu : ' + JSON.stringify(a)); };

const ARTICLE = 'https://support.google.com/mail/answer/8253';
// googleSearch a réellement remonté cet article : la source est authentique
const sourcé = { groundingMetadata: { groundingChunks: [ { web: { uri: ARTICLE } } ] } };

console.log('\nArticle sourcé terminant une phrase');
let out = sandbox.cleanAndValidateUrls_('La marche à suivre est décrite sur ' + ARTICLE + '.', sourcé);
check('le lien survit au point final', out, t => t.includes(ARTICLE));
check('la phrase reste entière',       out, t => t.trim() === 'La marche à suivre est décrite sur ' + ARTICLE + '.');
check('le point reste hors de l\'URL', out, t => !t.includes('8253..'));

console.log('\nAutres ponctuations');
out = sandbox.cleanAndValidateUrls_('Voir ' + ARTICLE + ', puis réessayez.', sourcé);
check('virgule traitée de même', out, t => t.includes(ARTICLE + ',') && t.includes('puis réessayez.'));
out = sandbox.cleanAndValidateUrls_('Est-ce bien ' + ARTICLE + ' ?', sourcé);
check('espace avant le point d\'interrogation préservé', out, t => t.includes(ARTICLE + ' ?'));

console.log('\nComportements à ne pas régresser');
out = sandbox.cleanAndValidateUrls_('Article du Centre d\'aide : ' + ARTICLE, sourcé);
check('sans ponctuation, inchangé', out, t => t.trim() === 'Article du Centre d\'aide : ' + ARTICLE);

out = sandbox.cleanAndValidateUrls_('Voir https://support.google.com/inexistant.', {});
check('un 404 confirmé est toujours supprimé', out, t => !t.includes('inexistant'));

interrogees.length = 0;
out = sandbox.cleanAndValidateUrls_('Procédure officielle de récupération : https://g.co/recover.', {});
check('le lien de confiance reste intact', out, t => t.includes('https://g.co/recover.'));
check('aucune requête HTTP sur un lien de confiance', interrogees.length, n => n === 0);

out = sandbox.cleanAndValidateUrls_('[Aide Gmail](' + ARTICLE + ') explique tout.', sourcé);
check('la forme markdown reste convertie', out, t => t.includes('Aide Gmail : ' + ARTICLE));

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
