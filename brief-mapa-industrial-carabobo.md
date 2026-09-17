# Brief técnico: Mapa Industrial Interactivo de Carabobo (con mapa real)

## 1. Objetivo

Construir una aplicación web interactiva de "Mapa Industrial del Estado Carabobo" (Venezuela) que muestre municipios, sectores productivos y empresas/instalaciones industriales ubicadas sobre un **mapa real** (tiles de OpenStreetMap, Mapbox o Google Maps — no un dibujo esquemático), con capacidad de agregar y quitar empresas desde la propia interfaz.

Ya existe una primera versión funcional (ver sección 5) construida como página HTML autocontenida con un mapa **vectorial** georreferenciado (coordenadas reales, pero dibujado a mano, sin tiles reales), porque el entorno donde se creó no permite cargar mapas de teselas en vivo por restricciones de red del navegador integrado (CSP). Ese es exactamente el límite que se busca superar en Antigravity: aquí sí se puede usar una librería de mapas con tiles reales.

## 2. Alcance funcional (debe conservarse igual o mejor que la v1)

- Mapa real, navegable (pan/zoom), centrado en el estado Carabobo, Venezuela.
- Un marcador por **municipio** (14 municipios) en la coordenada de su capital, y un marcador por **empresa/instalación** en su coordenada real (o aproximada cuando no se conoce la dirección exacta).
- Clic en un marcador de empresa → tarjeta/popup con: nombre, sector, estado operativo (Activa / Operación parcial / Paralizada / Cerrada / Sin datos), descripción, coordenadas.
- Clic en un marcador de municipio → panel lateral con: resumen del municipio, sectores presentes, lista de empresas, y formulario para **agregar una nueva empresa**.
- Formulario "agregar empresa": nombre, sector (selección de una lista fija de 7 sectores), estado operativo, descripción libre, y ubicación — idealmente permitiendo elegir la ubicación **haciendo clic directamente sobre el mapa real** (soltar un pin) además de poder escribir lat/lon a mano o buscar una dirección (geocoding).
- Botón para **quitar** una empresa ya registrada.
- Filtro por sector (chips/leyenda con 7 colores, multi-selección) que resalta/oculta marcadores.
- Buscador de texto libre (nombre de empresa, municipio o sector).
- Contador de empresas y municipios.
- Los cambios (agregar/quitar empresa) deben **persistir** — no perderse al recargar.

## 3. Stack sugerido para Antigravity

- **Mapa:** Leaflet.js + tiles de OpenStreetMap (gratis, sin API key) como opción por defecto; alternativamente Google Maps JavaScript API o Mapbox GL JS si el usuario prefiere ese estilo visual (requieren API key propia).
- **Geocoding** (para buscar una dirección y convertirla a lat/lon al agregar una empresa): Nominatim (OSM, gratis) o Google Geocoding API.
- **Persistencia:** un archivo `data/municipios.json` (mismo esquema que la sección 4) leído/escrito por un backend simple (Node/Express, o un archivo JSON editado directamente si es una app local), o una base de datos ligera (SQLite) si se prefiere.
- **Frontend:** puede ser HTML/JS plano (como la v1) o un framework (React/Vue) si el agente lo prefiere — no es un requisito duro, lo importante es conservar la funcionalidad de la sección 2.

## 4. Modelo de datos

Cada municipio es un objeto con esta forma:

```json
{
  "id": "val",
  "nombre": "Valencia",
  "capital": "Valencia",
  "lat": 10.1621,
  "lon": -68.0077,
  "sectores": ["auto", "petro", "alim", "farma", "textil"],
  "resumen": "Texto descriptivo del municipio…",
  "empresas": [
    {
      "id": "e6",
      "n": "GM Venezolana (Chevrolet)",
      "sector": "auto",
      "estado": "Operación muy limitada",
      "nota": "Planta de ensamblaje automotriz.",
      "lat": 10.1450,
      "lon": -67.9850
    }
  ]
}
```

Catálogo fijo de 7 sectores (clave → etiqueta):

| clave | etiqueta |
|---|---|
| petro | Petróleo y petroquímica |
| auto | Automotriz y metalmecánica |
| alim | Alimentos y bebidas |
| farma | Farmacéutica y química |
| textil | Textil y manufactura liviana |
| agro | Agroindustria |
| energia | Energía, puerto y logística |

Recuadro geográfico real del estado (para centrar/ajustar el mapa): 9°48'52"–10°35'26" N, 67°30'53"–68°25'25" O.

## 5. Dataset actual completo (JSON)

Úsalo tal cual como semilla inicial de datos — ya tiene los 14 municipios y las empresas cargadas hasta ahora, cada una con lat/lon real o aproximada:

