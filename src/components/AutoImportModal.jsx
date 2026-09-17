import React, { useState } from 'react';

export default function AutoImportModal({
  isOpen,
  onClose,
  queueStatus,
  onRefresh,
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const folderPath =
    queueStatus?.queueFolder ||
    'data/import-queue';

  const isProcessing = queueStatus?.isProcessing || false;
  const currentJob = queueStatus?.currentJob || {};
  const logs = queueStatus?.logs || [];

  const handleCopyPath = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(folderPath).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const formatDateTime = (isoStr) => {
    if (!isoStr) return '--';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (_) {
      return isoStr;
    }
  };

  const progressPercent =
    currentJob.progress?.total > 0
      ? Math.round((currentJob.progress.current / currentJob.progress.total) * 100)
      : 0;

  return (
    <div className="modal-backdrop auto-import-backdrop" role="dialog" aria-modal="true" aria-labelledby="auto-import-title">
      <div className="modal-container auto-import-modal-container">
        {/* Encabezado */}
        <div className="modal-header auto-import-header">
          <div className="header-title-group">
            <div className="header-icon-circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                <polyline points="12 11 12 17 14 15"></polyline>
              </svg>
            </div>
            <div>
              <div className="header-title-row">
                <h2 id="auto-import-title">Cola de Importaciones Automáticas</h2>
                <span className="live-status-pill is-active" title="El servidor vigila la carpeta de forma continua">
                  <span className="pulse-dot"></span> Vigilancia activa
                </span>
              </div>
              <p className="auto-import-subtitle">
                Procesamiento y verificación continua en segundo plano por el backend
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Cerrar ventana"
          >
            &times;
          </button>
        </div>

        <div className="modal-body auto-import-body">
          {/* Tarjeta con la ruta exacta de la carpeta */}
          <div className="queue-folder-card">
            <div className="folder-card-label">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
              </svg>
              <span>Carpeta vigilada en este equipo</span>
            </div>
            <p className="folder-instructions">
              Copia o arrastra archivos <strong>.xlsx</strong> o <strong>.csv</strong> directamente a esta carpeta en tu explorador de archivos. El servidor los detecta en 2 segundos, procesa sus 26 columnas y verifica ubicaciones automáticamente.
            </p>
            <div className="folder-path-display-box">
              <code className="folder-path-code" title={folderPath}>
                {folderPath}
              </code>
              <button
                type="button"
                className={`btn-copy-path ${copied ? 'is-copied' : ''}`}
                onClick={handleCopyPath}
                title="Copiar ruta de la carpeta al portapapeles"
              >
                {copied ? (
                  <>
                    <span className="copy-check">✓</span>
                    <span>¡Ruta copiada!</span>
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copiar ruta</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Estado de procesamiento en vivo (si hay archivo en curso) */}
          {isProcessing && (
            <div className="live-job-banner">
              <div className="job-banner-header">
                <div className="spinner-indicator"></div>
                <div>
                  <strong>Procesando ahora: {currentJob.filename}</strong>
                  <div className="job-step-desc">
                    {currentJob.step === 'parsing' && 'Leyendo estructura y extrayendo 26 columnas...'}
                    {currentJob.step === 'saving' && 'Guardando nuevas empresas en el dataset...'}
                    {currentJob.step === 'verifying' && (
                      <span>
                        Verificando con Google / Nominatim ({currentJob.progress?.current || 0} de {currentJob.progress?.total || 0}) &middot;{' '}
                        <strong className="text-success">{currentJob.progress?.autoVerified || 0} confirmadas</strong> &middot;{' '}
                        <strong className="text-warning">{currentJob.progress?.pendingReview || 0} en revisión</strong>
                      </span>
                    )}
                  </div>
                </div>
                <span className="progress-badge">{progressPercent}%</span>
              </div>
              {currentJob.step === 'verifying' && (
                <div className="job-progress-bar-container">
                  <div
                    className="job-progress-bar-fill"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              )}
            </div>
          )}

          {/* Historial de corridas */}
          <div className="queue-history-section">
            <div className="section-header-row">
              <h3>Historial de Procesamiento ({logs.length})</h3>
              <button
                type="button"
                className="btn-refresh-logs"
                onClick={onRefresh}
                title="Actualizar estado e historial ahora"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6"></path>
                  <path d="M1 20v-6h6"></path>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                <span>Actualizar</span>
              </button>
            </div>

            {logs.length === 0 ? (
              <div className="empty-history-state">
                <div className="empty-history-icon">📂</div>
                <h4>Aún no hay corridas registradas</h4>
                <p>
                  Coloca un archivo como <code>Reporte_CIEC_2026-09-01.xlsx</code> en la carpeta de entrada para que el servidor lo procese de inmediato.
                </p>
              </div>
            ) : (
              <div className="history-table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Fecha / Archivo</th>
                      <th>Estado</th>
                      <th>Filas</th>
                      <th>Agregadas</th>
                      <th>Duplicados</th>
                      <th>Verificadas Auto</th>
                      <th>Revisión</th>
                      <th>Destino</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((entry) => {
                      const isSuccess = entry.estado === 'completado';
                      return (
                        <tr key={entry.id || entry.fecha} className={`history-row ${isSuccess ? 'is-success' : 'is-error'}`}>
                          <td className="cell-file">
                            <div className="file-name-text" title={entry.archivo}>{entry.archivo}</div>
                            <span className="file-date-sub">{formatDateTime(entry.fecha)}</span>
                          </td>
                          <td className="cell-status">
                            <span className={`status-badge ${isSuccess ? 'badge-completed' : 'badge-error'}`}>
                              {isSuccess ? '✓ Completado' : '✖ Error'}
                            </span>
                          </td>
                          <td className="cell-metric">{entry.totalFilas ?? '--'}</td>
                          <td className="cell-metric">
                            {entry.empresasAgregadas > 0 ? (
                              <span className="metric-added">+{entry.empresasAgregadas}</span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td className="cell-metric text-muted">{entry.duplicadosOmitidos ?? 0}</td>
                          <td className="cell-metric">
                            <span className="metric-verified">✓ {entry.verificadasAuto ?? 0}</span>
                          </td>
                          <td className="cell-metric">
                            {entry.pendientesRevision > 0 ? (
                              <span className="metric-review">⚠ {entry.pendientesRevision}</span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td className="cell-dest" title={entry.archivoDestino}>
                            <code className="dest-code">
                              {entry.archivoDestino ? entry.archivoDestino.split(/[\\/]/).pop() : '--'}
                            </code>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer auto-import-footer">
          <div className="footer-legend">
            <span className="legend-item">✓ &lt;500m ubicación confirmada</span>
            <span className="legend-item">⚠ &ge;500m pendiente de revisión manual</span>
          </div>
          <button
            type="button"
            className="btn-modal-close-main"
            onClick={onClose}
          >
            Entendido, cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
