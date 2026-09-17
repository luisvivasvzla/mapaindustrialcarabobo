export const SECTORES = {
  petro: { id: 'petro', label: 'Petróleo y petroquímica', color: '#e8a33d' },
  auto: { id: 'auto', label: 'Automotriz y metalmecánica', color: '#d9707a' },
  alim: { id: 'alim', label: 'Alimentos y bebidas', color: '#84b871' },
  farma: { id: 'farma', label: 'Farmacéutica y química', color: '#5fc9c0' },
  textil: { id: 'textil', label: 'Textil y manufactura liviana', color: '#a596f2' },
  agro: { id: 'agro', label: 'Agroindustria', color: '#c7d15b' },
  energia: { id: 'energia', label: 'Energía, puerto y logística', color: '#6fa8dc' },
  otros: { id: 'otros', label: 'Servicios y otros (no industrial)', color: '#6b7c85' },
};

export const ESTADO_COLORS = {
  activa: { bg: 'rgba(34, 197, 94, 0.15)', text: '#4ade80', border: 'rgba(34, 197, 94, 0.3)' },
  parcial: { bg: 'rgba(234, 179, 8, 0.15)', text: '#facc15', border: 'rgba(234, 179, 8, 0.3)' },
  paralizada: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' },
  cerrada: { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' },
  default: { bg: 'rgba(148, 163, 184, 0.15)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.25)' },
};

// Instalaciones con coordenadas reales verificadas en fuentes públicas (Sección 6 del brief)
export const VERIFIED_EMPRESAS = ['e1', 'e3', 'e4', 'e5'];

export function isCoordenadaVerificada(empresa) {
  if (!empresa) return false;
  if (typeof empresa === 'string') {
    return VERIFIED_EMPRESAS.includes(empresa);
  }
  if (empresa.verificado === true) return true;
  if (empresa.id && VERIFIED_EMPRESAS.includes(empresa.id)) return true;
  return false;
}

export function getEstadoStyle(estado = '') {
  const lower = estado.toLowerCase();
  if (lower.includes('activa') || lower.includes('activo')) {
    if (lower.includes('reducida') || lower.includes('limitada')) {
      return ESTADO_COLORS.parcial;
    }
    return ESTADO_COLORS.activa;
  }
  if (lower.includes('parcial') || lower.includes('limitada') || lower.includes('reducida')) {
    return ESTADO_COLORS.parcial;
  }
  if (lower.includes('paralizada') || lower.includes('inactiva') || lower.includes('cerrada') || lower.includes('sin producción')) {
    return ESTADO_COLORS.paralizada;
  }
  return ESTADO_COLORS.default;
}
