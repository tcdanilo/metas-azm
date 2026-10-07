/* ===== Impressão das metas para os encarregados =====
   Monta uma folha A4 por meta (setor/loja) com as metas de cada mês, o prêmio por pessoa,
   as regras e o espaço para assinatura. Usa a impressão do navegador (dá para salvar em PDF). */
'use strict';

function impPainelHTML(E) {
  const eqs = equipes(E).map(eq => resultadoEquipe(E, eq, E.ano, ui.tri));
  return `<section class="colab-form imp-prev"><h3>Imprimir metas do ${ui.tri}º trimestre</h3>
    <p class="aviso">Sai uma folha por meta, com as metas de cada mês, o prêmio por pessoa, as regras e o campo de assinatura do encarregado. Na janela de impressão você também pode escolher "Salvar como PDF".</p>
    <div class="imp-lista">${eqs.map(r => `<label class="cf-check"><input type="checkbox" class="imp-eq" value="${esc(r.eq.nome)}" ${r.temMeta ? 'checked' : ''}> ${esc(r.eq.nome)}${r.temMeta ? '' : ' <span class="aviso">(sem metas)</span>'}</label>`).join('')}</div>
    <div class="acoes"><button class="link" data-acao="imp-todas">Marcar todas</button><button class="link" data-acao="imp-nenhuma">Desmarcar todas</button>
      <span class="imp-esp"></span><button class="btn" data-acao="imp-cancelar">Cancelar</button><button class="btn prim" data-acao="imp-imprimir">Imprimir</button></div>
  </section>`;
}

function impValor(ind, v) { return isNum(v) ? fmt(v, ind.tipo) : 'a definir'; }

function impFolhaHTML(E, nomeEquipe) {
  const eq = equipes(E).find(e => e.nome === nomeEquipe);
  if (!eq) return '';
  const r = resultadoEquipe(E, eq, E.ano, ui.tri);
  const ms = mesesDoTri(ui.tri);
  const semPremio = triSemPremio();
  const pessoas = typeof colabDaEquipe === 'function' ? colabDaEquipe(eq.nome) : [];
  const gatilho = eq.programas.some(p => p.gatilho);
  let h = `<article class="folha">
    <header class="f-topo"><div><small>Supermercados AZM · Metas trimestrais</small><h1>${esc(eq.nome)}</h1>
      <p>${ui.tri}º trimestre de ${E.ano} · ${MESES_LONGOS[ms[0] - 1]} a ${MESES_LONGOS[ms[2] - 1].toLowerCase()}</p></div>
      ${semPremio ? '' : `<div class="f-max"><small>Prêmio máximo por pessoa no trimestre</small><b>${brl(r.potencial)}</b></div>`}</header>`;
  r.progs.forEach(p => {
    const prog = p.prog;
    const mensais = prog.indicadores.filter(i => i.periodo !== 'tri');
    const tris = prog.indicadores.filter(i => i.periodo === 'tri');
    h += `<section class="f-prog"><h2>${esc(prog.loja === 'Lojas' ? 'Lojas somadas' : 'Loja ' + prog.loja)}</h2><table class="f-tab">
      <thead><tr><th>Meta</th>${ms.map(m => `<th>${MESES_LONGOS[m - 1]}</th>`).join('')}<th>Prêmio</th></tr></thead><tbody>`;
    mensais.forEach(ind => {
      const vals = ms.map(m => valorDe(E, prog.id, E.ano, m, ind.id));
      h += `<tr><td><b>${esc(ind.nome)}</b>${ind.sentido === 'menor' ? '<small>no máximo (quanto menor, melhor)</small>' : '<small>no mínimo</small>'}${prog.gatilho === ind.id ? '<small class="f-gat">gatilho do mês</small>' : ''}</td>
        ${vals.map(v => `<td class="num">${impValor(ind, v.m)}${isNum(v.a) ? `<small>2025: ${fmt(v.a, ind.tipo)}</small>` : ''}</td>`).join('')}
        <td class="num">${semPremio ? '—' : brl(ind.premio) + '<small>por mês</small>'}</td></tr>`;
    });
    tris.forEach(ind => {
      const metas = ms.map(m => valorDe(E, prog.id, E.ano, m, ind.id).m).filter(isNum);
      const meta = metas.length ? metas.reduce((a, b) => a + b, 0) / metas.length : null;
      h += `<tr><td><b>${esc(ind.nome)}</b><small>compras ÷ vendas, média dos 3 meses, no máximo</small></td><td class="num f-span" colspan="${ms.length}">${impValor(ind, meta)}</td><td class="num">${semPremio ? '—' : brl(ind.premio) + '<small>no trimestre</small>'}</td></tr>`;
    });
    h += `</tbody></table></section>`;
  });
  h += `<section class="f-regras"><h2>Como funciona</h2><ul>
    ${semPremio ? '<li>Trimestre só de acompanhamento, sem prêmio.</li>' : `<li>Cada meta batida no mês soma o valor da coluna "Prêmio". O prêmio é de cada pessoa da equipe, não é dividido.</li>
    ${gatilho ? '<li><b>Vendas é gatilho:</b> se a meta de vendas do mês não for batida, o mês não paga nenhum prêmio.</li>' : ''}
    <li>Os resultados são lançados mês a mês, e o resultado final sai no fechamento do trimestre.</li>`}
    <li>Metas marcadas como "a definir" ainda serão informadas pela gerência.</li></ul></section>`;
  h += `<section class="f-pessoas"><h2>Equipe (${pessoas.length})</h2>${pessoas.length ? `<ol>${pessoas.map(c => `<li>${esc(c.nome)}</li>`).join('')}</ol>` : '<p>Nenhum colaborador cadastrado nesta meta.</p>'}</section>
    <footer class="f-assin"><div><span></span>Encarregado(a)</div><div><span></span>Gerência</div><div><span></span>Data</div></footer>
    <p class="f-rodape">Impresso em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · metas.supermercadoazm.com.br</p>
  </article>`;
  return h;
}

function imprimirEquipes(nomes) {
  if (!nomes.length) { mostrar('Marque pelo menos uma meta para imprimir.', true); return; }
  const E = estadoAtivo();
  let alvo = document.getElementById('impressao');
  if (!alvo) { alvo = document.createElement('div'); alvo.id = 'impressao'; document.body.appendChild(alvo); }
  alvo.innerHTML = nomes.map(n => impFolhaHTML(E, n)).join('');
  document.body.classList.add('imprimindo');
  const limpar = () => { document.body.classList.remove('imprimindo'); alvo.innerHTML = ''; window.removeEventListener('afterprint', limpar); };
  window.addEventListener('afterprint', limpar);
  setTimeout(() => window.print(), 50);
}
