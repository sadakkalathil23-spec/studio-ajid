const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3025;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.webm': 'video/webm'
};

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.split('?')[0] === '/api/contact') {
    const send = (status, payload) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }).end(JSON.stringify(payload));
    };

    if (!(req.headers['content-type'] || '').startsWith('application/json')) {
      send(415, { ok: false, error: 'Please submit the form as JSON.' });
      return;
    }

    let body = '';
    let bytes = 0;
    let tooLarge = false;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 64 * 1024) { tooLarge = true; return; }
      body += chunk;
    });
    req.on('end', () => {
      if (tooLarge) { send(413, { ok: false, error: 'The inquiry is too large.' }); return; }

      let input;
      try { input = JSON.parse(body); }
      catch (e) { send(400, { ok: false, error: 'Invalid form data.' }); return; }

      /* Quietly accept the hidden honeypot without saving it. Bots see a
         successful response while genuine submissions continue below. */
      if (String(input.companyWebsite || '').trim()) {
        send(200, { ok: true });
        return;
      }

      const clean = (value, max) => String(value || '')
        .replace(/\0/g, '').trim().slice(0, max);
      const projectTypes = ['Residential', 'Hospitality', 'Objects', 'Other'];
      const contactMethods = ['Email', 'Phone', 'WhatsApp'];

      const submission = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        fullName: clean(input.fullName, 120),
        email: clean(input.email, 180).toLowerCase(),
        phone: clean(input.phone, 60),
        projectType: clean(input.projectType, 40),
        location: clean(input.location, 160),
        budget: clean(input.budget, 80),
        preferredContact: clean(input.preferredContact, 40),
        message: clean(input.message, 2000)
      };

      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email);
      if (!submission.fullName || !validEmail || !submission.message ||
          !projectTypes.includes(submission.projectType) ||
          !contactMethods.includes(submission.preferredContact) || input.consent !== true) {
        send(400, { ok: false, error: 'Please complete all required fields.' });
        return;
      }

      const dataDir = path.join(ROOT, 'data');
      const file = path.join(dataDir, 'contact-submissions.jsonl');
      fs.mkdir(dataDir, { recursive: true }, err => {
        if (err) { send(500, { ok: false, error: 'Unable to save the inquiry.' }); return; }
        fs.appendFile(file, JSON.stringify(submission) + '\n', 'utf8', appendErr => {
          if (appendErr) { send(500, { ok: false, error: 'Unable to save the inquiry.' }); return; }
          send(201, { ok: true, id: submission.id });
        });
      });
    });
    return;
  }

  // dev only: POST a dataURL here to drop a frame into shots/ for inspection
  if (req.method === 'POST' && req.url.startsWith('/__shot')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const m = /^data:image\/(\w+);base64,(.*)$/s.exec(body.trim());
      if (!m) { res.writeHead(400).end('bad'); return; }
      // ?as=assets/out/0000.webp writes to that path; otherwise shots/<ts>
      const as = new URL(req.url, 'http://x').searchParams.get('as');
      const rel = as
        ? path.normalize(as).replace(/^(\.\.[/\\])+/, '')
        : path.join('shots', 'shot-' + Date.now() + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]));
      const dest = path.join(ROOT, rel);
      if (!dest.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(m[2], 'base64'));
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end(rel);
    });
    return;
  }

  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    }).end(buf);
  });
}).listen(PORT, () => console.log(`falcon-scroll → http://localhost:${PORT}`));
