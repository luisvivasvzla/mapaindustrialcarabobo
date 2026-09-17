import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';

// Asegurar global L antes de que cargue markercluster
if (typeof window !== 'undefined') {
  window.L = L;
}
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import initialMunicipios from '../data/municipios.json';
import { SECTORES, getEstadoStyle, isCoordenadaVerificada } from './constants/sectores';
import { normalizeText } from './utils/text';
import TopBarControls from './components/TopBarControls';
import MunicipioDrawer from './components/MunicipioDrawer';
import MapDisclaimer from './components/MapDisclaimer';

// Coordenadas oficiales de Carabobo (Sección 4 del brief):
// 9°48'52"–10°35'26" N, 67°30'53"–68°25'25" O
const CARABOBO_BOUNDS = [
  [9.814444, -68.423611], // Suroeste
  [10.590556, -67.514722], // Noreste
];

// Helper para crear icono de municipio (círculo hueco ámbar)
function createMunicipioIcon(nombre, isDimmed = false) {
  return L.divIcon({
    className: `custom-municipio-icon-wrapper ${isDimmed ? 'is-dimmed' : ''}`,
    html: `
      <div class="custom-municipio-marker" title="Municipio ${nombre}">
        <div class="municipio-ring-pulse"></div>
        <div class="municipio-ring-core"></div>
        <span class="municipio-pin-label">${nombre}</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

// Helper para crear icono de empresa con color de sector
function createEmpresaIcon(sectorKey) {
  const sec = SECTORES[sectorKey] || { color: '#94a3b8' };
  return L.divIcon({
    className: 'custom-empresa-icon-wrapper',
    html: `
      <div class="custom-empresa-marker" style="--sector-color: ${sec.color};">
        <div class="empresa-marker-dot"></div>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
}

// Helper para crear icono temporal
function createTempPickerIcon() {
  return L.divIcon({
    className: 'custom-temp-picker-wrapper',
    html: `
      <div class="temp-picker-pin">
        <div class="picker-pulse"></div>
        <div class="picker-core">📍</div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
  });
}

// Helper para el popup de Leaflet de empresa
function createEmpresaPopupHTML(emp, municipio) {
  const sec = SECTORES[emp.sector] || { label: emp.sector, color: '#94a3b8' };
  const estadoStyle = getEstadoStyle(emp.estado);
  const verificada = isCoordenadaVerificada(emp.id);

  return `
    <div class="empresa-popup-card">
      <div class="popup-badges-row">
        <span class="popup-sector-badge" style="background-color: ${sec.color}22; color: ${sec.color}; border-color: ${sec.color}55;">
          <span class="popup-dot" style="background-color: ${sec.color};"></span>
          ${sec.label}
        </span>
        <span class="popup-estado-badge" style="background-color: ${estadoStyle.bg}; color: ${estadoStyle.text}; border-color: ${estadoStyle.border};">
          ${emp.estado}
        </span>
        <span class="popup-precision-badge ${verificada ? 'is-verified' : 'is-approx'}" title="${verificada ? 'Ubicación verificada en fuentes públicas' : 'Aproximación a zona/parque industrial'}">
          ${verificada ? '✓ Verificada' : '~ Aprox. zona'}
        </span>
      </div>

      <h3 class="popup-empresa-name">${emp.n}</h3>
      <p class="popup-municipio-ref">Municipio ${municipio.nombre}</p>

      ${emp.nota ? `<p class="popup-desc">${emp.nota}</p>` : ''}

      <div class="popup-footer">
        <span class="popup-coords">${emp.lat.toFixed(4)}, ${emp.lon.toFixed(4)}</span>
        <button 
          class="popup-btn-quitar" 
          type="button" 
          data-empresa-id="${emp.id}" 
          data-municipio-id="${municipio.id}"
          title="Eliminar esta empresa del dataset"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Quitar
        </button>
      </div>
    </div>
  `;
}

export default function App() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const clusterGroupRef = useRef(null);
  const municipiosLayerRef = useRef(null);
  const tempMarkerRef = useRef(null);

  // Dataset en memoria
  const [municipios, setMunicipios] = useState(initialMunicipios);
  const [selectedMunicipio, setSelectedMunicipio] = useState(null);

  // Estados de filtrado
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modo de ubicación en el mapa
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [pickedCoords, setPickedCoords] = useState(null);
  const isPickingRef = useRef(false);
  isPickingRef.current = isPickingLocation;

  // Cargar datos persistidos desde el backend al montar
  useEffect(() => {
    fetch('/api/municipios')
      .then((res) => {
        if (!res.ok) throw new Error('Error al consultar /api/municipios');
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setMunicipios(data);
          console.log('[Persistencia] Datos cargados desde el backend:', data.length, 'municipios');
        }
      })
      .catch((err) => {
        console.warn('[Persistencia] Usando dataset local inicial:', err.message);
      });
  }, []);

  // Función para persistir cambios en disco mediante PUT /api/municipios
  const persistChanges = async (newDataset) => {
    try {
      const res = await fetch('/api/municipios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDataset),
      });
      const data = await res.json();
      console.log('[Persistencia] Éxito al guardar en disco:', data);
    } catch (err) {
      console.error('[Persistencia Error] No se pudo guardar en disco:', err);
    }
  };

  // Requerimiento: Agregar empresa a un municipio
  const handleAddEmpresa = (municipioId, nuevaEmpData) => {
    const nuevaEmpresa = {
      id: `e_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ...nuevaEmpData,
    };

    const updatedMunicipios = municipios.map((m) => {
      if (m.id !== municipioId) return m;

      const updatedEmpresas = [...(m.empresas || []), nuevaEmpresa];
      const updatedSectores = m.sectores?.includes(nuevaEmpresa.sector)
        ? m.sectores
        : [...(m.sectores || []), nuevaEmpresa.sector];

      return {
        ...m,
        sectores: updatedSectores,
        empresas: updatedEmpresas,
      };
    });

    setMunicipios(updatedMunicipios);

    if (selectedMunicipio && selectedMunicipio.id === municipioId) {
      const refreshed = updatedMunicipios.find((m) => m.id === municipioId);
      setSelectedMunicipio(refreshed);
    }

    if (tempMarkerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(tempMarkerRef.current);
      tempMarkerRef.current = null;
    }
    setPickedCoords(null);
    setIsPickingLocation(false);

    persistChanges(updatedMunicipios);
  };

  // Requerimiento: Quitar empresa
  const handleDeleteEmpresa = useCallback((empresaId, municipioIdOpt = null) => {
    setMunicipios((prev) => {
      const updatedMunicipios = prev.map((m) => {
        if (municipioIdOpt && m.id !== municipioIdOpt) return m;
        const exists = m.empresas?.some((e) => e.id === empresaId);
        if (!exists) return m;

        const filteredEmpresas = m.empresas.filter((e) => e.id !== empresaId);
        return {
          ...m,
          empresas: filteredEmpresas,
        };
      });

      setSelectedMunicipio((current) => {
        if (!current) return null;
        return updatedMunicipios.find((m) => m.id === current.id) || null;
      });

      persistChanges(updatedMunicipios);
      return updatedMunicipios;
    });

    if (mapInstanceRef.current) {
      mapInstanceRef.current.closePopup();
    }
  }, []);

  // Manejador al seleccionar una dirección geocodificada de Nominatim
  const handleSelectGeocodedLocation = ({ lat, lon, displayName }) => {
    setPickedCoords({ lat, lon });
    setIsPickingLocation(false);

    const map = mapInstanceRef.current;
    if (!map) return;

    map.flyTo([lat, lon], 15, {
      duration: 1.2,
      animate: true,
    });

    if (tempMarkerRef.current) {
      tempMarkerRef.current.setLatLng([lat, lon]);
    } else {
      tempMarkerRef.current = L.marker([lat, lon], {
        icon: createTempPickerIcon(),
        zIndexOffset: 1000,
      }).addTo(map);
    }

    const shortLabel = displayName.split(',').slice(0, 2).join(',');
    tempMarkerRef.current
      .bindPopup(
        `<div style="font-size:12px; font-weight:700; color:#38bdf8;">📍 Ubicación Geocodificada</div>
         <div style="font-size:11px; color:#cbd5e1; margin-top:2px; line-height:1.3;">${shortLabel}</div>`,
        { offset: [0, -22] }
      )
      .openPopup();
  };

  const totalRealMunicipios = municipios.length;
  const totalRealEmpresas = useMemo(() => {
    return municipios.reduce((acc, m) => acc + (m.empresas?.length || 0), 0);
  }, [municipios]);

  const handleToggleSector = (sectorKey) => {
    setSelectedSectors((prev) => {
      if (prev.includes(sectorKey)) {
        return prev.filter((k) => k !== sectorKey);
      } else {
        return [...prev, sectorKey];
      }
    });
  };

  const handleClearFilters = () => {
    setSelectedSectors([]);
    setSearchQuery('');
  };

  // Inicialización del Mapa
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      minZoom: 8,
      maxZoom: 18,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    map.fitBounds(CARABOBO_BOUNDS, {
      padding: [40, 40],
      animate: false,
    });

    const municipiosLayer = L.layerGroup().addTo(map);
    municipiosLayerRef.current = municipiosLayer;

    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 40,
      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        let sizeClass = 'small';
        if (count > 5) sizeClass = 'medium';
        if (count > 10) sizeClass = 'large';

        return L.divIcon({
          html: `<div class="custom-cluster-marker cluster-${sizeClass}"><span>${count}</span></div>`,
          className: 'custom-cluster-wrapper',
          iconSize: L.point(38, 38),
        });
      },
    });
    clusterGroup.addTo(map);
    clusterGroupRef.current = clusterGroup;

    map.on('click', (e) => {
      if (isPickingRef.current) {
        const { lat, lng } = e.latlng;
        setPickedCoords({ lat, lon: lng });
        setIsPickingLocation(false);

        if (tempMarkerRef.current) {
          tempMarkerRef.current.setLatLng([lat, lng]);
        } else {
          tempMarkerRef.current = L.marker([lat, lng], {
            icon: createTempPickerIcon(),
            zIndexOffset: 1000,
          }).addTo(map);
        }
      }
    });

    const mapContainer = mapContainerRef.current;
    const onContainerClick = (e) => {
      const quitarBtn = e.target.closest('.popup-btn-quitar');
      if (quitarBtn) {
        const empId = quitarBtn.getAttribute('data-empresa-id');
        const munId = quitarBtn.getAttribute('data-municipio-id');
        if (empId) {
          handleDeleteEmpresa(empId, munId);
        }
      }
    };
    mapContainer.addEventListener('click', onContainerClick);

    mapInstanceRef.current = map;

    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      mapContainer.removeEventListener('click', onContainerClick);
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [handleDeleteEmpresa]);

  // Filtrado y renderizado dinámico
  const filteredEmpresasCount = useMemo(() => {
    const map = mapInstanceRef.current;
    if (!map || !clusterGroupRef.current || !municipiosLayerRef.current) return 0;

    municipiosLayerRef.current.clearLayers();
    clusterGroupRef.current.clearLayers();

    const normQuery = normalizeText(searchQuery);
    const hasSectorFilter = selectedSectors.length > 0;
    const hasSearchFilter = normQuery.length > 0;
    const hasAnyFilter = hasSectorFilter || hasSearchFilter;

    let matchingEmpresasTotal = 0;

    municipios.forEach((m) => {
      const normMunNombre = normalizeText(m.nombre);
      const normMunCapital = normalizeText(m.capital);

      let munHasMatchingEmpresas = false;

      if (Array.isArray(m.empresas)) {
        m.empresas.forEach((emp) => {
          const sec = SECTORES[emp.sector] || { label: emp.sector };
          const normEmpName = normalizeText(emp.n);
          const normSectorLabel = normalizeText(sec.label);
          const normSectorKey = normalizeText(emp.sector);
          const normNota = normalizeText(emp.nota);

          const matchSector = !hasSectorFilter || selectedSectors.includes(emp.sector);
          const matchText = !hasSearchFilter || (
            normEmpName.includes(normQuery) ||
            normMunNombre.includes(normQuery) ||
            normMunCapital.includes(normQuery) ||
            normSectorLabel.includes(normQuery) ||
            normSectorKey.includes(normQuery) ||
            normNota.includes(normQuery)
          );

          const isCompanyMatch = matchSector && matchText;

          if (isCompanyMatch) {
            matchingEmpresasTotal++;
            munHasMatchingEmpresas = true;

            if (typeof emp.lat === 'number' && typeof emp.lon === 'number') {
              const empMarker = L.marker([emp.lat, emp.lon], {
                icon: createEmpresaIcon(emp.sector),
                title: `${emp.n} (${m.nombre})`,
              });

              const popupContent = createEmpresaPopupHTML(emp, m);
              empMarker.bindPopup(popupContent, {
                maxWidth: 340,
                className: 'custom-leaflet-popup',
              });

              clusterGroupRef.current.addLayer(empMarker);
            }
          }
        });
      }

      if (typeof m.lat !== 'number' || typeof m.lon !== 'number') return;

      const munNameMatchesSearch = hasSearchFilter && (
        normMunNombre.includes(normQuery) ||
        normMunCapital.includes(normQuery)
      );

      const shouldDimMunicipio = hasAnyFilter && !munHasMatchingEmpresas && !munNameMatchesSearch;

      const munMarker = L.marker([m.lat, m.lon], {
        icon: createMunicipioIcon(m.nombre, shouldDimMunicipio),
        title: `Municipio ${m.nombre} (Capital: ${m.capital})`,
        zIndexOffset: shouldDimMunicipio ? 10 : 60,
        opacity: shouldDimMunicipio ? 0.35 : 1.0,
      });

      munMarker.on('click', () => {
        setSelectedMunicipio(m);
      });

      municipiosLayerRef.current.addLayer(munMarker);
    });

    return matchingEmpresasTotal;
  }, [municipios, selectedSectors, searchQuery]);

  return (
    <main className={`map-app-container ${isPickingLocation ? 'is-in-picking-mode' : ''}`}>
      {/* Controles superiores */}
      <TopBarControls
        totalEmpresas={totalRealEmpresas}
        totalMunicipios={totalRealMunicipios}
        filteredEmpresasCount={filteredEmpresasCount}
        selectedSectors={selectedSectors}
        onToggleSector={handleToggleSector}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearFilters={handleClearFilters}
      />

      {/* Banner flotante de aviso */}
      {isPickingLocation && (
        <div className="map-picking-banner" role="alert">
          <div className="banner-content">
            <span className="banner-pulse"></span>
            <span>Haz clic directamente sobre el mapa para capturar las coordenadas de la empresa</span>
          </div>
          <button
            type="button"
            className="btn-cancel-picking"
            onClick={() => setIsPickingLocation(false)}
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Viewport del Mapa Leaflet */}
      <div 
        ref={mapContainerRef} 
        id="map" 
        className="map-viewport"
        aria-label="Mapa interactivo del estado Carabobo"
      />

      {/* Nota visible de rigor y precisión de coordenadas */}
      <MapDisclaimer />

      {/* Panel lateral del Municipio seleccionado */}
      <MunicipioDrawer 
        municipio={selectedMunicipio} 
        onClose={() => {
          setSelectedMunicipio(null);
          setIsPickingLocation(false);
          if (tempMarkerRef.current && mapInstanceRef.current) {
            mapInstanceRef.current.removeLayer(tempMarkerRef.current);
            tempMarkerRef.current = null;
          }
        }}
        onAddEmpresa={handleAddEmpresa}
        onDeleteEmpresa={handleDeleteEmpresa}
        isPickingLocation={isPickingLocation}
        onTogglePickingLocation={() => setIsPickingLocation((prev) => !prev)}
        pickedCoords={pickedCoords}
        onSelectGeocodedLocation={handleSelectGeocodedLocation}
      />
    </main>
  );
}
