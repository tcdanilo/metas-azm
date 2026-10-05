/* ===== Interface ===== */
const CFG = window.METAS_CONFIG || {};
const sb = (window.supabase && CFG.supabaseUrl && CFG.supabaseAnonKey) ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
const app = document.getElementById('app');

let S = null, versao = null, atualizadoEm = null, atualizadoPor = null, erroCarga = null;
let podeEditar = false, sessao = null;
const hoje = new Date();
const ui = { tri: Math.ceil((hoje.getMonth() + 1) / 3), equipe: null, editando: false, rascunho: null, confirmar: null, msg: null, msgErro: false, salvando: false, login: false, entrando: false, loginErro: null };

/* ---------- formatação ---------- */
const nf = (v, min, max) => v.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
function fmt(v, tipo) {
  if (!isNum(v)) return '—';
  if (tipo === 'moeda') return 'R$ ' + (Math.abs(v) >= 1000 ? nf(v, 0, 0) : nf(v, 2, 2));
  if (tipo === 'pct' || tipo === 'razao') return nf(v * 100, 0, 2) + '%';
  return nf(v, 0, 0);
}
function brl(v) { return 'R$ ' + nf(v, 0, 2); }
function etq(v, cls) { if (triSemPremio()) return `<span class="etq ${cls || ''} zero" style="font-size:15px">sem prêmio</span>`; return `<span class="etq ${cls || ''} ${v ? '' : 'zero'}"><small>R$</small>${nf(v, 0, 2)}</span>`; }
function difTexto(ind, real, meta) {
  if (!isNum(real) || !isNum(meta)) return '';
  if (ind.tipo === 'pct' || ind.tipo === 'razao') { const d = (real - meta) * 100; return (d >= 0 ? '+' : '−') + nf(Math.abs(d), 0, 2) + ' p.p.'; }
  if (!meta) return '';
  const d = (real / meta - 1) * 100; return (d >= 0 ? '+' : '−') + nf(Math.abs(d), 1, 1) + '%';
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function lojasDe(eq) { const l = [...new Set(eq.programas.map(p => p.loja).filter(x => x !== 'Lojas'))]; return l.length > 1 ? l.join(' e ') : (l[0] || 'Lojas'); }
const ROTULO_ST = { ok: 'Batida', nao: 'Não batida', pend: 'Aguardando lançamento', sem: 'Meta não definida' };

/* ---------- entrada de números ---------- */
function paraInput(v, tipo) {
  if (!isNum(v)) return '';
  if (tipo === 'pct' || tipo === 'razao') return String(Math.round(v * 1e6) / 1e4).replace('.', ',');
  return String(Math.round(v * 100) / 100).replace('.', ',');
}
function lerNumero(txt, tipo) {
  let s = String(txt).replace(/R\$|%|\s/g, '');
  if (s === '') return { ok: true, v: null };
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false };
  let v = parseFloat(s);
  if (tipo === 'pct' || tipo === 'razao') v = Math.round(v * 1e6) / 1e8;
  return { ok: true, v };
}

/* ---------- estado ativo (rascunho durante a edição) ---------- */
function estadoAtivo() { return ui.editando && ui.rascunho ? ui.rascunho : S; }
function triChave() { return S.ano + '-' + ui.tri; }
function triSemPremio() { return !!(S.trimestres[triChave()] && S.trimestres[triChave()].semPremio); }
function triFechado() { return !!(S.trimestres[triChave()] && S.trimestres[triChave()].fechado); }

