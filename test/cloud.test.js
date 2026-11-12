/*
 * Testa o núcleo de sincronização (cloud.js) contra um Supabase simulado em
 * memória: login, primeiro envio, segundo aparelho, conflito, token expirado,
 * falta de rede e isolamento entre contas.
 * Rodar: node test/cloud.test.js
 */
'use strict';
const { createSync, META_KEY } = require('../cloud.js');

let fails = 0;
const check = (label, ok) => { if (!ok) { fails++; console.log('FAIL ' + label); } };

/* ---- servidor simulado (GoTrue + PostgREST com RLS por usuário) ---- */
function fakeServer() {
  const users = new Map();   // email -> { id, password }
  const tokens = new Map();  // access_token -> user id
  const rows = new Map();    // user id -> { user_id, rev, data }
  const srv = { rows, tokens, offline: false, calls: [], n: 0 };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const session = (u, email) => {
    const access_token = 'at-' + (++srv.n);
    tokens.set(access_token, u.id);
    return { access_token, refresh_token: 'rt-' + u.id, expires_in: 3600, user: { id: u.id, email } };
  };
  srv.fetch = async (url, opts = {}) => {
    if (srv.offline) throw new TypeError('fetch failed');
    const u = new URL(url);
    const body = opts.body ? JSON.parse(opts.body) : null;
    srv.calls.push(`${opts.method || 'GET'} ${u.pathname}`);
    if (opts.headers.apikey !== 'anon-key') return json(401, { message: 'Invalid API key' });
    if (u.pathname === '/auth/v1/signup') {
      if (users.has(body.email)) return json(422, { msg: 'User already registered' });
      const user = { id: 'u' + (users.size + 1), password: body.password, email: body.email };
      users.set(body.email, user);
      return json(200, session(user, body.email));
    }
    if (u.pathname === '/auth/v1/token') {
      if (u.searchParams.get('grant_type') === 'refresh_token') {
        const user = [...users.values()].find((x) => 'rt-' + x.id === body.refresh_token);
        return user ? json(200, session(user, user.email)) : json(400, { error_description: 'Invalid Refresh Token' });
      }
      const user = users.get(body.email);
      if (!user || user.password !== body.password) return json(400, { error_description: 'Invalid login credentials' });
      return json(200, session(user, body.email));
    }
    if (u.pathname === '/auth/v1/logout') return json(204, null);
    if (u.pathname === '/rest/v1/investcalc_state') {
      const me = tokens.get((opts.headers.Authorization || '').replace('Bearer ', ''));
      if (!me) return json(401, { message: 'JWT expired' });
      const eq = (k) => (u.searchParams.get(k) || '').replace(/^eq\./, '');
      const mine = rows.get(me);                       // RLS: só a própria linha
      const hit = mine && (!eq('user_id') || eq('user_id') === me) && (!eq('rev') || +eq('rev') === mine.rev);
      if (opts.method === 'GET') return json(200, hit ? [{ rev: mine.rev, data: mine.data }] : []);
      if (opts.method === 'POST') {
        if (body.user_id !== me) return json(403, { message: 'new row violates row-level security policy' });
        if (mine) return json(409, { message: 'duplicate key value' });
        rows.set(me, JSON.parse(JSON.stringify(body)));
        return json(201, [rows.get(me)]);
      }
      if (opts.method === 'PATCH') {
        if (!hit) return json(200, []);
        Object.assign(mine, JSON.parse(JSON.stringify(body)));
        return json(200, [mine]);
      }
    }
    return json(404, { message: 'not found' });
  };
  return srv;
}

function device(srv, initial) {
  const store = new Map();
  const dev = { state: initial, statuses: [], clock: Date.now(), timers: [] };
  dev.sync = createSync({
    fetch: srv.fetch,
    storage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    getState: () => dev.state,
    applyRemote: (data) => { dev.state = JSON.parse(JSON.stringify(data)); },
    onStatus: (s) => dev.statuses.push(s.code),
    now: () => dev.clock,
    setTimeout: (f) => { dev.timers.push(f); return dev.timers.length; },
    clearTimeout: (id) => { dev.timers[id - 1] = null; },
  });
  dev.edit = (change) => { change(dev.state); dev.sync.markDirty(); };
  dev.flush = async () => { const t = dev.timers.filter(Boolean); dev.timers = []; for (const f of t) await f(); };
  dev.store = store;
  return dev;
}
const URL_ = 'https://proj.supabase.co';
const code = (d) => d.sync.getStatus().code;

