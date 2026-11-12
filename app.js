'use strict';
/* =========================================================
   CONTROLE FINANCEIRO – LA CASA MIX  (v6)
   ---------------------------------------------------------
   API_URL: URL do "App da Web" do Google Apps Script (/exec).
   Deixe vazio ('') para usar só no aparelho (modo local).
   ========================================================= */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbydueeuqKoZvlLk5XFHcyQv_GKh9wUrDx3dzJhrvw5WKoqW5AeVQA36d0imwwfttBGWnw/exec'
};

const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const K_DADOS = 'lacasa_fin_dados', K_HASH = 'lacasa_fin_hash', K_SESS = 'lacasa_fin_sessao', K_ABA = 'lacasa_fin_aba';

/* Abas por estabelecimento (meta editável) */
const ESTAB = {
  alm: { campo: 'almoco',  nome: 'Almoço',  col: 'La Casa<br>Almoço (R$)',  sigla: 'ALMOÇO', titulo: 'La Casa <span>Almoço</span>' },
  noi: { campo: 'noite',   nome: 'Noite',   col: 'La Casa<br>Noite (R$)',   sigla: 'NOITE',  titulo: 'La Casa <span>Noite</span>' },
  beb: { campo: 'bebidas', nome: 'Bebidas', col: 'La Casa<br>Bebidas (R$)', sigla: 'CONV.',  titulo: 'La Casa <span>Bebidas</span>' }
};

const $ = s => document.querySelector(s);
const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------------- DADOS LOCAIS ----------------
   S.lanc  = lançamentos diários
   S.metas = valores mensais editáveis, chave "tipo:AAAA-MM"
             alm/noi/beb = metas | tra = valor de transporte  */
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
const valor = key => { const m = S.metas[key]; return m && m.v != null && m.v !== '' ? +m.v : null; };

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
function variacao(v) {
  if (v == null) return '<span class="dash">-</span>';
  const cls = v < 0 ? ' neg' : v > 0 ? ' pos' : '';
  return `<span class="money${cls}"><span>${v < 0 ? '-' : ''}R$</span><span>${fmt.format(Math.abs(v))}</span></span>`;
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
}