```json
[
  {"id":"jjm","nombre":"Juan José Mora","capital":"Morón","lat":10.4842,"lon":-68.2042,
   "sectores":["petro","energia"],
   "resumen":"Alberga el Complejo Petroquímico Morón (hoy Complejo Petroquímico \"Hugo Chávez\") de Pequiven, en operación desde 1956, uno de los tres grandes complejos petroquímicos del país.",
   "empresas":[
     {"id":"e1","n":"Complejo Petroquímico Morón (Pequiven)","sector":"petro","estado":"Activa (capacidad reducida)","nota":"Fertilizantes nitrogenados y fosfatados, ácido sulfúrico, cloro-soda; ~2.190 ha, a 30 km de Puerto Cabello.","lat":10.4870,"lon":-68.2020},
     {"id":"e2","n":"Ferralca (Ferro-Aluminio, C.A.)","sector":"petro","estado":"Activa","nota":"Ex empresa mixta de Pequiven; tratamiento de aguas industriales, capital privado venezolano desde 1976.","lat":10.4850,"lon":-68.2050}
   ]},
  {"id":"pc","nombre":"Puerto Cabello","capital":"Puerto Cabello","lat":10.4806,"lon":-68.0322,
   "sectores":["energia","petro"],
   "resumen":"Eje logístico y energético del estado: alberga el principal puerto comercial de Venezuela, la refinería de mayor capacidad de la región central y la principal planta termoeléctrica del país.",
   "empresas":[
     {"id":"e3","n":"Puerto de Puerto Cabello","sector":"energia","estado":"Activo","nota":"Principal puerto de carga comercial de Venezuela.","lat":10.4740,"lon":-68.0180},
     {"id":"e4","n":"Refinería El Palito (PDVSA)","sector":"petro","estado":"Operación parcial","nota":"Capacidad de diseño de ~140.000 barriles/día; operando muy por debajo de esa cifra en años recientes.","lat":10.3990,"lon":-68.0800},
     {"id":"e5","n":"Planta Centro","sector":"energia","estado":"Activa","nota":"Principal central termoeléctrica del país, contigua a la refinería.","lat":10.4000,"lon":-68.1150}
   ]},
  {"id":"bej","nombre":"Bejuma","capital":"Bejuma","lat":10.1633,"lon":-68.2794,
   "sectores":["agro"],
   "resumen":"Municipio de vocación agrícola en la zona montañosa occidental del estado, con baja industrialización manufacturera.",
   "empresas":[]},
  {"id":"nag","nombre":"Naguanagua","capital":"Naguanagua","lat":10.2264,"lon":-67.9950,
   "sectores":["alim"],
   "resumen":"Municipio predominantemente comercial, de servicios y sede de la Universidad de Carabobo; su presencia industrial manufacturera es menor que la de sus vecinos.",
   "empresas":[]},
  {"id":"val","nombre":"Valencia","capital":"Valencia","lat":10.1621,"lon":-68.0077,
   "sectores":["auto","petro","alim","farma","textil"],
   "resumen":"Capital del estado y conocida como la \"capital industrial de Venezuela\": llegó a agrupar unos 39 parques industriales y a concentrar cerca del 40% de la industria del país, con tres grandes ensambladoras automotrices globales. El parque industrial sufre una fuerte contracción desde mediados de la década de 2010.",
   "empresas":[
     {"id":"e6","n":"GM Venezolana (Chevrolet)","sector":"auto","estado":"Operación muy limitada","nota":"Planta de ensamblaje automotriz.","lat":10.1450,"lon":-67.9850},
     {"id":"e7","n":"Ford Motor de Venezuela","sector":"auto","estado":"Cerrada / sin producción","nota":"Ensambla vehículos en Valencia desde 1962; producción muy reducida en años recientes.","lat":10.1480,"lon":-67.9780},
     {"id":"e8","n":"Mack de Venezuela","sector":"auto","estado":"Activa (producción reducida)","nota":"Ensamblaje de camiones pesados; una de las pocas plantas automotrices activas del país.","lat":10.1500,"lon":-67.9750},
     {"id":"e9","n":"FCA / antigua Chrysler","sector":"auto","estado":"Inactiva","nota":"Operaciones históricas de ensamblaje, hoy muy limitadas.","lat":10.1470,"lon":-67.9800},
     {"id":"e10","n":"Sede corporativa de Pequiven","sector":"petro","estado":"Activa","nota":"Sede administrativa de la petroquímica estatal.","lat":10.1620,"lon":-68.0050},
     {"id":"e11","n":"Múltiples zonas industriales (Norte, Sur, La Quizanda, entre otras)","sector":"textil","estado":"Operación parcial","nota":"Alimentos, textil, metalmecánica y química.","lat":10.1400,"lon":-67.9900}
   ]},
  {"id":"sd","nombre":"San Diego","capital":"San Diego","lat":10.2144,"lon":-67.9689,
   "sectores":["textil","alim"],
   "resumen":"Municipio de fuerte desarrollo urbano y comercial contiguo a Valencia; comparte con ella parte del parque industrial más grande del país en la zona de Castillito.",
   "empresas":[
     {"id":"e12","n":"Zona Industrial Castillito","sector":"textil","estado":"Operación parcial","nota":"Parque industrial y comercial compartido con el área metropolitana de Valencia.","lat":10.2200,"lon":-67.9600},
     {"id":"e13","n":"Big Low Center","sector":"textil","estado":"Sin datos recientes","nota":"Zona industrial que, junto a la de Valencia, formó el mayor parque industrial del país.","lat":10.2180,"lon":-67.9720}
   ]},
  {"id":"mon","nombre":"Montalbán","capital":"Montalbán","lat":10.2372,"lon":-68.3239,
   "sectores":["agro"],
   "resumen":"Municipio rural-agrícola, uno de los de menor población y actividad industrial del estado.",
   "empresas":[]},
  {"id":"lib","nombre":"Libertador","capital":"Tocuyito","lat":10.1028,"lon":-68.0761,
   "sectores":["textil","alim"],
   "resumen":"Municipio periférico al sur de Valencia, en crecimiento urbano, con actividad comercial y manufacturera menor.",
   "empresas":[]},
  {"id":"lg","nombre":"Los Guayos","capital":"Los Guayos","lat":10.1928,"lon":-67.9270,
   "sectores":["auto","textil"],
   "resumen":"Parte del corredor industrial oriental de Valencia; concentró fábricas de plástico, metalmecánica y textiles, hoy con una alta tasa de cierre y paralización de plantas.",
   "empresas":[]},
  {"id":"gua","nombre":"Guacara","capital":"Guacara","lat":10.2306,"lon":-67.8814,
   "sectores":["petro","farma"],
   "resumen":"Zona industrial con fuerte componente petroquímico y farmacéutico dentro del corredor industrial oriental de Valencia.",
   "empresas":[
     {"id":"e14","n":"Química Venoco","sector":"petro","estado":"Activa","nota":"Planta de alquilación en operación desde 1969; produce alquilbencenos lineales y ramificados para la industria de detergentes.","lat":10.2330,"lon":-67.8830},
     {"id":"e15","n":"Laboratorios Innova","sector":"farma","estado":"Activa","nota":"Farmacéutica con planta en la zona industrial de Guacara; analgésicos, antipiréticos, antisépticos.","lat":10.2350,"lon":-67.8790},
     {"id":"e16","n":"Petrocasa","sector":"textil","estado":"Sin datos recientes","nota":"Planta de viviendas industrializadas prefabricadas.","lat":10.2280,"lon":-67.8850}
   ]},
  {"id":"mir","nombre":"Miranda","capital":"Miranda","lat":10.1300,"lon":-68.2500,
   "sectores":["agro"],
   "resumen":"Municipio pequeño de vocación agropecuaria, con escasa industria registrada.",
   "empresas":[]},
  {"id":"ca","nombre":"Carlos Arvelo","capital":"Güigüe","lat":10.0389,"lon":-67.7756,
   "sectores":["agro"],
   "resumen":"Municipio de vocación agrícola y agroindustrial en la cuenca del Lago de Valencia.",
   "empresas":[]},
  {"id":"sj","nombre":"San Joaquín","capital":"San Joaquín","lat":10.2611,"lon":-67.8511,
   "sectores":["alim","textil"],
   "resumen":"Zona industrial del corredor oriental de Valencia; su actividad económica ha caído de forma marcada en la última década, con fuerte impacto en el comercio local dependiente de sus trabajadores.",
   "empresas":[]},
  {"id":"di","nombre":"Diego Ibarra","capital":"Mariara","lat":10.2467,"lon":-67.7381,
   "sectores":["auto","farma"],
   "resumen":"Posee su propia zona industrial, golpeada en años recientes por el deterioro de las vías de acceso y la infraestructura circundante.",
   "empresas":[]}
]
```

