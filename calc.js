/* ===== Regras de cálculo (puras) ===== */
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function mesesDoTri(tri) { return [tri * 3 - 2, tri * 3 - 1, tri * 3]; }
function chaveMes(ano, mes) { return ano + '-' + String(mes).padStart(2, '0'); }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

function valorDe(S, pid, ano, mes, indId) {
  const k = pid + '|' + chaveMes(ano, mes);
  return (S.valores[k] && S.valores[k][indId]) || {};
}

/* Realizado de um indicador num mês (razão = compras / vendas) */
function realDe(ind, v) {
  if (ind.tipo === 'razao') return isNum(v.n) && isNum(v.d) && v.d > 0 ? v.n / v.d : null;
  return isNum(v.r) ? v.r : null;
}

function bateu(ind, real, meta) {
  return ind.sentido === 'menor' ? real <= meta + 1e-9 : real >= meta - 1e-9;
}

/* status: 'ok' | 'nao' | 'pend' (falta realizado) | 'sem' (falta meta) */
function statusInd(ind, v) {
  const real = realDe(ind, v);
  const meta = isNum(v.m) ? v.m : null;
  if (meta === null) return { st: 'sem', real, meta };
  if (real === null) return { st: 'pend', real, meta };
  return { st: bateu(ind, real, meta) ? 'ok' : 'nao', real, meta };
}

/* Resultado de um programa num mês */
function resultadoMes(S, prog, ano, mes) {
  const itens = prog.indicadores.filter(i => i.periodo !== 'tri').map(ind => {
    const v = valorDe(S, prog.id, ano, mes, ind.id);
    return Object.assign({ ind, v }, statusInd(ind, v));
  });
  const gat = prog.gatilho ? itens.find(x => x.ind.id === prog.gatilho) : null;
  let premio = 0;
  itens.forEach(x => { if (x.st === 'ok') premio += x.ind.premio; });
  let bloqueado = false;
  if (gat && gat.st === 'nao') { premio = 0; bloqueado = true; }
  const pendentes = itens.filter(x => x.st === 'pend' || x.st === 'sem').length;
  const lancado = itens.length > 0 && itens.every(x => x.real !== null);
  const temMeta = itens.some(x => x.meta !== null);
  const aguardandoGatilho = !!(gat && (gat.st === 'pend' || gat.st === 'sem'));
  return { itens, premio, bloqueado, pendentes, lancado, temMeta, aguardandoGatilho,
    batidas: itens.filter(x => x.st === 'ok').length, total: itens.length };
}

/* Indicadores apurados no trimestre (média dos meses) */
function resultadoTriInd(S, prog, ind, ano, tri) {
  const ms = mesesDoTri(tri);
  const meses = ms.map(m => { const v = valorDe(S, prog.id, ano, m, ind.id); return { mes: m, v, real: realDe(ind, v), meta: isNum(v.m) ? v.m : null }; });
  const reais = meses.filter(x => x.real !== null).map(x => x.real);
  const metas = meses.filter(x => x.meta !== null).map(x => x.meta);
  const real = reais.length ? reais.reduce((a, b) => a + b, 0) / reais.length : null;
  const meta = metas.length ? metas.reduce((a, b) => a + b, 0) / metas.length : null;
  let st = 'sem';
  if (meta !== null) st = reais.length < 3 ? 'pend' : (bateu(ind, real, meta) ? 'ok' : 'nao');
  return { ind, meses, real, meta, st, parcial: reais.length > 0 && reais.length < 3, premio: st === 'ok' ? ind.premio : 0 };
}

function resultadoPrograma(S, prog, ano, tri) {
  const meses = mesesDoTri(tri).map(m => Object.assign({ mes: m }, resultadoMes(S, prog, ano, m)));
  const tris = prog.indicadores.filter(i => i.periodo === 'tri').map(ind => resultadoTriInd(S, prog, ind, ano, tri));
  const premio = meses.reduce((a, m) => a + m.premio, 0) + tris.reduce((a, t) => a + t.premio, 0);
  const potencial = meses.length * prog.indicadores.filter(i => i.periodo !== 'tri').reduce((a, i) => a + i.premio, 0)
    + tris.reduce((a, t) => a + t.ind.premio, 0);
  const temMeta = meses.some(m => m.temMeta) || tris.some(t => t.meta !== null);
  const semPremio = !!(S.trimestres && S.trimestres[ano + '-' + tri] && S.trimestres[ano + '-' + tri].semPremio);
  if (semPremio) { meses.forEach(m => { m.premio = 0; }); tris.forEach(t => { t.premio = 0; }); return { prog, meses, tris, premio: 0, potencial: 0, temMeta, semPremio }; }
  return { prog, meses, tris, premio, potencial, temMeta, semPremio };
}

function equipes(S) {
  const ordem = [];
  const mapa = {};
  S.programas.forEach(p => {
    if (!mapa[p.equipe]) { mapa[p.equipe] = []; ordem.push(p.equipe); }
    mapa[p.equipe].push(p);
  });
  return ordem.map(nome => ({ nome, programas: mapa[nome] }));
}

function resultadoEquipe(S, eq, ano, tri) {
  const progs = eq.programas.map(p => resultadoPrograma(S, p, ano, tri));
  return { eq, progs, premio: progs.reduce((a, r) => a + r.premio, 0), potencial: progs.reduce((a, r) => a + r.potencial, 0),
    temMeta: progs.some(r => r.temMeta) };
}


