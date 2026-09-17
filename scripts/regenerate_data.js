import fs from 'node:fs';
import path from 'node:path';

const briefPath = path.resolve('brief-mapa-industrial-carabobo.md');
const outPath = path.resolve('data/municipios.json');

const brief = fs.readFileSync(briefPath, 'utf8');
const startToken = '```json\n[';
const endToken = '\n]\n```';

const startIndex = brief.indexOf(startToken);
const endIndex = brief.indexOf(endToken, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not extract JSON from brief');
  process.exit(1);
}

const jsonStr = brief.substring(startIndex + '```json\n'.length, endIndex + '\n]'.length);
const data = JSON.parse(jsonStr);

// Añadir campo verificado a cada empresa (e1, e3, e4, e5 son verificadas según sección 6 del brief)
const VERIFIED = ['e1', 'e3', 'e4', 'e5'];
let totalEmpresas = 0;
let totalVerificadas = 0;

data.forEach((m) => {
  if (Array.isArray(m.empresas)) {
    m.empresas.forEach((e) => {
      totalEmpresas++;
      e.verificado = VERIFIED.includes(e.id);
      if (e.verificado) totalVerificadas++;
    });
  }
});

fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`[Regenerate] data/municipios.json escrito correctamente en UTF-8.`);
console.log(`Total municipios: ${data.length}`);
console.log(`Total empresas: ${totalEmpresas}`);
console.log(`Total verificadas: ${totalVerificadas}`);
