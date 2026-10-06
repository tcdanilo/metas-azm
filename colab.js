/* ===== Colaboradores: quem recebe o prêmio de cada meta =====
   Cada colaborador ligado a uma equipe recebe o prêmio INTEIRO da equipe (não é dividido). */
'use strict';

let COLAB = [], colabErro = null;

/* ---------- validação e formatação ---------- */
const soDigitos = s => String(s || '').replace(/\D/g, '');
function cpfValido(c) {
  c = soDigitos(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += +c[i] * (t + 1 - i);
    const dv = (soma * 10) % 11 % 10;
    if (dv !== +c[t]) return false;
  }
  return true;
}
function fmtCpf(c) { c = soDigitos(c).slice(0, 11); return c.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); }
function cpfMascarado(c) { c = soDigitos(c); return c.length === 11 ? '•••.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-••' : ''; }
function fmtCel(c) {
  c = soDigitos(c).slice(0, 11);
  if (c.length <= 2) return c.length ? '(' + c : '';
  if (c.length <= 6) return `(${c.slice(0, 2)}) ${c.slice(2)}`;
  if (c.length <= 10) return `(${c.slice(0, 2)}) ${c.slice(2, 6)}-${c.slice(6)}`;
  return `(${c.slice(0, 2)}) ${c.slice(2, 7)}-${c.slice(7)}`;
}
const emailValido = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function colabDaEquipe(nome) { return COLAB.filter(c => c.equipe === nome && c.ativo); }
function premioPorEquipe(E) {
  const m = {};
  equipes(E).forEach(eq => { m[eq.nome] = resultadoEquipe(E, eq, E.ano, ui.tri).premio; });
  return m;
}

