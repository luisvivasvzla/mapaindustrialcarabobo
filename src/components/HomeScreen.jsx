import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SECTORES, isCoordenadaVerificada } from '../constants/sectores';
import { normalizeText } from '../utils/text';

// Iconos representativos por sector
const SECTOR_ICONS = {
  petro: '🛢️',
  auto: '🚗',
  alim: '🌾',
  farma: '💊',
  textil: '🧵',
  agro: '🌱',
  energia: '⚡',
  otros: '💼',
};

export default function HomeScreen({
  isOpen,
  onEnterMap,
  municipios = [],
  onSelectEmpresa,
  onSelectSector,
  onSelectMunicipio,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);
  const searchInputRef = useRef(null);
  const resultsDropdownRef = useRef(null);

  // Debounce de ~200ms para el buscador
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 200);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Cálculos estadísticos en vivo desde el dataset
  const stats = useMemo(() => {
    let totalEmpresas = 0;
    let totalVerificadas = 0;
    let totalEmpleados = 0;
    const sectorCounts = {};
    const munCounts = [];

    municipios.forEach((m) => {
      const empList = Array.isArray(m.empresas) ? m.empresas : [];
      const empCount = empList.length;
      totalEmpresas += empCount;

      munCounts.push({
        id: m.id,
        nombre: m.nombre,
        capital: m.capital,
        lat: m.lat,
        lon: m.lon,
        empresasCount: empCount,
        sectores: m.sectores || [],
        municipioRaw: m,
      });

      empList.forEach((e) => {
        if (isCoordenadaVerificada(e)) {
          totalVerificadas++;
        }

        // Sumar columna "Total Empleados" de las que la tengan cargada
        const empVal = Number(e.totalEmpleados || e.empleados || e.numEmpleados || 0);
        if (!isNaN(empVal) && empVal > 0) {
          totalEmpleados += empVal;
        }

        const secKey = e.sector && SECTORES[e.sector] ? e.sector : 'otros';
        sectorCounts[secKey] = (sectorCounts[secKey] || 0) + 1;
      });
    });

    // Ordenar ranking de municipios de mayor a menor
    munCounts.sort((a, b) => b.empresasCount - a.empresasCount);

    // Municipio con más empresas
    const topMunicipio = munCounts.length > 0 ? munCounts[0] : { nombre: 'Valencia', empresasCount: 0 };

    // Sector con más empresas
    let topSectorKey = 'otros';
    let topSectorCount = 0;
    Object.entries(sectorCounts).forEach(([k, count]) => {
      if (count > topSectorCount) {
        topSectorCount = count;
        topSectorKey = k;
      }
    });

    const topSectorObj = SECTORES[topSectorKey] || { label: 'General' };

    const verificadasPct = totalEmpresas > 0 ? ((totalVerificadas / totalEmpresas) * 100).toFixed(1) : '0';
    const noVerificadas = totalEmpresas - totalVerificadas;

    return {
      totalEmpresas,
      totalMunicipios: municipios.length,
      totalVerificadas,
      noVerificadas,
      verificadasPct,
      totalEmpleados,
      sectorCounts,
      munRanking: munCounts,
      topMunicipio,
      topSector: {
        key: topSectorKey,
        label: topSectorObj.label,
        count: topSectorCount,
        pct: totalEmpresas > 0 ? ((topSectorCount / totalEmpresas) * 100).toFixed(1) : '0',
      },
    };
  }, [municipios]);

  // Resultados del buscador destacado agrupados por Empresas, Sectores y Municipios
  const searchResults = useMemo(() => {
    if (!debouncedSearch) return { empresas: [], sectores: [], municipios: [], totalCount: 0, flatList: [] };

    const norm = normalizeText(debouncedSearch);

    // 1. Coincidencias de Empresas (máx 5)
    const matchedEmpresas = [];
    for (const m of municipios) {
      if (Array.isArray(m.empresas)) {
        for (const emp of m.empresas) {
          const normName = normalizeText(emp.n);
          const normNota = normalizeText(emp.nota || '');
          const normRif = normalizeText(emp.rif || emp['RIF Compañía'] || '');
          const normRazon = normalizeText(emp.razonSocial || emp['Razón Social'] || '');
          const normMarcas = normalizeText(emp.marcas || emp['Marcas'] || '');
          const normProductos = normalizeText(emp.productos || emp['Productos'] || '');
          const normGremios = normalizeText(emp.gremios || emp['Gremios'] || '');
          if (
            normName.includes(norm) ||
            normNota.includes(norm) ||
            normRif.includes(norm) ||
            normRazon.includes(norm) ||
            normMarcas.includes(norm) ||
            normProductos.includes(norm) ||
            normGremios.includes(norm)
          ) {
            matchedEmpresas.push({
              type: 'empresa',
              empresa: emp,
              municipio: m,
              key: `emp-${emp.id}`,
            });
            if (matchedEmpresas.length >= 5) break;
          }
        }
      }
      if (matchedEmpresas.length >= 5) break;
    }

    // 2. Coincidencias de Sectores (máx 5)
    const matchedSectores = [];
    Object.entries(SECTORES).forEach(([secKey, secObj]) => {
      const normLabel = normalizeText(secObj.label);
      const normKey = normalizeText(secKey);
      if (normLabel.includes(norm) || normKey.includes(norm)) {
        matchedSectores.push({
          type: 'sector',
          sectorKey: secKey,
          sectorObj,
          count: stats.sectorCounts[secKey] || 0,
          key: `sec-${secKey}`,
        });
      }
    });

    // 3. Coincidencias de Municipios (máx 5)
    const matchedMunicipios = [];
    for (const m of municipios) {
      const normMun = normalizeText(m.nombre);
      const normCap = normalizeText(m.capital || '');
      if (normMun.includes(norm) || normCap.includes(norm)) {
        matchedMunicipios.push({
          type: 'municipio',
          municipio: m,
          count: m.empresas?.length || 0,
          key: `mun-${m.id}`,
        });
        if (matchedMunicipios.length >= 5) break;
      }
    }

    const flatList = [
      ...matchedEmpresas,
      ...matchedSectores.slice(0, 5),
      ...matchedMunicipios.slice(0, 5),
    ];

    return {
      empresas: matchedEmpresas,
      sectores: matchedSectores.slice(0, 5),
      municipios: matchedMunicipios.slice(0, 5),
      totalCount: flatList.length,
      flatList,
    };
  }, [debouncedSearch, municipios, stats.sectorCounts]);

  // Manejador al seleccionar un resultado de búsqueda
  const handleSelectResult = (item) => {
    if (!item) return;
    setSearchTerm('');
    setIsSearchFocused(false);

    if (item.type === 'empresa') {
      onSelectEmpresa(item.empresa, item.municipio);
    } else if (item.type === 'sector') {
      onSelectSector(item.sectorKey);
    } else if (item.type === 'municipio') {
      onSelectMunicipio(item.municipio);
    }
  };

  // Manejo de teclado en el buscador
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsSearchFocused(false);
      searchInputRef.current?.blur();
      return;
    }

    if (searchResults.totalCount === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedResultIndex((prev) => (prev < searchResults.totalCount - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedResultIndex((prev) => (prev > 0 ? prev - 1 : searchResults.totalCount - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedResultIndex >= 0 && selectedResultIndex < searchResults.flatList.length) {
        handleSelectResult(searchResults.flatList[selectedResultIndex]);
      } else if (searchResults.flatList.length > 0) {
        handleSelectResult(searchResults.flatList[0]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="home-screen-overlay" role="dialog" aria-modal="true" aria-label="Pantalla de inicio del Mapa Industrial de Carabobo">
      <div className="home-screen-content">
        
        {/* ================================================================= */}
        {/* 1. ENCABEZADO PRINCIPAL */}
        {/* ================================================================= */}
        <header className="home-hero-header">
          <div className="home-hero-badge">
            <span className="hero-badge-dot"></span>
            <span>Plataforma Geoespacial · Estado Carabobo</span>
          </div>

          <h1 className="home-hero-title">
            Mapa Industrial de <span className="text-gradient-carabobo">Carabobo</span>
          </h1>

          <p className="home-hero-subtitle">
            Censo geoespacial, análisis de capacidad y monitoreo dinámico del parque productivo en los 14 municipios del estado.
          </p>

          <div className="home-hero-actions">
            <button
              type="button"
              className="btn-hero-primary"
              id="btn-entrar-al-mapa"
              onClick={onEnterMap}
              title="Explorar el mapa interactivo con vista completa"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
                <line x1="8" y1="2" x2="8" y2="18"></line>
                <line x1="16" y1="6" x2="16" y2="22"></line>
              </svg>
              <span>Entrar al mapa</span>
            </button>

            <a
              href="#seccion-buscador"
              className="btn-hero-secondary"
              onClick={(e) => {
                e.preventDefault();
                searchInputRef.current?.focus();
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span>Buscar empresa o sector</span>
            </a>
          </div>
        </header>

        {/* ================================================================= */}
        {/* 2. TARJETAS DE ESTADÍSTICAS CLAVE (Calculadas en vivo) */}
        {/* ================================================================= */}
        <section className="home-stats-section" aria-label="Estadísticas clave del dataset">
          <div className="home-section-tag">Métricas del Ecosistema</div>
          <div className="home-stats-grid">
            
            {/* Tarjeta 1: Total Empresas */}
            <div className="stat-card stat-card-highlight">
              <div className="stat-icon-wrapper stat-icon-blue">🏢</div>
              <div className="stat-info">
                <div className="stat-label">Total de Empresas</div>
                <div className="stat-value" id="stat-total-empresas">{stats.totalEmpresas}</div>
                <div className="stat-subtext">Registradas en el dataset activo</div>
              </div>
            </div>

            {/* Tarjeta 2: Total Municipios */}
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-cyan">📍</div>
              <div className="stat-info">
                <div className="stat-label">Municipios</div>
                <div className="stat-value" id="stat-total-municipios">{stats.totalMunicipios}</div>
                <div className="stat-subtext">100% con cobertura territorial</div>
              </div>
            </div>

            {/* Tarjeta 3: Verificadas vs Sin verificar */}
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-green">✓</div>
              <div className="stat-info">
                <div className="stat-label">Ubicaciones Verificadas</div>
                <div className="stat-value-group">
                  <span className="stat-value" id="stat-verificadas">{stats.totalVerificadas}</span>
                  <span className="stat-badge-pct">{stats.verificadasPct}%</span>
                </div>
                <div className="stat-subtext">
                  {stats.noVerificadas} pendientes de validación
                </div>
                <div className="stat-progress-track" title={`${stats.verificadasPct}% verificado`}>
                  <div className="stat-progress-fill" style={{ width: `${stats.verificadasPct}%` }}></div>
                </div>
              </div>
            </div>

            {/* Tarjeta 4: Total Empleados */}
            <div className="stat-card">
              <div className="stat-icon-wrapper stat-icon-amber">👥</div>
              <div className="stat-info">
                <div className="stat-label">Empleados Contabilizados</div>
                <div className="stat-value" id="stat-total-empleados">
                  {stats.totalEmpleados.toLocaleString('es-VE')}
                </div>
                <div className="stat-subtext">Suma de la columna "Total Empleados"</div>
              </div>
            </div>

            {/* Tarjeta 5: Sector con más empresas */}
            <div 
              className="stat-card stat-card-interactive" 
              onClick={() => onSelectSector(stats.topSector.key)}
              title={`Ver empresas de ${stats.topSector.label} en el mapa`}
            >
              <div className="stat-icon-wrapper stat-icon-purple">📊</div>
              <div className="stat-info">
                <div className="stat-label">Sector Predominante</div>
                <div className="stat-value-text" id="stat-top-sector">
                  {stats.topSector.label}
                </div>
                <div className="stat-subtext">
                  <strong>{stats.topSector.count} empresas</strong> ({stats.topSector.pct}% del estado)
                </div>
              </div>
            </div>

            {/* Tarjeta 6: Municipio con más empresas */}
            <div 
              className="stat-card stat-card-interactive" 
              onClick={() => {
                const targetMun = municipios.find((m) => m.id === stats.topMunicipio.id);
                if (targetMun) onSelectMunicipio(targetMun);
              }}
              title={`Ver ${stats.topMunicipio.nombre} en el mapa`}
            >
              <div className="stat-icon-wrapper stat-icon-rose">🏆</div>
              <div className="stat-info">
                <div className="stat-label">Municipio Líder</div>
                <div className="stat-value-text" id="stat-top-municipio">
                  {stats.topMunicipio.nombre}
                </div>
                <div className="stat-subtext">
                  <strong>{stats.topMunicipio.empresasCount} empresas</strong> (
                  {stats.totalEmpresas > 0
                    ? ((stats.topMunicipio.empresasCount / stats.totalEmpresas) * 100).toFixed(1)
                    : 0}
                  % del total)
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ================================================================= */}
        {/* 3. BUSCADOR DESTACADO CON AUTOCOMPLETADO EN VIVO */}
        {/* ================================================================= */}
        <section className="home-search-section" id="seccion-buscador" aria-label="Buscador destacado">
          <div className="home-search-container">
            <div className="home-search-header-group">
              <h2 className="home-search-title">Buscador Inteligente</h2>
              <p className="home-search-desc">
                Escribe para autocompletar empresas, sectores o municipios y navegar directamente sobre el mapa.
              </p>
            </div>

            <div className={`home-search-input-box ${isSearchFocused ? 'has-focus' : ''}`}>
              <svg className="home-search-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>

              <input
                ref={searchInputRef}
                type="text"
                className="home-search-input"
                id="input-buscador-destacado"
                placeholder="Busca por ej. 'Pequiven', 'Automotriz', 'Valencia' o 'Alimentos'..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setIsSearchFocused(true);
                  setSelectedResultIndex(-1);
                }}
                onFocus={() => setIsSearchFocused(true)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />

              {searchTerm && (
                <button
                  type="button"
                  className="home-search-clear"
                  onClick={() => {
                    setSearchTerm('');
                    searchInputRef.current?.focus();
                  }}
                  title="Limpiar búsqueda"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Resultados desplegables del autocompletado */}
            {isSearchFocused && debouncedSearch && (
              <div 
                ref={resultsDropdownRef} 
                className="home-search-dropdown" 
                role="listbox" 
                id="lista-resultados-autocompletado"
              >
                {searchResults.totalCount === 0 ? (
                  <div className="search-empty-state">
                    <span>🔍</span> No se encontraron resultados para "<strong>{debouncedSearch}</strong>"
                  </div>
                ) : (
                  <>
                    {/* GRUPO 1: EMPRESAS */}
                    {searchResults.empresas.length > 0 && (
                      <div className="search-group">
                        <div className="search-group-header">
                          <span>🏢 Empresas ({searchResults.empresas.length})</span>
                          <small>Lleva al mapa centrado con detalle</small>
                        </div>
                        {searchResults.empresas.map((item) => {
                          const sec = SECTORES[item.empresa.sector] || { label: item.empresa.sector, color: '#94a3b8' };
                          const isVerif = isCoordenadaVerificada(item.empresa);
                          return (
                            <div
                              key={item.key}
                              className="search-item search-item-empresa"
                              onClick={() => handleSelectResult(item)}
                              role="option"
                              tabIndex={0}
                            >
                              <div className="search-item-left">
                                <span className="item-type-icon">🏢</span>
                                <div className="item-text-info">
                                  <div className="item-primary-name">{item.empresa.n}</div>
                                  <div className="item-secondary-info">
                                    <span>Municipio {item.municipio.nombre}</span>
                                    {item.empresa.rif && <span>· RIF: {item.empresa.rif}</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="search-item-right">
                                <span 
                                  className="item-sector-badge" 
                                  style={{ backgroundColor: `${sec.color}20`, color: sec.color, borderColor: `${sec.color}40` }}
                                >
                                  {sec.label}
                                </span>
                                <span className={`item-verif-badge ${isVerif ? 'is-verified' : 'is-unverified'}`}>
                                  {isVerif ? '✓' : '⚠'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* GRUPO 2: SECTORES */}
                    {searchResults.sectores.length > 0 && (
                      <div className="search-group">
                        <div className="search-group-header">
                          <span>🏷️ Sectores ({searchResults.sectores.length})</span>
                          <small>Filtra el mapa por este sector</small>
                        </div>
                        {searchResults.sectores.map((item) => (
                          <div
                            key={item.key}
                            className="search-item search-item-sector"
                            onClick={() => handleSelectResult(item)}
                            role="option"
                            tabIndex={0}
                          >
                            <div className="search-item-left">
                              <span className="item-sector-color-dot" style={{ backgroundColor: item.sectorObj.color }}></span>
                              <div className="item-text-info">
                                <div className="item-primary-name">{item.sectorObj.label}</div>
                                <div className="item-secondary-info">{SECTOR_ICONS[item.sectorKey] || '🏷️'} Sector productivo</div>
                              </div>
                            </div>
                            <div className="search-item-right">
                              <span className="item-count-badge">{item.count} empresas</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* GRUPO 3: MUNICIPIOS */}
                    {searchResults.municipios.length > 0 && (
                      <div className="search-group">
                        <div className="search-group-header">
                          <span>📍 Municipios ({searchResults.municipios.length})</span>
                          <small>Centra en el municipio y abre su ficha</small>
                        </div>
                        {searchResults.municipios.map((item) => (
                          <div
                            key={item.key}
                            className="search-item search-item-municipio"
                            onClick={() => handleSelectResult(item)}
                            role="option"
                            tabIndex={0}
                          >
                            <div className="search-item-left">
                              <span className="item-type-icon">📍</span>
                              <div className="item-text-info">
                                <div className="item-primary-name">Municipio {item.municipio.nombre}</div>
                                <div className="item-secondary-info">Capital: {item.municipio.capital}</div>
                              </div>
                            </div>
                            <div className="search-item-right">
                              <span className="item-count-badge">{item.count} empresas</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ================================================================= */}
        {/* 4. TARJETAS DE SECTORES (8 Sectores en Cuadrícula) */}
        {/* ================================================================= */}
        <section className="home-sectors-section" aria-label="Sectores productivos de Carabobo">
          <div className="home-section-header">
            <div>
              <div className="home-section-tag">Especialización Productiva</div>
              <h2 className="home-section-title">Sectores Industriales</h2>
            </div>
            <p className="home-section-note">Haz clic en cualquier sector para abrir el mapa con su filtro aplicado.</p>
          </div>

          <div className="home-sectors-grid">
            {Object.entries(SECTORES).map(([secKey, secObj]) => {
              const count = stats.sectorCounts[secKey] || 0;
              const pct = stats.totalEmpresas > 0 ? ((count / stats.totalEmpresas) * 100).toFixed(1) : '0';
              const icon = SECTOR_ICONS[secKey] || '🏭';

              return (
                <div
                  key={secKey}
                  className="home-sector-card"
                  onClick={() => onSelectSector(secKey)}
                  style={{ '--sector-theme-color': secObj.color }}
                  role="button"
                  tabIndex={0}
                  title={`Filtrar mapa por ${secObj.label} (${count} empresas)`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectSector(secKey);
                    }
                  }}
                >
                  <div className="sector-card-top">
                    <span className="sector-card-icon">{icon}</span>
                    <span className="sector-card-badge" style={{ backgroundColor: `${secObj.color}20`, color: secObj.color }}>
                      {pct}%
                    </span>
                  </div>

                  <h3 className="sector-card-title">{secObj.label}</h3>

                  <div className="sector-card-bottom">
                    <span className="sector-card-count">
                      <strong>{count}</strong> {count === 1 ? 'empresa' : 'empresas'}
                    </span>
                    <span className="sector-card-arrow" aria-hidden="true">→</span>
                  </div>

                  <div className="sector-card-bar">
                    <div
                      className="sector-card-bar-fill"
                      style={{
                        width: `${Math.min(100, Math.max(5, (count / (stats.topSector.count || 1)) * 100))}%`,
                        backgroundColor: secObj.color,
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ================================================================= */}
        {/* 5. RANKING DE MUNICIPIOS (14 Municipios Ordenados con Barras) */}
        {/* ================================================================= */}
        <section className="home-ranking-section" aria-label="Ranking de municipios">
          <div className="home-section-header">
            <div>
              <div className="home-section-tag">Distribución Territorial</div>
              <h2 className="home-section-title">Ranking de Municipios por Concentración Industrial</h2>
            </div>
            <p className="home-section-note">
              Los 14 municipios ordenados por número de empresas. Haz clic en cualquiera para volar hacia él en el mapa.
            </p>
          </div>

          <div className="ranking-table-card">
            <div className="ranking-list">
              {stats.munRanking.map((mun, idx) => {
                const maxCount = stats.munRanking[0]?.empresasCount || 1;
                const barWidth = maxCount > 0 ? (mun.empresasCount / maxCount) * 100 : 0;
                const pctOfTotal = stats.totalEmpresas > 0 ? ((mun.empresasCount / stats.totalEmpresas) * 100).toFixed(1) : '0';

                return (
                  <div
                    key={mun.id}
                    className="ranking-row"
                    onClick={() => {
                      const target = municipios.find((m) => m.id === mun.id);
                      if (target) onSelectMunicipio(target);
                    }}
                    role="button"
                    tabIndex={0}
                    title={`Abrir panel de ${mun.nombre} en el mapa`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const target = municipios.find((m) => m.id === mun.id);
                        if (target) onSelectMunicipio(target);
                      }
                    }}
                  >
                    <div className="ranking-col-rank">
                      <span className={`rank-badge rank-${idx + 1}`}>{idx + 1}</span>
                    </div>

                    <div className="ranking-col-name">
                      <div className="ranking-mun-title">
                        <strong>{mun.nombre}</strong>
                        <span className="ranking-mun-capital">Cap: {mun.capital}</span>
                      </div>
                      <div className="ranking-bar-wrapper">
                        <div
                          className="ranking-bar-fill"
                          style={{
                            width: `${barWidth}%`,
                            background: idx === 0 
                              ? 'linear-gradient(90deg, #38bdf8, #0284c7)' 
                              : idx < 3 
                              ? 'linear-gradient(90deg, #818cf8, #6366f1)' 
                              : 'linear-gradient(90deg, #64748b, #475569)',
                          }}
                        ></div>
                      </div>
                    </div>

                    <div className="ranking-col-sectors">
                      {mun.sectores && mun.sectores.slice(0, 4).map((secKey) => {
                        const sec = SECTORES[secKey];
                        if (!sec) return null;
                        return (
                          <span
                            key={secKey}
                            className="ranking-sector-dot"
                            style={{ backgroundColor: sec.color }}
                            title={sec.label}
                          ></span>
                        );
                      })}
                      {mun.sectores && mun.sectores.length > 4 && (
                        <span className="ranking-sector-more">+{mun.sectores.length - 4}</span>
                      )}
                    </div>

                    <div className="ranking-col-count">
                      <span className="ranking-number">{mun.empresasCount}</span>
                      <span className="ranking-unit">
                        {mun.empresasCount === 1 ? 'empresa' : 'empresas'} ({pctOfTotal}%)
                      </span>
                    </div>

                    <div className="ranking-col-action">
                      <span className="ranking-action-btn">Ver en mapa →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 6. GRÁFICOS VISUALES Y REPARTO ANALÍTICO */}
        {/* ================================================================= */}
        <section className="home-charts-section" aria-label="Visualización gráfica de datos">
          <div className="home-section-header">
            <div>
              <div className="home-section-tag">Análisis Comparativo</div>
              <h2 className="home-section-title">Estructura y Validación de Datos</h2>
            </div>
          </div>

          <div className="charts-grid-two">
            {/* Gráfico 1: Validación de Coordenadas */}
            <div className="chart-card">
              <h3 className="chart-card-title">Estado de Verificación Geoespacial</h3>
              <p className="chart-card-desc">Proporción de coordenadas auditadas contra fuentes oficiales y satelitales.</p>

              <div className="verif-donut-layout">
                <div className="verif-donut-visual">
                  <svg viewBox="0 0 36 36" className="donut-svg">
                    <path
                      className="donut-bg"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="donut-fill"
                      strokeDasharray={`${stats.verificadasPct}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="donut-center-text">
                    <span className="donut-pct">{stats.verificadasPct}%</span>
                    <span className="donut-sublabel">Auditadas</span>
                  </div>
                </div>

                <div className="verif-donut-legend">
                  <div className="legend-row">
                    <span className="legend-color-box legend-color-verified"></span>
                    <div className="legend-text">
                      <strong>{stats.totalVerificadas} empresas verificadas</strong>
                      <span>Ubicación confirmada por geocoding / satélite</span>
                    </div>
                  </div>

                  <div className="legend-row">
                    <span className="legend-color-box legend-color-unverified"></span>
                    <div className="legend-text">
                      <strong>{stats.noVerificadas} sin verificar</strong>
                      <span>Pendientes de confirmación precisa de coordenadas</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Gráfico 2: Desglose Industrial por Sectores */}
            <div className="chart-card">
              <h3 className="chart-card-title">Distribución por Rama de Actividad</h3>
              <p className="chart-card-desc">Peso porcentual de cada sector dentro del tejido industrial de Carabobo.</p>

              <div className="sector-bars-breakdown">
                {Object.entries(SECTORES).map(([key, sec]) => {
                  const count = stats.sectorCounts[key] || 0;
                  const pct = stats.totalEmpresas > 0 ? ((count / stats.totalEmpresas) * 100).toFixed(1) : 0;
                  return (
                    <div 
                      key={key} 
                      className="breakdown-item"
                      onClick={() => onSelectSector(key)}
                      title={`Filtrar ${sec.label}`}
                    >
                      <div className="breakdown-labels">
                        <span className="breakdown-name">
                          <span className="breakdown-dot" style={{ backgroundColor: sec.color }}></span>
                          {sec.label}
                        </span>
                        <span className="breakdown-count">
                          <strong>{count}</strong> ({pct}%)
                        </span>
                      </div>
                      <div className="breakdown-track">
                        <div
                          className="breakdown-fill"
                          style={{ width: `${pct}%`, backgroundColor: sec.color }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Footer de la Pantalla de Inicio */}
        <footer className="home-screen-footer">
          <div className="footer-left">
            <strong>Mapa Industrial de Carabobo</strong> &middot; Edición 2026
          </div>
          <button
            type="button"
            className="btn-footer-enter"
            onClick={onEnterMap}
          >
            <span>Ir al Mapa Interactivo</span>
            <span>→</span>
          </button>
        </footer>

      </div>
    </div>
  );
}
