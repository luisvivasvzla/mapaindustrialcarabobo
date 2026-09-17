import * as XLSX from 'xlsx';
import { processImportData, mapRowToEmpresa } from '../src/utils/importer.js';

console.log('--- Iniciando Test de Importación CIEC (26 Columnas) ---');

// Fila de prueba con las 26 columnas exactas del reporte real de la CIEC
const testRow = {
  'RIF Compañía': 'J-00012345-6',
  'Razón Social': 'Manufacturas Industriales Carabobo C.A.',
  'Año Fundación': 1985,
  'Dirección Fiscal': 'Avenida Henry Ford, Edificio Centro Industrial, Piso 2',
  'Nombre Establecimiento': 'Planta Metalmecánica Valencia',
  'Fecha Apertura': '1988-03-15',
  'Email Principal': 'contacto@manufacturascarabobo.com.ve',
  'Teléfono 1': '0241-8321122',
  'Teléfono 2': '0241-8329988',
  'Estado': 'Carabobo',
  'Municipio': 'Valencia',
  'Parroquia': 'Rafael Urdaneta',
  'Dirección Detallada': 'Zona Industrial Sur, Parcela 44, Calle C',
  'Latitud': 10.1520,
  'Longitud': -67.9740,
  'Nº Obreros': 120,
  'Nº Empleados': 45,
  'Nº Directivos': 8,
  'Total Empleados': 173,
  'Sección CAEV': 'C',
  'División CAEV': 25,
  'Clase CAEV': '2511',
  'Productos': 'Estructuras metálicas, tuberías de acero y perfiles industriales',
  'Marcas': 'Metalcara, Tuberías del Centro',
  'Procesos Productivos': 'Corte por plasma, conformado en frío, soldadura robótica',
  'Gremios': 'Cámara de Industriales de Carabobo (CIEC), AIMM',
};

const knownMunicipios = [
  { id: 'val', nombre: 'Valencia', empresas: [] },
  { id: 'gua', nombre: 'Guacara', empresas: [] },
];

// 1. Mapeo directo de fila
const mapped = mapRowToEmpresa(testRow, knownMunicipios);

console.log('1. Verificando campos de primer nivel:');
const expectedCols = [
  'RIF Compañía', 'Razón Social', 'Año Fundación', 'Dirección Fiscal',
  'Nombre Establecimiento', 'Fecha Apertura', 'Email Principal', 'Teléfono 1',
  'Teléfono 2', 'Estado', 'Municipio', 'Parroquia', 'Dirección Detallada',
  'Latitud', 'Longitud', 'Nº Obreros', 'Nº Empleados', 'Nº Directivos',
  'Total Empleados', 'Sección CAEV', 'División CAEV', 'Clase CAEV', 'Productos',
  'Marcas', 'Procesos Productivos', 'Gremios'
];

let allExactFound = true;
expectedCols.forEach((col) => {
  if (mapped[col] === undefined) {
    console.error(`❌ Columna exacta faltante en primer nivel: "${col}"`);
    allExactFound = false;
  }
});

if (allExactFound) {
  console.log('✓ Las 26 columnas exactas existen como campos de primer nivel.');
}

console.log('2. Verificando campos camelCase y clasificación:');
console.log('   - ID:', mapped.id);
console.log('   - Nombre (n):', mapped.n);
console.log('   - RIF:', mapped.rif);
console.log('   - Sector clasificado:', mapped.sector);
console.log('   - Total Empleados:', mapped.totalEmpleados);
console.log('   - Marcas:', mapped.marcas);
console.log('   - Municipio emparejado:', mapped.matchedMunicipioNombre, `(${mapped.matchedMunicipioId})`);

if (mapped.sector === 'auto' && mapped.matchedMunicipioId === 'val' && mapped.totalEmpleados === 173) {
  console.log('✓ Clasificación de sector y municipio funcionando con éxito.');
} else {
  console.error('❌ Error en sector o municipio emparejado.');
}

// 2. Creación de un buffer XLSX en memoria y prueba con processImportData
const ws = XLSX.utils.json_to_sheet([testRow]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Empresas CIEC');
const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

const result = processImportData(excelBuffer, knownMunicipios, knownMunicipios);
console.log('3. Resultado de processImportData desde Excel real:');
console.log('   - Total filas leídas:', result.totalFilas);
console.log('   - Empresas agregadas:', result.added.length);
console.log('   - Duplicados:', result.duplicates.length);
console.log('   - Requieren revisión:', result.needsReviewList.length);

if (result.added.length === 1 && result.added[0]['Marcas'] === 'Metalcara, Tuberías del Centro') {
  console.log('✓ Test de lectura y procesamiento de archivo Excel completado con éxito!');
} else {
  console.error('❌ Falló la prueba de procesamiento de archivo Excel.');
}
