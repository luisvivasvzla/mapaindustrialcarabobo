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
import { normalizeText, formatShortCompanyName } from './utils/text';
import TopBarControls from './components/TopBarControls';
import MunicipioDrawer from './components/MunicipioDrawer';
import MapDisclaimer from './components/MapDisclaimer';
import ImportModal from './components/ImportModal';
import VerificationBatchModal from './components/VerificationBatchModal';
import HomeScreen from './components/HomeScreen';
import ResetDatasetModal from './components/ResetDatasetModal';
import AutoImportModal from './components/AutoImportModal';

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

// Helper para crear icono de empresa con color de sector e indicador de verificación / advertencia
function createEmpresaIcon(sectorKey, isVerificada = false, hasWarning = false) {
  const sec = SECTORES[sectorKey] || { color: '#94a3b8' };
  return L.divIcon({
    className: `custom-empresa-icon-wrapper ${isVerificada ? 'is-verified' : 'is-unverified'} ${hasWarning ? 'has-coord-warning' : ''}`,
    html: `
      <div class="custom-empresa-marker" style="--sector-color: ${sec.color};">
        <div class="empresa-marker-dot"></div>
        ${isVerificada 
          ? '<span class="marker-badge-verified" title="Ubicación verificada">✓</span>' 
          : '<span class="marker-badge-unverified" title="Ubicación sin verificar">⚠</span>'}
        ${hasWarning ? '<span class="marker-badge-warning-flag" title="Coordenada dudosa o fuera de Carabobo">⚠️</span>' : ''}
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -16],
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
  const verificada = isCoordenadaVerificada(emp);

  const empRif = emp.rif || emp['RIF Compañía'];
  const empRazon = emp.razonSocial || emp['Razón Social'];
  const empTotalEmp = emp.totalEmpleados ?? emp['Total Empleados'];
  const empProductos = emp.productos || emp['Productos'];
  const empMarcas = emp.marcas || emp['Marcas'];
  const empGremios = emp.gremios || emp['Gremios'];

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
        <span class="popup-verif-badge ${verificada ? 'is-verified' : 'is-unverified'}" title="${verificada ? 'Ubicación verificada' : 'Ubicación sin verificar'}">
          ${verificada ? '✓ Verificada' : '⚠ Sin verificar'}
        </span>
        ${emp.coordWarning ? `<span class="popup-warning-badge" title="${emp.coordReviewReason || 'Coordenada dudosa'}">⚠️ Coord. dudosa</span>` : ''}
      </div>

      <h3 class="popup-empresa-name">${emp.n}</h3>
      ${empRazon && empRazon !== emp.n ? `<p class="popup-razon-sub">${empRazon}</p>` : ''}
      <p class="popup-municipio-ref">Municipio ${municipio.nombre}</p>

      ${empRif ? `<div class="popup-info-pill-row"><span class="popup-pill-rif">RIF: ${empRif}</span>${empTotalEmp ? `<span class="popup-pill-emp">👥 ${empTotalEmp} empleados</span>` : ''}</div>` : ''}

      ${emp.nota ? `<p class="popup-desc">${emp.nota}</p>` : ''}
      ${empMarcas ? `<p class="popup-meta-line"><strong>Marcas:</strong> ${empMarcas}</p>` : ''}
      ${empProductos ? `<p class="popup-meta-line"><strong>Productos:</strong> ${empProductos}</p>` : ''}
      ${empGremios ? `<p class="popup-meta-line"><strong>Gremios:</strong> ${empGremios}</p>` : ''}

      <div class="popup-actions-bar">
        <button
          class="popup-btn-ver-ficha"
          type="button"
          data-empresa-id="${emp.id}"
          data-municipio-id="${municipio.id}"
          title="Abrir panel lateral con la Ficha Técnica Completa (26 columnas CIEC)"
        >
          📋 Ver Ficha Completa
        </button>
      </div>

      <div class="popup-footer">
        <span class="popup-coords">${typeof emp.lat === 'number' ? `${emp.lat.toFixed(4)}, ${emp.lon.toFixed(4)}` : 'Sin coord.'}</span>
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

// Helper para el tooltip de hover compacto de empresa (vista previa rápida)
function createEmpresaHoverHTML(emp, municipio, isTouch = false) {
  const sec = SECTORES[emp.sector] || { label: emp.sector || 'General', color: '#94a3b8' };
  const estadoStyle = getEstadoStyle(emp.estado);
  const verificada = isCoordenadaVerificada(emp);

  return `
    <div class="empresa-hover-card">
      <div class="hover-card-title">${emp.n}</div>
      <div class="hover-card-row">
        <span class="hover-sector-dot" style="background-color: ${sec.color};"></span>
        <span class="hover-sector-label" style="color: ${sec.color};">${sec.label}</span>
      </div>
      <div class="hover-card-row">
        <span class="hover-estado-badge" style="background-color: ${estadoStyle.bg}; color: ${estadoStyle.text}; border-color: ${estadoStyle.border};">
          ${emp.estado || 'Sin datos'}
        </span>
        <span class="hover-verif-pill ${verificada ? 'is-verified' : 'is-unverified'}">
          ${verificada ? '✓ Verificada' : '⚠ Sin verificar'}
        </span>
      </div>
      <div class="hover-card-row hover-mun-row">
        <span class="hover-mun-icon">📍</span>
        <span class="hover-mun-name">Municipio ${municipio.nombre}</span>
      </div>
      ${isTouch ? `
        <div class="hover-card-touch-cta">
          <button type="button" class="hover-btn-ver-mas" data-empresa-id="${emp.id}" data-municipio-id="${municipio.id}">
            Ver ficha completa →
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

export default function App() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const clusterGroupRef = useRef(null);
  const municipiosLayerRef = useRef(null);
  const tempMarkerRef = useRef(null);
  const empresaMarkersRef = useRef({});
  const hoverTooltipRef = useRef(null);
  const touchActiveEmpresaIdRef = useRef(null);
  const isTouchDeviceRef = useRef(false);

  // Detección de dispositivos táctiles para ajustar comportamiento de hover en móvil
  useEffect(() => {
    const handleTouch = () => {
      isTouchDeviceRef.current = true;
    };
    window.addEventListener('touchstart', handleTouch, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', handleTouch);
  }, []);

  // Pantalla de inicio (se muestra primero antes de entrar al mapa, o si la URL no es #mapa)
  const [isHomeOpen, setIsHomeOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#mapa') {
      return false;
    }
    return true;
  });

  // Escuchar cambios de hash para navegación del navegador (#inicio y #mapa)
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#mapa') {
        setIsHomeOpen(false);
      } else if (window.location.hash === '#inicio' || window.location.hash === '') {
        setIsHomeOpen(true);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleEnterMap = useCallback(() => {
    setIsHomeOpen(false);
    window.location.hash = '#mapa';
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 100);
  }, []);

  const handleOpenHome = useCallback(() => {
    setIsHomeOpen(true);
    window.location.hash = '#inicio';
  }, []);

  const handleSelectEmpresaFromHome = useCallback((empresa, municipio) => {
    setIsHomeOpen(false);
    window.location.hash = '#mapa';
    setSelectedSectors([]);
    setOnlyUnverified(false);
    setSearchQuery('');

    setTimeout(() => {
      const map = mapInstanceRef.current;
      if (!map) return;
      map.invalidateSize();

      if (typeof empresa.lat === 'number' && typeof empresa.lon === 'number' && !isNaN(empresa.lat) && !isNaN(empresa.lon)) {
        map.flyTo([empresa.lat, empresa.lon], 16, { duration: 1.2 });
        setTimeout(() => {
          const cluster = clusterGroupRef.current;
          const marker = empresaMarkersRef.current[empresa.id];
          if (cluster && marker) {
            cluster.zoomToShowLayer(marker, () => {
              marker.openPopup();
            });
          }
        }, 700);
      } else {
        setSelectedMunicipio(municipio);
      }
    }, 150);
  }, []);

  const handleSelectSectorFromHome = useCallback((sectorKey) => {
    setIsHomeOpen(false);
    window.location.hash = '#mapa';
    setSelectedSectors([sectorKey]);
    setOnlyUnverified(false);
    setSearchQuery('');

    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.fitBounds(CARABOBO_BOUNDS, { padding: [40, 40], animate: true });
      }
    }, 150);
  }, []);

  const handleSelectMunicipioFromHome = useCallback((municipio) => {
    setIsHomeOpen(false);
    window.location.hash = '#mapa';
    setSelectedMunicipio(municipio);

    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        if (typeof municipio.lat === 'number' && typeof municipio.lon === 'number') {
          mapInstanceRef.current.flyTo([municipio.lat, municipio.lon], 13, { duration: 1.2 });
        }
      }
    }, 150);
  }, []);

  // Dataset en memoria
  const [municipios, setMunicipios] = useState(initialMunicipios);
  const [selectedMunicipio, setSelectedMunicipio] = useState(null);
  const municipiosRef = useRef(municipios);
  municipiosRef.current = municipios;

  // Estados de filtrado
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modales
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBatchVerifyOpen, setIsBatchVerifyOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isAutoImportOpen, setIsAutoImportOpen] = useState(false);
  const [queueStatus, setQueueStatus] = useState(null);

  // Inspección de discrepancia en mapa
  const [discrepancyInspection, setDiscrepancyInspection] = useState(null);
  const discrepancyLayerRef = useRef(null);

  // Modo de ubicación en el mapa
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [pickedCoords, setPickedCoords] = useState(null);
  const isPickingRef = useRef(false);
  isPickingRef.current = isPickingLocation;

  // Cargar datos persistidos desde el backend al montar o refrescar
  const reloadMunicipios = useCallback(() => {
    fetch('/api/municipios')
      .then((res) => {
        if (!res.ok) throw new Error('Error al consultar /api/municipios');
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setMunicipios(data);
          console.log('[Persistencia] Datos actualizados desde el backend:', data.length, 'municipios');
        }
      })
      .catch((err) => {
        console.warn('[Persistencia] Usando dataset local inicial:', err.message);
      });
  }, []);

  useEffect(() => {
    reloadMunicipios();
  }, [reloadMunicipios]);

  // Polling del estado de la cola de importaciones automáticas cada 12 segundos
  const fetchQueueStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/import-queue/status');
      if (res.ok) {
        const data = await res.json();
        setQueueStatus(data);
        if (
          data.totalEmpresas !== undefined &&
          municipiosRef.current &&
          !data.isProcessing
        ) {
          const localTotal = municipiosRef.current.reduce(
            (acc, m) => acc + (m.empresas?.length || 0),
            0
          );
          if (data.totalEmpresas !== localTotal) {
            reloadMunicipios();
          }
        }
      }
    } catch (_) {}
  }, [reloadMunicipios]);

  useEffect(() => {
    fetchQueueStatus();
    const interval = setInterval(fetchQueueStatus, 12000);
    return () => clearInterval(interval);
  }, [fetchQueueStatus]);

  // Función para persistir cambios en disco mediante PUT /api/municipios
  const persistChanges = async (newDataset) => {
    try {
      const res = await fetch('/api/municipios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(newDataset),
      });
      const data = await res.json();
      console.log('[Persistencia] Éxito al guardar en disco:', data);
    } catch (err) {
      console.error('[Persistencia Error] No se pudo guardar en disco:', err);
    }
  };

  // Requerimiento A: Vaciar todas las empresas (empezar de cero) manteniendo los municipios
  const handleResetDataset = useCallback(async () => {
    const emptyMunicipios = municipios.map((m) => ({
      ...m,
      empresas: [],
    }));

    setMunicipios(emptyMunicipios);
    if (selectedMunicipio) {
      const refreshedSelected = emptyMunicipios.find((m) => m.id === selectedMunicipio.id);
      setSelectedMunicipio(refreshedSelected || null);
    }
    setIsResetModalOpen(false);

    // Persistir dataset vacío en disco y refrescar todo
    await persistChanges(emptyMunicipios);
  }, [municipios, selectedMunicipio]);

  // Requerimiento: Agregar empresa a un municipio
  const handleAddEmpresa = (municipioId, nuevaEmpData) => {
    const nuevaEmpresa = {
      id: `e_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      verificado: false,
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

  // Actualización masiva o individual de empresas (para verificación o cambios de coordenadas)
  const handleUpdateEmpresas = useCallback((updates) => {
    setMunicipios((prev) => {
      const updatedMunicipios = prev.map((m) => {
        let hasChanges = false;
        const newEmpresas = (m.empresas || []).map((e) => {
          const up = updates.find((u) => u.empresaId === e.id);
          if (up) {
            hasChanges = true;
            return {
              ...e,
              ...(up.lat !== undefined ? { lat: up.lat } : {}),
              ...(up.lon !== undefined ? { lon: up.lon } : {}),
              ...(up.verificado !== undefined ? { verificado: up.verificado } : {}),
              ...(up.verificadoMetodo ? { verificadoMetodo: up.verificadoMetodo } : {}),
              ...(up.verificadoDistanciaMetros !== undefined ? { verificadoDistanciaMetros: up.verificadoDistanciaMetros } : {}),
              coordWarning: up.lat !== undefined ? false : e.coordWarning,
            };
          }
          return e;
        });

        if (!hasChanges) return m;
        return {
          ...m,
          empresas: newEmpresas,
        };
      });

      setSelectedMunicipio((curr) => {
        if (!curr) return null;
        return updatedMunicipios.find((m) => m.id === curr.id) || null;
      });

      persistChanges(updatedMunicipios);
      return updatedMunicipios;
    });
  }, []);

  const handleUpdateSingleEmpresa = useCallback((update) => {
    handleUpdateEmpresas([update]);
  }, [handleUpdateEmpresas]);

  // Aplicar empresas importadas de Excel / CSV
  const handleApplyImport = useCallback(({ added, updated }) => {
    setMunicipios((prev) => {
      const muniMap = new Map(
        prev.map((m) => [m.id, { ...m, empresas: [...(m.empresas || [])], sectores: [...(m.sectores || [])] }])
      );

      // 1. Incorporar nuevas empresas por municipio asignado
      added.forEach((emp) => {
        const targetMuniId = emp.matchedMunicipioId || 'val';
        const muni = muniMap.get(targetMuniId) || muniMap.get('val');
        if (muni) {
          muni.empresas.push(emp);
          if (!muni.sectores.includes(emp.sector)) {
            muni.sectores.push(emp.sector);
          }
        }
      });

      // 2. Actualizar duplicados si corresponde
      if (updated && updated.length > 0) {
        updated.forEach((emp) => {
          for (const muni of muniMap.values()) {
            const idx = muni.empresas.findIndex((e) => e.id === emp.id);
            if (idx !== -1) {
              muni.empresas[idx] = {
                ...muni.empresas[idx],
                ...emp,
              };
              if (!muni.sectores.includes(emp.sector)) {
                muni.sectores.push(emp.sector);
              }
              break;
            }
          }
        });
      }

      const nextState = Array.from(muniMap.values());

      setSelectedMunicipio((curr) => {
        if (!curr) return null;
        return nextState.find((m) => m.id === curr.id) || null;
      });

      persistChanges(nextState);
      return nextState;
    });
  }, []);

  // Limpiar capa de inspección de discrepancia
  const clearDiscrepancyLayer = useCallback(() => {
    if (discrepancyLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(discrepancyLayerRef.current);
      discrepancyLayerRef.current = null;
    }
    setDiscrepancyInspection(null);
  }, []);

  // Inspección de discrepancia en mapa
  const handleInspectDiscrepancy = useCallback((item) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    clearDiscrepancyLayer();
    setDiscrepancyInspection(item);

    const curLat = item.empresa.lat;
    const curLon = item.empresa.lon;
    const sugLat = item.result.geocoded.lat;
    const sugLon = item.result.geocoded.lon;

    const group = L.layerGroup();

    if (typeof curLat === 'number' && typeof curLon === 'number') {
      const curMarker = L.marker([curLat, curLon], {
        icon: L.divIcon({
          className: 'discrepancy-cur-marker',
          html: '<div style="background:#f59e0b; color:#000; font-weight:bold; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:2px solid #fff; font-size:11px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">Actual</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).bindPopup(`<b>Ubicación Actual:</b><br>${item.empresa.n}<br>${curLat.toFixed(5)}, ${curLon.toFixed(5)}`);
      group.addLayer(curMarker);

      const polyline = L.polyline([[curLat, curLon], [sugLat, sugLon]], {
        color: '#f43f5e',
        dashArray: '6, 8',
        weight: 3,
      });
      group.addLayer(polyline);
    }

    const sugMarker = L.marker([sugLat, sugLon], {
      icon: L.divIcon({
        className: 'discrepancy-sug-marker',
        html: '<div style="background:#2563eb; color:#fff; font-weight:bold; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:2px solid #fff; font-size:10px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">Google</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }).bindPopup(`<b>Ubicación Encontrada en Google:</b><br>${item.result.geocoded.displayName}<br>${sugLat.toFixed(5)}, ${sugLon.toFixed(5)}`);
    group.addLayer(sugMarker);

    group.addTo(map);
    discrepancyLayerRef.current = group;

    if (typeof curLat === 'number' && typeof curLon === 'number') {
      map.fitBounds([[curLat, curLon], [sugLat, sugLon]], { padding: [80, 80] });
    } else {
      map.flyTo([sugLat, sugLon], 15);
    }
  }, [clearDiscrepancyLayer]);

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

  const totalVerificadas = useMemo(() => {
    return municipios.reduce((acc, m) => {
      if (!Array.isArray(m.empresas)) return acc;
      return acc + m.empresas.filter((e) => isCoordenadaVerificada(e)).length;
    }, 0);
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
    setOnlyUnverified(false);
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

    // Capa base única: OpenStreetMap estándar (sin API key)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Controles de zoom en la esquina inferior derecha
    L.control.zoom({ position: 'bottomright' }).addTo(map);

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

    // Tooltip compartido de vista previa rápida al pasar el mouse (hover)
    const hoverTooltip = L.tooltip({
      direction: 'auto',
      offset: [0, -18],
      className: 'empresa-hover-preview-tooltip',
      opacity: 0,
    });
    hoverTooltipRef.current = hoverTooltip;

    // Control de nivel de zoom para activar labels permanentes solo cuando el zoom sea >= 14
    const updateZoomClass = () => {
      if (!mapContainerRef.current) return;
      if (map.getZoom() >= 14) {
        mapContainerRef.current.classList.add('map-zoom-detailed');
      } else {
        mapContainerRef.current.classList.remove('map-zoom-detailed');
      }
    };
    map.on('zoomend', updateZoomClass);
    updateZoomClass();

    const hideHoverTooltip = () => {
      if (hoverTooltipRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(hoverTooltipRef.current);
      }
      touchActiveEmpresaIdRef.current = null;
    };

    map.on('movestart', hideHoverTooltip);
    map.on('popupopen', hideHoverTooltip);

    map.on('click', (e) => {
      hideHoverTooltip();
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
      // En móvil: si pulsa el botón "Ver ficha completa" dentro del tooltip compacto
      const verMasBtn = e.target.closest('.hover-btn-ver-mas');
      if (verMasBtn) {
        const empId = verMasBtn.getAttribute('data-empresa-id');
        const marker = empresaMarkersRef.current[empId];
        if (marker) {
          hideHoverTooltip();
          marker.openPopup();
          return;
        }
      }

      // Si pulsa "Ver Ficha Completa" en el popup de la empresa
      const verFichaBtn = e.target.closest('.popup-btn-ver-ficha');
      if (verFichaBtn) {
        const munId = verFichaBtn.getAttribute('data-municipio-id');
        const foundMuni = municipiosRef.current?.find((m) => m.id === munId);
        if (foundMuni) {
          setSelectedMunicipio(foundMuni);
          hideHoverTooltip();
          mapInstanceRef.current?.closePopup();
          return;
        }
      }

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
      map.off('zoomend', updateZoomClass);
      map.off('movestart', hideHoverTooltip);
      map.off('popupopen', hideHoverTooltip);
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
    empresaMarkersRef.current = {};

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
          const normRif = normalizeText(emp.rif || emp['RIF Compañía'] || '');
          const normRazon = normalizeText(emp.razonSocial || emp['Razón Social'] || '');
          const normMarcas = normalizeText(emp.marcas || emp['Marcas'] || '');
          const normProductos = normalizeText(emp.productos || emp['Productos'] || '');
          const normGremios = normalizeText(emp.gremios || emp['Gremios'] || '');
          const normDir = normalizeText(emp.direccionDetallada || emp['Dirección Detallada'] || emp.direccionFiscal || '');

          const matchSector = !hasSectorFilter || selectedSectors.includes(emp.sector);
          const matchUnverified = !onlyUnverified || !isCoordenadaVerificada(emp);
          const matchText = !hasSearchFilter || (
            normEmpName.includes(normQuery) ||
            normMunNombre.includes(normQuery) ||
            normMunCapital.includes(normQuery) ||
            normSectorLabel.includes(normQuery) ||
            normSectorKey.includes(normQuery) ||
            normNota.includes(normQuery) ||
            normRif.includes(normQuery) ||
            normRazon.includes(normQuery) ||
            normMarcas.includes(normQuery) ||
            normProductos.includes(normQuery) ||
            normGremios.includes(normQuery) ||
            normDir.includes(normQuery)
          );

          const isCompanyMatch = matchSector && matchText && matchUnverified;

          if (isCompanyMatch) {
            matchingEmpresasTotal++;
            munHasMatchingEmpresas = true;

            if (typeof emp.lat === 'number' && typeof emp.lon === 'number' && !isNaN(emp.lat) && !isNaN(emp.lon)) {
              const isVerif = isCoordenadaVerificada(emp);
              const hasWarn = !!emp.coordWarning;

              const empMarker = L.marker([emp.lat, emp.lon], {
                icon: createEmpresaIcon(emp.sector, isVerif, hasWarn),
                title: `${emp.n} (${m.nombre}) - ${isVerif ? 'Verificada' : 'Sin verificar'}`,
              });

              const popupContent = createEmpresaPopupHTML(emp, m);
              empMarker.bindPopup(popupContent, {
                maxWidth: 360,
                className: 'custom-leaflet-popup',
              });

              // A) Nombre visible permanente junto al punto (discreto, ~11px, truncado a palabras legibles)
              const shortName = formatShortCompanyName(emp.n);
              empMarker.bindTooltip(shortName, {
                permanent: true,
                direction: 'top',
                className: 'permanent-empresa-tooltip',
                offset: [0, -14],
                opacity: 1,
              });

              // B) Resumen compacto al pasar el mouse (hover preview en desktop)
              empMarker.on('mouseover', () => {
                if (isTouchDeviceRef.current) return;
                // Ocultar temporalmente el label permanente para evitar solapamiento visual
                empMarker.getTooltip()?.setOpacity(0);

                const hoverTooltip = hoverTooltipRef.current;
                const mInstance = mapInstanceRef.current;
                if (hoverTooltip && mInstance) {
                  hoverTooltip
                    .setLatLng([emp.lat, emp.lon])
                    .setContent(createEmpresaHoverHTML(emp, m, false))
                    .addTo(mInstance);

                  const el = hoverTooltip.getElement();
                  if (el) el.style.opacity = '1';
                }
              });

              empMarker.on('mouseout', () => {
                if (isTouchDeviceRef.current) return;
                // Restaurar el label permanente
                empMarker.getTooltip()?.setOpacity(1);

                const hoverTooltip = hoverTooltipRef.current;
                const mInstance = mapInstanceRef.current;
                if (hoverTooltip && mInstance) {
                  mInstance.removeLayer(hoverTooltip);
                }
              });

              // Clic: en móvil primer toque abre resumen compacto, segundo toque abre popup completo
              empMarker.on('click', (e) => {
                if (isTouchDeviceRef.current) {
                  if (touchActiveEmpresaIdRef.current !== emp.id) {
                    // Primer toque en táctil: mostrar resumen compacto
                    e.originalEvent?.preventDefault();
                    e.originalEvent?.stopPropagation();
                    mapInstanceRef.current?.closePopup();

                    const hoverTooltip = hoverTooltipRef.current;
                    const mInstance = mapInstanceRef.current;
                    if (hoverTooltip && mInstance) {
                      hoverTooltip
                        .setLatLng([emp.lat, emp.lon])
                        .setContent(createEmpresaHoverHTML(emp, m, true))
                        .addTo(mInstance);

                      const el = hoverTooltip.getElement();
                      if (el) el.style.opacity = '1';
                    }
                    touchActiveEmpresaIdRef.current = emp.id;
                    return;
                  }

                  // Segundo toque en el mismo marcador: abrir popup completo
                  touchActiveEmpresaIdRef.current = null;
                  if (hoverTooltipRef.current && mapInstanceRef.current) {
                    mapInstanceRef.current.removeLayer(hoverTooltipRef.current);
                  }
                  empMarker.openPopup();
                  return;
                }

                // En desktop: click normal oculta hover y abre popup
                if (hoverTooltipRef.current && mapInstanceRef.current) {
                  mapInstanceRef.current.removeLayer(hoverTooltipRef.current);
                }
                empMarker.openPopup();
              });

              clusterGroupRef.current.addLayer(empMarker);
              empresaMarkersRef.current[emp.id] = empMarker;
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
  }, [municipios, selectedSectors, onlyUnverified, searchQuery]);

  return (
    <main className={`map-app-container ${isPickingLocation ? 'is-in-picking-mode' : ''}`}>
      {/* Controles superiores con filtros, importador y verificador */}
      <TopBarControls
        totalEmpresas={totalRealEmpresas}
        totalMunicipios={totalRealMunicipios}
        totalVerificadas={totalVerificadas}
        filteredEmpresasCount={filteredEmpresasCount}
        selectedSectors={selectedSectors}
        onToggleSector={handleToggleSector}
        onlyUnverified={onlyUnverified}
        onToggleOnlyUnverified={() => setOnlyUnverified((prev) => !prev)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearFilters={handleClearFilters}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onOpenBatchVerify={() => setIsBatchVerifyOpen(true)}
        onOpenHome={handleOpenHome}
        onOpenResetModal={() => setIsResetModalOpen(true)}
        onOpenAutoImport={() => setIsAutoImportOpen(true)}
        autoImportProcessing={queueStatus?.isProcessing || false}
      />

      {/* Banner flotante de aviso al colocar pin */}
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

      {/* Banner flotante de inspección de discrepancia en mapa */}
      {discrepancyInspection && (
        <div className="discrepancy-map-banner" role="region" aria-label="Inspección de discrepancia">
          <div className="banner-info-group">
            <span className="banner-alert-icon">⚠️</span>
            <div>
              <strong>{discrepancyInspection.empresa.n}</strong>
              <p>{discrepancyInspection.result.message}</p>
            </div>
          </div>
          <div className="banner-actions-group">
            <button
              type="button"
              className="btn-banner-use-suggested"
              onClick={() => {
                handleUpdateEmpresas([{
                  empresaId: discrepancyInspection.empresa.id,
                  municipioId: discrepancyInspection.municipioId,
                  lat: discrepancyInspection.result.geocoded.lat,
                  lon: discrepancyInspection.result.geocoded.lon,
                  verificado: true,
                  verificadoMetodo: 'google_manual_found',
                  verificadoDistanciaMetros: discrepancyInspection.result.distance,
                }]);
                clearDiscrepancyLayer();
              }}
            >
              ✓ Usar la encontrada
            </button>
            <button
              type="button"
              className="btn-banner-keep-current"
              onClick={() => {
                handleUpdateEmpresas([{
                  empresaId: discrepancyInspection.empresa.id,
                  municipioId: discrepancyInspection.municipioId,
                  verificado: true,
                  verificadoMetodo: 'user_confirmed_current',
                  verificadoDistanciaMetros: discrepancyInspection.result.distance,
                }]);
                clearDiscrepancyLayer();
              }}
            >
              Mantener la actual y marcar como verificada de todas formas
            </button>
            <button
              type="button"
              className="btn-banner-dismiss"
              onClick={clearDiscrepancyLayer}
              title="Cerrar inspección"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Nota visible de rigor y precisión de coordenadas */}
      <MapDisclaimer />

      {/* Panel lateral del Municipio seleccionado */}
      <MunicipioDrawer 
        municipio={selectedMunicipio} 
        municipios={municipios}
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
        onUpdateEmpresa={handleUpdateSingleEmpresa}
        isPickingLocation={isPickingLocation}
        onTogglePickingLocation={() => setIsPickingLocation((prev) => !prev)}
        pickedCoords={pickedCoords}
        onSelectGeocodedLocation={handleSelectGeocodedLocation}
        onInspectDiscrepancy={handleInspectDiscrepancy}
      />

      {/* Modal de Importación Excel / CSV */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        municipios={municipios}
        onApplyImport={handleApplyImport}
      />

      {/* Modal de Verificación en Cola */}
      <VerificationBatchModal
        isOpen={isBatchVerifyOpen}
        onClose={() => setIsBatchVerifyOpen(false)}
        municipios={municipios}
        onUpdateEmpresas={handleUpdateEmpresas}
        onInspectDiscrepancy={handleInspectDiscrepancy}
      />

      {/* Modal de confirmación para reiniciar dataset de empresas */}
      <ResetDatasetModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetDataset}
        totalEmpresas={totalRealEmpresas}
      />

      {/* Modal de Cola de Importaciones Automáticas */}
      <AutoImportModal
        isOpen={isAutoImportOpen}
        onClose={() => setIsAutoImportOpen(false)}
        queueStatus={queueStatus}
        onRefresh={fetchQueueStatus}
      />

      {/* Pantalla de Inicio / Bienvenida (se muestra al inicio o al hacer clic en Inicio) */}
      <HomeScreen
        isOpen={isHomeOpen}
        onEnterMap={handleEnterMap}
        municipios={municipios}
        onSelectEmpresa={handleSelectEmpresaFromHome}
        onSelectSector={handleSelectSectorFromHome}
        onSelectMunicipio={handleSelectMunicipioFromHome}
      />
    </main>
  );
}
