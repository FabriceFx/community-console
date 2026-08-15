const fs = require('fs'), vm = require('vm');
const HELP = 'https://support.google.com/docs/answer/3093342';
let mode = 'ok';

function makeSandbox(publishedCol) {
  const sb = {
    console:{warn(){},error(){},log(){}},
    UrlFetchApp:{ fetch(url){
      if (mode === 'reseau') throw new Error('DNS error');
      if (mode === '500')    return {getResponseCode:()=>503,getHeaders:()=>({}),getContentText:()=>''};
      return {getResponseCode:()=> url.includes('inexistant') ? 404 : 200, getHeaders:()=>({}), getContentText:()=>''};
    }},
    PropertiesService:(()=>{const s={};const o={getProperty:k=>s[k]||null,setProperty:(k,v)=>{s[k]=v;}};return{getScriptProperties:()=>o,getUserProperties:()=>o};})(),
    CacheService:{ getScriptCache:()=>({get:()=>null,put(){},remove(){}}) },
    Utilities:{sleep(){},getUuid:()=>'x'},
    SpreadsheetApp:{
      newRichTextValue:()=>({setText(){return this;},build(){return {};}}),
      getActiveSpreadsheet:()=>({ getSheetByName:()=>({
        getLastRow:()=>publishedCol.length+1,
        getLastColumn:()=>12,
        getRange:(r,c,n)=>({ getValues:()=>publishedCol.map(v=>[v]) })
      })})
    },
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync('gas/Config.gs','utf8'), sb);
  vm.runInContext(fs.readFileSync('gas/Gemini.gs','utf8'), sb);
  return sb;
}

let fails=0;
const check=(n,a,p)=>{const ok=p(a);if(!ok)fails++;console.log((ok?'  OK   ':'  ECHEC')+' '+n);if(!ok)console.log('        obtenu : '+JSON.stringify(a).slice(0,300));};

console.log('\n1. Liens du Centre d\'aide — regression corrigee');
let sb = makeSandbox([]);
const src = "Activez le partage.\n\nPartager des fichiers : " + HELP;
mode='ok';     check('lien conserve quand la verification passe', sb.cleanAndValidateUrls(src,{}), t=>t.includes(HELP));
mode='reseau'; check('lien conserve malgre un echec reseau',      sb.cleanAndValidateUrls(src,{}), t=>t.includes(HELP));
mode='500';    check('lien conserve malgre un 503',               sb.cleanAndValidateUrls(src,{}), t=>t.includes(HELP));
mode='ok';     check('404 confirme : lien bien supprime', sb.cleanAndValidateUrls("Voir : https://support.google.com/inexistant",{}), t=>!t.includes('inexistant'));
check('etat tri-etat correct', [sb.checkUrlStatus_(HELP), (mode='reseau', sb.checkUrlStatus_(HELP))], v=>v[0]==='valide'&&v[1]==='inconnue');
mode='ok';

console.log('\n2. Consigne de sources dans le prompt');
const p = sb.buildSystemInstruction_();
check('les sources sont exigees, plus optionnelles', p, t=>t.includes('À FOURNIR SYSTÉMATIQUEMENT'));
check('la limite de mots n\'ecrase plus les liens',   p, t=>t.includes('ne comptent pas dans cette limite'));
check('support.google.com privilegie',                p, t=>t.includes('Privilégie support.google.com'));

console.log('\n3. Boucle de retour — extraction du corps publie');
const publie = "Bonjour Marie,\n\nLe partage est bloqué par la règle du domaine. Demande à ton administrateur d'autoriser le partage externe dans la console.\n\nPartager des fichiers : " + HELP + "\n\nDis-moi si ça avance de ton côté.\n\nFabrice";
const corps = sb.stripReplyShell_(publie);
check('accueil retire',                corps, t=>!t.startsWith('Bonjour'));
check('signature retiree',             corps, t=>!/Fabrice/.test(t));
check('cloture retiree',               corps, t=>!t.includes('Dis-moi si'));
check('fond et lien preserves',        corps, t=>t.includes('règle du domaine') && t.includes(HELP));

console.log('\n4. Injection des exemples dans le prompt');
sb = makeSandbox([publie, publie.replace('Marie','Paul'), '', 'trop court']);
const ex = sb.getStyleExamples_();
check('exemples exploitables collectes', ex.length, n=>n===2);
check('les vides et trop courts ignores', ex.join(''), t=>!t.includes('trop court'));
check('aucun prenom d\'usager dans les exemples', ex.join(''), t=>!t.includes('Marie')&&!t.includes('Paul'));
const p2 = sb.buildSystemInstruction_();
check('section de style presente dans le prompt', p2, t=>t.includes('EXEMPLES DU STYLE RÉEL'));
check('les exemples priment sur les consignes',   p2, t=>t.includes('priment sur toute description de style'));
const sbVide = makeSandbox([]);
check('aucune section si aucun exemple', sbVide.buildSystemInstruction_(), t=>!t.includes('EXEMPLES DU STYLE RÉEL'));

console.log('\n5. Schema de la feuille');
const CFG = vm.runInContext('CONFIG', sb);
check('12 colonnes definies',       CFG.COLUMNS.length, n=>n===12);
check('« Réponse publiée » ajoutee', CFG.COLUMNS[11], v=>v==='Réponse publiée');
check('indices coherents',          CFG.COL.PUBLISHED, n=>n===12);

console.log('\n' + (fails===0?'Tous les tests passent.':fails+' test(s) en echec.'));
process.exit(fails?1:0);
