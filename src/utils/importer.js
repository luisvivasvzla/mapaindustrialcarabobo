import * as XLSX from 'xlsx';
import { normalizeText } from './text.js';
import { isWithinCaraboboBounds } from './geo.js';

/**
 * Normaliza nombres de columnas para búsqueda insensible a acentos/mayúsculas
 */
function findColumnValue(row, patterns) {
  const rowKeys = Object.keys(row);
  for (const pattern of patterns) {
    // 1. Intento de coincidencia exacta directa de clave
    if (row[pattern] !== undefined && row[pattern] !== null && row[pattern] !== '') {
      const val = row[pattern];
      if (typeof val === 'string') return val.trim();
      return val;
    }

    // 2. Coincidencia insensible a mayúsculas/minúsculas, acentos y símbolos (º, °)
    const normPattern = normalizeText(pattern).replace(/[º°]/g, 'o');
    const foundKey = rowKeys.find((k) => {
      const normK = normalizeText(k).replace(/[º°]/g, 'o');
      return normK.includes(normPattern) || normK === normPattern;
    });
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
      const val = row[foundKey];
      if (typeof val === 'string') return val.trim();
      return val;
    }
  }
  return '';
}

/**
 * Determina el sector a partir de Sección CAEV, División CAEV y Productos
 */
export function classifySector(seccionRaw, divisionRaw, productosRaw = '') {
  const sec = String(seccionRaw || '').trim().toUpperCase();
  
  // División puede venir como número, texto "10.0", "10", etc.
  let div = null;
  if (divisionRaw !== undefined && divisionRaw !== null && divisionRaw !== '') {
    const num = parseFloat(String(divisionRaw).replace(',', '.'));
    if (!isNaN(num)) {
      div = Math.floor(num);
    }
  }

  if (sec === 'C') {
    if (div === 10 || div === 11 || div === 12) {
      return 'alim';
    }
    if (div >= 13 && div <= 18) {
      return 'textil';
    }
    if (div === 19) {
      return 'petro';
    }
    if (div === 20) {
      const prodLower = normalizeText(String(productosRaw || ''));
      const chemKeywords = [
        'quimic', 'solvent', 'resin', 'fertiliz', 'alquilbencen',
        'lubricant', 'petroquimic', 'industri', 'aditiv', 'pintur', 'adhesiv', 'polimer'
      ];
      const pharmaKeywords = [
        'farmac', 'medicament', 'drog', 'terapeut', 'suer',
        'ampoll', 'tablet', 'comprimid', 'jarab', 'salud', 'medicin', 'antiseptic'
      ];

      const hasChem = chemKeywords.some((k) => prodLower.includes(k));
      const hasPharma = pharmaKeywords.some((k) => prodLower.includes(k));

      if (hasChem && !hasPharma) {
        return 'petro';
      }
      return 'farma';
    }
    if (div === 21) {
      return 'farma';
    }
    if (div === 22 || div === 23) {
      return 'textil';
    }
    if (div >= 24 && div <= 30) {
      return 'auto';
    }
    if (div >= 31 && div <= 33) {
      return 'textil';
    }
    return 'otros';
  }

  if (sec === 'H') {
    return 'energia';
  }

  // Cualquier otra sección o vacía -> "otros"
  return 'otros';
}

/**
 * Normaliza el nombre del municipio del reporte CIEC retirando prefijo "Municipio "
 */
export function cleanMunicipioName(rawMunicipio) {
  if (!rawMunicipio) return '';
  return String(rawMunicipio)
    .replace(/^municipio\s+/i, '')
    .trim();
}

/**
 * Mapea una fila cruda del Excel de la CIEC al esquema de empresa de nuestra aplicación,
 * incorporando TODAS las 26 columnas exactas como campos de primer nivel.
 */
