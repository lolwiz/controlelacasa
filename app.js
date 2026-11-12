'use strict';
/* =========================================================
   CONTROLE FINANCEIRO – LA CASA  (v1)
   ---------------------------------------------------------
   API_URL: cole aqui a URL do "App da Web" do Google Apps
   Script (termina em /exec) para sincronizar entre aparelhos.
   Deixe vazio ('') para usar só no aparelho (modo local).
   ========================================================= */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbydueeuqKoZvlLk5XFHcyQv_GKh9wUrDx3dzJhrvw5WKoqW5AeVQA36d0imwwfttBGWnw/exec'
};

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const K_DADOS = 'lacasa_fin_dados', K_HASH = 'lacasa_fin_hash', K_SESS = 'lacasa_fin_sessao', K_ABA = 'lacasa_fin_aba';

const $ = s => document.querySelector(s);
const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------------- DADOS LOCAIS ---------------- */
let S = carregar();
function carregar() {
  try {
    const d = JSON.parse(localStorage.getItem(K_DADOS));
    if (d && Array.isArray(d.lanc)) return Object.assign({ metas: {}, dirty: 0, lastSync: 0 }, d);
  } catch (e) {}
  return { lanc: [], metas: {}, dirty: 0, lastSync: 0 };
}
function salvar() { localStorage.setItem(K_DADOS, JSON.stringify(S)); }
function alterou() { S.dirty++; salvar(); renderTudo(); agendarSync(); }
const ativos = () => S.lanc.filter(l => !l.del);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const r2 = n => Math.round(n * 100) / 100;

/* ---------------- FORMATAÇÃO ---------------- */
function parseBR(s) {
  if (s == null) return 0;
  s = String(s).replace(/R\$|\s/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? r2(n) : NaN;
}
function money(v, sempreValor) {
  if (!v && !sempreValor) return '<span class="money"><span>R$</span><span>-</span></span>';
  const neg = v < 0;
  return `<span class="money${neg ? ' neg' : ''}"><span>${neg ? '-' : ''}R$</span><span>${fmt.format(Math.abs(v))}</span></span>`;
}
const dataBR = d => d.split('-').reverse().join('/');
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- SENHA / LOGIN ---------------- */
async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('lacasa-fin:' + t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const senhaSessao = () => sessionStorage.getItem(K_SESS) || localStorage.getItem(K_SESS);
const criandoSenha = () => !CONFIG.API_URL && !localStorage.getItem(K_HASH);

function telaLogin() {
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  const criar = criandoSenha();
  $('#lgConfBox').classList.toggle('hidden', !criar);
  $('#lgSub').textContent = criar ? 'Primeiro acesso: crie sua senha' : 'Digite sua senha para entrar';
  $('#lgBtn').textContent = criar ? 'Criar senha e entrar' : 'Entrar';
  $('#lgSenha').value = ''; $('#lgConf').value = '';
  setTimeout(() => $('#lgSenha').focus(), 50);
}

$('#fmLogin').addEventListener('submit', async ev => {
  ev.preventDefault();
  const pw = $('#lgSenha').value, erro = m => { $('#lgErro').textContent = m; };
  erro('');
  const h = await sha256(pw), salvo = localStorage.getItem(K_HASH);

  if (!CONFIG.API_URL) {                                   // modo local
    if (!salvo) {
      if (pw.length < 4) return erro('A senha precisa ter pelo menos 4 caracteres.');
      if (pw !== $('#lgConf').value) return erro('As senhas não conferem.');
      localStorage.setItem(K_HASH, h);
    } else if (h !== salvo) return erro('Senha incorreta.');
  } else if (navigator.onLine) {                           // online: valida no servidor
    $('#lgBtn').disabled = true; erro('Verificando…');
    try {
      const r = await api({ acao: 'login', senha: pw });
      if (!r.ok) { $('#lgBtn').disabled = false; return erro(r.erro || 'Senha incorreta.'); }
      localStorage.setItem(K_HASH, h);
    } catch (e) {
      if (!salvo || h !== salvo) { $('#lgBtn').disabled = false; return erro(salvo ? 'Senha incorreta.' : 'Não foi possível conectar ao servidor.'); }
    }
    $('#lgBtn').disabled = false; erro('');
  } else {                                                 // offline
    if (!salvo) return erro('O primeiro acesso neste aparelho precisa de internet.');
    if (h !== salvo) return erro('Senha incorreta.');
  }

  sessionStorage.removeItem(K_SESS); localStorage.removeItem(K_SESS);
  ($('#lgManter').checked ? localStorage : sessionStorage).setItem(K_SESS, pw);
  abrirApp();
});

$('#btSair').addEventListener('click', sair);
function sair() {
  sessionStorage.removeItem(K_SESS); localStorage.removeItem(K_SESS);
  telaLogin();
}

/* ---------------- ABAS ---------------- */
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => mostrarAba(b.dataset.tab)));
function mostrarAba(t) {
  localStorage.setItem(K_ABA, t);
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('ativa', b.dataset.tab === t));
  $('#aba-controle').classList.toggle('hidden', t !== 'controle');
  $('#aba-resumo').classList.toggle('hidden', t !== 'resumo');
  renderTudo();
}

