const geminiKey = 'AQ.Ab8RN6KXBZng1DUOT5Y7rM19CmJU-VedOomM87cIsjpEVEz4jg';

async function debug() {
  const cleanNombre = 'Alimentos Heinz';
  const muniName = 'San Joaquín';
  const prompt = `Busca la ubicación de la empresa '${cleanNombre}' en el municipio ${muniName}, estado Carabobo, Venezuela. Devuelve su dirección más precisa y, si logras encontrar coordenadas geográficas citadas en alguna fuente, inclúyelas. Si no encuentras nada confiable, dilo explícitamente en vez de inventar coordenadas.`;

  const stdRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  const sData = await stdRes.json();
  const text = sData.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || '';
  console.log('Gemini text:\n', text);

  // Regex testing
  const dirMatch = text.match(/(?:direcci[oó]n|ubicaci[oó]n)[^:]*:\s*[*_]*([^\n\r.]+)/i);
  console.log('Dir match:', dirMatch ? dirMatch[1] : 'none');

  if (dirMatch) {
    let refined = dirMatch[1].replace(/[*_#]/g, '').trim();
    console.log('Refined address:', refined);
    // Let's test Nominatim on refined
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(refined)}&format=json&limit=3&countrycodes=ve`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Test/1.0' } });
    const data = await res.json();
    console.log('Nominatim on refined:', data);
  }
}

debug();
