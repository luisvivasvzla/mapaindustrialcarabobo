import * as XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sampleData = [
  {
    'RIF Compañía': 'J-00032541-2',
    'Razón Social': 'Alimentos Industriales del Centro C.A.',
    'Año Fundación': 1974,
    'Dirección Fiscal': 'Avenida Michelena, Zona Industrial Este, Parcela 12',
    'Nombre Establecimiento': 'Planta Procesadora Michelena',
    'Fecha Apertura': '1976-05-20',
    'Email Principal': 'ventas@alimentoscentro.com.ve',
    'Teléfono 1': '0241-8345566',
    'Teléfono 2': '0241-8345577',
    'Estado': 'Carabobo',
    'Municipio': 'Valencia',
    'Parroquia': 'San Blas',
    'Dirección Detallada': 'Zona Industrial Michelena, Calle Norte 3',
    'Latitud': 10.1650,
    'Longitud': -67.9890,
    'Nº Obreros': 210,
    'Nº Empleados': 65,
    'Nº Directivos': 12,
    'Total Empleados': 287,
    'Sección CAEV': 'C',
    'División CAEV': 10,
    'Clase CAEV': '1071',
    'Productos': 'Harina de trigo, pastas alimenticias y galletas fortificadas',
    'Marcas': 'Pastas del Centro, Harina Cristal',
    'Procesos Productivos': 'Molienda de trigo durum, extrusión de masa, horneado y empaque automatizado',
    'Gremios': 'CIEC, CAVIDEA',
  },
  {
    'RIF Compañía': 'J-30114589-0',
    'Razón Social': 'Química Industrial de Carabobo S.A.',
    'Año Fundación': 1991,
    'Dirección Fiscal': 'Carretera Nacional Guacara-Los Guayos, Km 5',
    'Nombre Establecimiento': 'Complejo Químico Guacara',
    'Fecha Apertura': '1993-11-10',
    'Email Principal': 'gerencia@quimicacarabobo.ve',
    'Teléfono 1': '0245-5623344',
    'Teléfono 2': '0245-5623355',
    'Estado': 'Carabobo',
    'Municipio': 'Guacara',
    'Parroquia': 'Ciudad Alianza',
    'Dirección Detallada': 'Zona Industrial El Tigre, Avenida 2, Galpón 8',
    'Latitud': 10.2310,
    'Longitud': -67.8820,
    'Nº Obreros': 85,
    'Nº Empleados': 30,
    'Nº Directivos': 6,
    'Total Empleados': 121,
    'Sección CAEV': 'C',
    'División CAEV': 20,
    'Clase CAEV': '2011',
    'Productos': 'Solventes industriales, resinas sintéticas y diluyentes para pintura',
    'Marcas': 'ResinCar, SolvIndustrial',
    'Procesos Productivos': 'Destilación fraccionada, polimerización en reactores y envasado en tambores',
    'Gremios': 'CIEC, ASOQUIM',
  },
  {
    'RIF Compañía': 'J-07554321-9',
    'Razón Social': 'Metalúrgica y Autopartes del Litoral C.A.',
    'Año Fundación': 1982,
    'Dirección Fiscal': 'Sector Santa Rosa, Vía Refinería, Puerto Cabello',
    'Nombre Establecimiento': 'Planta Ensamblaje y Mecanizado Puerto Cabello',
    'Fecha Apertura': '1984-02-14',
    'Email Principal': 'operaciones@autoparteslitoral.com',
    'Teléfono 1': '0242-3641200',
    'Teléfono 2': '0242-3641201',
    'Estado': 'Carabobo',
    'Municipio': 'Puerto Cabello',
    'Parroquia': 'Bartolomé Salom',
    'Dirección Detallada': 'Avenida La Marina frente al muelle 12',
    'Latitud': 10.4720,
    'Longitud': -68.0250,
    'Nº Obreros': 140,
    'Nº Empleados': 35,
    'Nº Directivos': 7,
    'Total Empleados': 182,
    'Sección CAEV': 'C',
    'División CAEV': 29,
    'Clase CAEV': '2930',
    'Productos': 'Ejes de transmisión, ballestas y amortiguadores para transporte pesado',
    'Marcas': 'LitoralHeavy, SuspenCar',
    'Procesos Productivos': 'Forja en caliente, maquinado CNC, templado térmico y pruebas dinamométricas',
    'Gremios': 'CIEC, FAVENPA',
  }
];

const ws = XLSX.utils.json_to_sheet(sampleData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Afiliados CIEC');

const outPath = path.join(__dirname, '..', 'public', 'ejemplo_reporte_ciec.xlsx');
XLSX.writeFile(wb, outPath);
console.log('✓ Archivo de prueba generado en:', outPath);