/* ---------------- FILTROS (ANO/MÊS) ---------------- */
function anosDisponiveis() {
  const set = new Set([String(new Date().getFullYear())]);
  ativos().forEach(l => set.add(l.data.slice(0, 4)));
  Object.keys(S.metas).forEach(k => { if (S.metas[k].v != null) set.add(k.slice(0, 4)); });
  return [...set].sort();
}
function preencherAnos(sel) {
  const atual = sel.value || String(new Date().getFullYear());
  const anos = anosDisponiveis();
  sel.innerHTML = anos.map(a => `<option value="${a}">${a}</option>`).join('');
  sel.value = anos.includes(atual) ? atual : anos[anos.length - 1];
}
$('#fMes').innerHTML = '<option value="">Todos</option>' +
  MESES_NOME.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${m}</option>`).join('');
$('#fMes').value = String(new Date().getMonth() + 1).padStart(2, '0');
$('#fMes').addEventListener('change', renderControle);
$('#fAno').addEventListener('change', renderControle);
$('#rAno').addEventListener('change', () => renderResumo(true));

/* ---------------- ABA CONTROLE FINANCEIRO ---------------- */
let editId = null;
['#inAlm', '#inNoi', '#inBeb'].forEach(id => $(id).addEventListener('blur', e => {
  const n = parseBR(e.target.value);
  if (e.target.value.trim() && !isNaN(n)) e.target.value = fmt.format(n);
}));

$('#fmLanc').addEventListener('submit', ev => {
  ev.preventDefault();
  const data = $('#inData').value;
  const alm = parseBR($('#inAlm').value), noi = parseBR($('#inNoi').value), beb = parseBR($('#inBeb').value);
  if (!data) return alert('Informe a data.');
  if ([alm, noi, beb].some(isNaN)) return alert('Valor inválido. Use o formato 1.000,00');
  if (!alm && !noi && !beb) return alert('Informe pelo menos um valor.');
  if (editId) {
    const l = S.lanc.find(x => x.id === editId);
    if (l) Object.assign(l, { data, almoco: alm, noite: noi, bebidas: beb, upd: Date.now() });
  } else {
    S.lanc.push({ id: uid(), data, almoco: alm, noite: noi, bebidas: beb, upd: Date.now(), del: 0 });
  }
  // mostra o mês/ano do lançamento
  preencherAnos($('#fAno'));
  $('#fAno').value = data.slice(0, 4);
  if ($('#fMes').value) $('#fMes').value = data.slice(5, 7);
  limparForm();
  alterou();
});
$('#btCancelar').addEventListener('click', limparForm);
function limparForm() {
  editId = null;
  $('#inData').value = hoje();
  $('#inAlm').value = $('#inNoi').value = $('#inBeb').value = '';
  $('#btSalvar').textContent = 'Adicionar';
  $('#btCancelar').classList.add('hidden');
}

$('#tbodyControle').addEventListener('click', e => {
  const b = e.target.closest('button[data-acao]'); if (!b) return;
  const l = S.lanc.find(x => x.id === b.dataset.id); if (!l) return;
  if (b.dataset.acao === 'del') {
    if (!confirm(`Excluir o lançamento de ${dataBR(l.data)}?`)) return;
    l.del = 1; l.upd = Date.now();
    if (editId === l.id) limparForm();
    alterou();
  } else {
    editId = l.id;
    $('#inData').value = l.data;
    $('#inAlm').value = l.almoco ? fmt.format(l.almoco) : '';
    $('#inNoi').value = l.noite ? fmt.format(l.noite) : '';
    $('#inBeb').value = l.bebidas ? fmt.format(l.bebidas) : '';
    $('#btSalvar').textContent = 'Salvar';
    $('#btCancelar').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

function renderControle() {
  preencherAnos($('#fAno'));
  const ano = $('#fAno').value, mes = $('#fMes').value;
  const rows = ativos()
    .filter(l => l.data.slice(0, 4) === ano && (!mes || l.data.slice(5, 7) === mes))
    .sort((a, b) => a.data.localeCompare(b.data) || a.upd - b.upd);
  let tA = 0, tN = 0, tB = 0;
  $('#tbodyControle').innerHTML = rows.length ? rows.map(l => {
    const t = r2(l.almoco + l.noite + l.bebidas);
    tA += l.almoco; tN += l.noite; tB += l.bebidas;
    return `<tr>
      <td style="text-align:center">${dataBR(l.data)}</td>
      <td>${money(l.almoco)}</td><td>${money(l.noite)}</td><td>${money(l.bebidas)}</td>
      <td class="tot">${money(t)}</td>
      <td style="white-space:nowrap;text-align:center">
        <button type="button" class="ic" data-acao="edit" data-id="${esc(l.id)}" title="Editar">✏️</button>
        <button type="button" class="ic" data-acao="del" data-id="${esc(l.id)}" title="Excluir">🗑️</button>
      </td></tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhum lançamento neste período.</td></tr>';
  $('#tfootControle').innerHTML = `<tr><td style="text-align:center">TOTAL</td>
    <td>${money(r2(tA))}</td><td>${money(r2(tN))}</td><td>${money(r2(tB))}</td><td>${money(r2(tA + tN + tB))}</td><td></td></tr>`;
}

