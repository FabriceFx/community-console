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
    // stripReplyShell_ repère la signature configurée, plus un prénom en dur
    PropertiesService:(()=>{const s={PE_SIGNATURE:'Fabrice'};const o={getProperty:k=>s[k]||null,setProperty:(k,v)=>{s[k]=v;},deleteProperty:k=>{delete s[k];}};return{getScriptProperties:()=>o,getUserProperties:()=>o};})(),

    Utilities:{sleep(){},getUuid:()=>'x'},
    SpreadsheetApp_INUTILISE:{
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

console.log('\n' + (fails===0?'Tous les tests passent.':fails+' test(s) en echec.'));
process.exit(fails?1:0);
