import React, { useState, useRef } from 'react';
import { processImportData } from '../utils/importer';

export default function ImportModal({
  isOpen,
  onClose,
  municipios,
  onApplyImport,
}) {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [duplicateHandling, setDuplicateHandling] = useState('skip'); // 'skip' | 'update'
  const [selectedTab, setSelectedTab] = useState('summary'); // 'summary' | 'review' | 'duplicates'
  const [manualAssignments, setManualAssignments] = useState({}); // { empresaId: municipioId }
  const [inspectedEmpresa, setInspectedEmpresa] = useState(null); // Empresa seleccionada para ver 26 columnas
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      processFile(selected);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      processFile(dropped);
    }
  };

  const processFile = (inputFile) => {
    setFile(inputFile);
    setIsProcessing(true);
    setImportResult(null);
    setManualAssignments({});

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const arrayBuffer = evt.target.result;
        // SheetJS: pasar arrayBuffer con codepage y tipo 'array' que respeta UTF-8 íntegro
        const result = processImportData(arrayBuffer, municipios, municipios);
        setImportResult(result);
        setSelectedTab(result.needsReviewList.length > 0 ? 'review' : 'summary');
      } catch (err) {
        console.error('Error al procesar archivo:', err);
        alert('Error al leer el archivo Excel/CSV: ' + err.message);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(inputFile);
  };

  const handleMuniSelectChange = (empresaId, munId) => {
    setManualAssignments((prev) => ({
      ...prev,
      [empresaId]: munId,
    }));
  };

  const handleBatchAssignToMuni = (targetMuniId) => {
    if (!importResult) return;
    const newAssignments = { ...manualAssignments };
    importResult.needsReviewList.forEach((emp) => {
      if (!emp.matchedMunicipioId) {
        newAssignments[emp.id] = targetMuniId;
      }
    });
    setManualAssignments(newAssignments);
  };

  const handleConfirmImport = () => {
    if (!importResult) return;

    // Crear lista final de empresas a agregar / actualizar
    const finalAdded = [];
    const finalUpdated = [];
    let skippedCount = 0;

    // 1. Nuevas empresas
    importResult.added.forEach((emp) => {
      const assignedMuniId = manualAssignments[emp.id] || emp.matchedMunicipioId;
      if (assignedMuniId) {
        finalAdded.push({
          ...emp,
          matchedMunicipioId: assignedMuniId,
        });
      } else {
        // Si aún no tiene municipio y el usuario no lo asignó, se asigna a Valencia o al primer municipio
        finalAdded.push({
          ...emp,
          matchedMunicipioId: 'val',
          matchedMunicipioNombre: 'Valencia (asignado por defecto)',
        });
      }
    });

    // 2. Duplicados según la opción seleccionada
    if (duplicateHandling === 'update') {
      importResult.duplicates.forEach((dup) => {
        const assignedMuniId = manualAssignments[dup.newEmpresa.id] || dup.newEmpresa.matchedMunicipioId || dup.municipioId;
        finalUpdated.push({
          ...dup.newEmpresa,
          id: dup.existingEmpresa.id,
          matchedMunicipioId: assignedMuniId,
        });
      });
    } else {
      skippedCount = importResult.duplicates.length;
    }

    onApplyImport({
      added: finalAdded,
      updated: finalUpdated,
      skippedCount,
      totalProcessed: importResult.totalFilas,
      reviewCount: importResult.needsReviewList.length,
    });

    onClose();
  };

  return (
    <div className="modal-backdrop-overlay" role="dialog" aria-modal="true">
      <div className="import-modal-container">
        {/* Cabecera */}
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-header-icon">📥</span>
            <div>
              <h2>Importar Reporte de Empresas (Excel / CSV)</h2>
              <p className="modal-subtitle">
                Carga el reporte de la CIEC (.xlsx o .csv) para integrar nuevos establecimientos industriales
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">
            &times;
          </button>
        </div>

        {/* Cuerpo */}
        <div className="modal-body-content">
          {/* Zona de Dropzone si no hay resultado */}
          {!importResult && (
            <div
              className={`import-dropzone ${dragOver ? 'is-dragover' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <div className="dropzone-icon">📊</div>
              <h3>Haz clic o arrastra aquí tu archivo Excel o CSV</h3>
              <p className="dropzone-hint">
                Compatible con el formato oficial CIEC (.xlsx, .csv) con codificación UTF-8
              </p>
              {isProcessing && (
                <div className="dropzone-loading">
                  <span className="spinner-dot"></span>
                  <span>Procesando archivo y validando coordenadas...</span>
                </div>
              )}
            </div>
          )}

          {/* Si ya se parseó el archivo */}
          {importResult && (
            <div className="import-results-wrapper">
              {/* Tarjetas de Métricas de Resumen */}
              <div className="import-stats-grid">
                <div className="stat-card stat-success">
                  <div className="stat-value">{importResult.added.length}</div>
                  <div className="stat-label">Empresas Nuevas</div>
                  <div className="stat-sub">Listas para incorporar</div>
                </div>

                <div className={`stat-card ${importResult.needsReviewList.length > 0 ? 'stat-warning' : 'stat-neutral'}`}>
                  <div className="stat-value">{importResult.needsReviewList.length}</div>
                  <div className="stat-label">Requieren Revisión</div>
                  <div className="stat-sub">Municipio o coordenadas dudosas</div>
                </div>

                <div className="stat-card stat-info">
                  <div className="stat-value">{importResult.duplicates.length}</div>
                  <div className="stat-label">Duplicados Detectados</div>
                  <div className="stat-sub">Por RIF y Establecimiento</div>
                </div>

                <div className="stat-card stat-neutral">
                  <div className="stat-value">{importResult.totalFilas}</div>
                  <div className="stat-label">Total Filas Leídas</div>
                  <div className="stat-sub">{file?.name}</div>
                </div>
              </div>

              {/* Manejo de Duplicados (Punto 6 del requerimiento) */}
              {importResult.duplicates.length > 0 && (
                <div className="duplicates-action-banner">
                  <div className="duplicates-info">
                    <strong>⚠️ Se detectaron {importResult.duplicates.length} empresas ya existentes en el mapa:</strong>
                    <span>¿Deseas actualizar sus datos o mantener los existentes?</span>
                  </div>
                  <div className="duplicates-choices">
                    <label className="choice-radio">
                      <input
                        type="radio"
                        name="dupChoice"
                        value="skip"
                        checked={duplicateHandling === 'skip'}
                        onChange={() => setDuplicateHandling('skip')}
                      />
                      <span>Mantener existentes (saltar duplicados)</span>
                    </label>
                    <label className="choice-radio">
                      <input
                        type="radio"
                        name="dupChoice"
                        value="update"
                        checked={duplicateHandling === 'update'}
                        onChange={() => setDuplicateHandling('update')}
                      />
                      <span>Actualizar con los datos nuevos</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Pestañas de Navegación */}
              <div className="import-tabs-bar">
                <button
                  type="button"
                  className={`tab-btn ${selectedTab === 'review' ? 'is-active' : ''}`}
                  onClick={() => setSelectedTab('review')}
                >
                  Revisión Manual ({importResult.needsReviewList.length})
                </button>
                <button
                  type="button"
                  className={`tab-btn ${selectedTab === 'summary' ? 'is-active' : ''}`}
                  onClick={() => setSelectedTab('summary')}
                >
                  Todas las Empresas ({importResult.parsedEmpresas.length})
                </button>
                {importResult.duplicates.length > 0 && (
                  <button
                    type="button"
                    className={`tab-btn ${selectedTab === 'duplicates' ? 'is-active' : ''}`}
                    onClick={() => setSelectedTab('duplicates')}
                  >
                    Duplicados ({importResult.duplicates.length})
                  </button>
                )}
              </div>

              {/* Contenido según pestaña */}
              <div className="import-tab-content">
                {/* Pestaña: Revisión Manual */}
                {selectedTab === 'review' && (
                  <div className="review-list-view">
                    <div className="review-header-tools">
                      <p className="review-instruction">
                        Revisa empresas con coordenadas fuera del estado o sin municipio asignado en el reporte:
                      </p>
                      <div className="batch-assign-group">
                        <label>Asignar todas las pendientes sin municipio a:</label>
                        <select
                          className="quick-muni-select"
                          onChange={(e) => {
                            if (e.target.value) handleBatchAssignToMuni(e.target.value);
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Seleccionar municipio...</option>
                          {municipios.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="review-items-container">
                      {importResult.needsReviewList.map((emp) => {
                        const assignedMuni = manualAssignments[emp.id] || emp.matchedMunicipioId;
                        return (
                          <div key={emp.id} className="review-item-card">
                            <div className="review-item-main">
                              <div className="review-item-title-row">
                                <h4 className="review-emp-name">{emp.n}</h4>
                                {emp.rif && <span className="review-rif-pill">{emp.rif}</span>}
                              </div>
                              <p className="review-emp-desc">
                                {emp.direccionDetallada || emp.direccionFiscal || emp.nota || 'Sin dirección registrada'}
                              </p>

                              {/* Alertas de revisión */}
                              <div className="review-tags-row">
                                {emp.needsMuniReview && (
                                  <span className="tag-warning">
                                    🏢 Sin municipio ({emp.municipioRaw || 'campo vacío'})
                                  </span>
                                )}
                                {emp.coordWarning && (
                                  <span className="tag-danger">
                                    📍 {emp.coordReviewReason}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="review-item-action">
                              <label className="action-label">Municipio asignado:</label>
                              <select
                                className="action-select"
                                value={assignedMuni || ''}
                                onChange={(e) => handleMuniSelectChange(emp.id, e.target.value)}
                              >
                                <option value="">-- Asignar municipio --</option>
                                {municipios.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.nombre}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pestaña: Resumen de todas las empresas */}
                {selectedTab === 'summary' && (
                  <div className="summary-table-view">
                    <table className="import-data-table">
                      <thead>
                        <tr>
                          <th>Establecimiento / RIF</th>
                          <th>Sector / CAEV</th>
                          <th>Municipio Asignado</th>
                          <th>Coordenadas</th>
                          <th>Nómina</th>
                          <th>Validación</th>
                          <th>Ficha CIEC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.parsedEmpresas.slice(0, 100).map((emp) => {
                          const assignedMuniId = manualAssignments[emp.id] || emp.matchedMunicipioId;
                          const assignedMuni = municipios.find((m) => m.id === assignedMuniId);
                          const totalNomina = emp.totalEmpleados ?? emp['Total Empleados'];
                          return (
                            <tr key={emp.id} className={emp.needsReview ? 'row-needs-review' : ''}>
                              <td>
                                <strong>{emp.n}</strong>
                                {emp.rif && <div className="table-sub">RIF: {emp.rif}</div>}
                                {emp.razonSocial && emp.razonSocial !== emp.n && (
                                  <div className="table-sub-razon">{emp.razonSocial}</div>
                                )}
                              </td>
                              <td>
                                <span className={`table-sector-badge sector-${emp.sector}`}>
                                  {emp.sector}
                                </span>
                                {emp.seccionCAEV && (
                                  <span className="table-caev-sub">CAEV: {emp.seccionCAEV}-{emp.divisionCAEV || ''}</span>
                                )}
                              </td>
                              <td>{assignedMuni ? assignedMuni.nombre : (emp.municipioRaw || 'Por asignar')}</td>
                              <td>
                                {emp.lat !== null && emp.lon !== null ? (
                                  <span className={emp.coordWarning ? 'coord-alert' : ''}>
                                    {emp.lat.toFixed(4)}, {emp.lon.toFixed(4)}
                                    {emp.coordWarning && ' ⚠️'}
                                  </span>
                                ) : (
                                  <span className="coord-missing">Sin coordenadas</span>
                                )}
                              </td>
                              <td>
                                {totalNomina ? (
                                  <span className="table-nomina-val">👥 {totalNomina}</span>
                                ) : (
                                  <span className="table-nomina-empty">-</span>
                                )}
                              </td>
                              <td>
                                {emp.needsReview ? (
                                  <span className="badge-status-review">Revisión manual</span>
                                ) : (
                                  <span className="badge-status-ok">Listo ✓</span>
                                )}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn-inspect-ciec"
                                  onClick={() => setInspectedEmpresa(emp)}
                                  title="Inspeccionar las 26 columnas del reporte CIEC para esta fila"
                                >
                                  🔍 26 col.
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {importResult.parsedEmpresas.length > 100 && (
                      <p className="table-overflow-hint">
                        Mostrando primeras 100 de {importResult.parsedEmpresas.length} empresas.
                      </p>
                    )}
                  </div>
                )}

                {/* Pestaña: Duplicados */}
                {selectedTab === 'duplicates' && (
                  <div className="duplicates-list-view">
                    <table className="import-data-table">
                      <thead>
                        <tr>
                          <th>Empresa Duplicada</th>
                          <th>RIF</th>
                          <th>Municipio Existente</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.duplicates.map((dup, i) => (
                          <tr key={i}>
                            <td>
                              <strong>{dup.newEmpresa.n}</strong>
                            </td>
                            <td>{dup.newEmpresa.rif}</td>
                            <td>{dup.municipioNombre}</td>
                            <td>
                              {duplicateHandling === 'update' ? (
                                <span className="badge-update">Se actualizará</span>
                              ) : (
                                <span className="badge-skip">Se mantendrá existente</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer con Acciones */}
        <div className="modal-footer">
          {importResult && (
            <button
              type="button"
              className="btn-change-file"
              onClick={() => {
                setFile(null);
                setImportResult(null);
              }}
            >
              ← Cambiar archivo
            </button>
          )}

          <div className="footer-right-group">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>
              Cancelar
            </button>
            {importResult && (
              <button
                type="button"
                className="btn-modal-confirm"
                onClick={handleConfirmImport}
              >
                Integrar {importResult.added.length} empresas al mapa
              </button>
            )}
          </div>
        </div>

        {/* Modal Inspector de las 26 Columnas CIEC */}
        {inspectedEmpresa && (
          <div className="ciec-inspector-overlay" onClick={() => setInspectedEmpresa(null)}>
            <div className="ciec-inspector-card" onClick={(e) => e.stopPropagation()}>
              <div className="inspector-header">
                <div>
                  <h4>Ficha Técnica CIEC: {inspectedEmpresa.n}</h4>
                  <span className="inspector-sub">
                    Fila #{inspectedEmpresa.rowIndex} &middot; RIF: {inspectedEmpresa.rif || 'Sin RIF'} &middot; {inspectedEmpresa.sector?.toUpperCase()}
                  </span>
                </div>
                <button type="button" className="inspector-close-btn" onClick={() => setInspectedEmpresa(null)} aria-label="Cerrar">
                  &times;
                </button>
              </div>

              <div className="inspector-table-wrapper">
                <table className="inspector-data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '38%' }}>Columna CIEC (Exacta)</th>
                      <th style={{ width: '62%' }}>Valor Registrado en Fila</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['1. RIF Compañía', inspectedEmpresa['RIF Compañía'] || inspectedEmpresa.rif],
                      ['2. Razón Social', inspectedEmpresa['Razón Social'] || inspectedEmpresa.razonSocial],
                      ['3. Año Fundación', inspectedEmpresa['Año Fundación'] || inspectedEmpresa.anoFundacion],
                      ['4. Dirección Fiscal', inspectedEmpresa['Dirección Fiscal'] || inspectedEmpresa.direccionFiscal],
                      ['5. Nombre Establecimiento', inspectedEmpresa['Nombre Establecimiento'] || inspectedEmpresa.nombreEstablecimiento || inspectedEmpresa.n],
                      ['6. Fecha Apertura', inspectedEmpresa['Fecha Apertura'] || inspectedEmpresa.fechaApertura],
                      ['7. Email Principal', inspectedEmpresa['Email Principal'] || inspectedEmpresa.emailPrincipal],
                      ['8. Teléfono 1', inspectedEmpresa['Teléfono 1'] || inspectedEmpresa.telefono1],
                      ['9. Teléfono 2', inspectedEmpresa['Teléfono 2'] || inspectedEmpresa.telefono2],
                      ['10. Estado', inspectedEmpresa['Estado'] || inspectedEmpresa.estadoGeografico],
                      ['11. Municipio', inspectedEmpresa['Municipio'] || inspectedEmpresa.municipioRaw],
                      ['12. Parroquia', inspectedEmpresa['Parroquia'] || inspectedEmpresa.parroquia],
                      ['13. Dirección Detallada', inspectedEmpresa['Dirección Detallada'] || inspectedEmpresa.direccionDetallada],
                      ['14. Latitud', inspectedEmpresa['Latitud'] ?? inspectedEmpresa.lat],
                      ['15. Longitud', inspectedEmpresa['Longitud'] ?? inspectedEmpresa.lon],
                      ['16. Nº Obreros', inspectedEmpresa['Nº Obreros'] ?? inspectedEmpresa.numObreros],
                      ['17. Nº Empleados', inspectedEmpresa['Nº Empleados'] ?? inspectedEmpresa.numEmpleados],
                      ['18. Nº Directivos', inspectedEmpresa['Nº Directivos'] ?? inspectedEmpresa.numDirectivos],
                      ['19. Total Empleados', inspectedEmpresa['Total Empleados'] ?? inspectedEmpresa.totalEmpleados],
                      ['20. Sección CAEV', inspectedEmpresa['Sección CAEV'] || inspectedEmpresa.seccionCAEV],
                      ['21. División CAEV', inspectedEmpresa['División CAEV'] || inspectedEmpresa.divisionCAEV],
                      ['22. Clase CAEV', inspectedEmpresa['Clase CAEV'] || inspectedEmpresa.claseCAEV],
                      ['23. Productos', inspectedEmpresa['Productos'] || inspectedEmpresa.productos],
                      ['24. Marcas', inspectedEmpresa['Marcas'] || inspectedEmpresa.marcas],
                      ['25. Procesos Productivos', inspectedEmpresa['Procesos Productivos'] || inspectedEmpresa.procesosProductivos],
                      ['26. Gremios', inspectedEmpresa['Gremios'] || inspectedEmpresa.gremios],
                    ].map(([colName, colVal], idx) => (
                      <tr key={idx}>
                        <td className="col-name-cell">{colName}</td>
                        <td className="col-val-cell">
                          {colVal !== undefined && colVal !== null && colVal !== '' ? (
                            String(colVal)
                          ) : (
                            <span className="empty-field-dash">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="inspector-footer">
                <button type="button" className="btn-inspector-done" onClick={() => setInspectedEmpresa(null)}>
                  Cerrar Inspección
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
