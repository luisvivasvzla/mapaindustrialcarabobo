import React, { useState, useRef, useEffect } from 'react';
import { SECTORES } from '../constants/sectores';

export default function TopBarControls({
  totalEmpresas,
  totalMunicipios,
  totalVerificadas = 0,
  filteredEmpresasCount,
  selectedSectors,
  onToggleSector,
  onlyUnverified,
  onToggleOnlyUnverified,
  searchQuery,
  onSearchChange,
  onClearFilters,
  onOpenImportModal,
  onOpenBatchVerify,
  onOpenHome,
  onOpenResetModal,
  onOpenAutoImport,
  autoImportProcessing = false,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const pendingCount = totalEmpresas - totalVerificadas;
  const hasActiveFilters = selectedSectors.length > 0 || searchQuery.trim().length > 0 || onlyUnverified;

  // Cerrar menú al hacer clic fuera o presionar Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <header className="topbar-controls-container" aria-label="Barra superior de control y filtros">
      {/* Fila superior: Título, Contadores, Botones de Acción y Buscador */}
      <div className="topbar-main-row">
        {/* Identidad y contadores */}
        <div 
          className="topbar-brand-group is-clickable" 
          onClick={onOpenHome}
          title="Volver a la pantalla de inicio"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenHome?.();
            }
          }}
        >
          <div className="topbar-logo-badge" aria-hidden="true">C</div>
          <div className="topbar-titles">
            <h1>Mapa Industrial de Carabobo</h1>
            <div className="topbar-real-counter" id="total-counter">
              <span className="counter-text">
                <strong>{totalEmpresas} empresas</strong> &middot; <strong>{totalMunicipios} municipios</strong>
              </span>
              <span className="counter-verified-pill" title={`${totalVerificadas} de ${totalEmpresas} tienen ubicación confirmada`}>
                ✓ {totalVerificadas} de {totalEmpresas} ubicaciones verificadas
              </span>
              {hasActiveFilters && (
                <span className="counter-filtered-pill">
                  {filteredEmpresasCount} {filteredEmpresasCount === 1 ? 'coincidencia' : 'coincidencias'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Grupo de Acciones: Botón Inicio, Menú desplegable de Opciones de Datos y Botón Verificar */}
        <div className="topbar-actions-group">
          {/* 1. Botón Inicio */}
          <button
            type="button"
            className="btn-action-home"
            onClick={onOpenHome}
            title="Volver a la pantalla de inicio y estadísticas generales"
            id="btn-volver-inicio"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>Inicio</span>
          </button>

          {/* 2. Menú desplegable con acciones de datos (Importar, Cola automática, Reiniciar) */}
          <div className="topbar-dropdown-wrapper" ref={menuRef}>
            <button
              type="button"
              className={`btn-action-more-menu ${isMenuOpen ? 'is-open' : ''}`}
              onClick={() => setIsMenuOpen((prev) => !prev)}
              title="Opciones de dataset y mantenimiento"
              aria-expanded={isMenuOpen}
              aria-haspopup="true"
              id="btn-menu-datos"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2.2" />
                <circle cx="12" cy="12" r="2.2" />
                <circle cx="12" cy="19" r="2.2" />
              </svg>
              {autoImportProcessing && (
                <span className="menu-active-pulse" title="Importación automática activa en segundo plano"></span>
              )}
            </button>

            {isMenuOpen && (
              <div className="topbar-dropdown-menu" role="menu" aria-orientation="vertical">
                <div className="dropdown-section-header">
                  <span>Gestión de datos</span>
                </div>

                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenImportModal?.();
                  }}
                  role="menuitem"
                  id="menu-item-importar"
                >
                  <div className="dropdown-item-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                  </div>
                  <div className="dropdown-item-text">
                    <span className="dropdown-item-label">Importar Excel/CSV</span>
                    <span className="dropdown-item-desc">Carga manual de archivo CIEC (26 columnas)</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenAutoImport?.();
                  }}
                  role="menuitem"
                  id="menu-item-auto-import"
                >
                  <div className="dropdown-item-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      <polyline points="12 11 12 17 14 15"></polyline>
                    </svg>
                  </div>
                  <div className="dropdown-item-text">
                    <div className="dropdown-item-label-row">
                      <span className="dropdown-item-label">Importaciones automáticas</span>
                      {autoImportProcessing && <span className="item-pill-live">En curso</span>}
                    </div>
                    <span className="dropdown-item-desc">Vigilancia de carpeta data/import-queue</span>
                  </div>
                </button>

                <div className="dropdown-divider" role="separator"></div>

                <button
                  type="button"
                  className="dropdown-item is-destructive"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenResetModal?.();
                  }}
                  role="menuitem"
                  id="menu-item-reiniciar"
                >
                  <div className="dropdown-item-icon icon-danger">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"></polyline>
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                  </div>
                  <div className="dropdown-item-text">
                    <span className="dropdown-item-label text-danger">Reiniciar dataset</span>
                    <span className="dropdown-item-desc">Vaciar empresas de los 14 municipios</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* 3. Botón Verificar todas las pendientes (frecuente, visible en la barra) */}
          <button
            type="button"
            className="btn-action-verify"
            onClick={onOpenBatchVerify}
            title="Verificar ubicaciones pendientes contra Nominatim / Google"
            id="btn-verificar-pendientes"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
            </svg>
            <span>Verificar todas las pendientes</span>
            {pendingCount > 0 && <span className="btn-badge-pending">{pendingCount}</span>}
          </button>
        </div>

        {/* Buscador de texto libre */}
        <div className="topbar-search-wrapper">
          <div className="search-input-box">
            <svg 
              className="search-icon" 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              id="search-input"
              className="search-input-field"
              placeholder="Buscar por empresa, municipio o sector..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Buscar empresa, municipio o sector"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => onSearchChange('')}
                title="Borrar búsqueda"
                aria-label="Borrar texto de búsqueda"
              >
                &times;
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fila inferior: Chips de Sectores + Chip 'Solo sin verificar' + Botón Limpiar filtros */}
      <div className="topbar-chips-row" aria-label="Filtro por sector industrial y estado de verificación">
        <div className="chips-list">
          {/* Chip especial: Solo sin verificar (Requerimiento B.3) */}
          <button
            type="button"
            className={`sector-filter-chip chip-unverified ${onlyUnverified ? 'is-active' : ''}`}
            onClick={onToggleOnlyUnverified}
            aria-pressed={onlyUnverified}
            title={onlyUnverified ? 'Mostrar todas' : 'Filtrar solo empresas con ubicación sin verificar'}
            id="chip-solo-sin-verificar"
          >
            <span className="chip-icon-warning">⚠</span>
            <span className="chip-text">Solo sin verificar</span>
            {pendingCount > 0 && <span className="chip-count-pill">{pendingCount}</span>}
            {onlyUnverified && <span className="chip-check-mark">&#10003;</span>}
          </button>

          {/* Chips de los 8 sectores (incluyendo 'otros') */}
          {Object.entries(SECTORES).map(([key, sec]) => {
            const isSelected = selectedSectors.includes(key);

            return (
              <button
                key={key}
                type="button"
                className={`sector-filter-chip ${isSelected ? 'is-active' : ''}`}
                onClick={() => onToggleSector(key)}
                style={{
                  '--sector-color': sec.color,
                  '--sector-color-glow': `${sec.color}55`,
                  '--sector-color-bg': isSelected ? `${sec.color}28` : 'rgba(255, 255, 255, 0.04)',
                  borderColor: isSelected ? sec.color : 'rgba(255, 255, 255, 0.1)',
                }}
                aria-pressed={isSelected}
                title={`${isSelected ? 'Desactivar' : 'Filtrar por'} ${sec.label}`}
              >
                <span 
                  className="chip-dot" 
                  style={{ backgroundColor: sec.color }} 
                  aria-hidden="true" 
                />
                <span className="chip-text">{sec.label}</span>
                {isSelected && <span className="chip-check-mark">&#10003;</span>}
              </button>
            );
          })}
        </div>

        {/* Botón para limpiar filtros */}
        {hasActiveFilters && (
          <button
            type="button"
            className="clear-filters-btn"
            onClick={onClearFilters}
            title="Quitar todos los filtros de sector, verificación y búsqueda"
            id="btn-limpiar-filtros"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
            <span>Limpiar filtros</span>
          </button>
        )}
      </div>
    </header>
  );
}