/* ---------- render ---------- */
function render() {
  if (!S) { app.innerHTML = cargaHTML(); return; }
  const E = estadoAtivo();
  const fechado = triFechado();
  let h = `<header class="topo"><div class="marca"><small>Supermercados AZM · ${S.ano}</small><h1>Metas trimestrais</h1></div>
    <nav class="tris" aria-label="Trimestre">${[1, 2, 3, 4].map(t => `<button data-acao="tri" data-tri="${t}" aria-pressed="${t === ui.tri}" ${ui.editando ? 'disabled' : ''}>${t}º tri</button>`).join('')}</nav></header>`;
  const ms = mesesDoTri(ui.tri);
  h += `<div class="faixa"><div class="faixa-info"><span class="chip ${fechado ? 'fechado' : 'aberto'}">${triSemPremio() ? 'Sem prêmio · só acompanhamento' : fechado ? 'Fechado · resultado final' : 'Em andamento · resultado parcial'}</span>
    <span>${MESES_LONGOS[ms[0] - 1]} a ${MESES_LONGOS[ms[2] - 1].toLowerCase()} de ${S.ano}</span></div>`;
  if (podeEditar && !ui.equipe && !ui.editando) {
    h += `<div class="acoes">${fechado ? `<button class="btn" data-acao="pedir-reabrir">Reabrir trimestre</button>` : `<button class="btn prim" data-acao="pedir-fechar">Fechar ${ui.tri}º trimestre</button>`}</div>`;
  }
  h += `</div>`;
  if (ui.msg) h += `<p class="aviso ${ui.msgErro ? 'erro' : ''}" role="status">${esc(ui.msg)}</p>`;
  if (ui.confirmar) h += confirmacaoHTML();
  h += ui.equipe ? detalheHTML(E) : resumoHTML(E);
  h += rodapeHTML();
  const foco = document.activeElement && document.activeElement.id;
  app.innerHTML = h;
  if (foco && ui.login) { const el = document.getElementById(foco); if (el) el.focus(); }
}

function confirmacaoHTML() {
  const fechar = ui.confirmar === 'fechar';
  return `<div class="confirma" role="alert"><span>${fechar
    ? `Fechar o ${ui.tri}º trimestre? Os prêmios passam a valer como resultado final e o lançamento fica bloqueado.`
    : `Reabrir o ${ui.tri}º trimestre? Os prêmios voltam a aparecer como parciais e o lançamento é liberado.`}</span>
    <span class="acoes"><button class="btn" data-acao="cancelar-conf">Cancelar</button><button class="btn prim" data-acao="${fechar ? 'fechar' : 'reabrir'}" ${ui.salvando ? 'disabled' : ''}>${fechar ? 'Fechar trimestre' : 'Reabrir'}</button></span></div>`;
}

function resumoHTML(E) {
  const fechado = triFechado();
  const res = equipes(E).map(eq => resultadoEquipe(E, eq, E.ano, ui.tri));
  const total = res.reduce((a, r) => a + r.premio, 0), pot = res.reduce((a, r) => a + r.potencial, 0);
  let ok = 0, aval = 0;
  res.forEach(r => r.progs.forEach(p => { p.meses.forEach(m => m.itens.forEach(x => { if (x.st === 'ok') ok++; if (x.st === 'ok' || x.st === 'nao') aval++; })); p.tris.forEach(t => { if (t.st === 'ok') ok++; if (t.st === 'ok' || t.st === 'nao') aval++; }); }));
  const ms = mesesDoTri(ui.tri);
  const lanc = ms.map((m, i) => { const ps = res.flatMap(r => r.progs).filter(p => p.meses[i].temMeta); return { m, n: ps.filter(p => p.meses[i].lancado).length, t: ps.length }; });
  let h = `<section class="totais">
    ${triSemPremio() ? `<div class="total"><span>Prêmios</span><b>Sem prêmio</b><em>As metas com prêmio começaram no 3º trimestre</em></div>` : `<div class="total"><span>${fechado ? 'Prêmios pagos no trimestre' : 'Prêmios previstos até agora'}</span><b class="num">${brl(total)}</b><em>de ${brl(pot)} possíveis</em></div>`}
    <div class="total"><span>Metas batidas</span><b class="num">${ok} de ${aval}</b><em>${aval ? nf(ok / aval * 100, 0, 0) + '% das metas já apuradas' : 'Nenhuma meta apurada ainda'}</em></div>
    <div class="total"><span>Lançamento dos meses</span><b class="num">${lanc.filter(l => l.t && l.n === l.t).length} de 3</b><em>${lanc.map(l => `${MESES[l.m - 1]} ${l.t ? l.n + '/' + l.t : '—'}`).join(' · ')}</em></div></section>`;
  h += `<div class="sec-tit"><h2>Equipes</h2><div class="legenda"><span><i class="dot ok"></i>batida</span><span><i class="dot nao"></i>não batida</span><span><i class="dot"></i>aguardando</span><span><i class="dot sem"></i>sem meta</span></div></div>`;
  const ord = [...res].sort((a, b) => (b.temMeta - a.temMeta));
  h += `<div class="grade">${ord.map(r => cardHTML(r)).join('')}</div>`;
  return h;
}

