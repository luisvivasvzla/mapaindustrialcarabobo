import React, { useState, useRef, useEffect } from 'react';
import { verifyCompanyLocation } from '../utils/verifier';
import { formatDistance } from '../utils/geo';

export default function VerificationBatchModal({
  isOpen,
  onClose,
  municipios,
  onUpdateEmpresas,
  onInspectDiscrepancy,
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentCompany, setCurrentCompany] = useState(null);
  const [autoVerifiedList, setAutoVerifiedList] = useState([]);
  const [discrepancyList, setDiscrepancyList] = useState([]);
  const [notFoundList, setNotFoundList] = useState([]);
  const [isFinished, setIsFinished] = useState(false);
  const [activeTab, setActiveTab] = useState('discrepancy'); // 'discrepancy' | 'auto' | 'notfound'

  const stopRequestedRef = useRef(false);

  // Extraer todas las empresas sin verificar
  const pendingEmpresas = React.useMemo(() => {
    const list = [];
    municipios.forEach((m) => {
      if (Array.isArray(m.empresas)) {
        m.empresas.forEach((e) => {
          if (!e.verificado) {
            list.push({ empresa: e, municipioId: m.id, municipioNombre: m.nombre });
          }
        });
      }
    });
    return list;
  }, [municipios]);

  useEffect(() => {
    if (!isOpen) {
      setIsRunning(false);
      stopRequestedRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartVerification = async () => {
    setIsRunning(true);
    setIsFinished(false);
    stopRequestedRef.current = false;
    setCurrentIndex(0);
    setAutoVerifiedList([]);
    setDiscrepancyList([]);
    setNotFoundList([]);

    const autoVerified = [];
    const discrepancies = [];
    const notFound = [];

    for (let i = 0; i < pendingEmpresas.length; i++) {
      if (stopRequestedRef.current) break;

      const item = pendingEmpresas[i];
      setCurrentIndex(i + 1);
      setCurrentCompany(item);

      const result = await verifyCompanyLocation(item.empresa, item.municipioNombre);

      if (result.status === 'AUTO_VERIFIED') {
        autoVerified.push({ ...item, result });
        setAutoVerifiedList([...autoVerified]);
      } else if (result.status === 'DISCREPANCY') {
        discrepancies.push({ ...item, result });
        setDiscrepancyList([...discrepancies]);
      } else {
        notFound.push({ ...item, result });
        setNotFoundList([...notFound]);
      }

      // Pausa breve entre peticiones para respetar límites
      if (i < pendingEmpresas.length - 1 && !stopRequestedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    setIsRunning(false);
    setIsFinished(true);
    setCurrentCompany(null);

    // Si hubo auto-verificadas, aplicarlas inmediatamente
    if (autoVerified.length > 0) {
      const updates = autoVerified.map((av) => ({
        empresaId: av.empresa.id,
        municipioId: av.municipioId,
        verificado: true,
        verificadoMetodo: av.result.source || 'google_auto',
        verificadoDistanciaMetros: av.result.distance,
      }));
      onUpdateEmpresas(updates);
    }
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    setIsRunning(false);
  };

  // Resolver discrepancia: Usar la encontrada
  const handleResolveUseSuggested = (discItem) => {
    const { empresa, municipioId, result } = discItem;
    onUpdateEmpresas([
      {
        empresaId: empresa.id,
        municipioId,
        lat: result.geocoded.lat,
        lon: result.geocoded.lon,
        verificado: true,
        verificadoMetodo: 'google_manual_found',
        verificadoDistanciaMetros: result.distance,
      },
    ]);
    setDiscrepancyList((prev) => prev.filter((d) => d.empresa.id !== empresa.id));
  };

  // Resolver discrepancia: Mantener la actual y marcar como verificada de todas formas
  const handleResolveKeepCurrent = (discItem) => {
    const { empresa, municipioId, result } = discItem;
    onUpdateEmpresas([
      {
        empresaId: empresa.id,
        municipioId,
        verificado: true,
        verificadoMetodo: 'user_confirmed_current',
        verificadoDistanciaMetros: result.distance,
      },
    ]);
    setDiscrepancyList((prev) => prev.filter((d) => d.empresa.id !== empresa.id));
  };

  const totalPending = pendingEmpresas.length;
  const progressPercent = totalPending > 0 ? Math.round((currentIndex / totalPending) * 100) : 0;

  return (
    <div className="modal-backdrop-overlay" role="dialog" aria-modal="true">
      <div className="verification-modal-container">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-header-icon">🧭</span>
            <div>
              <h2>Verificación de Ubicaciones en Google</h2>
              <p className="modal-subtitle">
                Búsqueda en Google (Places / Gemini Grounding) y validación de distancia geodésica (±500m)
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="modal-body-content">
          {/* Métricas previas y estado */}
          <div className="verif-stats-banner">
            <div className="verif-stat-box">
              <span className="stat-num">{totalPending}</span>
              <span className="stat-desc">Pendientes por verificar</span>
            </div>
            <div className="verif-stat-box stat-verified">
              <span className="stat-num">{autoVerifiedList.length}</span>
              <span className="stat-desc">Auto-verificadas (&lt;500m)</span>
            </div>
            <div className="verif-stat-box stat-discrepancy">
              <span className="stat-num">{discrepancyList.length}</span>
              <span className="stat-desc">Discrepancias (≥500m)</span>
            </div>
            <div className="verif-stat-box stat-notfound">
              <span className="stat-num">{notFoundList.length}</span>
              <span className="stat-desc">No encontradas en Google</span>
            </div>
          </div>

          {/* Barra de progreso interactiva */}
          {isRunning && (
            <div className="verif-progress-section">
              <div className="progress-header">
                <span>
                  Verificando {currentIndex} de {totalPending} empresas ({progressPercent}%)
                </span>
                <span className="rate-limit-badge">Google Places / Gemini</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
              </div>
              {currentCompany && (
                <div className="current-verif-card">
                  <span className="pulse-indicator"></span>
                  <div className="current-info">
                    <strong>{currentCompany.empresa.n}</strong>
                    <span>{currentCompany.empresa.direccionDetallada || currentCompany.municipioNombre}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Estado no iniciado */}
          {!isRunning && !isFinished && totalPending > 0 && (
            <div className="verif-start-prompt">
              <p>
                Este proceso buscará la ubicación de cada empresa en Google (Google Places / Gemini Grounding).
                Si la distancia entre la coordenada guardada y la encontrada es menor a 500 metros,
                se marcará como <strong>verificada automáticamente</strong> (±Xm). Las que superen 500 metros
                quedarán en una lista de discrepancias para tu revisión manual.
              </p>
              <button
                type="button"
                className="btn-start-batch-verif"
                onClick={handleStartVerification}
              >
                ▶ Iniciar verificación de {totalPending} pendientes
              </button>
            </div>
          )}

          {/* Finalizado o en pausa: Pestañas de resultados */}
          {(isFinished || discrepancyList.length > 0 || autoVerifiedList.length > 0) && (
            <div className="verif-results-section">
              <div className="verif-tabs-bar">
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'discrepancy' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('discrepancy')}
                >
                  ⚠️ Discrepancias ({discrepancyList.length})
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'auto' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('auto')}
                >
                  ✓ Auto-verificadas ({autoVerifiedList.length})
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'notfound' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('notfound')}
                >
                  ❓ No encontradas en Google ({notFoundList.length})
                </button>
              </div>

              <div className="verif-tab-panel">
                {/* Pestaña: Discrepancias */}
                {activeTab === 'discrepancy' && (
                  <div className="discrepancy-panel-list">
                    {discrepancyList.length === 0 ? (
                      <div className="empty-tab-box">
                        <p>No hay discrepancias pendientes de revisión.</p>
                      </div>
                    ) : (
                      discrepancyList.map((item) => {
                        const distFormatted = item.result.distance !== null
                          ? formatDistance(item.result.distance)
                          : 'Sin coord previa';
                        return (
                          <div key={item.empresa.id} className="discrepancy-card">
                            <div className="disc-header">
                              <div>
                                <h4 className="disc-company-name">{item.empresa.n}</h4>
                                <span className="disc-muni">Municipio {item.municipioNombre}</span>
                              </div>
                              <span className="disc-dist-pill">
                                Discrepancia de {distFormatted}
                              </span>
                            </div>

                            <p className="disc-address">
                              <strong>Dirección consultada:</strong> {item.result.addressQueried}
                            </p>

                            <div className="disc-comparison-grid">
                              <div className="coord-compare-box current-box">
                                <span className="coord-box-tag">Ubicación Guardada</span>
                                <div className="coords-val">
                                  {typeof item.empresa.lat === 'number'
                                    ? `${item.empresa.lat.toFixed(5)}, ${item.empresa.lon.toFixed(5)}`
                                    : 'Sin coordenadas'}
                                </div>
                              </div>
                              <div className="coord-compare-box suggested-box">
                                <span className="coord-box-tag">Encontrada en Google</span>
                                <div className="coords-val">
                                  {item.result.geocoded.lat.toFixed(5)}, {item.result.geocoded.lon.toFixed(5)}
                                </div>
                                <div className="geocoded-label" title={item.result.geocoded.displayName}>
                                  📍 {item.result.geocoded.displayName}
                                </div>
                              </div>
                            </div>

                            <div className="disc-actions-row">
                              <button
                                type="button"
                                className="btn-use-suggested"
                                onClick={() => handleResolveUseSuggested(item)}
                              >
                                ✓ Usar la encontrada
                              </button>
                              <button
                                type="button"
                                className="btn-keep-current"
                                onClick={() => handleResolveKeepCurrent(item)}
                              >
                                Mantener la actual y marcar como verificada de todas formas
                              </button>
                              {onInspectDiscrepancy && (
                                <button
                                  type="button"
                                  className="btn-inspect-map"
                                  onClick={() => {
                                    onInspectDiscrepancy(item);
                                    onClose();
                                  }}
                                >
                                  🔍 Ver en mapa
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Pestaña: Auto-confirmadas */}
                {activeTab === 'auto' && (
                  <div className="auto-verified-list">
                    {autoVerifiedList.map((item) => (
                      <div key={item.empresa.id} className="auto-verified-item">
                        <div className="auto-verif-main">
                          <strong>{item.empresa.n}</strong>
                          <span className="auto-verif-dist">
                            ±{Math.round(item.result.distance)} m de diferencia
                          </span>
                        </div>
                        <span className="badge-confirmed">✓ Confirmada</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pestaña: No encontradas */}
                {activeTab === 'notfound' && (
                  <div className="notfound-list">
                    {notFoundList.map((item) => (
                      <div key={item.empresa.id} className="notfound-item">
                        <div>
                          <strong>{item.empresa.n}</strong>
                          <div className="table-sub">{item.result.addressQueried}</div>
                        </div>
                        <span className="badge-notfound">No encontrada en Google</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {isRunning ? (
            <button type="button" className="btn-modal-cancel" onClick={handleStop}>
              ⏹ Detener proceso
            </button>
          ) : (
            <button type="button" className="btn-modal-confirm" onClick={onClose}>
              Cerrar y ver mapa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
