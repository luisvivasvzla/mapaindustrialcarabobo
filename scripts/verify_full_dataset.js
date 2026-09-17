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

console.log(`=== INICIANDO VERIFICACIÓN COMPLETA DE TODAS LAS PENDIENTES ===`);
console.log(`Total empresas pendientes: ${pendingList.length}`);

const autoVerified = [];
const discrepancy = [];
const notFound = [];

// Para no exceder tiempos y respetar la política de Nominatim, procesamos de forma secuencial
const LIMIT = process.env.VERIF_LIMIT ? parseInt(process.env.VERIF_LIMIT) : pendingList.length;
console.log(`Procesando hasta ${LIMIT} empresas...`);

for (let i = 0; i < Math.min(pendingList.length, LIMIT); i++) {
  const item = pendingList[i];
  
  // Si la empresa no tiene dirección alguna ni coordenadas válidas, clasificar directo
  const hasAddr = (item.empresa.direccionDetallada && item.empresa.direccionDetallada.trim()) ||
                  (item.empresa.direccionFiscal && item.empresa.direccionFiscal.trim());

  if (!hasAddr && !item.empresa.nota) {
    notFound.push({ ...item, result: { message: 'Sin dirección registrada en el reporte' } });
    if ((i + 1) % 25 === 0 || i === pendingList.length - 1) {
      console.log(`[${i + 1}/${pendingList.length}] Progreso: Auto: ${autoVerified.length}, Disc: ${discrepancy.length}, NoGeocod: ${notFound.length}`);
    }
    continue;
  }

  const result = await verifyCompanyLocation(item.empresa, item.municipioNombre);

  if (result.status === 'AUTO_VERIFIED') {
    autoVerified.push({ ...item, result });
    item.empresa.verificado = true;
    item.empresa.verificadoMetodo = 'nominatim_auto';
    item.empresa.verificadoDistanciaMetros = result.distance;
  } else if (result.status === 'DISCREPANCY') {
    discrepancy.push({ ...item, result });
  } else {
    notFound.push({ ...item, result });
  }

  if ((i + 1) % 10 === 0 || i === pendingList.length - 1) {
    console.log(`[${i + 1}/${pendingList.length}] Progreso: Auto: ${autoVerified.length}, Disc: ${discrepancy.length}, NoGeocod: ${notFound.length}`);
  }

  // Respetar política de Nominatim (mínimo 1 req/s)
  await new Promise((r) => setTimeout(r, 1050));
}

// Guardar actualizaciones de auto-verificadas en disco
if (autoVerified.length > 0) {
  fs.writeFileSync('data/municipios.json', JSON.stringify(munis, null, 2), 'utf8');
  console.log(`\nPersistidas ${autoVerified.length} auto-verificaciones en data/municipios.json`);
}

console.log('\n======================================================');
console.log('RESUMEN FINAL DE "VERIFICAR TODAS LAS PENDIENTES":');
console.log('======================================================');
console.log(`Total pendientes analizadas: ${autoVerified.length + discrepancy.length + notFound.length}`);
console.log(`- Verificadas automáticamente (< 500 m): ${autoVerified.length}`);
console.log(`- Con discrepancia pendiente de revisión manual (≥ 500 m): ${discrepancy.length}`);
console.log(`- Sin poder geocodificar: ${notFound.length}`);
console.log('======================================================');