(async () => {
  const srv = fakeServer();

  /* aparelho A cria a conta e envia os dados que já tinha */
  const A = device(srv, { params: {}, deals: [], clients: ['ana'] });
  A.edit(() => {});
  await A.sync.signIn(URL_, 'anon-key', 'me@x.com', 'pw', true);
  check('A sincronizado após criar conta', code(A) === 'synced');
  check('linha criada na nuvem', srv.rows.get('u1') && srv.rows.get('u1').rev === 1);
  check('dados de A na nuvem', srv.rows.get('u1').data.clients[0] === 'ana');

  /* erros de login */
  const X = device(srv, { params: {}, deals: [] });
  let err = null;
  try { await X.sync.signIn(URL_, 'anon-key', 'me@x.com', 'errada', false); } catch (e) { err = e; }
  check('senha errada é recusada', err && /Invalid login/.test(err.message) && !X.sync.getInfo().signedIn);
  err = null;
  try { await X.sync.signIn('proj.supabase.co', 'anon-key', 'me@x.com', 'pw', false); } catch (e) { err = e; }
  check('URL sem https é recusada', err && /URL/.test(err.message));

  /* aparelho B entra: nuvem já tem dados → precisa escolher */
  const B = device(srv, { params: {}, deals: [], clients: ['seed'] });
  await B.sync.signIn(URL_, 'anon-key', 'me@x.com', 'pw', false);
  check('B pede escolha no primeiro acesso', code(B) === 'conflict');
  check('B não sobrescreveu a nuvem', srv.rows.get('u1').data.clients[0] === 'ana');
  check('B não perdeu os dados locais', B.state.clients[0] === 'seed');
  await B.sync.resolve('cloud');
  check('B adotou a nuvem', code(B) === 'synced' && B.state.clients[0] === 'ana');

  /* B edita → sobe; A puxa ao voltar */
  B.edit((s) => s.clients.push('bob'));
  check('envio agendado', B.timers.filter(Boolean).length === 1);
  await B.flush();
  check('B enviou', srv.rows.get('u1').rev === 2 && srv.rows.get('u1').data.clients.length === 2);
  await A.sync.sync();
  check('A recebeu a edição de B', A.state.clients.join() === 'ana,bob' && code(A) === 'synced');

  /* sem alterações: nada é gravado */
  const before = srv.calls.length;
  await A.sync.sync();
  check('sync sem mudanças só lê', srv.calls.slice(before).join() === 'GET /rest/v1/investcalc_state');

  /* conflito: os dois editam sem sincronizar */
  A.edit((s) => s.clients.push('de-A'));
  B.edit((s) => s.clients.push('de-B'));
  await B.flush();
  await A.flush();
  check('A detecta conflito', code(A) === 'conflict');
  check('nuvem ficou com B', srv.rows.get('u1').data.clients.includes('de-B') && !srv.rows.get('u1').data.clients.includes('de-A'));
  check('A mantém a própria edição', A.state.clients.includes('de-A'));
  A.edit((s) => s.clients.push('mais-A'));
  check('em conflito não agenda envio', A.timers.filter(Boolean).length === 0);
  await A.sync.resolve('device');
  check('A enviou por cima', code(A) === 'synced' && srv.rows.get('u1').data.clients.includes('mais-A'));
  await B.sync.sync();
  check('B recebeu a versão de A', B.state.clients.includes('mais-A') && !B.state.clients.includes('de-B'));

  /* sem rede: fica pendente e sobe depois */
  srv.offline = true;
  A.edit((s) => s.clients.push('offline'));
  await A.flush();
  check('offline sinalizado', code(A) === 'offline' && A.sync.getInfo().dirty);
  srv.offline = false;
  await A.sync.sync();
  check('subiu ao voltar a rede', code(A) === 'synced' && srv.rows.get('u1').data.clients.includes('offline'));

  /* token expirado no servidor → renova e repete */
  srv.tokens.clear();
  A.edit((s) => s.clients.push('pos-token'));
  await A.flush();
  check('renovou o token e enviou', code(A) === 'synced' && srv.rows.get('u1').data.clients.includes('pos-token'));

  /* token perto de expirar pelo relógio → renova antes */
  A.clock += 3600 * 1000;
  const n = srv.calls.length;
  await A.sync.sync();
  check('renova antes de expirar', srv.calls[n] === 'POST /auth/v1/token');

  /* estado sobrevive a recarregar a página (mesmo storage) */
  const A2 = createSync({ fetch: srv.fetch, getState: () => A.state, applyRemote: () => {},
    storage: { getItem: (k) => A.store.get(k) || null, setItem: (k, v) => A.store.set(k, v) } });
  check('sessão persiste', A2.getInfo().signedIn && A2.getInfo().email === 'me@x.com');
  check('senha nunca é guardada', !A.store.get(META_KEY).includes('pw'));

  /* outra conta não enxerga nem altera a primeira */
  const C = device(srv, { params: {}, deals: [], clients: ['de-outra-conta'] });
  await C.sync.signIn(URL_, 'anon-key', 'other@x.com', 'pw2', true);
  check('conta 2 tem a própria linha', srv.rows.get('u2').data.clients[0] === 'de-outra-conta');
  check('conta 1 intacta', srv.rows.get('u1').data.clients[0] === 'ana');

  /* sair: para de sincronizar, dados locais ficam */
  await B.sync.signOut();
  const m = srv.calls.length;
  B.edit((s) => s.clients.push('local'));
  await B.flush();
  await B.sync.sync();
  check('desconectado não fala com a nuvem', srv.calls.length === m && code(B) === 'off' && B.state.clients.includes('local'));

  console.log(fails ? `${fails} falha(s)` : 'OK — sincronização com a nuvem');
  process.exit(fails ? 1 : 0);
})();