## 6. Notas importantes de exactitud (para no perder rigor al migrar)

- Las coordenadas de refinería El Palito, el puerto de Puerto Cabello, Planta Centro y el complejo petroquímico de Morón están razonablemente bien ubicadas (fuentes públicas verificadas).
- El resto de las coordenadas de empresas son **aproximaciones** a su zona/parque industrial conocido, no direcciones exactas verificadas — el agente debería, idealmente, permitir refinarlas fácilmente (arrastrando el pin o re-geocodificando) y no presentarlas como definitivas.
- Municipios de vocación agrícola (Bejuma, Montalbán, Miranda, Carlos Arvelo) tienen poca o ninguna industria documentada en fuentes públicas — está reflejado en el dataset (`empresas: []`), no es un vacío de carga de datos.

## 7. Petición concreta para el agente de Antigravity

1. Crear la app (mapa real con Leaflet/OSM u otra librería equivalente) usando el dataset de la sección 5 como estado inicial.
2. Implementar todas las interacciones de la sección 2.
3. Implementar persistencia real (archivo o base de datos) para que agregar/quitar empresas sobreviva a un refresh.
4. Mantener el catálogo de 7 sectores y sus colores como filtro.
5. (Opcional pero deseable) Añadir geocoding para buscar una dirección al agregar una empresa, en vez de depender solo del clic en el mapa o de coordenadas manuales.
