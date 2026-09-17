import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';
import { processImportData } from './src/utils/importer.js';
import { calculateHaversineDistance } from './src/utils/geo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data', 'municipios.json');
const ENV_FILE = path.join(__dirname, '.env');
const QUEUE_DIR = path.join(__dirname, 'data', 'import-queue');
const PROCESSED_DIR = path.join(QUEUE_DIR, 'procesados');
const ERRORS_DIR = path.join(QUEUE_DIR, 'errores');
const LOG_FILE = path.join(QUEUE_DIR, 'log.json');

// Asegurar existencia de carpetas de la cola
[QUEUE_DIR, PROCESSED_DIR, ERRORS_DIR].forEach((d) => {
  if (!fsSync.existsSync(d)) {
    fsSync.mkdirSync(d, { recursive: true });
  }
});
if (!fsSync.existsSync(LOG_FILE)) {
  fsSync.writeFileSync(LOG_FILE, '[]', 'utf8');
}

// Cargar variables de entorno desde .env si existe
if (fsSync.existsSync(ENV_FILE)) {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(ENV_FILE);
    } else {
      const envRaw = fsSync.readFileSync(ENV_FILE, 'utf8');
      envRaw.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[k]) process.env[k] = v;
          }
        }
      });
    }
  } catch (err) {
    console.warn('[Env] Error al cargar .env:', err.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Middleware para forzar explícitamente Content-Type con charset=utf-8 en respuestas de la API
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Control de tasa de peticiones para respetar la política de Nominatim (mínimo ~1.1s entre peticiones)
let lastNominatimRequestTime = 0;
let lastGroundingCheckTime = 0;
let isGroundingAvailable = false;

async function queryNominatimInternal(query) {
  if (!query || typeof query !== 'string' || !query.trim()) return null;

  const now = Date.now();
  const timeSinceLast = now - lastNominatimRequestTime;
  if (timeSinceLast < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - timeSinceLast));
  }
  lastNominatimRequestTime = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&limit=1&countrycodes=ve`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CaraboboIndustrialMap/1.0 (Carabobo Industrial App; contact: dev@carabobo-map.ve)',
        'Accept-Language': 'es',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const top = data[0];
      const lat = parseFloat(top.lat);
      const lon = parseFloat(top.lon);
      // Validar si cae razonablemente dentro o cerca de Carabobo (9.65-10.65 N, -68.50 a -67.45 W)
      if (lat >= 9.65 && lat <= 10.65 && lon >= -68.50 && lon <= -67.45) {
        return {
          lat,
          lon,
          displayName: top.display_name,
          formattedAddress: top.display_name,
        };
      }
    }
    return null;
  } catch (err) {
    console.warn('[Nominatim Internal Warning]:', err.message);
    return null;
  }
}

async function queryNominatimCandidatesInternal(query) {
  if (!query || typeof query !== 'string' || !query.trim()) return [];

  const now = Date.now();
  const timeSinceLast = now - lastNominatimRequestTime;
  if (timeSinceLast < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - timeSinceLast));
  }
  lastNominatimRequestTime = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&limit=5&countrycodes=ve`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CaraboboIndustrialMap/1.0 (Carabobo Industrial App; contact: dev@carabobo-map.ve)',
        'Accept-Language': 'es',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .map((top) => ({
        lat: parseFloat(top.lat),
        lon: parseFloat(top.lon),
        displayName: top.display_name,
        formattedAddress: top.display_name,
        source: 'nominatim_fallback',
      }))
      .filter((c) => c.lat >= 9.65 && c.lat <= 10.65 && c.lon >= -68.50 && c.lon <= -67.45);
  } catch (err) {
    console.warn('[Nominatim Candidates Warning]:', err.message);
    return [];
  }
}

// GET /api/config-status - Informa si hay claves configuradas
app.get('/api/config-status', (req, res) => {
  res.json({
    hasGoogleKey: !!process.env.GOOGLE_MAPS_API_KEY,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    hasMapboxToken: !!process.env.MAPBOX_ACCESS_TOKEN,
    mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || '',
  });
});