$('#fmLogin').addEventListener('submit', async ev => {
  ev.preventDefault();
  const pw = $('#lgSenha').value, erro = m => { $('#lgErro').textContent = m; };
  erro('');
  const h = await sha256(pw), salvo = localStorage.getItem(K_HASH);

  if (!CONFIG.API_URL) {
    if (!salvo) {
      if (pw.length < 4) return erro('A senha precisa ter pelo menos 4 caracteres.');
      if (pw !== $('#lgConf').value) return erro('As senhas não conferem.');
      localStorage.setItem(K_HASH, h);
    } else if (h !== salvo) return erro('Senha incorreta.');
  } else if (navigator.onLine) {
    $('#lgBtn').disabled = true; erro('Verificando…');
    try {
      const r = await api({ acao: 'login', senha: pw });
      if (!r.ok) { $('#lgBtn').disabled = false; return erro(r.erro || 'Senha incorreta.'); }
      localStorage.setItem(K_HASH, h);
    } catch (e) {
      if (!salvo || h !== salvo) { $('#lgBtn').disabled = false; return erro(salvo ? 'Senha incorreta.' : 'Não foi possível conectar ao servidor.'); }
    }
    $('#lgBtn').disabled = false; erro('');
  } else {
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
const ABAS = ['controle', 'alm', 'noi', 'beb', 'tra', 'acu', 'res', 'est'];
let abaAtual = 'controle';
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => mostrarAba(b.dataset.tab)));
function mostrarAba(t) {
  if (!ABAS.includes(t)) t = 'controle';
  abaAtual = t;
  localStorage.setItem(K_ABA, t);
  document.querySelectorAll('.tab').forEach(b => {
    const at = b.dataset.tab === t;
    b.classList.toggle('ativa', at);
    if (at) b.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  $('#aba-controle').classList.toggle('hidden', t !== 'controle');
  $('#aba-mensal').classList.toggle('hidden', t === 'controle');
  if (t !== 'controle') montarMensal();
  renderTudo();
}

/* ---------------- FILTROS ---------------- */
function anosDisponiveis() {
  const set = new Set([String(new Date().getFullYear())]);
  ativos().forEach(l => set.add(l.data.slice(0, 4)));
  Object.keys(S.metas).forEach(k => { const m = k.match(/(\d{4})-\d{2}$/); if (m && valor(k) != null) set.add(m[1]); });
  return [...set].sort();
}
function preencherAnos(sel) {
  const atual = sel.value || String(new Date().getFullYear());
  const anos = anosDisponiveis();
  const html = anos.map(a => `<option value="${a}">${a}</option>`).join('');
  if (sel.innerHTML !== html) sel.innerHTML = html;
  sel.value = anos.includes(atual) ? atual : anos[anos.length - 1];
}
$('#fMes').innerHTML = '<option value="">Todos</option>' +
  MESES_NOME.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${m}</option>`).join('');
$('#fMes').value = String(new Date().getMonth() + 1).padStart(2, '0');
$('#fMes').addEventListener('change', renderControle);
$('#fAno').addEventListener('change', renderControle);
$('#rAno').addEventListener('change', () => { montarMensal(); calcularMensal(); });

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
    $('#fmLanc').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      <td class="cab" data-label="Data" style="text-align:center">${dataBR(l.data)}</td>
      <td data-label="Almoço">${money(l.almoco)}</td>
      <td data-label="Noite">${money(l.noite)}</td>
      <td data-label="Bebidas">${money(l.bebidas)}</td>
      <td class="tot" data-label="Total">${money(t)}</td>
      <td class="acoes-td" style="white-space:nowrap;text-align:center">
        <button type="button" class="ic" data-acao="edit" data-id="${esc(l.id)}" title="Editar" aria-label="Editar">✏️</button>
        <button type="button" class="ic" data-acao="del" data-id="${esc(l.id)}" title="Excluir" aria-label="Excluir">🗑️</button>
      </td></tr>`;
  }).join('') : '<tr><td colspan="6" class="vazio">Nenhum lançamento neste período.</td></tr>';
  $('#tfootControle').innerHTML = `<tr><td class="cab" data-label="TOTAL" style="text-align:center"><span class="so-pc">TOTAL – </span>${mes ? MESES_NOME[+mes - 1] : 'Ano'} ${ano}</td>
    <td data-label="Almoço">${money(r2(tA))}</td><td data-label="Noite">${money(r2(tN))}</td>
    <td data-label="Bebidas">${money(r2(tB))}</td><td data-label="Total">${money(r2(tA + tN + tB))}</td><td class="vazia"></td></tr>`;
}

