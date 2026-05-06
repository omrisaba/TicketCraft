import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const [{ default: https }, { default: http }, { default: fs }] = await Promise.all([
    import('https'),
    import('http'),
    import('fs'),
  ]);

  const { app } = await import('./app.js');
  const { config, validateConfig } = await import('./config/index.js');

  validateConfig();

  const { DraftStore } = await import('./services/draft/DraftStore.js');
  DraftStore.cleanup().then((n) => {
    if (n > 0) console.log(`[DRAFTS] Cleaned up ${n} expired draft(s).`);
  }).catch(() => {});

  let useHttps = false;

  try {
    if (fs.existsSync(config.tls.certPath) && fs.existsSync(config.tls.keyPath)) {
      const tlsOptions = {
        key: fs.readFileSync(config.tls.keyPath),
        cert: fs.readFileSync(config.tls.certPath),
      };

      const httpsServer = https.createServer(tlsOptions, app);
      httpsServer.listen(config.port, config.host, () => {
        console.log(`[HTTPS] Server running at https://${config.host}:${config.port}`);
      });

      const httpRedirect = http.createServer((req, res) => {
        const redirectUrl = `https://${config.host}:${config.port}${req.url}`;
        res.writeHead(301, { Location: redirectUrl });
        res.end();
      });

      httpRedirect.listen(config.httpPort, config.host, () => {
        console.log(`[HTTP]  Redirecting http://${config.host}:${config.httpPort} → HTTPS`);
      });

      useHttps = true;
    }
  } catch (err) {
    console.warn('[TLS] Could not load certificates, falling back to HTTP:', (err as Error).message);
  }

  if (!useHttps) {
    const httpServer = http.createServer(app);
    httpServer.listen(config.port, config.host, () => {
      console.log(`[HTTP]  Server running at http://${config.host}:${config.port}`);
      console.log('[WARN]  No TLS certificates found. Run "npm run generate-certs" for HTTPS.');
    });
  }
}

main();