// POST /api/config-key - Permite establecer o actualizar la clave
app.post('/api/config-key', async (req, res) => {
  const { googleMapsApiKey, geminiApiKey, mapboxAccessToken } = req.body;
  if (googleMapsApiKey) {
    process.env.GOOGLE_MAPS_API_KEY = googleMapsApiKey.trim();
  }
  if (geminiApiKey) {
    process.env.GEMINI_API_KEY = geminiApiKey.trim();
  }
  if (mapboxAccessToken !== undefined) {
    process.env.MAPBOX_ACCESS_TOKEN = mapboxAccessToken.trim();
  }

  // Guardar en .env
  try {
    let envContent = '';
    if (fsSync.existsSync(ENV_FILE)) {
      envContent = await fs.readFile(ENV_FILE, 'utf8');
    }
    if (googleMapsApiKey) {
      if (envContent.includes('GOOGLE_MAPS_API_KEY=')) {
        envContent = envContent.replace(/GOOGLE_MAPS_API_KEY=.*/g, `GOOGLE_MAPS_API_KEY=${googleMapsApiKey.trim()}`);
      } else {
        envContent += `\nGOOGLE_MAPS_API_KEY=${googleMapsApiKey.trim()}`;
      }
    }
    if (geminiApiKey) {
      if (envContent.includes('GEMINI_API_KEY=')) {
        envContent = envContent.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY=${geminiApiKey.trim()}`);
      } else {
        envContent += `\nGEMINI_API_KEY=${geminiApiKey.trim()}`;
      }
    }
    if (mapboxAccessToken !== undefined) {
      if (envContent.includes('MAPBOX_ACCESS_TOKEN=')) {
        envContent = envContent.replace(/MAPBOX_ACCESS_TOKEN=.*/g, `MAPBOX_ACCESS_TOKEN=${mapboxAccessToken.trim()}`);
      } else {
        envContent += `\nMAPBOX_ACCESS_TOKEN=${mapboxAccessToken.trim()}`;
      }
    }
    await fs.writeFile(ENV_FILE, envContent.trim() + '\n', 'utf8');
  } catch (err) {
    console.warn('[Config Key Warning]: No se pudo escribir en .env:', err.message);
  }

  res.json({
    success: true,
    hasGoogleKey: !!process.env.GOOGLE_MAPS_API_KEY,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    hasMapboxToken: !!process.env.MAPBOX_ACCESS_TOKEN,
    mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || '',
  });
});

// Función para extraer coordenadas en texto (ej. devueltas por Gemini o fuentes citadas)
function extractCoordinatesFromText(text) {
  if (!text) return null;

  // Formato: Latitud: 10.2608° N, Longitud: 67.7785° W
  const latMatch = text.match(/(?:latitud|lat[.:]?)\s*[:=]?\s*[*_]*\s*([0-9]{1,2}\.[0-9]{3,7})\s*°?\s*([NS])?/i);
  const lonMatch = text.match(/(?:longitud|lon[.:]?)\s*[:=]?\s*[*_]*\s*([0-9]{1,2}\.[0-9]{3,7})\s*°?\s*([WEO])?/i);

  if (latMatch && lonMatch) {
    let lat = parseFloat(latMatch[1]);
    if (latMatch[2] && latMatch[2].toUpperCase() === 'S') lat = -lat;

    let lon = parseFloat(lonMatch[1]);
    const dir = lonMatch[2] ? lonMatch[2].toUpperCase() : '';
    if (dir === 'W' || dir === 'O' || lon > 0) lon = -Math.abs(lon);

    if (lat >= 9.65 && lat <= 10.65 && lon >= -68.50 && lon <= -67.45) {
      return { lat, lon };
    }
  }

  // Formato par: 10.2608, -67.7785 o 10.2608 N, 67.7785 W
  const pairMatch = text.match(/([0-9]{1,2}\.[0-9]{3,7})\s*°?\s*([NS])?\s*,\s*(-?[0-9]{1,2}\.[0-9]{3,7})\s*°?\s*([WEO])?/i);
  if (pairMatch) {
    let lat = parseFloat(pairMatch[1]);
    if (pairMatch[2] && pairMatch[2].toUpperCase() === 'S') lat = -lat;

    let lon = parseFloat(pairMatch[3]);
    const dir = pairMatch[4] ? pairMatch[4].toUpperCase() : '';
    if (dir === 'W' || dir === 'O' || (lon > 0 && Math.abs(lon) > 60)) lon = -Math.abs(lon);

    if (lat >= 9.65 && lat <= 10.65 && lon >= -68.50 && lon <= -67.45) {
      return { lat, lon };
    }
  }

  return null;
}

// Función modular para buscar la empresa en Google Places / Gemini Grounding / Fallback geocodificador
async function searchPlaceForVerification(nombre, municipio, direccionDetallada, direccionFiscal) {
  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return { success: false, notFound: true, message: 'Nombre de empresa requerido' };
  }

  const cleanNombre = nombre.trim();
  const muniName = municipio ? municipio.trim() : 'Carabobo';
  const queryPlaces = `${cleanNombre}, ${muniName}, Carabobo, Venezuela`;

  let foundResult = null;
  let allCandidates = [];

  // 1. Google Places API (Text Search)
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleKey) {
    try {
      const placesUrl = 'https://places.googleapis.com/v1/places:searchText';
      const placesRes = await fetch(placesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleKey,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
        },
        body: JSON.stringify({
          textQuery: queryPlaces,
          languageCode: 'es',
          locationBias: {
            rectangle: {
              low: { latitude: 9.814444, longitude: -68.423611 },
              high: { latitude: 10.590556, longitude: -67.514722 },
            },
          },
        }),
      });

      if (placesRes.ok) {
        const placesData = await placesRes.json();
        if (Array.isArray(placesData.places) && placesData.places.length > 0) {
          const validPlaces = placesData.places
            .filter((p) => p.location?.latitude && p.location?.longitude)
            .map((p) => ({
              lat: p.location.latitude,
              lon: p.location.longitude,
              displayName: p.displayName?.text || cleanNombre,
              formattedAddress: p.formattedAddress || queryPlaces,
              source: 'google_places',
            }));
          if (validPlaces.length > 0) {
            foundResult = validPlaces[0];
            allCandidates = validPlaces;
          }
        }
      }
    } catch (err) {
      console.warn('[Google Places Error]:', err.message);
    }
  }

  // 2. Si Places no encuentra nada o la API key no está disponible: Respaldo con Gemini
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!foundResult && geminiKey) {
    try {
      const prompt = `Busca la ubicación de la empresa '${cleanNombre}' en el municipio ${muniName}, estado Carabobo, Venezuela. Devuelve su dirección más precisa y, si logras encontrar coordenadas geográficas citadas en alguna fuente, inclúyelas. Si no encuentras nada confiable, dilo explícitamente en vez de inventar coordenadas.`;

      let geminiText = '';
      let isGrounded = false;

      const canTryGrounding = isGroundingAvailable || Date.now() - lastGroundingCheckTime > 10 * 60 * 1000;
      if (canTryGrounding) {
        lastGroundingCheckTime = Date.now();
        try {
          const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(3000),
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              tools: [{ googleSearch: {} }],
            }),
          });

          if (gRes.ok) {
            const gData = await gRes.json();
            geminiText = gData.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || '';
            isGrounded = true;
            isGroundingAvailable = true;
          } else {
            isGroundingAvailable = false;
          }
        } catch (e) {
          isGroundingAvailable = false;
        }
      }

      if (!geminiText) {
        const stdRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(3000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        });
        if (stdRes.ok) {
          const sData = await stdRes.json();
          geminiText = sData.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || '';
        }
      }

      if (
        geminiText &&
        !geminiText.toLowerCase().includes('no encuentro nada confiable') &&
        !geminiText.toLowerCase().includes('no se encontró información confiable')
      ) {
        const extractedCoords = extractCoordinatesFromText(geminiText);

        if (extractedCoords) {
          foundResult = {
            lat: extractedCoords.lat,
            lon: extractedCoords.lon,
            displayName: cleanNombre,
            formattedAddress: `Coordenadas verificadas de ${cleanNombre}`,
            source: isGrounded ? 'gemini_grounding_coords' : 'gemini_coords',
          };
          allCandidates = [foundResult];
        }

        if (!foundResult) {
          const dirMatch = geminiText.match(/(?:direcci[oó]n|ubicaci[oó]n)[^:]*:\s*[*_]*([^\n\r.]+)/i);
          let refinedAddress = dirMatch ? dirMatch[1].replace(/[*_#]/g, '').trim() : null;

          if (refinedAddress && refinedAddress.length > 5) {
            if (!refinedAddress.toLowerCase().includes('carabobo')) {
              refinedAddress += `, ${muniName}, Carabobo, Venezuela`;
            }
            const geoRes = await queryNominatimInternal(refinedAddress);
            if (geoRes) {
              foundResult = {
                ...geoRes,
                source: isGrounded ? 'gemini_grounding_address' : 'gemini_address',
              };
              allCandidates = [foundResult];
            }
          }

          if (!foundResult) {
            const ziMatch = geminiText.match(/(Zona Industrial [A-Za-zÁÉÍÓÚáéíóúñÑ0-9\s]+)/i);
            if (ziMatch) {
              const ziQuery = `${ziMatch[1].trim()}, ${muniName}, Carabobo, Venezuela`;
              const geoRes = await queryNominatimInternal(ziQuery);
              if (geoRes) {
                foundResult = {
                  ...geoRes,
                  source: isGrounded ? 'gemini_grounding_zi' : 'gemini_zi',
                };
                allCandidates = [foundResult];
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Gemini Error]:', err.message);
    }
  }

  // 3. Fallback geocodificador Nominatim
  if (!foundResult) {
    let geoRes = await queryNominatimInternal(`${cleanNombre}, ${muniName}, Carabobo, Venezuela`);

    if (!geoRes) {
      const bestDir = (direccionDetallada && direccionDetallada.trim()) || (direccionFiscal && direccionFiscal.trim());
      if (bestDir) {
        let cleanDir = bestDir.trim();
        if (!cleanDir.toLowerCase().includes('carabobo')) {
          cleanDir += `, ${muniName}, Carabobo, Venezuela`;
        }
        geoRes = await queryNominatimInternal(cleanDir);
      }
    }

    if (geoRes) {
      foundResult = {
        ...geoRes,
        source: 'nominatim_fallback',
      };
      allCandidates = [foundResult];
    }
  }

  if (!foundResult) {
    return {
      success: false,
      notFound: true,
      message: 'No se encontró esta empresa en Google',
    };
  }

  return {
    success: true,
    notFound: false,
    found: foundResult,
    candidates: allCandidates.length > 0 ? allCandidates : [foundResult],
  };
}

// POST /api/verify-place - Endpoint HTTP para verificación unitaria
app.post('/api/verify-place', async (req, res) => {
  const { nombre, municipio, direccionDetallada, direccionFiscal } = req.body;
  const result = await searchPlaceForVerification(nombre, municipio, direccionDetallada, direccionFiscal);
  if (result.notFound) {
    return res.json(result);
  }
  res.json(result);
});

// Verificación interna contra coordenadas existentes (umbral 500m)
async function verifyCompanyInternal(empresa, municipioNombre) {
  const searchRes = await searchPlaceForVerification(
    empresa.n || empresa.nombreEstablecimiento || empresa.razonSocial,
    municipioNombre,
    empresa.direccionDetallada,
    empresa.direccionFiscal
  );

  if (!searchRes.success || !searchRes.found) {
    return { verified: false, discrepancy: false, notFound: true, distance: null };
  }

  const found = searchRes.found;
  const hasCoords = typeof empresa.lat === 'number' && typeof empresa.lon === 'number' && !isNaN(empresa.lat) && !isNaN(empresa.lon);

  if (!hasCoords) {
    return { verified: false, discrepancy: true, notFound: false, distance: null, found };
  }

  const distance = calculateHaversineDistance(empresa.lat, empresa.lon, found.lat, found.lon);
  if (distance < 500) {
    return { verified: true, discrepancy: false, notFound: false, distance, found };
  } else {
    return { verified: false, discrepancy: true, notFound: false, distance, found };
  }
}

// Estado en memoria del proceso actual de la cola
let currentJob = {
  isProcessing: false,
  filename: null,
  step: 'idle', // 'idle' | 'parsing' | 'saving' | 'verifying' | 'done' | 'error'
  startedAt: null,
  progress: { current: 0, total: 0, autoVerified: 0, pendingReview: 0 },
  lastError: null,
};

async function readQueueLogs() {
  try {
    if (fsSync.existsSync(LOG_FILE)) {
      const raw = await fs.readFile(LOG_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[QueueLog] Error al leer logs:', err.message);
  }
  return [];
}

async function appendQueueLog(entry) {
  try {
    const logs = await readQueueLogs();
    logs.unshift(entry);
    const trimmed = logs.slice(0, 50);
    await fs.writeFile(LOG_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    return trimmed;
  } catch (err) {
    console.warn('[QueueLog] Error al escribir logs:', err.message);
  }
}

// Procesador de archivo colocado en data/import-queue/
async function processQueueFile(filePath) {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

  console.log(`[ImportQueue] Procesando archivo de cola: ${fileName}`);
  currentJob = {
    isProcessing: true,
    filename: fileName,
    step: 'parsing',
    startedAt: now.toISOString(),
    progress: { current: 0, total: 0, autoVerified: 0, pendingReview: 0 },
    lastError: null,
  };

  try {
    const fileBuffer = await fs.readFile(filePath);
    const rawMunis = await fs.readFile(DATA_FILE, 'utf8');
    const currentMunis = JSON.parse(rawMunis);

    const importResult = processImportData(fileBuffer, currentMunis, currentMunis);

    if (!importResult || importResult.totalFilas === 0) {
      throw new Error('El archivo no contiene filas de datos válidas o está vacío.');
    }

    currentJob.step = 'saving';
    const muniMap = new Map(currentMunis.map((m) => [m.id, m]));
    importResult.added.forEach((emp) => {
      const targetId = emp.matchedMunicipioId || 'val';
      const m = muniMap.get(targetId) || muniMap.get('val');
      if (m) {
        if (!Array.isArray(m.empresas)) m.empresas = [];
        m.empresas.push(emp);
        if (!Array.isArray(m.sectores)) m.sectores = [];
        if (emp.sector && !m.sectores.includes(emp.sector)) {
          m.sectores.push(emp.sector);
        }
      }
    });

    // Guardar dataset enriquecido
    await fs.writeFile(DATA_FILE, JSON.stringify(currentMunis, null, 2), 'utf8');

    // Mover archivo a procesados
    const destName = `${baseName}__procesado_${ts}${ext}`;
    const destPath = path.join(PROCESSED_DIR, destName);
    try {
      await fs.rename(filePath, destPath);
    } catch (_) {
      await fs.copyFile(filePath, destPath);
      await fs.unlink(filePath);
    }

    console.log(`[ImportQueue] ${importResult.added.length} empresas agregadas. Archivo trasladado a: ${destName}`);

    // Verificación automática de empresas añadidas en segundo plano
    currentJob.step = 'verifying';
    currentJob.progress = {
      current: 0,
      total: importResult.added.length,
      autoVerified: 0,
      pendingReview: 0,
    };

    let autoVerifiedCount = 0;
    let pendingReviewCount = 0;
    const addedList = importResult.added;
    const BATCH_SIZE = 3;

    for (let i = 0; i < addedList.length; i += BATCH_SIZE) {
      const batch = addedList.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (emp) => {
          const mName = emp.matchedMunicipioNombre || 'Carabobo';
          try {
            const verifRes = await verifyCompanyInternal(emp, mName);
            if (verifRes.verified) {
              autoVerifiedCount++;
              emp.verificado = true;
              emp.verificadoEn = new Date().toISOString();
              emp.verificadoDistancia = verifRes.distance !== null ? Math.round(verifRes.distance) : null;
              emp.verificadoFuente = verifRes.found?.source || 'auto';
            } else if (verifRes.discrepancy) {
              pendingReviewCount++;
              emp.verificado = false;
              emp.discrepanciaUbicacion = true;
              emp.discrepanciaDistancia = verifRes.distance !== null ? Math.round(verifRes.distance) : null;
              emp.candidatoGeocoded = verifRes.found;
              emp.needsReview = true;
            } else {
              pendingReviewCount++;
              emp.verificado = false;
              emp.sinResultadosGoogle = true;
            }
          } catch (verifErr) {
            console.warn(`[ImportQueue] Error verificando ${emp.n}:`, verifErr.message);
            pendingReviewCount++;
          }
        })
      );

      currentJob.progress.current = Math.min(i + batch.length, addedList.length);
      currentJob.progress.autoVerified = autoVerifiedCount;
      currentJob.progress.pendingReview = pendingReviewCount;

      if (i + BATCH_SIZE < addedList.length) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    // Guardar dataset final con flags de verificación actualizados
    await fs.writeFile(DATA_FILE, JSON.stringify(currentMunis, null, 2), 'utf8');

    const duracionMs = Date.now() - (currentJob.startedAt ? new Date(currentJob.startedAt).getTime() : Date.now());
    const logEntry = {
      id: `run_${Date.now()}`,
      archivo: fileName,
      archivoDestino: destName,
      fecha: new Date().toISOString(),
      estado: 'completado',
      totalFilas: importResult.totalFilas,
      empresasAgregadas: importResult.added.length,
      duplicadosOmitidos: importResult.duplicates.length,
      verificadasAuto: autoVerifiedCount,
      pendientesRevision: pendingReviewCount,
      duracionMs,
    };

    await appendQueueLog(logEntry);
    currentJob.isProcessing = false;
    currentJob.step = 'done';
    console.log(`[ImportQueue] Proceso completado: ${autoVerifiedCount} verificadas, ${pendingReviewCount} pendientes de revisión.`);
  } catch (err) {
    console.error(`[ImportQueue Error]: ${err.message}`);
    const errDestName = `${baseName}__error_${ts}${ext}`;
    const errDestPath = path.join(ERRORS_DIR, errDestName);
    try {
      if (fsSync.existsSync(filePath)) {
        await fs.rename(filePath, errDestPath);
      }
    } catch (_) {
      try {
        await fs.copyFile(filePath, errDestPath);
        await fs.unlink(filePath);
      } catch (__) {}
    }

    const duracionMs = Date.now() - (currentJob.startedAt ? new Date(currentJob.startedAt).getTime() : Date.now());
    const logEntry = {
      id: `run_${Date.now()}`,
      archivo: fileName,
      archivoDestino: errDestName,
      fecha: new Date().toISOString(),
      estado: 'error',
      totalFilas: 0,
      empresasAgregadas: 0,
      duplicadosOmitidos: 0,
      verificadasAuto: 0,
      pendientesRevision: 0,
      error: err.message,
      duracionMs,
    };

    await appendQueueLog(logEntry);
    currentJob.isProcessing = false;
    currentJob.step = 'error';
    currentJob.lastError = err.message;
  }
}

// Inicializar Chokidar para vigilar data/import-queue/
const queueWatcher = chokidar.watch(QUEUE_DIR, {
  ignored: (targetPath) => {
    const norm = path.normalize(targetPath).toLowerCase();
    if (norm.startsWith(path.normalize(PROCESSED_DIR).toLowerCase())) return true;
    if (norm.startsWith(path.normalize(ERRORS_DIR).toLowerCase())) return true;
    if (norm === path.normalize(LOG_FILE).toLowerCase()) return true;
    const base = path.basename(targetPath);
    if (base.startsWith('~$') || (base.startsWith('.') && base !== '.')) return true;
    return false;
  },
  persistent: true,
  ignoreInitial: false,
  depth: 0,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100,
  },
});

queueWatcher.on('add', async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.xlsx' && ext !== '.csv') return;
  const fileName = path.basename(filePath);
  if (fileName.startsWith('~$') || fileName.startsWith('.')) return;

  const resolvedDir = path.dirname(path.resolve(filePath)).toLowerCase();
  const targetDir = path.resolve(QUEUE_DIR).toLowerCase();
  if (resolvedDir !== targetDir) return;

  console.log(`[ImportQueue Watcher] Detectado nuevo archivo listo: ${fileName}`);
  await processQueueFile(filePath);
});

queueWatcher.on('error', (err) => {
  console.error('[ImportQueue Watcher Error]:', err.message);
});

// GET /api/import-queue/status - Informa el estado en vivo y el historial de la cola
app.get('/api/import-queue/status', async (req, res) => {
  try {
    const logs = await readQueueLogs();
    let totalEmpresas = 0;
    let totalVerificadas = 0;
    try {
      const raw = await fs.readFile(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      totalEmpresas = data.reduce((acc, m) => acc + (m.empresas?.length || 0), 0);
      totalVerificadas = data.reduce(
        (acc, m) => acc + (m.empresas?.filter((e) => e.verificado === true)?.length || 0),
        0
      );
    } catch (_) {}

    res.json({
      success: true,
      queueFolder: QUEUE_DIR,
      isProcessing: currentJob.isProcessing,
      currentJob,
      logs: logs.slice(0, 50),
      totalEmpresas,
      totalVerificadas,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar estado de cola' });
  }
});

// GET /api/geocode - Proxy hacia Nominatim con User-Agent identificable y rate-limiting
app.get('/api/geocode', async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.json([]);
  }

  const now = Date.now();
  const timeSinceLast = now - lastNominatimRequestTime;
  if (timeSinceLast < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - timeSinceLast));
  }
  lastNominatimRequestTime = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&limit=5&countrycodes=ve`;

  try {
    const geoRes = await fetch(url, {
      headers: {
        'User-Agent': 'CaraboboIndustrialMap/1.0 (Carabobo Industrial App; contact: dev@carabobo-map.ve)',
        'Accept-Language': 'es',
      },
    });

    if (!geoRes.ok) {
      throw new Error(`Nominatim HTTP error: ${geoRes.status}`);
    }

    const data = await geoRes.json();
    res.json(data);
  } catch (err) {
    console.error('[Geocode Error]:', err.message);
    res.status(502).json({ error: 'Error al consultar geocoding de Nominatim' });
  }
});

// GET /api/municipios - Lee y retorna data/municipios.json (estrictamente UTF-8 sin BOM)
app.get('/api/municipios', async (req, res) => {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    res.json(data);
  } catch (err) {
    console.error('[API Error] No se pudo leer municipios.json:', err);
    res.status(500).json({ error: 'Error al leer el archivo de municipios' });
  }
});

// PUT /api/municipios - Escribe el JSON completo a data/municipios.json en disco (UTF-8)
app.put('/api/municipios', async (req, res) => {
  try {
    const data = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'El cuerpo debe ser un array de municipios' });
    }

    const jsonString = JSON.stringify(data, null, 2);
    await fs.writeFile(DATA_FILE, jsonString, 'utf8');

    const totalEmpresas = data.reduce((acc, m) => acc + (m.empresas?.length || 0), 0);
    console.log(`[Backend] Guardado en disco. Municipios: ${data.length}, Empresas totales: ${totalEmpresas}`);

    res.json({ success: true, count: data.length, totalEmpresas });
  } catch (err) {
    console.error('[API Error] No se pudo escribir municipios.json:', err);
    res.status(500).json({ error: 'Error al persistir en disco' });
  }
});

// Servir la carpeta dist estática generada por Vite
app.use(express.static(path.join(__dirname, 'dist')));

// Redirigir cualquier otra petición al index.html para soportar el enrutamiento de la SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Backend] Servidor Express activo en http://localhost:${PORT}`);
});
