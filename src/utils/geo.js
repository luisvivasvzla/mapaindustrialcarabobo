/**
 * Utilidades geodésicas y de cálculo de distancias para el estado Carabobo
 */

// Radio de la Tierra en metros (WGS-84 promedio)
const EARTH_RADIUS_METERS = 6371000;

/**
 * Calcula la distancia ortodrómica en metros entre dos puntos geográficos
 * usando la fórmula de Haversine.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} distancia en metros
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Formatea una distancia en metros a texto legible (ej: "350 m" o "2.4 km")
 * @param {number} meters 
 * @returns {string}
 */
export function formatDistance(meters) {
  if (meters === undefined || meters === null || isNaN(meters)) return '--';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Valida si un par de coordenadas está dentro del recuadro del estado Carabobo
 * con margen de tolerancia de ~0.1°
 * Bounds brief: Lat 9°48'52"–10°35'26" N (~9.814–10.590), Lon 67°30'53"–68°25'25" O (~-68.423 a -67.514)
 * Recuadro con margen: Lat [9.65, 10.65], Lon [-68.50, -67.45]
 */
export const CARABOBO_TOLERANCE_BOUNDS = {
  minLat: 9.65,
  maxLat: 10.65,
  minLon: -68.50,
  maxLon: -67.45,
};

export function isWithinCaraboboBounds(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return false;
  }
  return (
    lat >= CARABOBO_TOLERANCE_BOUNDS.minLat &&
    lat <= CARABOBO_TOLERANCE_BOUNDS.maxLat &&
    lon >= CARABOBO_TOLERANCE_BOUNDS.minLon &&
    lon <= CARABOBO_TOLERANCE_BOUNDS.maxLon
  );
}
