/**
 * Lanceur de la suite de tests du backend Apps Script.
 *
 * Les fichiers .gs sont chargés dans un contexte `vm` où les services Google
 * (UrlFetchApp, PropertiesService, SpreadsheetApp, CacheService) sont simulés.
 * Aucune dépendance externe : `node tests/run.js` suffit.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let failed = 0;

for (const file of files) {
  console.log('\n─── ' + file + ' ' + '─'.repeat(Math.max(0, 60 - file.length)));
  try {
    execFileSync(process.execPath, [path.join(__dirname, file)], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });
  } catch (e) {
    failed++;
  }
}

console.log('\n' + '='.repeat(66));
if (failed) {
  console.log(`${failed} fichier(s) de test en échec sur ${files.length}.`);
  process.exit(1);
}
console.log(`${files.length} fichiers de test, tous verts.`);