/* ---------------- ABA RESUMO ---------------- */
function metaDe(k) { const m = S.metas[k]; return m && m.v != null ? m.v : null; }

function renderResumo(forcar) {
  preencherAnos($('#rAno'));
  const ano = $('#rAno').value;
  const ae = document.activeElement;
  // se o usuário está digitando uma meta, só recalcula (não recria os campos)
  if (!forcar && ae && ae.classList.contains('meta-in') && $('#tbodyResumo').dataset.ano === ano) return calcularResumo();
  $('#tbodyResumo').dataset.ano = ano;
  $('#tbodyResumo').innerHTML = MESES.map((m, i) => {
    const k = `${ano}-${String(i + 1).padStart(2, '0')}`, mv = metaDe(k);
    return `<tr data-k="${k}">
      <td class="mes">${i + 1}<br><small style="font-weight:normal">${m}</small></td>
      <td class="c-a"></td><td class="c-n"></td><td class="c-b"></td><td class="c-t tv"></td>
      <td><input class="meta-in" data-k="${k}" inputmode="decimal" placeholder="-" value="${mv != null ? fmt.format(mv) : ''}" aria-label="Meta ${MESES_NOME[i]}"></td>
      <td class="c-v"></td><td class="c-s status-meta"></td></tr>`;
  }).join('');
  calcularResumo();
}

function statusMeta(td, total, meta) {
  td.classList.remove('ok', 'nok');
  if (meta == null) { td.textContent = '-'; return; }
  if (total >= meta) { td.classList.add('ok'); td.textContent = 'Meta alcançada!'; }
  else { td.classList.add('nok'); td.textContent = 'Meta não alcançada!'; }
}

function calcularResumo() {
  let gA = 0, gN = 0, gB = 0, gM = 0, temMeta = false;
  document.querySelectorAll('#tbodyResumo tr').forEach(tr => {
    const k = tr.dataset.k;
    let a = 0, n = 0, b = 0;
    ativos().forEach(l => { if (l.data.slice(0, 7) === k) { a += l.almoco; n += l.noite; b += l.bebidas; } });
    a = r2(a); n = r2(n); b = r2(b);
    const t = r2(a + n + b), meta = metaDe(k);
    gA += a; gN += n; gB += b;
    if (meta != null) { gM += meta; temMeta = true; }
    tr.querySelector('.c-a').innerHTML = money(a);
    tr.querySelector('.c-n').innerHTML = money(n);
    tr.querySelector('.c-b').innerHTML = money(b);
    tr.querySelector('.c-t').innerHTML = money(t);
    tr.querySelector('.c-v').innerHTML = meta != null ? money(r2(t - meta), true) : '<span class="dash">-</span>';
    statusMeta(tr.querySelector('.c-s'), t, meta);
  });
  const gT = r2(gA + gN + gB);
  $('#tfootResumo').innerHTML = `<tr><td class="mes" style="text-align:center">TOTAL</td>
    <td>${money(r2(gA))}</td><td>${money(r2(gN))}</td><td>${money(r2(gB))}</td><td>${money(gT)}</td>
    <td>${temMeta ? money(r2(gM), true) : '<span class="dash">-</span>'}</td>
    <td>${temMeta ? money(r2(gT - gM), true) : '<span class="dash">-</span>'}</td>
    <td class="status-meta" id="statusAno"></td></tr>`;
  statusMeta($('#statusAno'), gT, temMeta ? r2(gM) : null);
}

