/**
 * Formatage Markdown vers RichTextValue (Google Sheets).
 *
 * Vérifie que les résumés et relances générés par l'IA sont correctement
 * nettoyés et transformés en texte enrichi avec styles gras et liens cliquables.
 */
const fs = require('fs'), vm = require('vm');

function makeSandbox() {
  const sandbox = {
    console: { warn() {}, error() {}, log() {} },
    SpreadsheetApp: {
      newTextStyle: () => {
        let isBold = false;
        return {
          setBold(b) { isBold = b; return this; },
          build() { return { isBold }; }
        };
      },
      newRichTextValue: () => {
        let text = '';
        const styles = [];
        const links = [];
        return {
          setText(t) { text = t; return this; },
          setTextStyle(start, end, style) { styles.push({ start, end, style }); return this; },
          setLinkUrl(start, end, url) { links.push({ start, end, url }); return this; },
          build() {
            return {
              text,
              styles,
              links,
              getText() { return text; }
            };
          }
        };
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('gas/Config.gs', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('gas/Gemini.gs', 'utf8'), sandbox);
  return sandbox;
}

let fails = 0;
const check = (n, a, p) => {
  const ok = p(a);
  if (!ok) fails++;
  console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n);
  if (!ok) console.log('        obtenu : ' + (a !== undefined ? JSON.stringify(a).slice(0, 300) : 'undefined'));
};

const sb = makeSandbox();
const format = sb.formatMarkdownToRichText;

console.log('\n1. Cas limites : entrées vides ou nulles');
check('chaîne vide gérée', format('').text, v => v === '');
check('null géré sans exception', format(null).text, v => v === '');
check('undefined géré sans exception', format(undefined).text, v => v === '');

console.log('\n2. Nettoyage de la syntaxe Markdown technique');
const codeWithBackticks = 'Utilisez la formule `=IMPORTXML("url", "//a")` pour extraire les données.';
check('backticks retirés', format(codeWithBackticks).text, t => !t.includes('`') && t.includes('=IMPORTXML'));

const doubleQuotes = 'Le message indique ""accès refusé"" à l\'ouverture.';
check('guillemets doublés corrigés', format(doubleQuotes).text, t => t.includes('"accès refusé"') && !t.includes('""'));

const separators = 'Première section\n\n---\n\nDeuxième section\n***\nTroisième section\n___';
const separated = format(separators).text;
check('séparateurs horizontaux (---, ***, ___) supprimés', separated, t => !t.includes('---') && !t.includes('***') && !t.includes('___'));

const multiline = 'Ligne 1\n\n\n\n\nLigne 2';
check('sauts de ligne consécutifs réduits', format(multiline).text, t => t === 'Ligne 1\n\nLigne 2');

console.log('\n3. Conversion des titres et listes');
const headingText = '# Titre Principal\nVoici le détail.\n### Sous-titre';
const headingRt = format(headingText);
check('titres transformés en gras', headingRt.text, t => t.includes('Titre Principal') && t.includes('Sous-titre') && !t.includes('#'));
check('plage de style gras appliquée au titre', headingRt.styles.length, n => n >= 2);

const listText = '* Première étape\n  * Sous-étape\n- Troisième étape';
const listFormatted = format(listText).text;
check('puces astérisques converties en tirets', listFormatted, t => t.includes('- Première étape') && t.includes('  - Sous-étape'));

console.log('\n4. Application des styles et liens RichText');
const mixed = 'Ouvrez **Google Sheets**, puis consultez [Aide officielle](https://support.google.com/docs) ou https://support.google.com/drive.';
const rt = format(mixed);

check('texte final débarrassé des marqueurs markdown', rt.text, t =>
  t.includes('Google Sheets') && !t.includes('**') &&
  t.includes('Aide officielle') && !t.includes('[Aide officielle](')
);

// Vérifier les plages de gras
const boldTexts = rt.styles.filter(s => s.style.isBold).map(s => rt.text.substring(s.start, s.end));
check('gras repéré exactement sur « Google Sheets »', boldTexts, arr => arr.includes('Google Sheets'));

// Vérifier les liens Markdown [Label](url)
const mdLink = rt.links.find(l => l.url === 'https://support.google.com/docs');
check('lien Markdown appliqué sur le label « Aide officielle »', mdLink, l =>
  !!l && rt.text.substring(l.start, l.end) === 'Aide officielle'
);

// Vérifier les URL brutes https://...
const rawLink = rt.links.find(l => l.url === 'https://support.google.com/drive');
check('URL brute cliquable conservée', rawLink, l =>
  !!l && rt.text.substring(l.start, l.end) === 'https://support.google.com/drive'
);

console.log('\n5. Lien gras combiné **[Label](url)**');
const boldLink = 'Voir **[Procédure de récupération](https://support.google.com/accounts/answer/123)** pour la suite.';
const rtBoldLink = format(boldLink);

const linkEntry = rtBoldLink.links.find(l => l.url.includes('support.google.com'));
const boldEntry = rtBoldLink.styles.find(s => s.style.isBold);
check('lien créé pour le lien gras', linkEntry, l =>
  !!l && rtBoldLink.text.substring(l.start, l.end) === 'Procédure de récupération'
);
check('style gras appliqué sur le texte du lien', boldEntry, b =>
  !!b && rtBoldLink.text.substring(b.start, b.end) === 'Procédure de récupération'
);

console.log('\n' + (fails === 0 ? 'Tous les tests passent.' : fails + ' test(s) en échec.'));
process.exit(fails ? 1 : 0);
