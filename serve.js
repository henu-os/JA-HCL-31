// JEEVIKA ERP - Lightweight Static HTTP Server (port 3000)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.eot':  'application/vnd.ms-fontobject',
  '.bat':  'text/plain',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + filePath.replace(ROOT, ''));
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // Strip query strings for file lookup
  let urlPath = req.url.split('?')[0];

  // Default to login.html at root
  if (urlPath === '/') urlPath = '/login.html';

  // Handle favicon.ico fallback
  if (urlPath === '/favicon.ico') {
    const icoPath = path.join(ROOT, 'favicon.ico');
    if (fs.existsSync(icoPath)) {
      serveFile(res, icoPath);
      return;
    }
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#1565C0"/><text x="16" y="22" fill="#FFFFFF" font-family="Segoe UI, Arial, sans-serif" font-weight="bold" font-size="18" text-anchor="middle">J</text></svg>`;
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
    res.end(svgIcon);
    return;
  }

  const filePath = path.join(ROOT, urlPath);
  const ext = path.extname(filePath);

  if (ext) {
    // Has extension — serve directly
    serveFile(res, filePath);
  } else {
    // No extension — try adding .html (e.g. /workspace → workspace.html)
    const withHtml = filePath + '.html';
    fs.access(withHtml, fs.constants.F_OK, (err) => {
      if (!err) {
        serveFile(res, withHtml);
      } else {
        // Try as directory/index.html
        const indexHtml = path.join(filePath, 'index.html');
        fs.access(indexHtml, fs.constants.F_OK, (err2) => {
          if (!err2) {
            serveFile(res, indexHtml);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found: ' + urlPath);
          }
        });
      }
    });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error('  ERROR: Port ' + PORT + ' is already in use!');
    console.error('  Close the existing JEEVIKA ERP Frontend window and try again.');
    console.error('');
    process.exit(1);
  } else {
    throw err;
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  JEEVIKA ERP Frontend Server running at:');
  console.log('  http://localhost:' + PORT);
  console.log('');
});
