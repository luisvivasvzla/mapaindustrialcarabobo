const key = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6KXBZng1DUOT5Y7rM19CmJU-VedOomM87cIsjpEVEz4jg';

async function test() {
  try {
    const prompt = `Busca la ubicación de la empresa 'Alimentos Heinz' en el municipio San Joaquín, estado Carabobo, Venezuela. Devuelve su dirección más precisa y, si logras encontrar coordenadas geográficas citadas en alguna fuente, inclúyelas. Si no encuentras nada confiable, dilo explícitamente en vez de inventar coordenadas.`;
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }]
      })
    });
    
    console.log('Status:', res.status);
    const data = await res.json();
    if (data.candidates && data.candidates[0]) {
      const text = data.candidates[0].content.parts.map(p => p.text).join(' ');
      console.log('Gemini text response:\n', text);
      if (data.candidates[0].groundingMetadata) {
        console.log('Grounding metadata search queries:', data.candidates[0].groundingMetadata.webSearchQueries);
        console.log('Grounding sources count:', data.candidates[0].groundingMetadata.groundingChunks?.length);
      }
    } else {
      console.log('Error data:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