function cardHTML(r) {
  const ms = mesesDoTri(ui.tri);
  let h = `<button class="card" data-acao="abrir" data-eq="${esc(r.eq.nome)}"><div class="card-top"><div><h3>${esc(r.eq.nome)}</h3><p>${esc(lojasDe(r.eq))}${r.temMeta ? '' : ' · metas ainda não cadastradas'}</p></div>${etq(r.premio, 'm')}</div>
    <div class="linhas"><div class="linha cab"><span></span>${ms.map(m => `<span>${MESES[m - 1]}</span>`).join('')}</div>`;
  r.progs.forEach(p => {
    const mensais = p.prog.indicadores.some(i => i.periodo !== 'tri');
    if (mensais) {
      h += `<div class="linha"><span class="lj">${esc(p.prog.loja)}</span>${p.meses.map(m => {
        const v = !m.temMeta ? '<span class="v zero">sem meta</span>' : triSemPremio() ? `<span class="v">${m.batidas}/${m.total} batidas</span>` : m.bloqueado ? '<span class="v trava">R$ 0 · vendas</span>' : `<span class="v ${m.premio ? '' : 'zero'}">${brl(m.premio)}</span>`;
        return `<div class="mes"><div class="dots">${m.itens.map(x => `<i class="dot ${x.st}" title="${esc(x.ind.nome)}: ${ROTULO_ST[x.st]}"></i>`).join('')}</div>${v}</div>`;
      }).join('')}</div>`;
    }
    p.tris.forEach(t => {
      h += `<div class="linha tri"><span class="lj">C × V</span><div class="tri-cell"><span>Média ${fmt(t.real, 'razao')} · meta ${fmt(t.meta, 'razao')}</span><span class="pill ${t.st}" style="margin:0">${t.parcial ? 'Parcial' : ROTULO_ST[t.st]}</span></div></div>`;
    });
  });
  return h + `</div></button>`;
}

function detalheHTML(E) {
  const eq = equipes(E).find(e => e.nome === ui.equipe);
  if (!eq) { ui.equipe = null; return resumoHTML(E); }
  const r = resultadoEquipe(E, eq, E.ano, ui.tri);
  const fechado = triFechado();
  let h = `<button class="voltar" data-acao="voltar" ${ui.editando ? 'disabled' : ''}>← Todas as equipes</button>
    <div class="det-top"><div><h2>${esc(eq.nome)}</h2><p class="aviso">${esc(lojasDe(eq))} · ${fechado ? 'prêmio final' : 'prêmio previsto'} do ${ui.tri}º trimestre</p></div>
    <div class="acoes"><span id="tot-eq">${etq(r.premio, 'g')}</span>${podeEditar && !ui.editando && !fechado ? `<button class="btn prim" data-acao="editar">Lançar resultados e metas</button>` : ''}</div></div>`;
  if (podeEditar && fechado && !ui.editando) h += `<p class="aviso">Trimestre fechado. Para corrigir um lançamento, reabra o trimestre na tela inicial.</p>`;
  r.progs.forEach(p => { h += programaHTML(E, p); });
  if (ui.editando) {
    h += `<div class="barra-ed"><span class="aviso" id="aviso-ed">Digite metas e realizados. Percentuais em número: 28,9 para 28,9%.</span>
      <span class="acoes"><button class="btn" data-acao="cancelar" ${ui.salvando ? 'disabled' : ''}>Cancelar</button><button class="btn prim" data-acao="salvar" ${ui.salvando ? 'disabled' : ''}>${ui.salvando ? 'Salvando…' : 'Salvar lançamento'}</button></span></div>`;
  }
  return h;
}

