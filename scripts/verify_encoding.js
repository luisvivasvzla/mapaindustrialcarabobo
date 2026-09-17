import fs from 'node:fs';

const raw = fs.readFileSync('data/municipios.json', 'utf8');

if (raw.includes('\ufffd')) {
  console.error('ERROR: data/municipios.json contains \\ufffd () character!');
  process.exit(1);
} else {
  console.log('✓ SUCCESS: data/municipios.json contains NO \\ufffd () characters.');
}

const words = [
  'petroquímica',
  'José',
  'ácido',
  'sulfúrico',
  'Morón',
  'Montalbán',
  'San Joaquín',
  'Güigüe',
  'operación'
];

for (const w of words) {
  const found = raw.includes(w);
  console.log(`- Palabra "${w}": ${found ? 'ENCONTRADA ✓' : 'NO ENCONTRADA ✗'}`);
}

try {
  const res = await fetch('http://localhost:3001/api/municipios');
  console.log('\n--- Test de API HTTP ---');
  console.log('Content-Type:', res.headers.get('content-type'));
  const txt = await res.text();
  console.log('¿Contiene \\ufffd en respuesta?:', txt.includes('\ufffd'));
  console.log('¿Contiene "Juan José Mora"?:', txt.includes('Juan José Mora'));
  console.log('¿Contiene "ácido sulfúrico"?:', txt.includes('ácido sulfúrico'));
} catch (e) {
  console.error('API test error:', e.message);
}
