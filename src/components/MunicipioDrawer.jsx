import React, { useState, useEffect, useRef } from 'react';
import { SECTORES, getEstadoStyle, isCoordenadaVerificada } from '../constants/sectores';
import { verifyCompanyLocation, searchPlaceAuto } from '../utils/verifier';
import { formatDistance } from '../utils/geo';

const ESTADOS_OPERATIVOS = [
  'Activa',
  'Operación parcial',
  'Paralizada',
  'Cerrada',
  'Sin datos recientes',
];

export default function MunicipioDrawer({
  municipio,
  municipios = [],
  onClose,
  onAddEmpresa,
  onDeleteEmpresa,
  onUpdateEmpresa,
  isPickingLocation,
  onTogglePickingLocation,
  pickedCoords,
  onSelectGeocodedLocation,
  onInspectDiscrepancy,
}) {
  if (!municipio) return null;

  // Estados del formulario
  const [formMunicipioId, setFormMunicipioId] = useState(municipio?.id || '');
  const [nombre, setNombre] = useState('');
  const [sector, setSector] = useState('auto');
  const [estado, setEstado] = useState('Activa');
  const [nota, setNota] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(true);

  // Estados de verificación automática antes de guardar (Requerimiento B)
  const [isAutoVerified, setIsAutoVerified] = useState(false);
  const [autoVerifySource, setAutoVerifySource] = useState('');
  const [autoVerifyAddress, setAutoVerifyAddress] = useState('');
  const [autoCandidates, setAutoCandidates] = useState([]);
  const [isSearchingAuto, setIsSearchingAuto] = useState(false);
  const [autoSearchNotice, setAutoSearchNotice] = useState('');

  // Estados del buscador de dirección Nominatim
  const [direccionQuery, setDireccionQuery] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [addressResults, setAddressResults] = useState([]);
  const [addressNotice, setAddressNotice] = useState('');
  const lastSearchTimeRef = useRef(0);

  // Estados de verificación de empresas individuales
  const [verifyingEmpresaId, setVerifyingEmpresaId] = useState(null);
  const [verificationFeedback, setVerificationFeedback] = useState({});
  const [expandedDetails, setExpandedDetails] = useState({});

  // Al seleccionar coordenadas desde el mapa
  useEffect(() => {
    if (pickedCoords) {
      setLat(pickedCoords.lat.toFixed(5));
      setLon(pickedCoords.lon.toFixed(5));
      setIsAutoVerified(false);
      setAutoVerifySource('manual_map');
      setAutoVerifyAddress('');
      setFormError('');
      setFormSuccess('Coordenadas capturadas del mapa.');
      setTimeout(() => setFormSuccess(''), 3000);
    }
  }, [pickedCoords]);

  // Limpiar estados cuando cambia de municipio
  useEffect(() => {
    if (municipio?.id) {
      setFormMunicipioId(municipio.id);
    }
    setFormError('');
    setFormSuccess('');
    setDireccionQuery('');
    setAddressResults([]);
    setAddressNotice('');
    setIsAutoVerified(false);
    setAutoVerifySource('');
    setAutoVerifyAddress('');
    setAutoCandidates([]);
    setAutoSearchNotice('');
  }, [municipio?.id]);

  const handleToggleExpandDetails = (empId) => {
    setExpandedDetails((prev) => ({
      ...prev,
      [empId]: !prev[empId],
    }));
  };

  const handleVerifyLocation = async (emp) => {
    setVerifyingEmpresaId(emp.id);
    setVerificationFeedback((prev) => ({
      ...prev,
      [emp.id]: { status: 'LOADING', message: 'Buscando en Google (Places / Gemini Grounding)...' },
    }));

    try {
      const res = await verifyCompanyLocation(emp, municipio.nombre);

      if (res.status === 'AUTO_VERIFIED') {
        if (onUpdateEmpresa) {
          onUpdateEmpresa({
            empresaId: emp.id,
            municipioId: municipio.id,
            verificado: true,
            verificadoMetodo: res.source || 'google_auto',
            verificadoDistanciaMetros: res.distance,
          });
        }
        setVerificationFeedback((prev) => ({
          ...prev,
          [emp.id]: {
            status: 'AUTO_VERIFIED',
            message: `✓ Ubicación confirmada (±${Math.round(res.distance)}m)`,
          },
        }));
      } else if (res.status === 'DISCREPANCY') {
        setVerificationFeedback((prev) => ({
          ...prev,
          [emp.id]: {
            status: 'DISCREPANCY',
            message: `Discrepancia de ${formatDistance(res.distance)}, ¿cuál es correcta?`,
            discrepancyData: res,
          },
        }));

        // Mostrar automáticamente ambos puntos en el mapa según requerimiento B.4.f
        if (onInspectDiscrepancy) {
          onInspectDiscrepancy({ empresa: emp, municipioId: municipio.id, result: res });
        }
      } else {
        setVerificationFeedback((prev) => ({
          ...prev,
          [emp.id]: {
            status: 'NOT_FOUND',
            message: 'No se encontró esta empresa en Google',
          },
        }));
      }
    } catch (err) {
      setVerificationFeedback((prev) => ({
        ...prev,
        [emp.id]: {
          status: 'ERROR',
          message: 'Error al verificar: ' + err.message,
        },
      }));
    } finally {
      setVerifyingEmpresaId(null);
    }
  };

  const handleApplyDiscrepancySuggested = (emp, discrepancyData) => {
    if (onUpdateEmpresa) {
      onUpdateEmpresa({
        empresaId: emp.id,
        municipioId: municipio.id,
        lat: discrepancyData.geocoded.lat,
        lon: discrepancyData.geocoded.lon,
        verificado: true,
        verificadoMetodo: 'google_manual_found',
        verificadoDistanciaMetros: discrepancyData.distance,
      });
    }
    setVerificationFeedback((prev) => ({
      ...prev,
      [emp.id]: {
        status: 'RESOLVED',
        message: '✓ Coordenada actualizada a la encontrada en Google y verificada.',
      },
    }));
  };

  const handleApplyDiscrepancyKeepCurrent = (emp, discrepancyData) => {
    if (onUpdateEmpresa) {
      onUpdateEmpresa({
        empresaId: emp.id,
        municipioId: municipio.id,
        verificado: true,
        verificadoMetodo: 'user_confirmed_current',
        verificadoDistanciaMetros: discrepancyData.distance,
      });
    }
    setVerificationFeedback((prev) => ({
      ...prev,
      [emp.id]: {
        status: 'RESOLVED',
        message: '✓ Ubicación actual confirmada y marcada como verificada.',
      },
    }));
  };

  // Búsqueda de dirección con Nominatim
  const handleSearchAddress = async (e) => {
    if (e) e.preventDefault();
    setAddressNotice('');
    setFormError('');

    const query = direccionQuery.trim();
    if (!query) {
      setAddressNotice('Escribe una dirección, zona industrial o punto de referencia.');
      return;
    }

    const now = Date.now();
    const elapsed = now - lastSearchTimeRef.current;
    if (elapsed < 1100) {
      setAddressNotice('Por favor espera un momento entre búsquedas (política de OSM Nominatim).');
      return;
    }
    lastSearchTimeRef.current = now;

    setIsSearchingAddress(true);
    setAddressResults([]);

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        setAddressResults(data.slice(0, 5));
        setAddressNotice('');
      } else {
        setAddressResults([]);
        setAddressNotice('No se encontraron resultados en Venezuela. Prueba añadiendo "Carabobo" o el municipio.');
      }
    } catch (err) {
      console.warn('Fallo proxy geocoding, probando consulta directa:', err.message);
      try {
        const directUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=ve`;
        const directRes = await fetch(directUrl);
        const directData = await directRes.json();
        if (Array.isArray(directData) && directData.length > 0) {
          setAddressResults(directData.slice(0, 5));
        } else {
          setAddressNotice('No se encontraron resultados para esa dirección.');
        }
      } catch (fallbackErr) {
        setAddressNotice('Error de conexión al servicio de geocoding.');
      }
    } finally {
      setIsSearchingAddress(false);
    }
  };

  const handleSelectAddressItem = (item) => {
    const latNum = parseFloat(item.lat);
    const lonNum = parseFloat(item.lon);

    setLat(latNum.toFixed(5));
    setLon(lonNum.toFixed(5));
    setAddressResults([]);
    setAddressNotice(`✓ Ubicación seleccionada: ${item.display_name.split(',')[0]}`);

    if (onSelectGeocodedLocation) {
      onSelectGeocodedLocation({
        lat: latNum,
        lon: lonNum,
        displayName: item.display_name,
      });
    }
  };

  // Requerimiento B: Búsqueda automática de ubicación con Google Places / Gemini
  const handleSearchAutoLocation = async (manualNombre = null) => {
    const queryName = (typeof manualNombre === 'string' ? manualNombre : nombre).trim();
    setFormError('');
    setAutoSearchNotice('');
    setAutoCandidates([]);

    if (!queryName) {
      setAutoSearchNotice('Escribe el nombre de la empresa antes de buscar automáticamente.');
      return;
    }

    const currentMuniId = formMunicipioId || municipio?.id;
    const targetMuni = (municipios && municipios.find((m) => m.id === currentMuniId)) || municipio;
    const targetMuniName = targetMuni?.nombre || 'Carabobo';

    setIsSearchingAuto(true);

    try {
      const res = await searchPlaceAuto(queryName, targetMuniName);

      if (res.success && res.found) {
        const found = res.found;
        const latNum = parseFloat(found.lat);
        const lonNum = parseFloat(found.lon);

        if (!isNaN(latNum) && !isNaN(lonNum)) {
          setLat(latNum.toFixed(5));
          setLon(lonNum.toFixed(5));
          setIsAutoVerified(true);
          setAutoVerifySource(found.source || 'google_auto');
          setAutoVerifyAddress(found.formattedAddress || found.displayName || `${queryName}, ${targetMuniName}`);
          setFormError('');

          // Centrar mapa principal sobre la coordenada encontrada y abrir popup
          if (onSelectGeocodedLocation) {
            onSelectGeocodedLocation({
              lat: latNum,
              lon: lonNum,
              displayName: found.formattedAddress || found.displayName || queryName,
            });
          }

          if (Array.isArray(res.candidates) && res.candidates.length > 1) {
            setAutoCandidates(res.candidates);
          } else {
            setAutoCandidates([]);
          }
        } else {
          setIsAutoVerified(false);
          setAutoSearchNotice('Las coordenadas recibidas no son válidas.');
        }
      } else {
        setIsAutoVerified(false);
        setAutoVerifySource('');
        setAutoVerifyAddress('');
        setAutoCandidates([]);
        setAutoSearchNotice('No se encontró ubicación en Google Places / Gemini. Puedes usar "Ubicar en el mapa" o escribir las coordenadas manualmente.');
      }
    } catch (err) {
      setIsAutoVerified(false);
      setAutoSearchNotice('Error al buscar ubicación automáticamente: ' + err.message);
    } finally {
      setIsSearchingAuto(false);
    }
  };

  // Requerimiento B.4: Seleccionar un candidato específico cuando hay varios parecidos
  const handleSelectCandidate = (candidate) => {
    const latNum = parseFloat(candidate.lat);
    const lonNum = parseFloat(candidate.lon);

    if (!isNaN(latNum) && !isNaN(lonNum)) {
      setLat(latNum.toFixed(5));
      setLon(lonNum.toFixed(5));
      setIsAutoVerified(true);
      setAutoVerifySource(candidate.source || 'google_places_candidate');
      setAutoVerifyAddress(candidate.formattedAddress || candidate.displayName || candidate.name);
      setAutoCandidates([]);
      setFormError('');

      if (onSelectGeocodedLocation) {
        onSelectGeocodedLocation({
          lat: latNum,
          lon: lonNum,
          displayName: candidate.formattedAddress || candidate.displayName || nombre,
        });
      }
    }
  };

  const hasValidCoords = Boolean(
    lat &&
    lon &&
    !isNaN(parseFloat(lat)) &&
    !isNaN(parseFloat(lon))
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    if (!nombre.trim()) {
      setFormError('El nombre de la empresa es obligatorio.');
      return;
    }

    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    if (isNaN(latNum) || isNaN(lonNum)) {
      setFormError('Se requiere una coordenada válida (automática o manual).');
      return;
    }

    const targetMunId = formMunicipioId || municipio.id;

    const nuevaEmpresa = {
      n: nombre.trim(),
      sector,
      estado,
      nota: nota.trim(),
      lat: latNum,
      lon: lonNum,
      verificado: isAutoVerified,
      verificadoMetodo: isAutoVerified ? (autoVerifySource || 'google_auto') : undefined,
    };

    onAddEmpresa(targetMunId, nuevaEmpresa);

    setNombre('');
    setNota('');
    setLat('');
    setLon('');
    setIsAutoVerified(false);
    setAutoVerifySource('');
    setAutoVerifyAddress('');
    setAutoCandidates([]);
    setAutoSearchNotice('');
    setDireccionQuery('');
    setAddressResults([]);
    setAddressNotice('');
    setFormSuccess(`¡Empresa "${nuevaEmpresa.n}" guardada y registrada exitosamente!`);
    setTimeout(() => setFormSuccess(''), 4000);
  };

  return (
    <>
      {/* Backdrop overlay para cerrar en mobile y desktop al hacer clic afuera */}
      <div 
        className="drawer-backdrop" 
        onClick={onClose} 
        aria-hidden="true" 
      />

      <aside className="municipio-drawer" aria-label={`Detalles del municipio ${municipio.nombre}`}>
        {/* Barra de agarre para interacción móvil / bottom sheet */}
        <div className="drawer-drag-handle" aria-hidden="true" />

        {/* Cabecera del Drawer */}
        <div className="drawer-header">
          <div className="drawer-title-area">
            <span className="drawer-badge">Municipio</span>
            <h2>{municipio.nombre}</h2>
            <p className="drawer-subtitle">Capital: <strong>{municipio.capital}</strong></p>
          </div>
          <button 
            className="drawer-close-btn" 
            onClick={onClose} 
            aria-label="Cerrar panel de municipio"
            title="Cerrar panel"
          >
            &times;
          </button>
        </div>

        <div className="drawer-content">
          {/* Resumen Geoeconómico */}
          <section className="drawer-section">
            <h3>Resumen Geoeconómico</h3>
            <p className="drawer-resumen">{municipio.resumen}</p>
          </section>

          {/* Sectores Presentes */}
          <section className="drawer-section">
            <div className="section-title-row">
              <h3>Sectores Presentes</h3>
              <span className="count-pill">{municipio.sectores?.length || 0}</span>
            </div>
            <div className="sectores-chips-container">
              {municipio.sectores && municipio.sectores.length > 0 ? (
                municipio.sectores.map((secKey) => {
                  const info = SECTORES[secKey] || { label: secKey, color: '#94a3b8' };
                  return (
                    <span 
                      key={secKey} 
                      className="sector-chip" 
                      style={{ 
                        backgroundColor: `${info.color}1f`,
                        borderColor: `${info.color}55`,
                        color: info.color
                      }}
                    >
                      <span className="chip-indicator" style={{ backgroundColor: info.color }}></span>
                      {info.label}
                    </span>
                  );
                })
              ) : (
                <p className="empty-text">Sin sectores industriales registrados actualmente.</p>
              )}
            </div>
          </section>

          {/* Formulario "Agregar empresa" con verificación automática */}
          <section className="drawer-section form-section-card">
            <div 
              className="section-title-row clickable-title"
              onClick={() => setIsFormOpen(!isFormOpen)}
              title="Alternar formulario"
            >
              <h3>+ Agregar empresa</h3>
              <span className="toggle-indicator">{isFormOpen ? '▲' : '▼'}</span>
            </div>

            {isFormOpen && (
              <form onSubmit={handleSubmit} className="add-empresa-form">
                {formError && <div className="form-alert error">{formError}</div>}
                {formSuccess && <div className="form-alert success">{formSuccess}</div>}

                {/* Municipio (obligatorio, select) */}
                <div className="form-group">
                  <label htmlFor="emp-municipio">Municipio *</label>
                  <select
                    id="emp-municipio"
                    className="form-select"
                    value={formMunicipioId}
                    onChange={(e) => setFormMunicipioId(e.target.value)}
                    required
                  >
                    {(municipios.length > 0 ? municipios : [municipio]).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre} (Capital: {m.capital})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Nombre de la empresa */}
                <div className="form-group">
                  <label htmlFor="emp-nombre">Nombre de la empresa *</label>
                  <input
                    type="text"
                    id="emp-nombre"
                    className="form-input"
                    placeholder="Ej. Ford Motor de Venezuela, Alimentos Polar..."
                    value={nombre}
                    onChange={(e) => {
                      setNombre(e.target.value);
                      if (isAutoVerified) {
                        setIsAutoVerified(false);
                      }
                    }}
                    onBlur={() => {
                      if (nombre.trim().length >= 3 && !lat && !lon && !isSearchingAuto) {
                        handleSearchAutoLocation();
                      }
                    }}
                    required
                  />

                  {/* Botón de búsqueda automática según Prompt 9 */}
                  <div className="auto-search-row">
                    <button
                      type="button"
                      className="btn-auto-search"
                      id="btn-buscar-ubicacion-auto"
                      onClick={() => handleSearchAutoLocation()}
                      disabled={isSearchingAuto || !nombre.trim()}
                      title="Buscar automáticamente la ubicación en Google Places y Gemini Grounding"
                    >
                      {isSearchingAuto ? (
                        <>
                          <span className="auto-search-spinner" />
                          <span>Buscando en Google Places / Gemini...</span>
                        </>
                      ) : (
                        <>
                          <span>🔍 Buscar ubicación automáticamente</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Tarjeta de previsualización cuando se encuentra la ubicación automáticamente */}
                  {isAutoVerified && autoVerifyAddress && (
                    <div className="auto-verified-preview-card" role="region" aria-label="Ubicación verificada automáticamente">
                      <div className="auto-verified-title-row">
                        <span className="auto-verified-title">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          Ubicación localizada
                        </span>
                        <span className="badge-auto-verif-pill">✓ Verificada</span>
                      </div>
                      <p className="auto-verified-address">{autoVerifyAddress}</p>
                      <div className="auto-verified-meta">
                        <span className="auto-verified-coords">📍 {lat}, {lon}</span>
                        <span>Fuente: {autoVerifySource}</span>
                      </div>
                    </div>
                  )}

                  {/* Lista de candidatos cuando hay varias coincidencias similares */}
                  {autoCandidates.length > 1 && (
                    <div className="auto-candidates-container" role="region" aria-label="Candidatos encontrados">
                      <div className="auto-candidates-header">
                        <span>📍 Se encontraron {autoCandidates.length} opciones. Elige la sucursal o sede:</span>
                      </div>
                      <ul className="auto-candidates-list">
                        {autoCandidates.map((cand, idx) => (
                          <li
                            key={idx}
                            className="auto-candidate-item"
                            onClick={() => handleSelectCandidate(cand)}
                            title="Haz clic para seleccionar esta ubicación"
                          >
                            <div className="candidate-info">
                              <strong className="candidate-name">{cand.displayName || cand.name}</strong>
                              <span className="candidate-addr">{cand.formattedAddress}</span>
                            </div>
                            <button type="button" className="btn-select-candidate">
                              Elegir
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Aviso informativo de fallback cuando no se localizó automáticamente */}
                  {autoSearchNotice && (
                    <div className="auto-search-notice-fallback" role="alert">
                      <span>⚠️ {autoSearchNotice}</span>
                    </div>
                  )}
                </div>

                {/* Sector industrial */}
                <div className="form-group">
                  <label htmlFor="emp-sector">Sector industrial *</label>
                  <select
                    id="emp-sector"
                    className="form-select"
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                  >
                    {Object.entries(SECTORES).map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Estado operativo */}
                <div className="form-group">
                  <label htmlFor="emp-estado">Estado operativo *</label>
                  <select
                    id="emp-estado"
                    className="form-select"
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                  >
                    {ESTADOS_OPERATIVOS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Coordenadas (Lat, Lon) */}
                <div className="form-group">
                  <div className="coords-header-row">
                    <label>Coordenadas (Lat, Lon) *</label>
                    <button
                      type="button"
                      className={`btn-pick-map ${isPickingLocation ? 'is-picking' : ''}`}
                      onClick={onTogglePickingLocation}
                      title="Haz clic para seleccionar la posición exacta en el mapa"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
                      <span>{isPickingLocation ? 'Seleccionando en mapa...' : 'Ubicar en el mapa'}</span>
                    </button>
                  </div>

                  <div className="coords-inputs-grid">
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="Latitud"
                      value={lat}
                      onChange={(e) => {
                        setLat(e.target.value);
                        setIsAutoVerified(false);
                      }}
                      required
                    />
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="Longitud"
                      value={lon}
                      onChange={(e) => {
                        setLon(e.target.value);
                        setIsAutoVerified(false);
                      }}
                      required
                    />
                  </div>
                </div>

                {/* Descripción libre */}
                <div className="form-group">
                  <label htmlFor="emp-nota">Descripción / Nota técnica</label>
                  <textarea
                    id="emp-nota"
                    className="form-textarea"
                    rows="2"
                    placeholder="Detalles sobre productos, capacidad instalada o dirección..."
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                  />
                </div>

                {/* Mensaje de ayuda si no hay coordenadas */}
                {!hasValidCoords && (
                  <p className="submit-coord-helper-note">
                    ⚠️ Se requiere una coordenada válida (automática o manual) para registrar la empresa.
                  </p>
                )}

                {/* Botón de envío - Deshabilitado si no hay coordenadas */}
                <button 
                  type="submit" 
                  className="btn-submit-empresa" 
                  id="btn-guardar-empresa"
                  disabled={!hasValidCoords || isSearchingAuto}
                  title={!hasValidCoords ? 'Completa las coordenadas para poder guardar' : 'Guardar y registrar empresa'}
                >
                  + Guardar y registrar empresa
                </button>
              </form>
            )}
          </section>

          {/* Lista de Empresas / Instalaciones */}
          <section className="drawer-section">
            <div className="section-title-row">
              <h3>Empresas Registradas</h3>
              <span className="count-pill">{municipio.empresas?.length || 0}</span>
            </div>

            {municipio.empresas && municipio.empresas.length > 0 ? (
              <div className="empresas-list">
                {municipio.empresas.map((emp) => {
                  const sec = SECTORES[emp.sector] || { label: emp.sector, color: '#94a3b8' };
                  const estadoStyle = getEstadoStyle(emp.estado);
                  const isVerificada = isCoordenadaVerificada(emp);
                  const feedback = verificationFeedback[emp.id];
                  const isExpanded = !!expandedDetails[emp.id];
                  const empRif = emp.rif || emp['RIF Compañía'];
                  const empRazon = emp.razonSocial || emp['Razón Social'];
                  const empAno = emp.anoFundacion || emp['Año Fundación'];
                  const empDirFiscal = emp.direccionFiscal || emp['Dirección Fiscal'];
                  const empEstablecimiento = emp.nombreEstablecimiento || emp['Nombre Establecimiento'] || emp.n;
                  const empFechaApertura = emp.fechaApertura || emp['Fecha Apertura'];
                  const empEmail = emp.emailPrincipal || emp['Email Principal'];
                  const empTel1 = emp.telefono1 || emp['Teléfono 1'];
                  const empTel2 = emp.telefono2 || emp['Teléfono 2'];
                  const empEstado = emp.estadoGeografico || emp['Estado'] || 'Carabobo';
                  const empMunicipio = emp.municipioRaw || emp['Municipio'] || municipio.nombre;
                  const empParroquia = emp.parroquia || emp['Parroquia'];
                  const empDirDetallada = emp.direccionDetallada || emp['Dirección Detallada'];
                  const empObreros = emp.numObreros ?? emp['Nº Obreros'];
                  const empEmpleados = emp.numEmpleados ?? emp['Nº Empleados'];
                  const empDirectivos = emp.numDirectivos ?? emp['Nº Directivos'];
                  const empTotalEmp = emp.totalEmpleados ?? emp['Total Empleados'];
                  const empSeccionCAEV = emp.seccionCAEV || emp['Sección CAEV'];
                  const empDivisionCAEV = emp.divisionCAEV || emp['División CAEV'];
                  const empClaseCAEV = emp.claseCAEV || emp['Clase CAEV'];
                  const empProductos = emp.productos || emp['Productos'];
                  const empMarcas = emp.marcas || emp['Marcas'];
                  const empProcesos = emp.procesosProductivos || emp['Procesos Productivos'];
                  const empGremios = emp.gremios || emp['Gremios'];

                  const hasExtraDetails = Boolean(
                    empRif || empRazon || empAno || empDirFiscal || empFechaApertura ||
                    empEmail || empTel1 || empTel2 || empParroquia || empDirDetallada ||
                    empObreros || empEmpleados || empDirectivos || empTotalEmp ||
                    empSeccionCAEV || empDivisionCAEV || empClaseCAEV ||
                    empProductos || empMarcas || empProcesos || empGremios
                  );

                  return (
                    <article key={emp.id} className={`empresa-card ${isVerificada ? 'is-verified-card' : 'is-unverified-card'}`}>
                      <div className="empresa-card-header">
                        <div className="empresa-title-box">
                          <h4 className="empresa-name">{emp.n}</h4>
                          {empRazon && empRazon !== emp.n && (
                            <p className="empresa-razon-sub">{empRazon}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn-card-quitar"
                          onClick={() => onDeleteEmpresa(emp.id, municipio.id)}
                          title={`Eliminar ${emp.n}`}
                        >
                          &times;
                        </button>
                      </div>

                      <div className="empresa-badges-row">
                        <span 
                          className="badge-sector"
                          style={{ 
                            backgroundColor: `${sec.color}22`, 
                            color: sec.color,
                            borderColor: `${sec.color}44` 
                          }}
                        >
                          <span className="dot" style={{ backgroundColor: sec.color }}></span>
                          {sec.label}
                        </span>

                        <span 
                          className="badge-estado"
                          style={{ 
                            backgroundColor: estadoStyle.bg,
                            color: estadoStyle.text,
                            borderColor: estadoStyle.border
                          }}
                        >
                          {emp.estado}
                        </span>

                        {empRif && (
                          <span className="badge-rif" title="Registro de Información Fiscal">
                            {empRif}
                          </span>
                        )}

                        {empTotalEmp && (
                          <span className="badge-empleados" title="Nómina total de personal">
                            👥 {empTotalEmp} empleados
                          </span>
                        )}

                        {/* Indicador de verificación según Requerimiento B.2 */}
                        <span 
                          className={`badge-verificado ${isVerificada ? 'is-verified' : 'is-unverified'}`}
                          title={isVerificada ? 'Ubicación verificada y confirmada' : 'Ubicación sin verificar'}
                        >
                          {isVerificada ? '✓ Verificada' : '⚠ Sin verificar'}
                        </span>

                        {emp.coordWarning && (
                          <span className="badge-coord-alert" title={emp.coordReviewReason || 'Coordenada fuera de Carabobo o dudosa'}>
                            ⚠️ Coord. dudosa
                          </span>
                        )}
                      </div>

                      {emp.nota && <p className="empresa-nota">{emp.nota}</p>}

                      {/* Fila de coordenadas y botón de verificar ubicación */}
                      <div className="empresa-footer-row">
                        <span className="empresa-coords">
                          {typeof emp.lat === 'number' && typeof emp.lon === 'number'
                            ? `Lat: ${emp.lat.toFixed(4)}, Lon: ${emp.lon.toFixed(4)}`
                            : 'Sin coordenadas'}
                        </span>

                        <button
                          type="button"
                          className="btn-card-verify"
                          onClick={() => handleVerifyLocation(emp)}
                          disabled={verifyingEmpresaId === emp.id}
                          title="Verificar contra Nominatim y calcular distancia Haversine"
                        >
                          {verifyingEmpresaId === emp.id ? (
                            <span>⏳ Verificando...</span>
                          ) : (
                            <span>🧭 {isVerificada ? 'Re-verificar' : 'Verificar ubicación'}</span>
                          )}
                        </button>
                      </div>

                      {/* Banner de feedback / resolución de discrepancias */}
                      {feedback && (
                        <div className={`card-verif-feedback feedback-${feedback.status.toLowerCase()}`}>
                          {feedback.status === 'AUTO_VERIFIED' && (
                            <div className="feedback-auto-ok">
                              <span>{feedback.message}</span>
                            </div>
                          )}

                          {feedback.status === 'NOT_FOUND' && (
                            <div className="feedback-notfound-msg">
                              <span>❓ {feedback.message}</span>
                            </div>
                          )}

                          {feedback.status === 'DISCREPANCY' && (
                            <div className="card-discrepancy-box">
                              <p className="disc-msg-title">⚠️ {feedback.message}</p>
                              <div className="disc-compare-compact">
                                <div><strong>Actual:</strong> {typeof emp.lat === 'number' ? `${emp.lat.toFixed(4)}, ${emp.lon.toFixed(4)}` : 'N/D'}</div>
                                <div><strong>Encontrada:</strong> {feedback.discrepancyData.geocoded.lat.toFixed(4)}, {feedback.discrepancyData.geocoded.lon.toFixed(4)}</div>
                              </div>
                              <div className="disc-suggested-text" title={feedback.discrepancyData.geocoded.displayName}>
                                📍 {feedback.discrepancyData.geocoded.displayName}
                              </div>
                              <div className="disc-card-btn-group">
                                <button
                                  type="button"
                                  className="btn-disc-use"
                                  onClick={() => handleApplyDiscrepancySuggested(emp, feedback.discrepancyData)}
                                  title="Reemplazar coordenadas por las encontradas y marcar como verificada"
                                >
                                  ✓ Usar la encontrada
                                </button>
                                <button
                                  type="button"
                                  className="btn-disc-keep"
                                  onClick={() => handleApplyDiscrepancyKeepCurrent(emp, feedback.discrepancyData)}
                                  title="Conservar coordenadas actuales y marcar como verificada"
                                >
                                  Mantener la actual y marcar como verificada de todas formas
                                </button>
                              </div>
                              {onInspectDiscrepancy && (
                                <button
                                  type="button"
                                  className="btn-disc-inspect-map"
                                  onClick={() => onInspectDiscrepancy({ empresa: emp, municipioId: municipio.id, result: feedback.discrepancyData })}
                                  style={{ marginTop: '6px', fontSize: '11px', background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                  🗺️ Ver ambos puntos en el mapa
                                </button>
                              )}
                            </div>
                          )}

                          {feedback.status === 'RESOLVED' && (
                            <div className="feedback-resolved-ok">
                              <span>{feedback.message}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Ficha Integral de la Empresa (26 columnas del reporte CIEC) */}
                      {hasExtraDetails && (
                        <div className="card-extra-details-container">
                          <button
                            type="button"
                            className="btn-toggle-extra-details"
                            onClick={() => handleToggleExpandDetails(emp.id)}
                            aria-expanded={isExpanded}
                          >
                            <span>
                              {isExpanded ? '▲ Ocultar Ficha Técnica CIEC' : '📋 Ver Ficha Técnica Completa (26 Datos CIEC)'}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="ficha-tecnica-body">
                              {/* 1. Identificación & Legal */}
                              <div className="ficha-section">
                                <div className="ficha-section-title">
                                  <span>🏢</span>
                                  <h5>Identificación y Razón Social</h5>
                                </div>
                                <div className="ficha-grid">
                                  {empRif && (
                                    <div className="ficha-field">
                                      <span className="field-label">RIF Compañía:</span>
                                      <span className="field-val highlight-rif">{empRif}</span>
                                    </div>
                                  )}
                                  {empRazon && (
                                    <div className="ficha-field field-span-2">
                                      <span className="field-label">Razón Social:</span>
                                      <span className="field-val">{empRazon}</span>
                                    </div>
                                  )}
                                  {empEstablecimiento && (
                                    <div className="ficha-field field-span-2">
                                      <span className="field-label">Establecimiento:</span>
                                      <span className="field-val">{empEstablecimiento}</span>
                                    </div>
                                  )}
                                  {empAno && (
                                    <div className="ficha-field">
                                      <span className="field-label">Año Fundación:</span>
                                      <span className="field-val">{empAno}</span>
                                    </div>
                                  )}
                                  {empFechaApertura && (
                                    <div className="ficha-field">
                                      <span className="field-label">Fecha Apertura:</span>
                                      <span className="field-val">{empFechaApertura}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 2. Ubicación y Domicilio */}
                              <div className="ficha-section">
                                <div className="ficha-section-title">
                                  <span>📍</span>
                                  <h5>Ubicación y Domicilio</h5>
                                </div>
                                <div className="ficha-grid">
                                  <div className="ficha-field field-span-2">
                                    <span className="field-label">División Política:</span>
                                    <span className="field-val">
                                      {[empEstado, empMunicipio, empParroquia].filter(Boolean).join(' · ')}
                                    </span>
                                  </div>
                                  {empDirFiscal && (
                                    <div className="ficha-field field-span-2">
                                      <span className="field-label">Dirección Fiscal:</span>
                                      <span className="field-val">{empDirFiscal}</span>
                                    </div>
                                  )}
                                  {empDirDetallada && (
                                    <div className="ficha-field field-span-2">
                                      <span className="field-label">Dirección Detallada:</span>
                                      <span className="field-val">{empDirDetallada}</span>
                                    </div>
                                  )}
                                  <div className="ficha-field">
                                    <span className="field-label">Coordenadas:</span>
                                    <span className="field-val">
                                      {typeof emp.lat === 'number' && typeof emp.lon === 'number'
                                        ? `${emp.lat.toFixed(5)}, ${emp.lon.toFixed(5)}`
                                        : 'Sin coordenadas registradas'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* 3. Canales de Contacto */}
                              {(empEmail || empTel1 || empTel2) && (
                                <div className="ficha-section">
                                  <div className="ficha-section-title">
                                    <span>📞</span>
                                    <h5>Canales de Contacto</h5>
                                  </div>
                                  <div className="ficha-grid">
                                    {empEmail && (
                                      <div className="ficha-field field-span-2">
                                        <span className="field-label">Email Principal:</span>
                                        <a href={`mailto:${empEmail}`} className="field-val field-link">
                                          ✉️ {empEmail}
                                        </a>
                                      </div>
                                    )}
                                    {empTel1 && (
                                      <div className="ficha-field">
                                        <span className="field-label">Teléfono 1:</span>
                                        <a href={`tel:${empTel1}`} className="field-val field-link">
                                          📞 {empTel1}
                                        </a>
                                      </div>
                                    )}
                                    {empTel2 && (
                                      <div className="ficha-field">
                                        <span className="field-label">Teléfono 2:</span>
                                        <a href={`tel:${empTel2}`} className="field-val field-link">
                                          📞 {empTel2}
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 4. Personal y Nómina */}
                              {(empObreros || empEmpleados || empDirectivos || empTotalEmp) && (
                                <div className="ficha-section">
                                  <div className="ficha-section-title">
                                    <span>👥</span>
                                    <h5>Personal y Nómina (CIEC)</h5>
                                  </div>
                                  <div className="ficha-payroll-grid">
                                    <div className="payroll-card">
                                      <span className="payroll-val">{empObreros || '0'}</span>
                                      <span className="payroll-label">Nº Obreros</span>
                                    </div>
                                    <div className="payroll-card">
                                      <span className="payroll-val">{empEmpleados || '0'}</span>
                                      <span className="payroll-label">Nº Empleados</span>
                                    </div>
                                    <div className="payroll-card">
                                      <span className="payroll-val">{empDirectivos || '0'}</span>
                                      <span className="payroll-label">Nº Directivos</span>
                                    </div>
                                    <div className="payroll-card total-card">
                                      <span className="payroll-val">{empTotalEmp || '0'}</span>
                                      <span className="payroll-label">Total Nómina</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 5. Clasificación Industrial CAEV */}
                              {(empSeccionCAEV || empDivisionCAEV || empClaseCAEV) && (
                                <div className="ficha-section">
                                  <div className="ficha-section-title">
                                    <span>🏭</span>
                                    <h5>Clasificación de Actividad Económica (CAEV)</h5>
                                  </div>
                                  <div className="ficha-grid">
                                    <div className="ficha-field">
                                      <span className="field-label">Sección CAEV:</span>
                                      <span className="field-val caev-pill">{empSeccionCAEV || '-'}</span>
                                    </div>
                                    <div className="ficha-field">
                                      <span className="field-label">División CAEV:</span>
                                      <span className="field-val caev-pill">{empDivisionCAEV || '-'}</span>
                                    </div>
                                    <div className="ficha-field">
                                      <span className="field-label">Clase CAEV:</span>
                                      <span className="field-val caev-pill">{empClaseCAEV || '-'}</span>
                                    </div>
                                    <div className="ficha-field">
                                      <span className="field-label">Sector Asignado:</span>
                                      <span className="field-val">{sec.label}</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 6. Producción, Marcas, Procesos y Gremios */}
                              {(empProductos || empMarcas || empProcesos || empGremios) && (
                                <div className="ficha-section">
                                  <div className="ficha-section-title">
                                    <span>📦</span>
                                    <h5>Producción, Marcas y Gremios</h5>
                                  </div>
                                  <div className="ficha-grid">
                                    {empProductos && (
                                      <div className="ficha-field field-span-2">
                                        <span className="field-label">Productos Elaborados:</span>
                                        <span className="field-val">{empProductos}</span>
                                      </div>
                                    )}
                                    {empMarcas && (
                                      <div className="ficha-field field-span-2">
                                        <span className="field-label">Marcas Comerciales:</span>
                                        <span className="field-val highlight-marcas">{empMarcas}</span>
                                      </div>
                                    )}
                                    {empProcesos && (
                                      <div className="ficha-field field-span-2">
                                        <span className="field-label">Procesos Productivos:</span>
                                        <span className="field-val">{empProcesos}</span>
                                      </div>
                                    )}
                                    {empGremios && (
                                      <div className="ficha-field field-span-2">
                                        <span className="field-label">Gremios y Cámaras:</span>
                                        <span className="field-val">{empGremios}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-empresas-box">
                <p className="empty-title">Sin empresas registradas aún</p>
                <p className="empty-desc">
                  Usa el formulario superior para registrar la primera empresa en {municipio.nombre}.
                </p>
              </div>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