/* ---------------- ABAS MENSAIS ---------------- */
function vendasMes(k) {           // k = "AAAA-MM"
  let a = 0, n = 0, b = 0;
  ativos().forEach(l => { if (l.data.slice(0, 7) === k) { a += l.almoco; n += l.noite; b += l.bebidas; } });
  return { almoco: r2(a), noite: r2(n), bebidas: r2(b) };
}
const chavesAno = ano => MESES_NOME.map((_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
const inputValor = (key, label) => {
  const v = valor(key);
  return `<input class="meta-in" data-key="${key}" inputmode="decimal" placeholder="-" value="${v != null ? fmt.format(v) : ''}" aria-label="${label}">`;
};
const celMes = (i) => `<td class="mes cab" data-label="MÊS ${i + 1}"><span class="so-pc">${i + 1}</span><span class="so-cel">${MESES_NOME[i]}</span></td>`;

function statusMeta(td, total, meta) {
  td.classList.remove('ok', 'nok');
  if (meta == null) { td.textContent = '-'; return; }
  if (total >= meta) { td.classList.add('ok'); td.textContent = 'Meta alcançada!'; }
  else { td.classList.add('nok'); td.textContent = 'Meta não alcançada!'; }
}

/* monta o esqueleto da tabela (só quando muda a aba ou o ano) */
function montarMensal() {
  if (abaAtual === 'controle') return;
  preencherAnos($('#rAno'));
  const ano = $('#rAno').value, t = abaAtual, ks = chavesAno(ano);
  const tb = $('#tbMensal');
  tb.className = t === 'res' ? 't-res' : t === 'est' ? 't-est' : t === 'acu' ? 't-acu' : t === 'tra' ? 't-tra' : 't-meta';
  $('#mWrap').classList.toggle('estreita', t === 'tra');
  $('#tbodyMensal').dataset.id = t + ano;

  if (ESTAB[t]) {
    const e = ESTAB[t];
    $('#mTitulo').innerHTML = e.titulo;
    $('#theadMensal').innerHTML = `<tr><th>MÊS</th><th>${e.col}</th><th>META ${e.sigla}<br>MÊS (R$)</th>
      <th>VARIAÇÃO<br>${e.sigla} (R$)</th><th>META ${e.sigla}<br>BATIDA?</th></tr>`;
    $('#tbodyMensal').innerHTML = ks.map((k, i) => `<tr data-k="${k}">${celMes(i)}
      <td class="c-v" data-label="${e.nome}"></td>
      <td data-label="Meta mês">${inputValor(t + ':' + k, `Meta ${e.nome} ${MESES_NOME[i]}`)}</td>
      <td class="c-var opc" data-label="Variação"></td>
      <td class="c-s status-meta opc"></td></tr>`).join('');
    $('#mDica').innerHTML = `Somente o campo <b>META ${e.sigla} MÊS</b> é editável. As vendas vêm automaticamente da aba Controle Financeiro.`;
  } else if (t === 'tra') {
    $('#mTitulo').innerHTML = 'La Casa <span>Transportes</span>';
    $('#theadMensal').innerHTML = `<tr><th>MÊS</th><th>La Casa<br>Transporte (R$)</th></tr>`;
    $('#tbodyMensal').innerHTML = ks.map((k, i) => `<tr data-k="${k}">${celMes(i)}
      <td data-label="Transporte">${inputValor('tra:' + k, `Transporte ${MESES_NOME[i]}`)}</td></tr>`).join('');
    $('#mDica').innerHTML = 'Digite o valor de <b>Transporte</b> de cada mês. Não há meta nesta aba.';
  } else if (t === 'acu') {
    $('#mTitulo').innerHTML = 'Resumo <span>Mensal</span>';
    $('#theadMensal').innerHTML = `<tr><th>MÊS</th><th>ENTRADAS<br>MÊS (R$)</th><th>ENTRADAS<br>ACUMULADAS (R$)</th>
      <th>META<br>MÊS (R$)</th><th>META<br>ACUMULADA (R$)</th><th>VARIAÇÃO<br>ACUMULADA (R$)</th><th>META ACUMULADA<br>BATIDA?</th></tr>`;
    $('#tbodyMensal').innerHTML = ks.map((k, i) => `<tr data-k="${k}">${celMes(i)}
      <td class="c-e opc" data-label="Entradas mês"></td><td class="c-ea acum tv" data-label="Entradas acumuladas"></td>
      <td class="c-m opc" data-label="Meta mês"></td><td class="c-ma acum tv" data-label="Meta acumulada"></td>
      <td class="c-var opc" data-label="Variação acumulada"></td><td class="c-s status-meta opc"></td></tr>`).join('');
    $('#mDica').innerHTML = 'Tudo nesta aba é automático. <b>Entradas</b> = Almoço + Noite + Bebidas + Transporte. <b>Meta</b> = metas de Almoço + Noite + Bebidas. Os valores acumulados somam de janeiro até o mês da linha.';
  } else if (t === 'est') {
    $('#mTitulo').innerHTML = 'Resumo <span>Estabelecimentos</span>';
    $('#theadMensal').innerHTML = `<tr><th>MÊS</th><th>La Casa<br>Almoço (R$)</th><th>La Casa<br>Noite (R$)</th>
      <th>La Casa<br>Bebidas (R$)</th><th>La Casa<br>Transporte (R$)</th><th>TOTAL<br>MÊS (R$)</th></tr>`;
    $('#tbodyMensal').innerHTML = ks.map((k, i) => `<tr data-k="${k}">${celMes(i)}
      <td class="c-a opc" data-label="Almoço"></td><td class="c-n opc" data-label="Noite"></td>
      <td class="c-b opc" data-label="Bebidas"></td><td class="c-t opc" data-label="Transporte"></td>
      <td class="c-tot tv" data-label="Total mês"></td></tr>`).join('');
    $('#mDica').innerHTML = 'Tudo nesta aba é automático: soma <b>todos os estabelecimentos</b> (Almoço, Noite, Bebidas e Transporte) por mês.';
  } else {
    $('#mTitulo').innerHTML = 'Metas <span>Resumo</span>';
    $('#theadMensal').innerHTML = `<tr><th>MÊS</th><th>La Casa<br>Almoço (R$)</th><th>La Casa<br>Noite (R$)</th>
      <th>La Casa<br>Bebidas (R$)</th><th>TOTAL<br>VENDAS (R$)</th>
      <th>META<br>MÊS (R$)</th><th>VARIAÇÃO<br>(R$)</th><th>META<br>BATIDA?</th></tr>`;
    $('#tbodyMensal').innerHTML = ks.map((k, i) => `<tr data-k="${k}">${celMes(i)}
      <td class="c-a opc" data-label="Almoço"></td><td class="c-n opc" data-label="Noite"></td>
      <td class="c-b opc" data-label="Bebidas"></td>
      <td class="c-tot tv" data-label="Total vendas"></td><td class="c-m" data-label="Meta mês"></td>
      <td class="c-var opc" data-label="Variação"></td><td class="c-s status-meta opc"></td></tr>`).join('');
    $('#mDica').innerHTML = 'Tudo nesta aba é automático: soma as vendas e as <b>metas</b> das abas Almoço, Noite e Bebidas.';
  }
}

/* preenche os valores calculados (sem recriar os campos) */
function calcularMensal() {
  if (abaAtual === 'controle') return;
  const t = abaAtual, ano = $('#rAno').value;
  if ($('#tbodyMensal').dataset.id !== t + ano) montarMensal();
  const linhas = document.querySelectorAll('#tbodyMensal tr');

  if (ESTAB[t]) {
    const e = ESTAB[t]; let gV = 0, gM = 0, tem = false;
    linhas.forEach(tr => {
      const k = tr.dataset.k, v = vendasMes(k)[e.campo], m = valor(t + ':' + k);
      gV += v; if (m != null) { gM += m; tem = true; }
      tr.querySelector('.c-v').innerHTML = money(v);
      tr.querySelector('.c-var').innerHTML = variacao(m != null ? r2(v - m) : null);
      statusMeta(tr.querySelector('.c-s'), v, m);
      tr.classList.toggle('sem-dados', !v && m == null);
    });
    gV = r2(gV); gM = r2(gM);
    $('#tfootMensal').innerHTML = `<tr><td class="mes cab" data-label="TOTAL">${ano}</td>
      <td data-label="${e.nome}">${money(gV)}</td>
      <td data-label="Meta ano">${tem ? money(gM, true) : '<span class="dash">-</span>'}</td>
      <td data-label="Variação">${tem ? variacao(r2(gV - gM)) : '<span class="dash">-</span>'}</td>
      <td class="status-meta" id="stTot"></td></tr>`;
    statusMeta($('#stTot'), gV, tem ? gM : null);
  } else if (t === 'tra') {
    let g = 0;
    linhas.forEach(tr => { g += valor('tra:' + tr.dataset.k) || 0; });
    $('#tfootMensal').innerHTML = `<tr><td class="mes cab" data-label="TOTAL">${ano}</td>
      <td data-label="Transporte">${money(r2(g))}</td></tr>`;
  } else if (t === 'acu') {
    let aE = 0, aM = 0, temAlguma = false;
    linhas.forEach(tr => {
      const k = tr.dataset.k, vm = vendasMes(k), tr$ = valor('tra:' + k) || 0;
      const metas = ['alm', 'noi', 'beb'].map(x => valor(x + ':' + k));
      const temM = metas.some(x => x != null), meta = temM ? r2(metas.reduce((s, x) => s + (x || 0), 0)) : 0;
      const ent = r2(vm.almoco + vm.noite + vm.bebidas + tr$);
      aE = r2(aE + ent); aM = r2(aM + meta); if (temM) temAlguma = true;
      tr.querySelector('.c-e').innerHTML = money(ent);
      tr.querySelector('.c-ea').innerHTML = money(aE);
      tr.querySelector('.c-m').innerHTML = temM ? money(meta, true) : '<span class="dash">-</span>';
      tr.querySelector('.c-ma').innerHTML = temAlguma ? money(aM, true) : '<span class="dash">-</span>';
      tr.querySelector('.c-var').innerHTML = temM ? variacao(r2(aE - aM)) : '<span class="dash">-</span>';
      statusMeta(tr.querySelector('.c-s'), aE, temM ? aM : null);
      tr.classList.toggle('sem-dados', !ent && !temM);
    });
    $('#tfootMensal').innerHTML = `<tr><td class="mes cab" data-label="TOTAL">${ano}</td>
      <td data-label="Entradas ano">${money(aE)}</td><td data-label="Entradas acumuladas">${money(aE)}</td>
      <td data-label="Meta ano">${temAlguma ? money(aM, true) : '<span class="dash">-</span>'}</td>
      <td data-label="Meta acumulada">${temAlguma ? money(aM, true) : '<span class="dash">-</span>'}</td>
      <td data-label="Variação">${temAlguma ? variacao(r2(aE - aM)) : '<span class="dash">-</span>'}</td>
      <td class="status-meta" id="stTot"></td></tr>`;
    statusMeta($('#stTot'), aE, temAlguma ? aM : null);
  } else if (t === 'est') {
    const G = { a: 0, n: 0, b: 0, t: 0 };
    linhas.forEach(tr => {
      const k = tr.dataset.k, vm = vendasMes(k), tr$ = valor('tra:' + k) || 0;
      const tot = r2(vm.almoco + vm.noite + vm.bebidas + tr$);
      G.a += vm.almoco; G.n += vm.noite; G.b += vm.bebidas; G.t += tr$;
      tr.querySelector('.c-a').innerHTML = money(vm.almoco);
      tr.querySelector('.c-n').innerHTML = money(vm.noite);
      tr.querySelector('.c-b').innerHTML = money(vm.bebidas);
      tr.querySelector('.c-t').innerHTML = money(tr$);
      tr.querySelector('.c-tot').innerHTML = money(tot);
      tr.classList.toggle('sem-dados', !tot);
    });
    $('#tfootMensal').innerHTML = `<tr><td class="mes cab" data-label="TOTAL">${ano}</td>
      <td data-label="Almoço">${money(r2(G.a))}</td><td data-label="Noite">${money(r2(G.n))}</td>
      <td data-label="Bebidas">${money(r2(G.b))}</td><td data-label="Transporte">${money(r2(G.t))}</td>
      <td data-label="Total ano">${money(r2(G.a + G.n + G.b + G.t))}</td></tr>`;
  } else {
    const G = { a: 0, n: 0, b: 0, m: 0 }; let tem = false;
    linhas.forEach(tr => {
      const k = tr.dataset.k, vm = vendasMes(k);
      const metas = ['alm', 'noi', 'beb'].map(x => valor(x + ':' + k));
      const temM = metas.some(x => x != null), meta = temM ? r2(metas.reduce((s, x) => s + (x || 0), 0)) : null;
      const tot = r2(vm.almoco + vm.noite + vm.bebidas);
      G.a += vm.almoco; G.n += vm.noite; G.b += vm.bebidas;
      if (temM) { G.m += meta; tem = true; }
      tr.querySelector('.c-a').innerHTML = money(vm.almoco);
      tr.querySelector('.c-n').innerHTML = money(vm.noite);
      tr.querySelector('.c-b').innerHTML = money(vm.bebidas);
      tr.querySelector('.c-tot').innerHTML = money(tot);
      tr.querySelector('.c-m').innerHTML = temM ? money(meta, true) : '<span class="dash">-</span>';
      tr.querySelector('.c-var').innerHTML = temM ? variacao(r2(tot - meta)) : '<span class="dash">-</span>';
      statusMeta(tr.querySelector('.c-s'), tot, meta);
      tr.classList.toggle('sem-dados', !tot && !temM);
    });
    const gT = r2(G.a + G.n + G.b), gM = r2(G.m);
    $('#tfootMensal').innerHTML = `<tr><td class="mes cab" data-label="TOTAL">${ano}</td>
      <td data-label="Almoço">${money(r2(G.a))}</td><td data-label="Noite">${money(r2(G.n))}</td>
      <td data-label="Bebidas">${money(r2(G.b))}</td>
      <td data-label="Total vendas">${money(gT)}</td>
      <td data-label="Meta ano">${tem ? money(gM, true) : '<span class="dash">-</span>'}</td>
      <td data-label="Variação">${tem ? variacao(r2(gT - gM)) : '<span class="dash">-</span>'}</td>
      <td class="status-meta" id="stTot"></td></tr>`;
    statusMeta($('#stTot'), gT, tem ? gM : null);
  }
}

/* edição de meta / transporte */
$('#tbodyMensal').addEventListener('change', e => {
  const inp = e.target; if (!inp.classList.contains('meta-in')) return;
  const key = inp.dataset.key, txt = inp.value.trim();
  const v = txt ? parseBR(txt) : null;
  if (v != null && (isNaN(v) || v < 0)) {
    alert('Valor inválido. Use o formato 2.000,00');
    const m = valor(key); inp.value = m != null ? fmt.format(m) : ''; return;
  }
  inp.value = v != null ? fmt.format(v) : '';
  S.metas[key] = { v, upd: Date.now() };
  S.dirty++; salvar(); calcularMensal(); status(); agendarSync();
});
$('#tbodyMensal').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('meta-in')) e.target.blur();
});

