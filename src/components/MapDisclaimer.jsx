import React, { useState } from 'react';

export default function MapDisclaimer({ inline = false, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside
      className={`map-disclaimer-container ${inline ? 'is-inline-disclaimer' : ''} ${className}`}
      aria-label="Aviso de precisión cartográfica"
    >
      {!isOpen ? (
        <button
          type="button"
          className="disclaimer-collapsed-pill"
          onClick={() => setIsOpen(true)}
          title="Ver nota de rigor y precisión geográfica"
        >
          <span className="disclaimer-info-icon" aria-hidden="true">i</span>
          <span className="disclaimer-short-text">
            <strong>Nota de rigor:</strong> Coordenadas de empresas son aproximadas a su zona/parque industrial.
          </span>
          <span className="disclaimer-expand-action">Ver detalle &raquo;</span>
        </button>
      ) : (
        <div className="disclaimer-expanded-card" role="dialog" aria-modal="false">
          <div className="disclaimer-card-header">
            <h4>Rigor y Precisión Cartográfica</h4>
            <button
              type="button"
              className="disclaimer-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar nota de precisión"
            >
              &times;
            </button>
          </div>
          <div className="disclaimer-card-body">
            <p>
              <strong>Instalaciones con coordenadas verificadas:</strong> La Refinería El Palito,
              el Puerto de Puerto Cabello, Planta Centro y el Complejo Petroquímico Morón (Pequiven)
              están georreferenciadas con precisión verificada en fuentes públicas.
            </p>
            <p>
              <strong>Demás empresas e instalaciones:</strong> Corresponden a <em>aproximaciones</em>
              a sus respectivos parques o corredores industriales conocidos, no a direcciones catastrales exactas.
              La aplicación permite refinar o agregar nuevas coordenadas usando el buscador o el pin sobre el mapa.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
