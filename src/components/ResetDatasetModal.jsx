import React from 'react';
import MapDisclaimer from './MapDisclaimer';

export default function ResetDatasetModal({
  isOpen,
  onClose,
  onConfirm,
  totalEmpresas = 0,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title">
      <div className="modal-container reset-dataset-modal">
        <div className="modal-header">
          <div className="modal-header-title-group">
            <span className="modal-danger-icon" aria-hidden="true">⚠️</span>
            <h2 id="reset-modal-title">Reiniciar dataset de empresas</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            &times;
          </button>
        </div>

        <div className="modal-body reset-modal-body">
          <div className="reset-alert-box" role="alert">
            <p className="reset-alert-main">
              Esto eliminará las <strong>{totalEmpresas} empresas cargadas</strong>. Esta acción no se puede deshacer. ¿Confirmas?
            </p>
            <p className="reset-alert-sub">
              La estructura geográfica de los 14 municipios (nombres, capitales, coordenadas, sectores base y resúmenes) permanecerá intacta. Solo se vaciarán las listas de empresas registradas.
            </p>
          </div>

          <div className="reset-impact-summary">
            <div className="impact-item">
              <span className="impact-label">Empresas a eliminar:</span>
              <strong className="impact-val impact-val-danger">{totalEmpresas}</strong>
            </div>
            <div className="impact-item">
              <span className="impact-label">Municipios conservados:</span>
              <strong className="impact-val impact-val-safe">14 municipios</strong>
            </div>
            <div className="impact-item">
              <span className="impact-label">Persistencia:</span>
              <strong className="impact-val">Se guardará automáticamente en disco</strong>
            </div>
          </div>

          {/* Nota discreta de rigor al pie del modal */}
          <div className="reset-modal-disclaimer-wrapper">
            <MapDisclaimer inline={true} />
          </div>
        </div>

        <div className="modal-footer reset-modal-footer">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="btn-modal-danger-confirm"
            id="btn-confirmar-vaciar-todo"
            onClick={onConfirm}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Sí, vaciar todo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