/* ---------- dados ---------- */
async function carregarColab() {
  colabErro = null;
  const r = podeEditar
    ? await sb.from('colaboradores').select('id, nome, cpf, email, celular, equipe, ativo').order('nome')
    : await sb.rpc('colaboradores_equipe');
  if (r.error) {
    COLAB = [];
    colabErro = /does not exist|not find|schema cache|404/i.test((r.error.message || '') + r.error.code)
      ? 'O cadastro de colaboradores ainda não foi ativado no banco. Rode o script colaboradores.sql no Supabase.'
      : 'Não foi possível carregar os colaboradores. Verifique a internet e recarregue a página.';
  } else {
    COLAB = (r.data || []).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  render();
}

async function salvarColab(form) {
  const dados = {
    nome: form.nome.trim().replace(/\s+/g, ' '),
    cpf: soDigitos(form.cpf),
    email: form.email.trim().toLowerCase() || null,
    celular: soDigitos(form.celular) || null,
    equipe: form.equipe,
    ativo: form.ativo
  };
  const erros = [];
  if (dados.nome.length < 5 || !dados.nome.includes(' ')) erros.push('Informe o nome completo.');
  if (!cpfValido(dados.cpf)) erros.push('CPF inválido. Confira os números.');
  if (dados.email && !emailValido(dados.email)) erros.push('E-mail inválido.');
  if (dados.celular && !/^\d{11}$/.test(dados.celular)) erros.push('Celular deve ter DDD + 9 dígitos, por exemplo (38) 99999-0000.');
  if (!dados.equipe) erros.push('Escolha a meta (equipe) do colaborador.');
  const dup = COLAB.find(c => c.cpf === dados.cpf && c.id !== ui.colabForm.id);
  if (dup) erros.push('Já existe um colaborador com esse CPF: ' + dup.nome + '.');
  if (erros.length) { ui.colabForm = Object.assign({}, ui.colabForm, form, { erro: erros.join(' ') }); render(); return; }

  ui.colabForm = Object.assign({}, ui.colabForm, form, { erro: null, salvando: true }); render();
  const r = ui.colabForm.id
    ? await sb.from('colaboradores').update(dados).eq('id', ui.colabForm.id).select('id')
    : await sb.from('colaboradores').insert(dados).select('id');
  if (r.error || !r.data || !r.data.length) {
    const msg = r.error && r.error.code === '23505' ? 'Já existe um colaborador com esse CPF.' : 'Não foi possível salvar. Verifique se você tem permissão e tente de novo.';
    ui.colabForm = Object.assign({}, ui.colabForm, { erro: msg, salvando: false }); render(); return;
  }
  const novo = !ui.colabForm.id;
  ui.colabForm = null;
  ui.msg = novo ? 'Colaborador cadastrado.' : 'Cadastro atualizado.'; ui.msgErro = false;
  await carregarColab();
}

async function alterarColab(id, campos, msg) {
  const r = await sb.from('colaboradores').update(campos).eq('id', id).select('id');
  if (r.error || !r.data || !r.data.length) { mostrar('Não foi possível alterar o cadastro.', true); return; }
  ui.msg = msg; ui.msgErro = false;
  await carregarColab();
}

async function excluirColab(id) {
  const r = await sb.from('colaboradores').delete().eq('id', id).select('id');
  ui.colabExcluir = null;
  if (r.error || !r.data || !r.data.length) { mostrar('Não foi possível excluir o colaborador.', true); return; }
  ui.msg = 'Colaborador excluído.'; ui.msgErro = false;
  await carregarColab();
}

/* ---------- telas ---------- */
function formColabHTML(E) {
  const f = ui.colabForm;
  const eqs = equipes(E).map(e => e.nome);
  return `<form id="form-colab" class="colab-form" novalidate>
    <h3>${f.id ? 'Editar colaborador' : 'Novo colaborador'}</h3>
    ${f.erro ? `<p class="aviso erro" role="alert">${esc(f.erro)}</p>` : ''}
    <div class="cf-grade">
      <label class="cf-largo">Nome completo<input id="c-nome" maxlength="120" autocomplete="off" required value="${esc(f.nome || '')}"></label>
      <label>CPF<input id="c-cpf" inputmode="numeric" maxlength="14" autocomplete="off" required placeholder="000.000.000-00" value="${esc(fmtCpf(f.cpf || ''))}"></label>
      <label>Celular<input id="c-cel" inputmode="tel" maxlength="15" autocomplete="off" placeholder="(38) 99999-0000" value="${esc(fmtCel(f.celular || ''))}"></label>
      <label class="cf-largo">E-mail<input id="c-email" type="email" maxlength="254" autocomplete="off" value="${esc(f.email || '')}"></label>
      <label class="cf-largo">Meta (equipe)<select id="c-equipe" required><option value="">Escolha…</option>${eqs.map(n => `<option ${f.equipe === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="cf-check"><input id="c-ativo" type="checkbox" ${f.ativo === false ? '' : 'checked'}> Ativo (recebe o prêmio)</label>
    </div>
    <div class="acoes"><button type="button" class="btn" data-acao="colab-cancelar">Cancelar</button><button type="submit" class="btn prim" ${f.salvando ? 'disabled' : ''}>${f.salvando ? 'Salvando…' : 'Salvar'}</button></div>
  </form>`;
}

function colabPaginaHTML(E) {
  const premios = premioPorEquipe(E);
  const semPremio = triSemPremio();
  const ativos = COLAB.filter(c => c.ativo);
  const total = ativos.reduce((a, c) => a + (premios[c.equipe] || 0), 0);
  let h = `<div class="det-top"><div><h2>Colaboradores</h2><p class="aviso">Cada colaborador recebe o prêmio inteiro da sua meta. ${podeEditar ? 'CPF, e-mail e celular só aparecem para quem pode lançar.' : ''}</p></div>
    <div class="acoes">${semPremio ? '' : `<span class="tot-colab">${ui.tri}º tri · total a pagar ${etq(total, 'm')}</span>`}${podeEditar && !ui.colabForm ? '<button class="btn prim" data-acao="colab-novo">Novo colaborador</button>' : ''}</div></div>`;
  if (colabErro) return h + `<p class="aviso erro" role="alert">${esc(colabErro)}</p>`;
  if (ui.colabForm) h += formColabHTML(E);
  if (ui.colabExcluir) {
    const c = COLAB.find(x => x.id === ui.colabExcluir);
    if (c) h += `<div class="confirma" role="alert"><span>Excluir ${esc(c.nome)} do cadastro? Se ele só saiu da meta, prefira "Desativar" para manter o histórico.</span>
      <span class="acoes"><button class="btn" data-acao="colab-cancelar-excluir">Cancelar</button><button class="btn prim" data-acao="colab-excluir" data-id="${esc(c.id)}">Excluir</button></span></div>`;
  }
  h += `<div class="colab-busca"><label for="c-busca">Buscar</label><input id="c-busca" type="search" placeholder="Nome${podeEditar ? ' ou CPF' : ''}" value="${esc(ui.colabBusca || '')}" autocomplete="off"></div>`;
  if (!COLAB.length) return h + `<div class="vazio">Nenhum colaborador cadastrado ainda.${podeEditar ? ' Clique em "Novo colaborador" para começar.' : ''}</div>`;

  const q = (ui.colabBusca || '').trim().toLowerCase(), qd = soDigitos(q);
  const filtra = c => !q || c.nome.toLowerCase().includes(q) || (qd.length >= 3 && podeEditar && (c.cpf || '').includes(qd));
  const nomesEq = equipes(E).map(e => e.nome);
  const grupos = [...nomesEq, ...new Set(COLAB.map(c => c.equipe).filter(n => !nomesEq.includes(n)))];
  grupos.forEach(nome => {
    const lista = COLAB.filter(c => c.equipe === nome && filtra(c));
    if (!lista.length) return;
    const p = premios[nome];
    const nAtivos = lista.filter(c => c.ativo).length;
    h += `<section class="prog"><div class="prog-cab"><div><h3>${esc(nome)}</h3><p>${nAtivos} ${nAtivos === 1 ? 'colaborador ativo' : 'colaboradores ativos'}${p === undefined ? ' · meta não existe mais' : semPremio ? '' : ' · ' + brl(p) + ' por pessoa no ' + ui.tri + 'º tri'}</p></div>
      ${semPremio || p === undefined ? '' : `<span>${etq(p * nAtivos, 'm')}</span>`}</div><div class="rol"><table class="t-colab"><thead><tr><th>Nome</th>${podeEditar ? '<th>CPF</th><th>Celular</th><th>E-mail</th>' : ''}<th>Prêmio no ${ui.tri}º tri</th>${podeEditar ? '<th></th>' : ''}</tr></thead><tbody>`;
    lista.forEach(c => {
      h += `<tr class="${c.ativo ? '' : 'inativo'}"><td><b>${esc(c.nome)}</b>${c.ativo ? '' : ' <span class="pill sem nm">inativo</span>'}</td>`;
      if (podeEditar) h += `<td class="num">${esc(cpfMascarado(c.cpf))}</td><td class="num">${esc(fmtCel(c.celular || '')) || '—'}</td><td>${esc(c.email || '—')}</td>`;
      h += `<td class="num">${semPremio ? 'sem prêmio' : c.ativo && p !== undefined ? brl(p) : '—'}</td>`;
      if (podeEditar) h += `<td><div class="colab-acoes"><button class="link" data-acao="colab-editar" data-id="${esc(c.id)}">Editar</button><button class="link" data-acao="colab-ativo" data-id="${esc(c.id)}">${c.ativo ? 'Desativar' : 'Reativar'}</button><button class="link perigo" data-acao="colab-pedir-excluir" data-id="${esc(c.id)}">Excluir</button></div></td>`;
      h += `</tr>`;
    });
    h += `</tbody></table></div></section>`;
  });
  return h;
}

/* Bloco mostrado no detalhe de cada equipe */
function colabNaEquipeHTML(nome, premio) {
  if (colabErro) return '';
  const lista = colabDaEquipe(nome);
  const semPremio = triSemPremio();
  return `<section class="colab-eq"><div><b>Quem recebe esta meta (${lista.length})</b>
    <p class="aviso">${lista.length ? lista.map(c => esc(c.nome)).join(' · ') : 'Nenhum colaborador ligado a esta meta.'}</p></div>
    <div class="colab-eq-tot">${semPremio ? '' : `<span>${brl(premio)} por pessoa${lista.length > 1 ? ' · total ' + brl(premio * lista.length) : ''}</span>`}
    ${podeEditar ? '<button class="link" data-acao="pagina" data-pag="colab">Gerenciar colaboradores</button>' : ''}</div></section>`;
}

function lerFormColab() {
  return {
    nome: document.getElementById('c-nome').value,
    cpf: document.getElementById('c-cpf').value,
    celular: document.getElementById('c-cel').value,
    email: document.getElementById('c-email').value,
    equipe: document.getElementById('c-equipe').value,
    ativo: document.getElementById('c-ativo').checked
  };
}