function renderTudo() {
  if ($('#app').classList.contains('hidden')) return;
  if (abaAtual === 'controle') renderControle();
  else {
    const ae = document.activeElement;
    const editando = ae && ae.classList && ae.classList.contains('meta-in');
    const ano = $('#rAno').value; preencherAnos($('#rAno'));
    if (!editando && $('#rAno').value !== ano) montarMensal();
    if (!editando) {   // atualiza os campos com valores vindos da nuvem
      document.querySelectorAll('#tbodyMensal .meta-in').forEach(i => {
        const v = valor(i.dataset.key); i.value = v != null ? fmt.format(v) : '';
      });
    }
    calcularMensal();
  }
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
  const curto = window.innerWidth < 700;
  const pend = S.dirty ? (curto ? ` • ${S.dirty} pend.` : ` • ${S.dirty} alteraç${S.dirty > 1 ? 'ões' : 'ão'} pendente${S.dirty > 1 ? 's' : ''}`) : '';
  if (!CONFIG.API_URL) { el.classList.add('loc'); el.textContent = curto ? 'Modo local' : 'Modo local • salvo neste aparelho'; return; }
  if (!navigator.onLine) { el.classList.add('off'); el.textContent = 'Offline' + (pend || (curto ? '' : ' • salvo no aparelho')); return; }
  if (sincronizando) { el.textContent = 'Sincronizando…'; return; }
  if (erroSync) { el.classList.add('err'); el.textContent = (curto ? 'Erro sync' : 'Erro ao sincronizar') + pend; return; }
  const h = S.lastSync ? new Date(S.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  el.textContent = S.dirty ? 'Online' + pend : (curto ? `✓ ${h}` : `Online • sincronizado às ${h}`);
  el.title = `Sincronizado às ${h}`;
}

$('#btSync').addEventListener('click', () => sync());
window.addEventListener('online', () => { status(); sync(); });
window.addEventListener('offline', status);
window.addEventListener('resize', status);
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