function programaHTML(E, p) {
  const prog = p.prog, ed = ui.editando, ms = mesesDoTri(ui.tri);
  const mensais = prog.indicadores.filter(i => i.periodo !== 'tri');
  const gatInd = prog.indicadores.find(i => i.id === prog.gatilho);
  let h = `<section class="prog"><div class="prog-cab"><div><h3>${esc(prog.nome)} · ${esc(prog.loja === 'Lojas' ? 'Lojas somadas' : prog.loja)}</h3>
    <p>${gatInd ? `${esc(gatInd.nome)} é gatilho: sem bater ${esc(gatInd.nome.toLowerCase())}, o mês não paga prêmio.` : 'Apurado pela média dos três meses.'}</p></div>
    ${ed && mensais.length ? `<label class="aviso"><input type="checkbox" data-gat="${prog.id}" ${prog.gatilho ? 'checked' : ''}> Vendas é gatilho</label>` : ''}</div><div class="rol"><table>`;
  h += `<thead><tr><th class="ind">Indicador</th>${ms.map(m => `<th>${MESES_LONGOS[m - 1]}</th>`).join('')}</tr></thead><tbody>`;
  mensais.forEach(ind => {
    h += `<tr><td class="ind"><b>${esc(ind.nome)}</b>${ed ? `<small>Prêmio/mês R$ </small><input class="premio-in" inputmode="decimal" data-premio="${prog.id}" data-ind="${ind.id}" value="${paraInput(ind.premio, 'moeda')}" aria-label="Prêmio mensal ${esc(ind.nome)}">` : `<small>${brl(ind.premio)} por mês${ind.sentido === 'menor' ? ' · quanto menor, melhor' : ''}</small>`}</td>`;
    p.meses.forEach(m => {
      const x = m.itens.find(i => i.ind.id === ind.id);
      h += `<td>${ed ? edCel(prog, m.mes, ind, x.v) : verCel(ind, x)}</td>`;
    });
    h += `</tr>`;
  });
  if (mensais.length) {
    h += `<tr class="tot"><td>Prêmio do mês</td>${p.meses.map(m => `<td id="tot-${prog.id}-${m.mes}">${totMesHTML(m)}</td>`).join('')}</tr>`;
  }
  p.tris.forEach(t => {
    const ind = t.ind;
    h += `<tr><td class="ind"><b>${esc(ind.nome)}</b>${ed ? `<small>Prêmio/trimestre R$ </small><input class="premio-in" inputmode="decimal" data-premio="${prog.id}" data-ind="${ind.id}" value="${paraInput(ind.premio, 'moeda')}" aria-label="Prêmio trimestral">` : `<small>${brl(ind.premio)} por trimestre · compras ÷ vendas, quanto menor, melhor</small>`}</td>`;
    t.meses.forEach(m => {
      h += `<td>${ed ? edCel(prog, m.mes, ind, m.v) : `<div class="cel"><span class="k">Compras</span><span class="x">${fmt(m.v.n, 'moeda')}</span><span class="k">Vendas</span><span class="x">${fmt(m.v.d, 'moeda')}</span><span class="k">C × V</span><span class="x"><b>${fmt(m.real, 'razao')}</b></span><span class="k">Meta</span><span class="x">${fmt(m.meta, 'razao')}</span></div>`}</td>`;
    });
    h += `</tr><tr class="tot"><td>Resultado do trimestre</td><td colspan="3" id="tot-${prog.id}-tri">${totTriHTML(t)}</td></tr>`;
  });
  h += `</tbody></table></div><div class="prog-pe"><span>Total ${esc(prog.loja === 'Lojas' ? 'compra × venda' : prog.loja)} no trimestre · potencial ${brl(p.potencial)}</span><span id="totp-${prog.id}">${etq(p.premio, 'm')}</span></div></section>`;
  return h;
}