export function mapRowToEmpresa(row, knownMunicipios = []) {
  // 1. Extracción de las 26 columnas exactas del reporte CIEC
  const rif = findColumnValue(row, ['RIF Compañía', 'RIF Compania', 'rif compania', 'rif compa', 'rif']);
  const razonSocial = findColumnValue(row, ['Razón Social', 'Razon Social', 'razon social']);
  const anoFundacion = findColumnValue(row, ['Año Fundación', 'Ano Fundacion', 'ano fundacion', 'ano fundaci', 'ano fund']);
  const direccionFiscal = findColumnValue(row, ['Dirección Fiscal', 'Direccion Fiscal', 'direccion fiscal']);
  const nombreEstablecimiento = findColumnValue(row, ['Nombre Establecimiento', 'nombre establecimiento', 'establecimiento']);
  const fechaApertura = findColumnValue(row, ['Fecha Apertura', 'fecha apertura']);
  const emailPrincipal = findColumnValue(row, ['Email Principal', 'email principal', 'email', 'correo']);
  const telefono1 = findColumnValue(row, ['Teléfono 1', 'Telefono 1', 'telefono 1', 'telefono']);
  const telefono2 = findColumnValue(row, ['Teléfono 2', 'Telefono 2', 'telefono 2']);
  const estadoGeografico = findColumnValue(row, ['Estado', 'estado']);
  const municipioRaw = findColumnValue(row, ['Municipio', 'municipio']);
  const parroquia = findColumnValue(row, ['Parroquia', 'parroquia']);
  const direccionDetallada = findColumnValue(row, ['Dirección Detallada', 'Direccion Detallada', 'direccion detallada']);
  const latRaw = findColumnValue(row, ['Latitud', 'latitud', 'lat']);
  const lonRaw = findColumnValue(row, ['Longitud', 'longitud', 'lon', 'lng']);
  const numObreros = findColumnValue(row, ['Nº Obreros', 'No Obreros', 'N° Obreros', 'num obreros', 'n obreros', 'obreros']);
  const numEmpleados = findColumnValue(row, ['Nº Empleados', 'No Empleados', 'N° Empleados', 'num empleados', 'n empleados']);
  const numDirectivos = findColumnValue(row, ['Nº Directivos', 'No Directivos', 'N° Directivos', 'num directivos', 'n directivos', 'directivos']);
  const totalEmpleados = findColumnValue(row, ['Total Empleados', 'total empleados', 'empleados totales', 'total personal']);
  const seccionCAEV = findColumnValue(row, ['Sección CAEV', 'Seccion CAEV', 'seccion caev', 'secci']);
  const divisionCAEV = findColumnValue(row, ['División CAEV', 'Division CAEV', 'division caev', 'divisi']);
  const claseCAEV = findColumnValue(row, ['Clase CAEV', 'clase caev', 'clase']);
  const productos = findColumnValue(row, ['Productos', 'productos']);
  const marcas = findColumnValue(row, ['Marcas', 'marcas', 'marcas comerciales']);
  const procesosProductivos = findColumnValue(row, ['Procesos Productivos', 'procesos productivos', 'procesos']);
  const gremios = findColumnValue(row, ['Gremios', 'gremios', 'camaras']);

  // 2. Nombre de empresa principal de visualización
  const n = nombreEstablecimiento || razonSocial || 'Empresa sin nombre';

  // 3. Coordenadas
  let lat = null;
  let lon = null;
  if (latRaw !== '' && lonRaw !== '') {
    const pLat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw).replace(',', '.'));
    const pLon = typeof lonRaw === 'number' ? lonRaw : parseFloat(String(lonRaw).replace(',', '.'));
    if (!isNaN(pLat) && !isNaN(pLon)) {
      lat = pLat;
      lon = pLon;
    }
  }

  // 4. Nota descriptiva: concatenar Dirección Detallada + " · " + Productos + " · " + Total Empleados
  const notaParts = [];
  if (direccionDetallada) notaParts.push(direccionDetallada);
  if (productos) notaParts.push(productos);
  if (totalEmpleados && totalEmpleados !== 0 && totalEmpleados !== '0') {
    notaParts.push(`${totalEmpleados} empleados`);
  }
  const nota = notaParts.join(' · ');

  // 5. Sector económico
  const sector = classifySector(seccionCAEV, divisionCAEV, productos);

  // 6. Validación de coordenadas dentro de Carabobo (9.65-10.65 N, -68.50 a -67.45 O)
  let coordWarning = false;
  let coordReviewReason = '';
  if (lat === null || lon === null) {
    coordWarning = true;
    coordReviewReason = 'Sin coordenadas geográficas';
  } else if (!isWithinCaraboboBounds(lat, lon)) {
    coordWarning = true;
    coordReviewReason = `Coordenadas (${lat.toFixed(4)}, ${lon.toFixed(4)}) fuera del estado Carabobo`;
  }

  // 7. Matching de Municipio
  const cleanMuni = cleanMunicipioName(municipioRaw);
  const normCleanMuni = normalizeText(cleanMuni);
  let matchedMunicipioId = null;
  let matchedMunicipioNombre = null;

  if (normCleanMuni) {
    const foundMuni = knownMunicipios.find((m) => normalizeText(m.nombre) === normCleanMuni);
    if (foundMuni) {
      matchedMunicipioId = foundMuni.id;
      matchedMunicipioNombre = foundMuni.nombre;
    }
  }

  const needsMuniReview = !matchedMunicipioId;
  const needsReview = coordWarning || needsMuniReview;

  // Generación de ID limpia basada en RIF o timestamp
  const safeRif = rif ? String(rif).replace(/[^a-zA-Z0-9]/g, '') : '';
  const uniqueId = `ciec_${safeRif || 'emp'}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  return {
    id: uniqueId,
    n,
    lat,
    lon,
    nota,
    estado: 'Activa', // El reporte de afiliados de la CIEC corresponde a empresas activas
    sector,
    verificado: false,
    coordWarning,
    coordReviewReason,
    needsMuniReview,
    needsReview,
    municipioRaw,
    matchedMunicipioId,
    matchedMunicipioNombre,

    // TODAS las 26 columnas como campos de primer nivel con claves estándar camelCase:
    rif,
    razonSocial,
    anoFundacion,
    direccionFiscal,
    nombreEstablecimiento,
    fechaApertura,
    emailPrincipal,
    telefono1,
    telefono2,
    estadoGeografico: estadoGeografico || 'Carabobo',
    estadoVen: estadoGeografico || 'Carabobo',
    parroquia,
    direccionDetallada,
    numObreros,
    numEmpleados,
    numDirectivos,
    totalEmpleados,
    seccionCAEV,
    divisionCAEV,
    claseCAEV,
    productos,
    marcas,
    procesosProductivos,
    gremios,

    // TODAS las 26 columnas exactas del Excel CIEC como campos de primer nivel con sus cabeceras originales:
    'RIF Compañía': rif,
    'Razón Social': razonSocial,
    'Año Fundación': anoFundacion,
    'Dirección Fiscal': direccionFiscal,
    'Nombre Establecimiento': nombreEstablecimiento || n,
    'Fecha Apertura': fechaApertura,
    'Email Principal': emailPrincipal,
    'Teléfono 1': telefono1,
    'Teléfono 2': telefono2,
    'Estado': estadoGeografico || 'Carabobo',
    'Municipio': municipioRaw,
    'Parroquia': parroquia,
    'Dirección Detallada': direccionDetallada,
    'Latitud': lat,
    'Longitud': lon,
    'Nº Obreros': numObreros,
    'Nº Empleados': numEmpleados,
    'Nº Directivos': numDirectivos,
    'Total Empleados': totalEmpleados,
    'Sección CAEV': seccionCAEV,
    'División CAEV': divisionCAEV,
    'Clase CAEV': claseCAEV,
    'Productos': productos,
    'Marcas': marcas,
    'Procesos Productivos': procesosProductivos,
    'Gremios': gremios,
  };
}

/**
 * Parsea un ArrayBuffer o Buffer de archivo Excel/CSV y analiza contra el dataset actual
 */
export function processImportData(fileData, knownMunicipios, existingDataset) {
  // SheetJS: usar codepage 65001 (UTF-8) para no corromper caracteres acentuados ni la ñ
  const readOptions = {
    type: typeof Buffer !== 'undefined' && Buffer.isBuffer(fileData) ? 'buffer' : 'array',
    codepage: 65001,
    raw: false,
    cellDates: false,
  };

  const workbook = XLSX.read(fileData, readOptions);
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  // Crear mapa de duplicados existentes por RIF + Nombre Establecimiento
  const existingMap = new Map();
  existingDataset.forEach((m) => {
    if (Array.isArray(m.empresas)) {
      m.empresas.forEach((emp) => {
        const rifKey = (emp.rif || emp['RIF Compañía'] || '').trim().toUpperCase();
        const nameKey = (emp.nombreEstablecimiento || emp['Nombre Establecimiento'] || emp.n || '').trim().toUpperCase();
        const key = `${rifKey}::${nameKey}`;
        existingMap.set(key, { empresa: emp, municipioId: m.id, municipioNombre: m.nombre });
      });
    }
  });

  const parsedEmpresas = [];
  const duplicates = [];
  const added = [];
  const needsReviewList = [];

  rawRows.forEach((row, index) => {
    const mapped = mapRowToEmpresa(row, knownMunicipios);
    mapped.rowIndex = index + 2; // Fila Excel 1-indexed (cabecera en fila 1)

    const rifKey = (mapped.rif || '').trim().toUpperCase();
    const nameKey = (mapped.nombreEstablecimiento || mapped.n || '').trim().toUpperCase();
    const key = `${rifKey}::${nameKey}`;
    const existing = existingMap.get(key);

    if (existing) {
      duplicates.push({
        newEmpresa: mapped,
        existingEmpresa: existing.empresa,
        municipioId: existing.municipioId,
        municipioNombre: existing.municipioNombre,
      });
    } else {
      added.push(mapped);
      // Registrar en mapa temporal para evitar duplicados repetidos dentro del mismo Excel
      existingMap.set(key, { empresa: mapped, municipioId: mapped.matchedMunicipioId, municipioNombre: mapped.matchedMunicipioNombre });
    }

    if (mapped.needsReview) {
      needsReviewList.push(mapped);
    }

    parsedEmpresas.push(mapped);
  });

  return {
    totalFilas: rawRows.length,
    parsedEmpresas,
    added,
    duplicates,
    needsReviewList,
  };
}
