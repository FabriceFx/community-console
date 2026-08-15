const fs = require('fs'), vm = require('vm');
let fetchCount = 0;
const sandbox = {
  console: { warn(){}, error(){}, log(){} },
  // Cas le plus defavorable : TOUTE validation HTTP echoue (reseau coupe, UA bloque...)
  UrlFetchApp: { fetch(url){ fetchCount++; return { getResponseCode: () => url.includes('inexistant') ? 404 : 500, getHeaders: () => ({}), getContentText: () => '' }; } },
  PropertiesService: (() => { const s={}; const o={getProperty:k=>s[k]||null,setProperty:(k,v)=>{s[k]=v;}}; return {getScriptProperties:()=>o,getUserProperties:()=>o}; })(),
  Utilities: { sleep(){}, getUuid: () => 'x' },
  SpreadsheetApp: { newRichTextValue: () => ({ setText(){return this;}, build(){return {};} }) },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('gas/Config.gs','utf8'), sandbox);
vm.runInContext(fs.readFileSync('gas/Gemini.gs','utf8'), sandbox);

let fails = 0;
const check = (n,a,p) => { const ok=p(a); if(!ok) fails++; console.log((ok?'  OK   ':'  ECHEC')+' '+n); if(!ok) console.log('        obtenu : '+JSON.stringify(a)); };

console.log('\nLien de recuperation — validation HTTP totalement en echec');
const before = fetchCount;
let out = sandbox.cleanAndValidateUrls(
  "Le systeme exige un moyen de recuperation actif.\n\nProcedure officielle de recuperation : https://g.co/recover\n\nAutre source : https://support.google.com/inexistant", {});
check('g.co/recover survit malgre l\'echec reseau', out, t => t.includes('https://g.co/recover'));
check('aucune requete HTTP pour ce lien de confiance', fetchCount - before, n => n === 1);
check('le 404 confirme est bien supprime', out, t => !t.includes('inexistant'));
check('la ligne de procedure reste intacte', out, t => t.includes('Procedure officielle de recuperation : https://g.co/recover'));
check('un 5xx ne supprime pas le lien (mort non prouve)', sandbox.cleanAndValidateUrls("Voir : https://support.google.com/article-valide", {}), t => t.includes('article-valide'));

console.log('\nFormes ponctuees et variantes');
out = sandbox.cleanAndValidateUrls("Suivez https://g.co/recover.", {});
check('point final laisse hors de l\'URL', out, t => t.includes('https://g.co/recover.') && !t.includes('recover..'));
out = sandbox.cleanAndValidateUrls("Voir https://g.co/recover/ pour la suite", {});
check('barre oblique finale normalisee', out, t => t.includes('https://g.co/recover'));
out = sandbox.cleanAndValidateUrls("[Récupération](https://g.co/recover)", {});
check('forme markdown convertie sans perte', out, t => t.includes('Récupération : https://g.co/recover'));

console.log('\nLe filtre anti-tics ne doit pas toucher a cette ligne');
const body = "Le systeme exige un moyen actif.\n\nProcedure officielle de recuperation : https://g.co/recover";
check('ligne preservee par humanizeBody_', sandbox.humanizeBody_(body), t => t.includes('https://g.co/recover'));

console.log('\n' + (fails===0 ? 'Tous les tests passent.' : fails+' test(s) en echec.'));
process.exit(fails?1:0);