function verCel(ind, x) {
  const v = x.v;
  let h = `<div class="cel"><span class="k">Meta</span><span class="x">${fmt(x.meta, ind.tipo)}</span><span class="k">Real</span><span class="x"><b>${fmt(x.real, ind.tipo)}</b></span>`;
  if (isNum(v.a)) h += `<span class="ref">2025: ${fmt(v.a, ind.tipo)}</span>`;
  h += `</div><span class="pill ${x.st}">${ROTULO_ST[x.st]}${x.st === 'ok' || x.st === 'nao' ? ' ' + difTexto(ind, x.real, x.meta) : ''}</span>`;
  return h;
}

function edCel(prog, mes, ind, v) {
  const at = (campo) => `data-p="${prog.id}" data-mes="${mes}" data-ind="${ind.id}" data-campo="${campo}"`;
  const tipoCampo = (campo) => campo === 'm' ? (ind.tipo === 'razao' ? 'razao' : ind.tipo) : (ind.tipo === 'razao' ? 'moeda' : ind.tipo);
  const inp = (campo, rot) => `<label for="i-${prog.id}-${mes}-${ind.id}-${campo}">${rot}</label><input id="i-${prog.id}-${mes}-${ind.id}-${campo}" inputmode="decimal" autocomplete="off" ${at(campo)} data-tipo="${tipoCampo(campo)}" value="${paraInput(v[campo], tipoCampo(campo))}">`;
  if (ind.tipo === 'razao') return `<div class="ed">${inp('n', 'Compras')}${inp('d', 'Vendas')}${inp('m', 'Meta %')}</div>`;
  return `<div class="ed">${inp('m', 'Meta')}${inp('r', 'Real')}</div>`;
}

function totMesHTML(m) {
  let obs = '';
  if (!m.temMeta) obs = 'Sem metas cadastradas';
  else if (triSemPremio()) obs = `${m.batidas} de ${m.total} metas batidas`;
  else if (m.bloqueado) obs = 'Vendas não batida: o mês não paga';
  else if (m.aguardandoGatilho) obs = 'Depende do resultado de vendas';
  else if (m.pendentes) { const sm = m.itens.filter(x => x.st === 'sem').length, ag = m.pendentes - sm;
    obs = `${m.batidas} de ${m.total} batidas` + (ag ? ` · ${ag} aguardando` : '') + (sm ? ` · ${sm} sem meta` : ''); }
  else obs = `${m.batidas} de ${m.total} metas batidas`;
  return `${etq(m.premio, 'm')}<span class="obs">${obs}</span>`;
}
function totTriHTML(t) {
  return `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${etq(t.premio, 'm')}<span>Média ${fmt(t.real, 'razao')} contra meta de ${fmt(t.meta, 'razao')}</span><span class="pill ${t.st}" style="margin:0">${t.parcial ? 'Parcial: faltam meses' : ROTULO_ST[t.st]}</span></div>`;
}

/* atualiza totais durante a edição sem redesenhar os campos */
function atualizarTotais() {
  const E = ui.rascunho;
  const eq = equipes(E).find(e => e.nome === ui.equipe);
  if (!eq) return;
  const r = resultadoEquipe(E, eq, E.ano, ui.tri);
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('tot-eq', etq(r.premio, 'g'));
  r.progs.forEach(p => {
    p.meses.forEach(m => set(`tot-${p.prog.id}-${m.mes}`, totMesHTML(m)));
    p.tris.forEach(t => set(`tot-${p.prog.id}-tri`, totTriHTML(t)));
    set(`totp-${p.prog.id}`, etq(p.premio, 'm'));
  });
}

/* ---------- carga, login e salvamento (Supabase) ---------- */
function cargaHTML() {
  const msg = erroCarga || 'Carregando metas…';
  return `<header class="topo"><div class="marca"><small>Supermercados AZM</small><h1>Metas trimestrais</h1></div></header>
    <div class="vazio"><p class="aviso ${erroCarga ? 'erro' : ''}">${esc(msg)}</p>${erroCarga ? '<button class="btn" data-acao="recarregar">Tentar de novo</button>' : ''}</div>`;
}

