// Development only: Metro (the server Expo Go already talks to) forwards /api/* and /health/* to the
// local API. The phone then needs no firewall rule for port 8000 and no hard-coded laptop IP — it reaches
// the API through the same address it loads the app from. Release builds never use this.
const http = require('node:http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const target = new URL(process.env.HUNGERLY_API_PROXY || 'http://127.0.0.1:8000');

function proxy(req, res) {
  const upstream = http.request(
    {
      host: target.hostname,
      port: target.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${target.hostname}:${target.port}` },
      timeout: 20000,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'dev.api_unreachable', detail: `Metro could not reach the API at ${target.origin}. Is it running?` }));
  });
  req.pipe(upstream);
}

const previous = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const base = previous ? previous(middleware, server) : middleware;
    return (req, res, next) => {
      if (req.url && (req.url.startsWith('/api/') || req.url.startsWith('/health/'))) return proxy(req, res);
      return base(req, res, next);
    };
  },
};

module.exports = config;
