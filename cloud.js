/*
 * Sincronização opcional com a nuvem (Supabase), sem dependências.
 * Um login (e-mail + senha) e uma linha por usuário com o estado inteiro do app
 * em JSON; a coluna `rev` detecta alterações feitas em outro aparelho.
 *
 *  - createSync(env): núcleo testável (Node: test/cloud.test.js)
 *  - window.Cloud:    ligação com o app e o cartão "Nuvem" da aba Ajustes
 */
(function (global) {
'use strict';

const META_KEY = 'investcalc-cloud-v1';
const TABLE = 'investcalc_state';
const PUSH_DELAY = 2500;

const SETUP_SQL = `create table public.investcalc_state (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  rev bigint not null default 1,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.investcalc_state enable row level security;

create policy "cada usuario ve so a propria linha"
  on public.investcalc_state for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on public.investcalc_state to authenticated;`;

class CloudError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function createSync(env) {
  const { storage, getState, applyRemote } = env;
  const doFetch = (...a) => env.fetch(...a);
  const now = env.now || (() => Date.now());
  const setTimer = env.setTimeout || ((f, ms) => setTimeout(f, ms));
  const clearTimer = env.clearTimeout || ((t) => clearTimeout(t));

  let meta = { url: '', key: '', session: null, rev: null, dirty: false, lastSync: null };
  try { Object.assign(meta, JSON.parse(storage.getItem(META_KEY)) || {}); } catch { /* recomeça */ }
  const saveMeta = () => { try { storage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* sem espaço */ } };

  let status = { code: meta.session ? 'idle' : 'off', message: '' };
  let changeSeq = 0, timer = null, busy = null, again = false;
  const setStatus = (code, message) => {
    status = { code, message: message || '' };
    if (env.onStatus) env.onStatus(status);
  };

  const base = () => meta.url.replace(/\/+$/, '');
  const signedIn = () => !!(meta.session && meta.url && meta.key);

  async function readError(res) {
    let body = null;
    try { body = await res.json(); } catch { /* sem corpo */ }
    const msg = (body && (body.error_description || body.msg || body.message || body.error)) || `HTTP ${res.status}`;
    return { msg: String(msg), code: body && (body.code || body.error_code) };
  }

  function storeSession(body) {
    meta.session = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: Math.floor(now() / 1000) + (body.expires_in || 3600),
      user_id: body.user && body.user.id,
      email: body.user && body.user.email,
    };
    saveMeta();
  }

  async function authCall(path, payload) {
    let res;
    try {
      res = await doFetch(base() + '/auth/v1/' + path, {
        method: 'POST',
        headers: { apikey: meta.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch { throw new CloudError('offline', 'Sem conexão com a nuvem.'); }
    if (!res.ok) {
      const e = await readError(res);
      throw new CloudError('auth', e.msg);
    }
    return res.json();
  }

  async function refreshSession() {
    try {
      storeSession(await authCall('token?grant_type=refresh_token', { refresh_token: meta.session.refresh_token }));
      return true;
    } catch (e) {
      if (e.code === 'offline') throw e;
      meta.session = null;
      saveMeta();
      throw new CloudError('signedout', 'Sessão expirada — entre de novo.');
    }
  }

  async function rest(method, query, body, retry = true) {
    if (meta.session.expires_at - 60 < now() / 1000) await refreshSession();
    let res;
    try {
      res = await doFetch(`${base()}/rest/v1/${TABLE}${query}`, {
        method,
        headers: {
          apikey: meta.key,
          Authorization: 'Bearer ' + meta.session.access_token,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch { throw new CloudError('offline', 'Sem conexão — as alterações ficam no aparelho e sobem depois.'); }
    if (res.status === 401 && retry) { await refreshSession(); return rest(method, query, body, false); }
    if (!res.ok) {
      const e = await readError(res);
      if (res.status === 409) throw new CloudError('exists', e.msg);
      if (res.status === 404 || e.code === 'PGRST205' || e.code === '42P01') {
        throw new CloudError('setup', 'Tabela não encontrada — rode o SQL de configuração no Supabase.');
      }
      throw new CloudError('error', e.msg);
    }
    return res.json();
  }

  const uid = () => encodeURIComponent(meta.session.user_id);
  async function fetchRemote() {
    const rows = await rest('GET', `?select=rev,data&user_id=eq.${uid()}`);
    return rows.length ? rows[0] : null;
  }
  function done(rev, seq) {
    meta.rev = rev;
    meta.dirty = seq !== changeSeq; // houve edição durante o envio
    meta.lastSync = now();
    saveMeta();
    setStatus('synced');
    if (meta.dirty) schedule();
  }
  async function pushInsert() {
    const seq = changeSeq;
    const rows = await rest('POST', '', { user_id: meta.session.user_id, rev: 1, data: getState() });
    done(rows[0].rev, seq);
  }
  // só grava se a nuvem ainda estiver na revisão `rev`; false = outro aparelho gravou antes
  async function pushUpdate(rev) {
    const seq = changeSeq;
    const rows = await rest('PATCH', `?user_id=eq.${uid()}&rev=eq.${rev}`,
      { rev: rev + 1, data: getState(), updated_at: new Date(now()).toISOString() });
    if (!rows.length) return false;
    done(rows[0].rev, seq);
    return true;
  }
  function adopt(remote) {
    applyRemote(remote.data);
    meta.rev = remote.rev;
    meta.dirty = false;
    meta.lastSync = now();
    saveMeta();
    setStatus('synced');
  }
  const conflict = (first) => setStatus('conflict', first
    ? 'Já existem dados na nuvem desta conta. Escolha quais manter.'
    : 'Este aparelho e a nuvem foram alterados ao mesmo tempo. Escolha quais dados manter.');

  async function cycle() {
    setStatus('syncing');
    const remote = await fetchRemote();
    if (!remote) {
      try { await pushInsert(); } catch (e) { if (e.code !== 'exists') throw e; again = true; }
      return;
    }
    if (meta.rev == null) { conflict(true); return; }
    if (remote.rev !== meta.rev) {
      if (meta.dirty) conflict(false); else adopt(remote);
      return;
    }
    if (!meta.dirty) { meta.lastSync = now(); saveMeta(); setStatus('synced'); return; }
    if (!(await pushUpdate(meta.rev))) again = true; // perdeu a corrida: reavalia
  }

  function fail(e) {
    if (e instanceof CloudError) setStatus(e.code === 'signedout' ? 'off' : e.code === 'offline' ? 'offline' : 'error', e.message);
    else setStatus('error', String((e && e.message) || e));
  }

  function run(job) {
    if (busy) { again = true; return busy; }
    busy = (async () => {
      try { await job(); } catch (e) { again = false; fail(e); }
      busy = null;
      if (again) { again = false; return sync(); }
      return status;
    })();
    return busy;
  }
  function sync() {
    if (!signedIn()) return Promise.resolve(status);
    return run(cycle);
  }
  function schedule() {
    if (timer) clearTimer(timer);
    timer = setTimer(() => { timer = null; return sync(); }, PUSH_DELAY);
  }

  return {
    SETUP_SQL,
    getStatus: () => status,
    getInfo: () => ({ url: meta.url, key: meta.key, email: meta.session && meta.session.email,
      signedIn: signedIn(), dirty: meta.dirty, lastSync: meta.lastSync }),
    sync,
    markDirty() {
      changeSeq++;
      if (!meta.dirty) { meta.dirty = true; saveMeta(); }
      if (signedIn() && status.code !== 'conflict') schedule();
    },
    async signIn(url, key, email, password, create) {
      const prev = meta.session && meta.session.user_id;
      meta.url = String(url || '').trim();
      meta.key = String(key || '').trim();
      if (!/^https:\/\/[^\s/]+/.test(meta.url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(meta.url)) {
        throw new CloudError('auth', 'URL do projeto inválida (ex.: https://xxxx.supabase.co).');
      }
      if (!meta.key) throw new CloudError('auth', 'Informe a chave pública (anon / publishable) do projeto.');
      saveMeta();
      const body = await authCall(create ? 'signup' : 'token?grant_type=password', { email, password });
      if (!body.access_token) {
        throw new CloudError('confirm', 'Conta criada. Confirme o e-mail que o Supabase enviou e depois toque em Entrar.');
      }
      storeSession(body);
      if (prev !== meta.session.user_id) meta.rev = null; // outra conta: nunca sincronizou aqui
      saveMeta();
      setStatus('idle');
      return sync();
    },
    async signOut() {
      if (timer) { clearTimer(timer); timer = null; }
      const s = meta.session;
      meta.session = null;
      meta.rev = null;
      saveMeta();
      setStatus('off');
      if (s) {
        try {
          await doFetch(base() + '/auth/v1/logout', { method: 'POST',
            headers: { apikey: meta.key, Authorization: 'Bearer ' + s.access_token } });
        } catch { /* sem rede: a sessão local já foi apagada */ }
      }
    },
    // resolve um conflito: 'cloud' baixa a nuvem por cima do aparelho; 'device' envia o aparelho por cima da nuvem
    resolve(which) {
      if (!signedIn()) return Promise.resolve(status);
      again = false;
      return run(async () => {
        setStatus('syncing');
        const remote = await fetchRemote();
        if (which === 'cloud') {
          if (remote) adopt(remote); else await pushInsert();
        } else if (!remote) {
          await pushInsert();
        } else if (!(await pushUpdate(remote.rev))) {
          conflict(false);
        }
      });
    },
  };
}

/* ===== Ligação com o app (navegador) ===== */
function browserCloud() {
  /* global state, replaceState, renderAllVisible, esc */
  const fmtTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  let cardEl = null, notice = '';

  const core = createSync({
    fetch: (...a) => fetch(...a),
    storage: localStorage,
    getState: () => state,
    applyRemote: (data) => { replaceState(data); renderAllVisible(); },
    onStatus: () => draw(),
  });

  const STATUS = {
    off: ['dot-off', 'Desconectado — os dados ficam só neste aparelho.'],
    idle: ['dot-off', 'Conectado.'],
    syncing: ['dot-off', 'Sincronizando…'],
    synced: ['dot-on', 'Sincronizado'],
    offline: ['dot-off', ''],
    conflict: ['dot-off', ''],
    error: ['dot-off', ''],
  };

  function draw() {
    if (!cardEl || !cardEl.isConnected) return;
    const info = core.getInfo(), st = core.getStatus();
    const [dot, text] = STATUS[st.code] || STATUS.error;
    const line = st.message || text
      + (st.code === 'synced' && info.lastSync ? ` às ${fmtTime.format(new Date(info.lastSync))}` : '')
      + (st.code === 'synced' && info.dirty ? ' · alterações a enviar' : '');
    const head = `<h2>Nuvem</h2>
      <p class="hint">Entre com a mesma conta no celular e no computador para ver os mesmos dados. Só você tem acesso.</p>`;
    const msg = notice ? `<div class="warn-box">${esc(notice)}</div>` : '';

    if (info.signedIn) {
      cardEl.innerHTML = `${head}${msg}
        <p class="cloud-status"><span class="dot ${dot}"></span>${esc(info.email || '')} — ${esc(line)}</p>
        ${st.code === 'conflict' ? `<div class="warn-box">
          <b>Use os dados da nuvem</b> para trazer o que está salvo na conta (substitui os deste aparelho), ou
          <b>envie este aparelho</b> para gravar por cima do que está na nuvem.
          <div class="row-gap wrap" style="margin-top:8px">
            <button class="mini-btn" data-resolve="cloud">Usar os dados da nuvem</button>
            <button class="mini-btn danger" data-resolve="device">Enviar este aparelho</button>
          </div></div>` : ''}
        <div class="row-gap wrap">
          <button class="mini-btn" id="cloud-sync">Sincronizar agora</button>
          <button class="mini-btn danger" id="cloud-out">Sair</button>
        </div>`;
      cardEl.querySelector('#cloud-sync').addEventListener('click', () => { notice = ''; core.sync(); });
      cardEl.querySelector('#cloud-out').addEventListener('click', () => {
        if (confirm('Sair da nuvem? Os dados continuam neste aparelho.')) core.signOut();
      });
      cardEl.querySelectorAll('[data-resolve]').forEach((b) => b.addEventListener('click', () => {
        const which = b.dataset.resolve;
        const q = which === 'cloud'
          ? 'Substituir os dados deste aparelho pelos da nuvem?'
          : 'Gravar os dados deste aparelho por cima dos que estão na nuvem?';
        if (confirm(q)) core.resolve(which);
      }));
      return;
    }

    cardEl.innerHTML = `${head}${msg}
      <p class="cloud-status"><span class="dot dot-off"></span>${esc(line)}</p>
      <div class="field-grid">
        <label class="field wide"><span>URL do projeto Supabase</span><div class="input-wrap">
          <input type="url" id="cloud-url" value="${esc(info.url)}" placeholder="https://xxxx.supabase.co" autocomplete="off" autocapitalize="none"></div></label>
        <label class="field wide"><span>Chave pública (anon / publishable)</span><div class="input-wrap">
          <input type="text" id="cloud-key" value="${esc(info.key)}" autocomplete="off" autocapitalize="none" spellcheck="false"></div></label>
        <label class="field"><span>E-mail</span><div class="input-wrap">
          <input type="email" id="cloud-email" autocomplete="username" autocapitalize="none"></div></label>
        <label class="field"><span>Senha</span><div class="input-wrap">
          <input type="password" id="cloud-pass" autocomplete="current-password"></div></label>
      </div>
      <div class="row-gap wrap" style="margin-top:10px">
        <button class="mini-btn" id="cloud-in">Entrar</button>
        <button class="mini-btn" id="cloud-up">Criar conta</button>
      </div>
      <details style="margin-top:12px">
        <summary>Como configurar (uma vez, ~5 minutos)</summary>
        <p class="hint">1. Crie uma conta gratuita em supabase.com e um projeto novo.<br>
          2. No projeto, abra <b>SQL Editor</b>, cole o SQL abaixo e toque em <b>Run</b>.<br>
          3. Em <b>Project Settings → API</b>, copie a <b>Project URL</b> e a chave pública (<b>anon</b> ou <b>publishable</b>) para os campos acima. Nunca use a chave <b>service_role</b>/<b>secret</b>.<br>
          4. Digite um e-mail e uma senha e toque em <b>Criar conta</b> (uma vez). Nos outros aparelhos, use <b>Entrar</b>.<br>
          5. Depois de criar a sua conta, desligue novos cadastros em <b>Authentication → Sign In / Providers</b> ("Allow new users to sign up").</p>
        <pre class="sql">${esc(SETUP_SQL)}</pre>
      </details>`;
    const go = (create) => async () => {
      const v = (id) => cardEl.querySelector(id).value;
      if (!v('#cloud-email') || !v('#cloud-pass')) { notice = 'Informe e-mail e senha.'; draw(); return; }
      notice = '';
      try {
        await core.signIn(v('#cloud-url'), v('#cloud-key'), v('#cloud-email').trim(), v('#cloud-pass'), create);
      } catch (e) { notice = e.message || String(e); }
      draw();
    };
    cardEl.querySelector('#cloud-in').addEventListener('click', go(false));
    cardEl.querySelector('#cloud-up').addEventListener('click', go(true));
  }

  const wake = () => { if (document.visibilityState === 'visible') core.sync(); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);
  core.sync();

  return {
    markDirty: core.markDirty,
    sync: core.sync,
    renderCard(el) { cardEl = el; draw(); },
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createSync, SETUP_SQL, META_KEY };
else global.Cloud = browserCloud();
})(typeof window !== 'undefined' ? window : globalThis);
