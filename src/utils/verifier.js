import { calculateHaversineDistance, formatDistance } from './geo.js';

/**
 * Limpia y prepara la cadena de dirección para Nominatim
 */
export function getAddressForGeocoding(empresa, municipioNombre = '') {
  const muni = municipioNombre ? `Municipio ${municipioNombre}, Carabobo` : 'Carabobo';

  // 1. Prioridad: Dirección Detallada (del Excel CIEC)
  if (empresa.direccionDetallada && empresa.direccionDetallada.trim()) {
    let clean = empresa.direccionDetallada.trim();
    if (!clean.toLowerCase().includes('carabobo') && !clean.toLowerCase().includes('venezuela')) {
      clean += `, ${muni}, Venezuela`;
    }
    return clean;
  }

  // 2. Dirección Fiscal
  if (empresa.direccionFiscal && empresa.direccionFiscal.trim()) {
    let clean = empresa.direccionFiscal.trim();
    if (!clean.toLowerCase().includes('carabobo') && !clean.toLowerCase().includes('venezuela')) {
      clean += `, ${muni}, Venezuela`;
    }
    return clean;
  }

  // 3. Fallback: Nombre de la empresa + Municipio
  return `${empresa.n}, ${muni}, Venezuela`;
}

/**
 * Consulta la API de geocoding de Nominatim (vía proxy con rate limiting)
 */
export async function geocodeAddress(addressText) {
  if (!addressText || !addressText.trim()) return null;

  try {
    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3001';
    const encoded = encodeURIComponent(addressText.trim());
    const res = await fetch(`${baseUrl}/api/geocode?q=${encoded}`);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const results = await res.json();
    if (Array.isArray(results) && results.length > 0) {
      const top = results[0];
      return {
        lat: parseFloat(top.lat),
        lon: parseFloat(top.lon),
        displayName: top.display_name,
      };
    }

    // Fallback: Si la dirección tenía demasiado detalle y falló, probar con una versión más concisa
    const parts = addressText.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 2) {
      const simplified = `${parts[0]}, ${parts[parts.length - 2] || 'Carabobo'}, Venezuela`;
      const fallbackEncoded = encodeURIComponent(simplified);
      const fallbackRes = await fetch(`${baseUrl}/api/geocode?q=${fallbackEncoded}`);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (Array.isArray(fallbackData) && fallbackData.length > 0) {
          const top = fallbackData[0];
          return {
            lat: parseFloat(top.lat),
            lon: parseFloat(top.lon),
            displayName: top.display_name,
          };
        }
      }
    }

    return null;
  } catch (err) {
    console.warn('[Verifier] Error al geocodificar:', err.message);
    return null;
  }
}

/**
 * Verifica la ubicación de una empresa buscando la empresa real en Google (Google Places / Gemini Grounding / Fallback)
 * y calculando la distancia Haversine.
 */
export async function verifyCompanyLocation(empresa, municipioNombre = '') {
  try {
    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3001';
    const payload = {
      id: empresa.id,
      nombre: empresa.n,
      municipio: municipioNombre,
      direccionDetallada: empresa.direccionDetallada,
      direccionFiscal: empresa.direccionFiscal,
      lat: empresa.lat,
      lon: empresa.lon,
    };

    const res = await fetch(`${baseUrl}/api/verify-place`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const data = await res.json();

    if (!data || !data.success || !data.found) {
      return {
        status: 'NOT_FOUND',
        success: false,
        message: 'No se encontró esta empresa en Google',
        empresaId: empresa.id,
        addressQueried: `${empresa.n}, ${municipioNombre || 'Carabobo'}`,
      };
    }

    const geocoded = data.found;

    // Si la empresa no tiene lat/lon válidos actualmente, se ofrece asignar la encontrada
    if (typeof empresa.lat !== 'number' || typeof empresa.lon !== 'number' || isNaN(empresa.lat) || isNaN(empresa.lon)) {
      return {
        status: 'DISCREPANCY',
        success: true,
        autoVerified: false,
        hasDiscrepancy: true,
        distance: null,
        message: 'La empresa no tenía coordenadas previas. Se encontró ubicación en Google.',
        empresaId: empresa.id,
        geocoded,
        source: geocoded.source,
        addressQueried: `${empresa.n}, ${municipioNombre || 'Carabobo'}`,
      };
    }

    const distance = calculateHaversineDistance(empresa.lat, empresa.lon, geocoded.lat, geocoded.lon);

    // 4.e: Si la distancia es menor a 500 metros, marcar verificado automáticamente
    if (distance < 500) {
      return {
        status: 'AUTO_VERIFIED',
        success: true,
        autoVerified: true,
        distance,
        message: `Ubicación confirmada (±${Math.round(distance)}m)`,
        empresaId: empresa.id,
        geocoded,
        source: geocoded.source,
        addressQueried: `${empresa.n}, ${municipioNombre || 'Carabobo'}`,
      };
    }

    // 4.f: Si la distancia es mayor o igual a 500 metros -> Discrepancia
    return {
      status: 'DISCREPANCY',
      success: true,
      autoVerified: false,
      hasDiscrepancy: true,
      distance,
      message: `Discrepancia de ${formatDistance(distance)}, ¿cuál es correcta?`,
      empresaId: empresa.id,
      geocoded,
      source: geocoded.source,
      addressQueried: `${empresa.n}, ${municipioNombre || 'Carabobo'}`,
    };
  } catch (err) {
    console.warn('[Verifier] Error al verificar empresa en Google:', err.message);
    return {
      status: 'NOT_FOUND',
      success: false,
      message: 'No se encontró esta empresa en Google',
      empresaId: empresa.id,
    };
  }
}

/**
 * Busca automáticamente la ubicación de una empresa antes de guardarla.
 * Reutiliza /api/verify-place (Google Places -> Gemini Grounding -> Nominatim fallback).
 */
export async function searchPlaceAuto(nombre, municipioNombre = '') {
  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return { success: false, notFound: true, message: 'Ingresa un nombre de empresa.' };
  }

  try {
    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3001';
    const payload = {
      nombre: nombre.trim(),
      municipio: municipioNombre || 'Carabobo',
    };

    const res = await fetch(`${baseUrl}/api/verify-place`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[searchPlaceAuto] Error:', err.message);
    return {
      success: false,
      notFound: true,
      message: 'Error al consultar servicio de búsqueda: ' + err.message,
    };
  }
}