$('#tbodyResumo').addEventListener('change', e => {
  const inp = e.target; if (!inp.classList.contains('meta-in')) return;
  const k = inp.dataset.k, txt = inp.value.trim();
  const v = txt ? parseBR(txt) : null;
  if (v != null && (isNaN(v) || v < 0)) { alert('Meta inválida. Use o formato 2.000,00'); const m = metaDe(k); inp.value = m != null ? fmt.format(m) : ''; return; }
  inp.value = v != null ? fmt.format(v) : '';
  S.metas[k] = { v, upd: Date.now() };
  S.dirty++; salvar(); calcularResumo(); agendarSync();
});
$('#tbodyResumo').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('meta-in')) e.target.blur();
});

function renderTudo() {
  if ($('#app').classList.contains('hidden')) return;
  if (!$('#aba-controle').classList.contains('hidden')) renderControle();
  if (!$('#aba-resumo').classList.contains('hidden')) renderResumo();
  status();
}

/* ---------------- SINCRONIZAÇÃO ---------------- */
let syncTimer = null, sincronizando = false, erroSync = '';
async function api(body) {
  const r = await fetch(CONFIG.API_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body)
  });
  return r.json();
}
function agendarSync(ms = 1200) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, ms); }

function mergeLanc(a, b) {
  const m = new Map();
  [...(a || []), ...(b || [])].forEach(l => {
    const x = m.get(l.id);
    if (!x || (l.upd || 0) > (x.upd || 0)) m.set(l.id, {
      id: String(l.id), data: String(l.data).slice(0, 10), almoco: +l.almoco || 0, noite: +l.noite || 0,
      bebidas: +l.bebidas || 0, upd: +l.upd || 0, del: +l.del ? 1 : 0
    });
  });
  return [...m.values()];
}
function mergeMetas(a, b) {
  const r = Object.assign({}, a || {});
  Object.entries(b || {}).forEach(([k, m]) => {
    if (!r[k] || (m.upd || 0) > (r[k].upd || 0)) r[k] = { v: m.v == null || m.v === '' ? null : +m.v, upd: +m.upd || 0 };
  });
  return r;
}

async function sync() {
  if (!CONFIG.API_URL || !navigator.onLine || sincronizando || !senhaSessao()) return status();
  sincronizando = true; status();
  const dirtyAntes = S.dirty;
  try {
    const r = await api({ acao: 'sync', senha: senhaSessao(), lanc: S.lanc, metas: S.metas });
    if (!r.ok) {
      if (/senha/i.test(r.erro || '')) { sincronizando = false; localStorage.removeItem(K_HASH); alert('A senha foi alterada. Entre novamente.'); return sair(); }
      throw new Error(r.erro || 'Erro no servidor');
    }
    S.lanc = mergeLanc(S.lanc, r.lanc);
    S.metas = mergeMetas(S.metas, r.metas);
    S.dirty = Math.max(0, S.dirty - dirtyAntes);
    S.lastSync = Date.now(); erroSync = '';
    salvar();
    sincronizando = false;
    renderTudo();
    if (S.dirty) agendarSync(500);
  } catch (e) {
    erroSync = e.message || 'falha';
    sincronizando = false;
  }
  status();
}

function status() {
  const el = $('#status'); el.className = 'status';
  $('#btSync').classList.toggle('hidden', !CONFIG.API_URL);
  const pend = S.dirty ? ` • ${S.dirty} alteraç${S.dirty > 1 ? 'ões' : 'ão'} pendente${S.dirty > 1 ? 's' : ''}` : '';
  if (!CONFIG.API_URL) { el.classList.add('loc'); el.textContent = 'Modo local • salvo neste aparelho'; return; }
  if (!navigator.onLine) { el.classList.add('off'); el.textContent = 'Offline' + (pend || ' • salvo no aparelho'); return; }
  if (sincronizando) { el.textContent = 'Sincronizando…'; return; }
  if (erroSync) { el.classList.add('err'); el.textContent = 'Erro ao sincronizar' + pend; return; }
  const h = S.lastSync ? new Date(S.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  el.textContent = S.dirty ? 'Online' + pend : `Online • sincronizado às ${h}`;
}

$('#btSync').addEventListener('click', () => sync());
window.addEventListener('online', () => { status(); sync(); });
window.addEventListener('offline', status);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
setInterval(sync, 60000);

/* ---------------- INÍCIO ---------------- */
function abrirApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  limparForm();
  mostrarAba(localStorage.getItem(K_ABA) || 'controle');
  sync();
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (senhaSessao() && localStorage.getItem(K_HASH)) abrirApp(); else telaLogin();
