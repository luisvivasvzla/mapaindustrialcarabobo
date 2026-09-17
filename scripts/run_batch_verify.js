import fs from 'node:fs';
import { verifyCompanyLocation } from '../src/utils/verifier.js';
import { formatDistance } from '../src/utils/geo.js';

const munis = JSON.parse(fs.readFileSync('data/municipios.json', 'utf8'));

const pendingList = [];
munis.forEach((m) => {
  (m.empresas || []).forEach((e) => {
    if (!e.verificado) {
      pendingList.push({ empresa: e, municipioId: m.id, municipioNombre: m.nombre });
    }
  });
});

console.log(`=== INICIANDO VERIFICACIÓN EN COLA ===`);
console.log(`Total pendientes por verificar: ${pendingList.length}`);

const autoVerified = [];
const discrepancy = [];
const notFound = [];

for (let i = 0; i < pendingList.length; i++) {
  const item = pendingList[i];
  console.log(`\n[${i + 1}/${pendingList.length}] Verificando: "${item.empresa.n}" (Mun. ${item.municipioNombre})...`);

  const result = await verifyCompanyLocation(item.empresa, item.municipioNombre);

  if (result.status === 'AUTO_VERIFIED') {
    console.log(`  ✓ AUTO-VERIFICADA (diferencia: ${Math.round(result.distance)} m)`);
    autoVerified.push({ ...item, result });
  } else if (result.status === 'DISCREPANCY') {
    const dStr = result.distance !== null ? formatDistance(result.distance) : 'Sin coord previa';
    console.log(`  ⚠️ DISCREPANCIA (diferencia: ${dStr})`);
    console.log(`     Actual: [${item.empresa.lat}, ${item.empresa.lon}]`);
    console.log(`     Sugerida: [${result.geocoded.lat}, ${result.geocoded.lon}] - ${result.geocoded.displayName.slice(0, 80)}`);
    discrepancy.push({ ...item, result });
  } else {
    console.log(`  ❓ NO SE PUDO GEOCODIFICAR: ${result.message}`);
    notFound.push({ ...item, result });
  }

  // Respetar política de 1 req/s de Nominatim
  if (i < pendingList.length - 1) {
    await new Promise((r) => setTimeout(r, 1100));
  }
}

console.log('\n========================================');
console.log('RESUMEN DE VERIFICACIÓN EN COLA:');
console.log('========================================');
console.log(`- Verificadas automáticamente (< 500 m): ${autoVerified.length}`);
console.log(`- Con discrepancia pendiente de revisión manual (≥ 500 m): ${discrepancy.length}`);
console.log(`- Sin poder geocodificar: ${notFound.length}`);
console.log('========================================');
