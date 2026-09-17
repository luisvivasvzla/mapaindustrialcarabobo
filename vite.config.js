import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data', 'municipios.json');

let lastNominatimRequestTime = 0;

function apiPersistencePlugin() {
  return {
    name: 'api-persistence',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const parsedUrl = new URL(req.url, 'http://localhost:5173');

        // Endpoint Geocoding Nominatim
        if (parsedUrl.pathname === '/api/geocode') {
          const query = parsedUrl.searchParams.get('q');
          if (!query || !query.trim()) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify([]));
            return;
          }

          const now = Date.now();
          const elapsed = now - lastNominatimRequestTime;
          if (elapsed < 1050) {
            await new Promise((resolve) => setTimeout(resolve, 1050 - elapsed));
          }
          lastNominatimRequestTime = Date.now();

          const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&limit=5&countrycodes=ve`;

          try {
            const geoRes = await fetch(nominatimUrl, {
              headers: {
                'User-Agent': 'CaraboboIndustrialMap/1.0 (Carabobo Industrial App; contact: dev@carabobo-map.ve)',
                'Accept-Language': 'es',
              },
            });

            if (!geoRes.ok) throw new Error(`Nominatim HTTP ${geoRes.status}`);
            const data = await geoRes.json();
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(data));
            return;
          } catch (err) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }

        // Endpoint Municipios
        if (parsedUrl.pathname === '/api/municipios') {
          if (req.method === 'GET') {
            try {
              const raw = await fs.readFile(DATA_FILE, 'utf-8');
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(raw);
              return;
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
              return;
            }
          }

          if (req.method === 'PUT') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                const parsed = JSON.parse(body);
                if (!Array.isArray(parsed)) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Array expected' }));
                  return;
                }
                await fs.writeFile(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
                const totalEmpresas = parsed.reduce((acc, m) => acc + (m.empresas?.length || 0), 0);
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ success: true, count: parsed.length, totalEmpresas }));
                return;
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
            });
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const mapboxToken = env.MAPBOX_ACCESS_TOKEN || env.VITE_MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || '';

  return {
    define: {
      '__MAPBOX_ACCESS_TOKEN__': JSON.stringify(mapboxToken),
    },
    plugins: [react(), apiPersistencePlugin()],
    server: {
      port: 5173,
      open: false,
      proxy: {
        '/api/verify-place': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/config-status': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/config-key': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
