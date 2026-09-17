import fs from 'node:fs';
import { processImportData } from '../src/utils/importer.js';
import { verifyCompanyLocation } from '../src/utils/verifier.js';
import { formatDistance } from '../src/utils/geo.js';

console.log('=== TEST 1: SERVIDORES HTTP Y CODIFICACIÓN ===');

// 1. Verificar Vite dev server
try {
  const viteRes = await fetch('http://localhost:5173/');
  const viteHtml = await viteRes.text();
  console.log('Vite Dev Server (5173): Status', viteRes.status);
  console.log('¿<meta charset="UTF-8"> está en <head>?:', viteHtml.includes('<meta charset="UTF-8" />'));
} catch (e) {
  console.error('Vite dev server error:', e.message);
}

// 2. Verificar Express API
try {
  const apiRes = await fetch('http://localhost:3001/api/municipios');
  console.log('\nExpress API (3001): Status', apiRes.status);
  console.log('Content-Type:', apiRes.headers.get('content-type'));
  const apiData = await apiRes.json();
  const apiStr = JSON.stringify(apiData);
  console.log('Municipios cargados:', apiData.length);
  console.log('¿Contiene \\ufffd?:', apiStr.includes('\ufffd'));
  console.log('¿Contiene "petroquímica"?:', apiStr.includes('petroquímica'));
  console.log('¿Contiene "Juan José Mora"?:', apiStr.includes('Juan José Mora'));
} catch (e) {
  console.error('Express API error:', e.message);
}

console.log('\n=== TEST 2: IMPORTACIÓN DEL REPORTE REAL CIEC ===');
const excelPath = 'C:/Users/luisv/Downloads/Reporte_CIEC_2026-09-03.xlsx';
if (!fs.existsSync(excelPath)) {
  console.error('No se encontró el archivo:', excelPath);
  process.exit(1);
}

const fileBuf = fs.readFileSync(excelPath);
const currentMunis = JSON.parse(fs.readFileSync('data/municipios.json', 'utf8'));

const importResult = processImportData(fileBuf, currentMunis, currentMunis);

console.log(`Total filas en Excel CIEC: ${importResult.totalFilas}`);
console.log(`Empresas nuevas agregadas: ${importResult.added.length}`);
console.log(`Duplicados detectados: ${importResult.duplicates.length}`);
console.log(`Requieren revisión manual: ${importResult.needsReviewList.length}`);

const sinMuni = importResult.parsedEmpresas.filter((e) => e.needsMuniReview);
const coordAlert = importResult.parsedEmpresas.filter((e) => e.coordWarning);
console.log(`  - Sin municipio asignado en reporte: ${sinMuni.length}`);
console.log(`  - Coordenadas dudosas (fuera de Carabobo o sin coord): ${coordAlert.length}`);

// Distribución de sectores
const distSectores = {};
importResult.parsedEmpresas.forEach((e) => {
  distSectores[e.sector] = (distSectores[e.sector] || 0) + 1;
});
console.log('Distribución de sectores asignada:', distSectores);

// Verificar integridad UTF-8
const importStr = JSON.stringify(importResult.parsedEmpresas);
console.log('¿Existe corrupción \\ufffd en importación?:', importStr.includes('\ufffd'));

console.log('\n=== TEST 3: INTEGRACIÓN Y PERSISTENCIA ===');
// Integrar empresas nuevas al dataset de municipios
const muniMap = new Map(currentMunis.map((m) => [m.id, { ...m, empresas: [...(m.empresas || [])], sectores: [...(m.sectores || [])] }]));

importResult.added.forEach((emp) => {
  const targetId = emp.matchedMunicipioId || 'val';
  const muni = muniMap.get(targetId) || muniMap.get('val');
  if (muni) {
    muni.empresas.push(emp);
    if (!muni.sectores.includes(emp.sector)) {
      muni.sectores.push(emp.sector);
    }
  }
});

const integratedDataset = Array.from(muniMap.values());
const totalEmpresasIntegradas = integratedDataset.reduce((acc, m) => acc + m.empresas.length, 0);
console.log(`Total municipios: ${integratedDataset.length}`);
console.log(`Total empresas tras importar CIEC: ${totalEmpresasIntegradas}`);

// Persistir a través de PUT /api/municipios
const putRes = await fetch('http://localhost:3001/api/municipios', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(integratedDataset),
});
const putData = await putRes.json();
console.log('Respuesta PUT /api/municipios:', putData);
