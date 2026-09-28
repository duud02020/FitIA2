const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);
const sessions = new Map();

fs.mkdirSync(DATA, { recursive: true });
const usersFile = path.join(DATA, 'users.json');
const checkinsFile = path.join(DATA, 'checkins.json');
if (!fs.existsSync(usersFile) || readJson(usersFile, []).length === 0) {
  const salt = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(usersFile, JSON.stringify([{ id: crypto.randomUUID(), name: 'João Silva', email: 'joao@fitia.com', password: hashPassword('123456', salt), salt }], null, 2));
}
if (!fs.existsSync(checkinsFile)) fs.writeFileSync(checkinsFile, '{}');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function hashPassword(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
function safeUser(user) { return { id: user.id, name: user.name, email: user.email }; }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => { const i = part.indexOf('='); return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1))]; })); }
function currentUser(req) { const id = sessions.get(parseCookies(req).fitia_session); return id && readJson(usersFile, []).find(user => user.id === id); }
function send(res, status, body, headers = {}) { const payload = JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(payload); }
function readBody(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 1e6) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido')); } }); req.on('error', reject); }); }
function requireUser(req, res) { const user = currentUser(req); if (!user) { send(res, 401, { error: 'Faça login para continuar.' }); return null; } return user; }

const workouts = [
  { id: 'full-body', title: 'Full body express', category: 'Força', duration: 45, level: 'Iniciante' },
  { id: 'intervalada', title: 'Corrida intervalada', category: 'Cardio', duration: 30, level: 'Intermediário' },
  { id: 'flow', title: 'Flow para começar', category: 'Mobilidade', duration: 20, level: 'Todos os níveis' }
];

async function api(req, res, url) {
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, service: 'Fit.IA API' });
    if (req.method === 'GET' && url.pathname === '/api/workouts') return send(res, 200, workouts);
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const { name, email, password } = await readBody(req);
      if (!name || !email || !password || password.length < 6) return send(res, 400, { error: 'Informe nome, email e uma senha com pelo menos 6 caracteres.' });
      const users = readJson(usersFile, []); const normalized = email.trim().toLowerCase();
      if (users.some(user => user.email === normalized)) return send(res, 409, { error: 'Este email já está cadastrado.' });
      const salt = crypto.randomBytes(16).toString('hex'); const user = { id: crypto.randomUUID(), name: name.trim(), email: normalized, password: hashPassword(password, salt), salt };
      users.push(user); saveJson(usersFile, users); const token = crypto.randomUUID(); sessions.set(token, user.id);
      return send(res, 201, { user: safeUser(user) }, { 'Set-Cookie': `fitia_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800` });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const { email, password } = await readBody(req); const user = readJson(usersFile, []).find(item => item.email === String(email || '').trim().toLowerCase());
      if (!user || !crypto.timingSafeEqual(Buffer.from(hashPassword(String(password || ''), user.salt)), Buffer.from(user.password))) return send(res, 401, { error: 'Email ou senha incorretos.' });
      const token = crypto.randomUUID(); sessions.set(token, user.id);
      return send(res, 200, { user: safeUser(user) }, { 'Set-Cookie': `fitia_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800` });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') { const token = parseCookies(req).fitia_session; sessions.delete(token); return send(res, 200, { ok: true }, { 'Set-Cookie': 'fitia_session=; HttpOnly; Path=/; Max-Age=0' }); }
    if (req.method === 'GET' && url.pathname === '/api/auth/me') { const user = currentUser(req); return send(res, 200, { user: user ? safeUser(user) : null }); }
    if (req.method === 'GET' && url.pathname === '/api/checkins') { const user = requireUser(req, res); if (!user) return; return send(res, 200, readJson(checkinsFile, {})[user.id] || []); }
    if (req.method === 'PUT' && url.pathname === '/api/checkins') { const user = requireUser(req, res); if (!user) return; const { date, trained } = await readBody(req); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(res, 400, { error: 'Data inválida.' }); const all = readJson(checkinsFile, {}); const dates = new Set(all[user.id] || []); trained ? dates.add(date) : dates.delete(date); all[user.id] = [...dates].sort(); saveJson(checkinsFile, all); return send(res, 200, all[user.id]); }
    return send(res, 404, { error: 'Rota não encontrada.' });
  } catch (error) { return send(res, 500, { error: 'Erro interno do servidor.', detail: error.message }); }
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.resolve(ROOT, `.${requested}`);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, { error: 'Arquivo não encontrado.' });
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
server.listen(PORT, () => console.log(`Fit.IA rodando em http://localhost:${PORT}`));
