import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '..', 'data', 'municipios.json');

// Haversine formula
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
}

function formatDistance(meters) {
  if (meters === undefined || meters === null || isNaN(meters)) return '--';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

async function runBatch() {
  console.log('=== INICIANDO VERIFICACIÓN DE TODAS LAS PENDIENTES ===');
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const municipios = JSON.parse(raw);

  const pending = [];
  municipios.forEach((m) => {
    (m.empresas || []).forEach((e) => {
      if (!e.verificado) {
        pending.push({ empresa: e, municipioId: m.id, municipioNombre: m.nombre });
      }
    });
  });

  console.log(`Empresas pendientes por verificar: ${pending.length}`);

  let autoVerifiedCount = 0;
  let discrepancyCount = 0;
  let notFoundCount = 0;

  const discrepancies = [];
  const autoVerified = [];
  const notFound = [];

  const CHUNK_SIZE = 3;
  const PAUSE_MS = 150;

  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE);

    await Promise.all(
      chunk.map(async (item) => {
        const { empresa, municipioNombre } = item;

        try {
          const res = await fetch('http://localhost:3001/api/verify-place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
              nombre: empresa.n,
              municipio: municipioNombre,
              direccionDetallada: empresa.direccionDetallada,
              direccionFiscal: empresa.direccionFiscal,
              lat: empresa.lat,
              lon: empresa.lon,
            }),
          });

          const data = await res.json();

          if (!data || !data.success || !data.found) {
            notFoundCount++;
            notFound.push({
              id: empresa.id,
              nombre: empresa.n,
              municipio: municipioNombre,
            });
          } else {
            const found = data.found;
            if (typeof empresa.lat !== 'number' || typeof empresa.lon !== 'number' || isNaN(empresa.lat) || isNaN(empresa.lon)) {
              discrepancyCount++;
              discrepancies.push({
                id: empresa.id,
                nombre: empresa.n,
                municipio: municipioNombre,
                reason: 'Sin coordenadas previas',
                found,
              });
            } else {
              const dist = calculateHaversineDistance(empresa.lat, empresa.lon, found.lat, found.lon);
              if (dist < 500) {
                autoVerifiedCount++;
                empresa.verificado = true;
                empresa.verificadoMetodo = found.source || 'google_auto';
                empresa.verificadoDistanciaMetros = Math.round(dist);
                autoVerified.push({
                  id: empresa.id,
                  nombre: empresa.n,
                  municipio: municipioNombre,
                  distancia: dist,
                  source: found.source,
                });
              } else {
                discrepancyCount++;
                discrepancies.push({
                  id: empresa.id,
                  nombre: empresa.n,
                  municipio: municipioNombre,
                  distancia: dist,
                  distFormatted: formatDistance(dist),
                  actual: [empresa.lat, empresa.lon],
                  found: [found.lat, found.lon],
                  displayName: found.displayName || found.formattedAddress,
                });
              }
            }
          }
        } catch (err) {
          notFoundCount++;
          notFound.push({
            id: empresa.id,
            nombre: empresa.n,
            municipio: municipioNombre,
            error: err.message,
          });
        }
      })
    );

    const processed = Math.min(i + CHUNK_SIZE, pending.length);
    if (processed % 10 === 0 || processed === pending.length) {
      console.log(`[Progreso ${processed}/${pending.length}] Auto: ${autoVerifiedCount} | Discrepancias: ${discrepancyCount} | No encontradas: ${notFoundCount}`);
    }

    if (i + CHUNK_SIZE < pending.length) {
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }

  // Guardar municipios actualizados con las verificadas automáticamente
  const totalVerificadasFinal = municipios.reduce((acc, m) => acc + (m.empresas?.filter(e => e.verificado)?.length || 0), 0);
  const totalEmpresasFinal = municipios.reduce((acc, m) => acc + (m.empresas?.length || 0), 0);

  const saveRes = await fetch('http://localhost:3001/api/municipios', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(municipios),
  });

  const saveResult = await saveRes.json();
  console.log('\n=== RESULTADOS FINALES DE VERIFICACIÓN ===');
  console.log(`Total empresas analizadas en la corrida: ${pending.length}`);
  console.log(`- Verificadas automáticamente (< 500m): ${autoVerifiedCount}`);
  console.log(`- Con discrepancia pendiente de revisión manual (≥ 500m): ${discrepancyCount}`);
  console.log(`- Sin poder geocodificar (No encontradas en Google): ${notFoundCount}`);
  console.log(`\nEstado global del dataset:`);
  console.log(`- Total empresas verificadas: ${totalVerificadasFinal} de ${totalEmpresasFinal}`);
  console.log(`- Persistencia en disco: ${saveResult.success ? 'ÉXITO' : 'ERROR'}`);

  // Guardar log detallado de discrepancias para consulta rápida
  await fs.writeFile(
    path.join(__dirname, 'verification_report.json'),
    JSON.stringify({
      resumen: {
        totalAnalizadas: pending.length,
        autoVerificadas: autoVerifiedCount,
        discrepancias: discrepancyCount,
        noEncontradas: notFoundCount,
        totalVerificadasDataset: totalVerificadasFinal,
        totalEmpresasDataset: totalEmpresasFinal,
      },
      autoVerified,
      discrepancies,
      notFound,
    }, null, 2),
    'utf8'
  );
  console.log('Reporte detallado guardado en scripts/verification_report.json');
}

runBatch().catch(console.error);