function rodapeHTML() {
  const quando = atualizadoEm ? 'Atualizado em ' + new Date(atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Dados carregados das planilhas de metas 2026';
  let h = `<footer class="rodape"><span>${esc(quando)}</span><span>`;
  if (sessao) h += `${esc(sessao.user.email)}${podeEditar ? '' : ' (sem permissão para lançar)'} · <button class="voltar" data-acao="sair">Sair</button>`;
  else if (!ui.login) h += `Somente a administração lança resultados. <button class="voltar" data-acao="abrir-login">Entrar</button>`;
  h += `</span></footer>`;
  if (!sessao && ui.login) {
    h += `<form class="login" id="form-login" novalidate><h3>Entrar para lançar</h3>
      <label for="l-email">E-mail</label><input id="l-email" type="email" autocomplete="username" required value="${esc(ui.email || '')}">
      <label for="l-senha">Senha</label><input id="l-senha" type="password" autocomplete="current-password" required>
      ${ui.loginErro ? `<p class="aviso erro">${esc(ui.loginErro)}</p>` : ''}
      <div class="acoes"><button type="button" class="btn" data-acao="fechar-login">Cancelar</button><button type="submit" class="btn prim" ${ui.entrando ? 'disabled' : ''}>${ui.entrando ? 'Entrando…' : 'Entrar'}</button></div></form>`;
  }
  return h;
}

async function carregar() {
  if (!sb) { erroCarga = 'O site ainda não foi configurado (faltam os dados do Supabase em config.js).'; render(); return; }
  const { data, error } = await sb.from('estado').select('dados, versao, atualizado_em, atualizado_por').eq('id', 1).maybeSingle();
  if (error || !data) { erroCarga = 'Não foi possível carregar as metas. Verifique a internet e tente de novo.'; render(); return; }
  S = data.dados; versao = data.versao; atualizadoEm = data.atualizado_em; atualizadoPor = data.atualizado_por; erroCarga = null;
  render();
}

async function verificarAdmin() {
  podeEditar = false;
  if (sb && sessao) {
    const { data } = await sb.rpc('is_admin');
    podeEditar = data === true;
  }
  if (!podeEditar) { ui.editando = false; ui.rascunho = null; ui.confirmar = null; }
  render();
}

async function salvar(E, msgOk) {
  if (!sb || !podeEditar) { mostrar('Entre com a conta de administração para salvar.', true); return; }
  ui.salvando = true; render();
  const { data, error } = await sb.from('estado').update({ dados: E }).eq('id', 1).eq('versao', versao).select('versao, atualizado_em, atualizado_por');
  ui.salvando = false;
  if (error) {
    if (error.code === 'PGRST301' || /JWT/i.test(error.message || '')) { mostrar('Sua sessão expirou. Entre de novo para salvar; seus números continuam na tela.', true); sessao = null; podeEditar = false; return; }
    mostrar('Não foi possível salvar agora. Tente de novo em instantes; seus números continuam na tela.', true); return;
  }
  if (!data || !data.length) {
    mostrar('Os dados foram alterados em outro aparelho desde que você abriu a página. Recarregue a página e refaça o lançamento.', true); return;
  }
  S = E; versao = data[0].versao; atualizadoEm = data[0].atualizado_em; atualizadoPor = data[0].atualizado_por;
  ui.editando = false; ui.rascunho = null; ui.confirmar = null;
  mostrar(msgOk, false);
}
function mostrar(msg, erro) { ui.msg = msg; ui.msgErro = !!erro; render(); }

/* ---------- eventos ---------- */
app.addEventListener('click', ev => {
  const b = ev.target.closest('[data-acao]');
  if (!b || b.disabled) return;
  const a = b.dataset.acao;
  if (a === 'tri') { ui.tri = +b.dataset.tri; ui.confirmar = null; ui.msg = null; render(); }
  else if (a === 'abrir') { ui.equipe = b.dataset.eq; ui.msg = null; ui.confirmar = null; render(); window.scrollTo(0, 0); }
  else if (a === 'voltar') { ui.equipe = null; ui.msg = null; render(); }
  else if (a === 'editar') { ui.rascunho = JSON.parse(JSON.stringify(S)); ui.editando = true; ui.msg = null; render(); }
  else if (a === 'cancelar') { ui.editando = false; ui.rascunho = null; ui.msg = null; render(); }
  else if (a === 'salvar') {
    if (app.querySelector('input.erro')) { const el = document.getElementById('aviso-ed'); if (el) { el.textContent = 'Corrija os campos marcados em vermelho antes de salvar.'; el.classList.add('erro'); } return; }
    const E = JSON.parse(JSON.stringify(ui.rascunho));
    salvar(E, 'Lançamento salvo.');
  }
  else if (a === 'abrir-login') { ui.login = true; ui.loginErro = null; render(); const el = document.getElementById('l-email'); if (el) el.focus(); }
  else if (a === 'fechar-login') { ui.login = false; render(); }
  else if (a === 'sair') { sb && sb.auth.signOut(); }
  else if (a === 'recarregar') { erroCarga = null; render(); carregar(); }
  else if (a === 'pedir-fechar') { ui.confirmar = 'fechar'; render(); }
  else if (a === 'pedir-reabrir') { ui.confirmar = 'reabrir'; render(); }
  else if (a === 'cancelar-conf') { ui.confirmar = null; render(); }
  else if (a === 'fechar' || a === 'reabrir') {
    const E = JSON.parse(JSON.stringify(S));
    E.trimestres[triChave()] = Object.assign({}, E.trimestres[triChave()], { fechado: a === 'fechar', fechadoEm: a === 'fechar' ? new Date().toISOString() : null });
    salvar(E, a === 'fechar' ? `${ui.tri}º trimestre fechado. Os prêmios agora são o resultado final.` : `${ui.tri}º trimestre reaberto.`);
  }
});

app.addEventListener('input', ev => {
  const el = ev.target;
  if (!ui.editando || !ui.rascunho) return;
  const R = ui.rascunho;
  if (el.dataset.campo) {
    const lido = lerNumero(el.value, el.dataset.tipo);
    el.classList.toggle('erro', !lido.ok);
    if (!lido.ok) return;
    const k = el.dataset.p + '|' + chaveMes(R.ano, +el.dataset.mes);
    R.valores[k] = R.valores[k] || {};
    const v = R.valores[k][el.dataset.ind] = R.valores[k][el.dataset.ind] || {};
    if (lido.v === null) delete v[el.dataset.campo]; else v[el.dataset.campo] = lido.v;
    atualizarTotais();
  } else if (el.dataset.premio) {
    const lido = lerNumero(el.value, 'moeda');
    el.classList.toggle('erro', !lido.ok || lido.v === null);
    if (!lido.ok || lido.v === null) return;
    const p = R.programas.find(x => x.id === el.dataset.premio);
    p.indicadores.find(i => i.id === el.dataset.ind).premio = lido.v;
    atualizarTotais();
  }
});
app.addEventListener('change', ev => {
  const el = ev.target;
  if (!ui.editando || !el.dataset.gat) return;
  const p = ui.rascunho.programas.find(x => x.id === el.dataset.gat);
  p.gatilho = el.checked ? 'vendas' : null;
  atualizarTotais();
});

app.addEventListener('submit', async ev => {
  if (ev.target.id !== 'form-login') return;
  ev.preventDefault();
  const email = document.getElementById('l-email').value.trim(), senha = document.getElementById('l-senha').value;
  ui.email = email;
  if (!email || !senha) { ui.loginErro = 'Preencha e-mail e senha.'; render(); return; }
  ui.entrando = true; ui.loginErro = null; render();
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  ui.entrando = false;
  if (error) { ui.loginErro = 'E-mail ou senha incorretos.'; render(); return; }
  ui.login = false;
});

render();
carregar();
if (sb) {
  sb.auth.onAuthStateChange((evento, s) => {
    sessao = s;
    if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') setTimeout(verificarAdmin, 0);
  });
}
