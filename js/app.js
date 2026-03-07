/* ─────────────────────────────────────────
   FinançasPro – app.js
   ───────────────────────────────────────── */

'use strict';

// ───── STATE ─────
let transactions   = JSON.parse(localStorage.getItem('fp_transactions')  || '[]');
let investments    = JSON.parse(localStorage.getItem('fp_investments')   || '[]');
let budgetGoals    = JSON.parse(localStorage.getItem('fp_budget')        || '[]');
let userName       = localStorage.getItem('fp_name') || '';

// Chart instances
let barChartInst, doughnutInst, simChartInst, allocChartInst, plannerChartInst;

// ───── MARKET DATA STATE ─────
let MARKET_DATA = {
  cdi_anual: 13.65, cdi_mensal: 1.0708,
  selic_anual: 13.75, selic_mensal: 1.0792,
  ipca_mensal: 0.52, ipca_anual: 6.41,
  poupanca_mensal: 0.7493,
  loaded: false, live: false
};

const PRODUCTS = {
  cdb100:       { name: 'CDB 100% CDI',        ir: true,  pct_cdi: 1.00 },
  cdb110:       { name: 'CDB 110% CDI',        ir: true,  pct_cdi: 1.10 },
  cdb90:        { name: 'CDB 90% CDI',         ir: true,  pct_cdi: 0.90 },
  lci90:        { name: 'LCI / LCA 90% CDI',   ir: false, pct_cdi: 0.90 },
  tesouroselic: { name: 'Tesouro Selic',        ir: true,  type: 'selic' },
  tesouroi:     { name: 'Tesouro IPCA+ 6%',    ir: true,  type: 'ipca_plus', extra: 6 },
  acoes:        { name: 'Acoes (Ibovespa est.)',ir: false, type: 'fixed', annual: 15 },
  poupanca:     { name: 'Poupanca',             ir: false, type: 'poupanca' },
};

let selectedProduct = 'cdb100';

// ───── INIT ─────
document.addEventListener('DOMContentLoaded', () => {
  setTopbarDate();
  setupNav();
  setupMobileMenu();

  if (!userName) {
    document.getElementById('onboardingModal').classList.remove('hidden');
    document.getElementById('onboardingName').focus();
    document.getElementById('onboardingName')
      .addEventListener('keydown', e => { if (e.key === 'Enter') finishOnboarding(); });
  } else {
    applyUserName();
    initApp();
  }

  // Set today's date as default for transaction
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('txData').value = today;
});

function initApp() {
  updateDashboard();
  renderTransactions();
  renderCarteira();
  renderAllocChart();
  renderMetas();
  renderTips('todas');
  calcular5030();
  fetchAndRefreshRates(); // live market data
}

// ───── ONBOARDING ─────
function finishOnboarding() {
  const input = document.getElementById('onboardingName');
  const name  = input.value.trim();
  if (!name) { input.style.borderColor = 'var(--danger)'; return; }
  userName = name;
  localStorage.setItem('fp_name', name);
  document.getElementById('onboardingModal').classList.add('hidden');
  applyUserName();
  initApp();
}

function applyUserName() {
  document.getElementById('sidebarName').textContent    = userName;
  document.getElementById('topbarGreeting').textContent = `Olá, ${userName}`;
  document.querySelector('.user-avatar').textContent    = userName[0].toUpperCase();
}

// ───── DATE ─────
function setTopbarDate() {
  const now   = new Date();
  const opts  = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  document.getElementById('topbarDate').textContent =
    now.toLocaleDateString('pt-BR', opts).replace(/^\w/, c => c.toUpperCase());
}

// ───── NAVIGATION ─────
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const section = el.dataset.section;
      showSection(section);
      // close mobile sidebar
      document.getElementById('sidebar').classList.remove('open');
    });
  });
}

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById(name);
  if (el) el.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (nav) nav.classList.add('active');

  // Refresh charts when switching to invest section
  if (name === 'investimentos') {
    renderAllocChart();
  }
  if (name === 'dashboard') {
    updateDashboard();
  }
  if (name === 'orcamento') {
    renderMetas();
    calcular5030();
  }
}

// ───── MOBILE MENU ─────
function setupMobileMenu() {
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  // close on outside click
  document.addEventListener('click', e => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target.id !== 'menuToggle') {
      sidebar.classList.remove('open');
    }
  });
}

// ───── TOAST ─────
function toast(msg, type = 'default') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast show ${type}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ───── CURRENCY ─────
function fmt(val) {
  return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(val);
}

function parseVal(id) {
  return parseFloat(document.getElementById(id).value) || 0;
}

// ───── TRANSACTIONS ─────
function addTransaction() {
  const desc  = document.getElementById('txDesc').value.trim();
  const valor = parseFloat(document.getElementById('txValor').value);
  const tipo  = document.getElementById('txTipo').value;
  const cat   = document.getElementById('txCategoria').value;
  const data  = document.getElementById('txData').value;

  if (!desc) { toast('Informe uma descrição.', 'error'); return; }
  if (!valor || valor <= 0) { toast('Informe um valor válido.', 'error'); return; }
  if (!data) { toast('Selecione uma data.', 'error'); return; }

  transactions.unshift({ id: Date.now(), desc, valor, tipo, cat, data });
  save('transactions');
  renderTransactions();
  updateDashboard();
  renderMetas();

  // clear fields
  document.getElementById('txDesc').value  = '';
  document.getElementById('txValor').value = '';
  toast('Transação adicionada.', 'success');
}

function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  save('transactions');
  renderTransactions();
  updateDashboard();
  renderMetas();
}

function clearTransactions() {
  if (!confirm('Deseja apagar todas as transações?')) return;
  transactions = [];
  save('transactions');
  renderTransactions();
  updateDashboard();
  renderMetas();
  toast('Transações apagadas.');
}

function renderTransactions() {
  const filterText = document.getElementById('filterText')?.value.toLowerCase() || '';
  const filterTipo = document.getElementById('filterTipo')?.value || '';
  const filterCat  = document.getElementById('filterCat')?.value  || '';

  let list = transactions.filter(t => {
    const matchText = t.desc.toLowerCase().includes(filterText) ||
                      t.cat.toLowerCase().includes(filterText);
    const matchTipo = !filterTipo || t.tipo === filterTipo;
    const matchCat  = !filterCat  || t.cat  === filterCat;
    return matchText && matchTipo && matchCat;
  });

  const tbody = document.getElementById('txBody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Nenhuma transação encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(t => `
    <tr>
      <td>${formatDate(t.data)}</td>
      <td>${t.desc}</td>
      <td><span class="badge badge-gray">${t.cat}</span></td>
      <td><span class="badge ${t.tipo === 'receita' ? 'badge-success' : 'badge-danger'}">
        ${t.tipo === 'receita' ? '▲ Receita' : '▼ Despesa'}
      </span></td>
      <td class="${t.tipo === 'receita' ? 'tx-valor receita' : 'tx-valor despesa'}">
        ${t.tipo === 'receita' ? '+' : '-'} ${fmt(t.valor)}
      </td>
      <td>
        <button class="btn-delete" onclick="deleteTransaction(${t.id})" title="Excluir">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function formatDate(str) {
  if (!str) return '—';
  const [y,m,d] = str.split('-');
  return `${d}/${m}/${y}`;
}

// ───── DASHBOARD ─────
function updateDashboard() {
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  const thisMo = transactions.filter(t => {
    const d = new Date(t.data + 'T00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const receita = thisMo.filter(t=>t.tipo==='receita').reduce((a,t)=>a+t.valor,0);
  const despesa = thisMo.filter(t=>t.tipo==='despesa').reduce((a,t)=>a+t.valor,0);
  const saldo   = receita - despesa;

  document.getElementById('kpiReceita').textContent = fmt(receita);
  document.getElementById('kpiDespesa').textContent = fmt(despesa);
  document.getElementById('kpiSaldo').textContent   = fmt(saldo);

  // Investments total
  const totalInvest = investments.reduce((a,i)=>a+i.valor,0);
  document.getElementById('kpiInvestido').textContent   = fmt(totalInvest);
  document.getElementById('kpiInvestidoSub').textContent =
    `${investments.length} aplicaç${investments.length!==1?'ões':'ão'} ativa${investments.length!==1?'s':''}`;

  // KPI saldo color
  const kpiSaldoEl = document.getElementById('kpiSaldo');
  kpiSaldoEl.style.color = saldo < 0 ? 'var(--danger)' : 'var(--text)';

  renderBarChart();
  renderDoughnut();
  renderRecentTransactions();
}

function renderRecentTransactions() {
  const list  = transactions.slice(0,5);
  const el    = document.getElementById('recentTransactions');
  if (!list.length) {
    el.innerHTML = '<p class="empty-msg">Nenhuma transação ainda. Adicione em <b>Minhas Contas</b>.</p>';
    return;
  }
  el.innerHTML = list.map(t => `
    <div class="tx-item">
      <div class="tx-icon ${t.tipo}">
        ${t.tipo==='receita' ? '<i class="fa-solid fa-arrow-down"></i>' : '<i class="fa-solid fa-arrow-up"></i>'}
      </div>
      <div class="tx-info">
        <p class="tx-desc">${t.desc}</p>
        <p class="tx-meta">${t.cat} • ${formatDate(t.data)}</p>
      </div>
      <p class="tx-valor ${t.tipo}">${t.tipo==='receita'?'+':'-'} ${fmt(t.valor)}</p>
    </div>
  `).join('');
}

// ───── BAR CHART ─────
function renderBarChart() {
  const months = getLast6Months();
  const receitas = months.map(m => sumByMonth(m.year, m.month, 'receita'));
  const despesas = months.map(m => sumByMonth(m.year, m.month, 'despesa'));
  const labels   = months.map(m => m.label);

  const ctx = document.getElementById('barChart');
  if (!ctx) return;
  if (barChartInst) barChartInst.destroy();

  barChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Receitas', data: receitas, backgroundColor: '#4a8c5c', borderRadius: 0, borderSkipped: false },
        { label: 'Despesas', data: despesas, backgroundColor: '#9b3a3a', borderRadius: 0, borderSkipped: false },
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position:'top', labels:{ font:{ family:'DM Sans', size:11 }, color:'#4a4a4a', boxWidth:10, boxHeight:10 } },
        tooltip: { callbacks: { label: ctx => fmt(ctx.parsed.y) } }
      },
      scales: {
        y: { ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR'), font:{family:'DM Sans',size:11}, color:'#9a9a96' }, grid: { color: '#ebebea' } },
        x: { grid: { display: false }, ticks: { font:{family:'DM Sans',size:11}, color:'#9a9a96' } }
      }
    }
  });
}

function getLast6Months() {
  const arr = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push({ year: d.getFullYear(), month: d.getMonth(),
      label: d.toLocaleDateString('pt-BR',{ month:'short', year:'2-digit' }) });
  }
  return arr;
}

function sumByMonth(year, month, tipo) {
  return transactions
    .filter(t => {
      const d = new Date(t.data + 'T00:00');
      return d.getFullYear()===year && d.getMonth()===month && t.tipo===tipo;
    })
    .reduce((a,t)=>a+t.valor,0);
}

// ───── DOUGHNUT CHART ─────
function renderDoughnut() {
  const catMap = {};
  transactions.filter(t=>t.tipo==='despesa').forEach(t => {
    catMap[t.cat] = (catMap[t.cat]||0) + t.valor;
  });

  const labels = Object.keys(catMap);
  const data   = Object.values(catMap);
  const colors = ['#0f0f0f','#c9a84c','#4a4a4a','#9a9a96','#d9d9d6','#2c2c2c','#7a7a76','#b09040','#1e1e1e'];

  const ctx = document.getElementById('doughnutChart');
  if (!ctx) return;
  if (doughnutInst) doughnutInst.destroy();

  if (!labels.length) {
    doughnutInst = new Chart(ctx, {
      type:'doughnut',
      data:{ labels:['Sem despesas'], datasets:[{ data:[1], backgroundColor:['#e5e7eb'] }] },
      options:{ plugins:{ legend:{ display:false }, tooltip:{ enabled:false } }, cutout:'70%' }
    });
    return;
  }

  doughnutInst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0, labels.length), hoverOffset: 6, borderWidth: 2 }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: {
        legend: { position:'bottom', labels:{ font:{ family:'DM Sans', size:11 }, color:'#4a4a4a', boxWidth:10, boxHeight:10, padding:14 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.parsed)}` } }
      }
    }
  });
}

// ───── INVESTIMENTOS ─────
function simularInvestimento() {
  const inicial = parseVal('simInicial');
  const aporte  = parseVal('simAporte');
  const taxa    = parseVal('simTaxa') / 100;
  const meses   = Math.max(1, parseInt(document.getElementById('simMeses').value) || 12);

  let saldo = inicial;
  const pontos = [inicial];
  for (let i = 0; i < meses; i++) {
    saldo = saldo * (1 + taxa) + aporte;
    pontos.push(saldo);
  }

  const totalInvestido = inicial + aporte * meses;
  const montante       = saldo;
  const rendimento     = montante - totalInvestido;

  document.getElementById('simTotalInvestido').textContent = fmt(totalInvestido);
  document.getElementById('simMontante').textContent       = fmt(montante);
  document.getElementById('simRendimento').textContent     = `+ ${fmt(rendimento)}`;
  document.getElementById('simResult').style.display       = 'grid';

  const canvas = document.getElementById('simChart');
  canvas.style.display = 'block';
  if (simChartInst) simChartInst.destroy();

  const labels = pontos.map((_,i) => `Mês ${i}`);
  simChartInst = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Montante',
        data: pontos,
        fill: true,
        backgroundColor: 'rgba(201,168,76,.08)',
        borderColor: '#c9a84c',
        borderWidth: 1.5,
        pointRadius: meses <= 24 ? 3 : 0,
        tension: .35
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmt(ctx.parsed.y) } }
      },
      scales: {
        y: { ticks: { callback: v => 'R$ '+v.toLocaleString('pt-BR'), font:{family:'DM Sans',size:11}, color:'#9a9a96' }, grid:{ color:'#ebebea' } },
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7, font:{family:'DM Sans',size:11}, color:'#9a9a96' } }
      }
    }
  });
}

function addInvestimento() {
  const nome  = document.getElementById('invNome').value.trim();
  const tipo  = document.getElementById('invTipo').value;
  const valor = parseFloat(document.getElementById('invValor').value);
  const rent  = parseFloat(document.getElementById('invRent').value) || 0;

  if (!nome)          { toast('Informe o nome do investimento.','error'); return; }
  if (!valor || valor<=0) { toast('Informe um valor válido.','error'); return; }

  investments.push({ id: Date.now(), nome, tipo, valor, rent });
  save('investments');
  renderCarteira();
  renderAllocChart();
  updateDashboard();

  document.getElementById('invNome').value  = '';
  document.getElementById('invValor').value = '';
  document.getElementById('invRent').value  = '';
  toast('Investimento adicionado.', 'success');
}

function deleteInvestimento(id) {
  investments = investments.filter(i=>i.id!==id);
  save('investments');
  renderCarteira();
  renderAllocChart();
  updateDashboard();
}

const investIcons = {
  'Renda Fixa': 'fa-landmark',
  'Ações':      'fa-chart-line',
  'FIIs':       'fa-building',
  'Cripto':     'fa-bitcoin-sign',
  'Tesouro Direto':'fa-shield-halved',
  'CDB':        'fa-piggy-bank',
  'LCI/LCA':    'fa-leaf',
  'Fundos':     'fa-layer-group',
  'Outros':     'fa-coins'
};

function renderCarteira() {
  const el = document.getElementById('carteiraList');
  if (!investments.length) {
    el.innerHTML = '<p class="empty-msg">Nenhum investimento cadastrado.</p>';
    return;
  }
  el.innerHTML = investments.map(inv => `
    <div class="carteira-item">
      <div class="carteira-item-icon">
        <i class="fa-solid ${investIcons[inv.tipo]||'fa-coins'}"></i>
      </div>
      <div class="carteira-item-info">
        <p class="carteira-item-name">${inv.nome}</p>
        <p class="carteira-item-type">${inv.tipo}</p>
      </div>
      <div style="text-align:right">
        <p class="carteira-item-valor">${fmt(inv.valor)}</p>
        <p class="carteira-item-rent">${inv.rent > 0 ? inv.rent+'% a.m.' : '—'}</p>
      </div>
      <button class="btn-delete" onclick="deleteInvestimento(${inv.id})">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `).join('');
}

function renderAllocChart() {
  const ctx = document.getElementById('allocChart');
  if (!ctx) return;
  if (allocChartInst) allocChartInst.destroy();

  if (!investments.length) {
    document.getElementById('allocLegend').innerHTML =
      '<p class="empty-msg">Adicione investimentos para ver a distribuição.</p>';
    allocChartInst = new Chart(ctx, {
      type:'doughnut',
      data:{ labels:['Sem dados'], datasets:[{ data:[1], backgroundColor:['#e5e7eb'] }] },
      options:{ plugins:{ legend:{display:false}, tooltip:{enabled:false} }, cutout:'70%' }
    });
    return;
  }

  // Group by type
  const typeMap = {};
  investments.forEach(i => { typeMap[i.tipo] = (typeMap[i.tipo]||0) + i.valor; });

  const labels = Object.keys(typeMap);
  const data   = Object.values(typeMap);
  const total  = data.reduce((a,v)=>a+v,0);
  const colors = ['#0f0f0f','#c9a84c','#4a4a4a','#9a9a96','#d9d9d6','#2c2c2c','#7a7a76','#b09040','#1e1e1e'];

  allocChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0,labels.length), hoverOffset:6, borderWidth:2 }]
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${fmt(c.parsed)} (${((c.parsed/total)*100).toFixed(1)}%)` } }
      }
    }
  });

  // Custom legend
  document.getElementById('allocLegend').innerHTML = labels.map((l,i) => `
    <div class="alloc-legend-item">
      <span class="alloc-dot" style="background:${colors[i]}"></span>
      <span class="alloc-label">${l}</span>
      <span class="alloc-value">${fmt(data[i])}</span>
      <span class="alloc-pct">${((data[i]/total)*100).toFixed(1)}%</span>
    </div>
  `).join('');
}

// ───── ORÇAMENTO ─────
function calcular5030() {
  const renda = parseFloat(document.getElementById('rendaMensal')?.value) || 0;
  document.getElementById('r50').textContent = fmt(renda * 0.5);
  document.getElementById('r30').textContent = fmt(renda * 0.3);
  document.getElementById('r20').textContent = fmt(renda * 0.2);
}

function addMeta() {
  const cat   = document.getElementById('metaCat').value;
  const valor = parseFloat(document.getElementById('metaValor').value);
  if (!valor || valor <= 0) { toast('Informe um limite válido.', 'error'); return; }

  // update or add
  const existing = budgetGoals.findIndex(m=>m.cat===cat);
  if (existing !== -1) budgetGoals[existing].limite = valor;
  else budgetGoals.push({ cat, limite: valor });

  save('budget');
  renderMetas();
  document.getElementById('metaValor').value = '';
  toast(`Meta para ${cat} definida.`, 'success');
}

function deleteMeta(cat) {
  budgetGoals = budgetGoals.filter(m=>m.cat!==cat);
  save('budget');
  renderMetas();
}

function renderMetas() {
  const el = document.getElementById('metasGrid');
  if (!el) return;
  if (!budgetGoals.length) {
    el.innerHTML = '<p class="empty-msg">Nenhuma meta definida.</p>';
    return;
  }

  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  el.innerHTML = budgetGoals.map(m => {
    const gasto = transactions.filter(t => {
      const d = new Date(t.data+'T00:00');
      return t.tipo==='despesa' && t.cat===m.cat &&
             d.getMonth()===month && d.getFullYear()===year;
    }).reduce((a,t)=>a+t.valor,0);

    const pct      = Math.min((gasto / m.limite) * 100, 100);
    const overPct  = (gasto / m.limite) * 100;
    const barClass = overPct >= 100 ? 'over' : overPct >= 80 ? 'warning' : 'ok';
    const msg      = overPct >= 100
      ? `Limite ultrapassado em ${fmt(gasto - m.limite)}`
      : overPct >= 80
        ? `Atenção: ${(100-overPct).toFixed(0)}% do limite restante`
        : `${fmt(m.limite - gasto)} restantes`;

    return `
      <div class="meta-item">
        <div class="meta-header">
          <span class="meta-cat">${m.cat}</span>
          <div style="display:flex;gap:.75rem;align-items:center">
            <span class="meta-valores">${fmt(gasto)} / ${fmt(m.limite)}</span>
            <button class="btn-delete" onclick="deleteMeta('${m.cat}')">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
        <div class="meta-bar-track">
          <div class="meta-bar-fill ${barClass}" style="width:${pct}%"></div>
        </div>
        <p class="meta-msg">${msg}</p>
      </div>
    `;
  }).join('');
}

// ───── DICAS ─────
const TIPS = [
  {
    cat: 'basico',
    title: 'Crie uma Reserva de Emergência',
    text: 'Guarde de 3 a 6 meses de despesas em uma conta de fácil acesso. Isso te protege de imprevistos sem precisar contrair dívidas.'
  },
  {
    cat: 'basico',
    title: 'Anote tudo que você gasta',
    text: 'Registrar cada despesa (por menor que seja) revela padrões de consumo invisíveis. Use este app ou um caderno – o que importa é o hábito.'
  },
  {
    cat: 'dividas',
    title: 'Pague o cartão de crédito integralmente',
    text: 'Os juros do rotativo chegam a 400% ao ano. Se não puder pagar tudo, negocie parcelamento com o banco antes que a dívida escale.'
  },
  {
    cat: 'investimentos',
    title: 'Comece com o Tesouro Direto',
    text: 'É a aplicação mais segura do Brasil, garantida pelo governo. O Tesouro Selic é ideal para a reserva de emergência; o IPCA+ para metas de longo prazo.'
  },
  {
    cat: 'habitos',
    title: 'Pague-se primeiro',
    text: 'Assim que receber seu salário, transfira imediatamente o valor destinado a poupança/investimentos. Não espere sobrar – raramente sobra.'
  },
  {
    cat: 'investimentos',
    title: 'Diversifique sua carteira',
    text: 'Nunca coloque todos os ovos na mesma cesta. Combine renda fixa (segurança), ações (crescimento) e fundos imobiliários (renda passiva).'
  },
  {
    cat: 'habitos',
    title: 'Use a lista de compras como escudo',
    text: 'Ir ao supermercado sem lista pode aumentar os gastos em até 40%. Planeje as refeições da semana e compre apenas o necessário.'
  },
  {
    cat: 'dividas',
    title: 'Método Avalanche para dívidas',
    text: 'Liste todas as dívidas por taxa de juros (maior primeiro). Pague o mínimo em todas e jogue o dinheiro extra na dívida mais cara. Economiza mais que o método bola de neve.'
  },
  {
    cat: 'basico',
    title: 'Revise assinaturas mensalmente',
    text: 'Streaming, academia, apps – quanto você paga por serviços que não usa? Uma revisão mensal pode liberar R$ 200-500 de forma imediata e indolor.'
  },
  {
    cat: 'habitos',
    title: 'A regra das 72 horas',
    text: 'Antes de qualquer compra não planejada acima de R$ 100, espere 72 horas. Se ainda quiser e puder pagar, compre. Você vai se surpreender com quantas vezes o desejo passa.'
  },
  {
    cat: 'investimentos',
    title: 'Juros compostos: o 8º maravilha do mundo',
    text: 'Investindo R$ 500/mês a 1% a.m. por 10 anos, você acumula ~R$ 116.000 – tendo investido apenas R$ 60.000. Comece cedo; o tempo é seu maior aliado.'
  },
  {
    cat: 'basico',
    title: 'Moradia: máximo 30% da renda',
    text: 'Seja aluguel ou prestação, o ideal é não comprometer mais de 30% do seu salário líquido. Ultrapassar esse limite desequilibra todo o orçamento.'
  },
  {
    cat: 'habitos',
    title: 'Invista em educação financeira',
    text: 'Leia ao menos 1 livro de finanças pessoais por ano. Sugestões: "Pai Rico Pai Pobre" (R. Kiyosaki), "O Homem Mais Rico da Babilônia" e "Casais Inteligentes Enriquecem Juntos".'
  },
  {
    cat: 'dividas',
    title: 'Portabilidade de crédito',
    text: 'Você pode transferir suas dívidas para outro banco que ofereça taxas menores. Pesquise e negocie – os bancos preferem reter clientes a perdê-los.'
  },
  {
    cat: 'investimentos',
    title: 'LCI e LCA: isentos de IR',
    text: 'Letras de Crédito Imobiliário e do Agronegócio são isentas de Imposto de Renda para pessoas físicas, o que as torna muito atrativas em comparação ao CDB de mesmo rendimento.'
  },
  {
    cat: 'habitos',
    title: 'Delete apps de compra impulsiva',
    text: 'Notificações de promoção ativam o gatilho de urgência. Desinstale apps que estimulam compras não planejadas e acesse-os apenas quando tiver um objetivo específico.'
  },
];

function renderTips(cat) {
  const grid = document.getElementById('tipsGrid');
  const list = cat === 'todas' ? TIPS : TIPS.filter(t=>t.cat===cat);
  grid.innerHTML = list.map(t => `
    <div class="tip-card">
      <div class="tip-card-header">
        <div class="tip-meta">
          <h4>${t.title}</h4>
          <span class="tip-badge ${t.cat}">${catLabel(t.cat)}</span>
        </div>
      </div>
      <p>${t.text}</p>
    </div>
  `).join('');
}

function catLabel(c) {
  return { basico:'Básico', investimentos:'Investimentos', habitos:'Hábitos', dividas:'Dívidas' }[c] || c;
}

function filterTips(btn) {
  document.querySelectorAll('.tip-filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderTips(btn.dataset.cat);
}

// ───── STORAGE ─────
function save(key) {
  const map = { transactions, investments, budget: budgetGoals };
  localStorage.setItem(`fp_${key}`, JSON.stringify(map[key]));
}

/* =============================================================
   MARKET DATA — Banco Central / BrasilAPI
   ============================================================= */
async function fetchAndRefreshRates() {
  const setSource = (msg) => {
    const els = ['rbSource', 'dashSource'];
    els.forEach(id => { const e = document.getElementById(id); if (e) e.textContent = msg; });
  };
  setSource('Carregando...');

  // ── 1. CDI + Selic via BrasilAPI ──
  try {
    const r = await fetch('https://brasilapi.com.br/api/taxas/v1');
    const taxas = await r.json();
    const cdi   = taxas.find(t => t.nome.toUpperCase().includes('CDI'));
    const selic = taxas.find(t => t.nome.toUpperCase().includes('SELIC'));
    if (cdi)   MARKET_DATA.cdi_anual   = parseFloat(cdi.valor);
    if (selic) MARKET_DATA.selic_anual = parseFloat(selic.valor);
    MARKET_DATA.live = true;
  } catch (_) {
    // keep fallback values already in MARKET_DATA
  }

  // ── 2. IPCA mensal via BCB ──
  try {
    const r2 = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/1?formato=json');
    const d   = await r2.json();
    MARKET_DATA.ipca_mensal = parseFloat(d[0].valor);
    MARKET_DATA.live = true;
  } catch (_) {}

  // ── 3. Derive monthly / annual rates ──
  MARKET_DATA.cdi_mensal     = annualToMonthly(MARKET_DATA.cdi_anual);
  MARKET_DATA.selic_mensal   = annualToMonthly(MARKET_DATA.selic_anual);
  MARKET_DATA.ipca_anual     = (Math.pow(1 + MARKET_DATA.ipca_mensal / 100, 12) - 1) * 100;
  MARKET_DATA.poupanca_mensal = MARKET_DATA.selic_anual > 8.5
    ? 0.5
    : annualToMonthly(MARKET_DATA.selic_anual * 0.70);
  MARKET_DATA.loaded = true;

  renderRatesUI();
  renderProductRates();

  const now = new Date();
  const ts  = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  setSource(MARKET_DATA.live ? `Ao vivo — ${ts}` : 'Taxas de referencia');
}

function annualToMonthly(annual) {
  return (Math.pow(1 + annual / 100, 1 / 12) - 1) * 100;
}

function getProductMonthlyRate(key) {
  const p = PRODUCTS[key];
  const m = MARKET_DATA;
  if (p.pct_cdi !== undefined) return m.cdi_mensal * p.pct_cdi;
  if (p.type === 'selic')      return m.selic_mensal;
  if (p.type === 'poupanca')   return m.poupanca_mensal;
  if (p.type === 'fixed')      return annualToMonthly(p.annual);
  if (p.type === 'ipca_plus') {
    const extraM = annualToMonthly(p.extra);
    return ((1 + m.ipca_mensal / 100) * (1 + extraM / 100) - 1) * 100;
  }
  return 0;
}

function calcIR(bruto, meses) {
  if (bruto <= 0) return 0;
  return bruto * getIRRateByMonths(meses);
}

function getIRRateByMonths(meses) {
  const dias = meses * 30;
  return dias <= 180 ? 0.225 : dias <= 360 ? 0.20 : dias <= 720 ? 0.175 : 0.15;
}

function simulateProduct({ productKey, initial = 0, monthly = 0, months = 12 }) {
  const product = PRODUCTS[productKey];
  const rate = getProductMonthlyRate(productKey) / 100;
  const hasIR = product.ir;

  const lots = [];
  if (initial > 0) {
    lots.push({ principal: initial, value: initial, monthsHeld: 0 });
  }

  let totalAportado = initial;
  const history = [];

  for (let mes = 1; mes <= months; mes++) {
    lots.forEach(lot => {
      lot.value *= (1 + rate);
      lot.monthsHeld += 1;
    });

    if (monthly > 0) {
      lots.push({ principal: monthly, value: monthly, monthsHeld: 0 });
      totalAportado += monthly;
    }

    const saldo = lots.reduce((sum, lot) => sum + lot.value, 0);
    const bruto = lots.reduce((sum, lot) => sum + Math.max(0, lot.value - lot.principal), 0);
    const ir = hasIR
      ? lots.reduce((sum, lot) => {
          const ganho = Math.max(0, lot.value - lot.principal);
          return sum + (ganho * getIRRateByMonths(lot.monthsHeld));
        }, 0)
      : 0;
    const liq = saldo - ir;
    const real = liq / Math.pow(1 + MARKET_DATA.ipca_mensal / 100, mes);

    history.push({
      mes,
      totalAportado,
      saldo,
      bruto,
      ir,
      liq,
      real,
    });
  }

  const last = history[history.length - 1] || {
    mes: 0,
    totalAportado,
    saldo: initial,
    bruto: 0,
    ir: 0,
    liq: initial,
    real: initial,
  };

  return {
    product,
    rate: rate * 100,
    hasIR,
    history,
    totalAportado: last.totalAportado,
    saldo: last.saldo,
    bruto: last.bruto,
    ir: last.ir,
    liq: last.liq,
    real: last.real,
  };
}

function renderRatesUI() {
  const m = MARKET_DATA;
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  set('rbCDI',    m.cdi_anual.toFixed(2));
  set('rbCDIm',   m.cdi_mensal.toFixed(4));
  set('rbSelic',  m.selic_anual.toFixed(2));
  set('rbIPCA',   m.ipca_mensal.toFixed(2));
  set('rbPoup',   m.poupanca_mensal.toFixed(4));
  // dashboard strip
  set('dashCDI',  m.cdi_anual.toFixed(2) + '%');
  set('dashCDIm', m.cdi_mensal.toFixed(4) + '%');
  set('dashSelic',m.selic_anual.toFixed(2) + '%');
  set('dashIPCA', m.ipca_mensal.toFixed(2) + '%');
  set('dashPoup', m.poupanca_mensal.toFixed(4) + '%');
}

function renderProductRates() {
  Object.keys(PRODUCTS).forEach(k => {
    const el = document.getElementById('rate-' + k);
    if (!el) return;
    const r = getProductMonthlyRate(k);
    el.textContent = r.toFixed(4) + '% a.m.';
  });
}

function selectProduct(btn) {
  document.querySelectorAll('.prod-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedProduct = btn.dataset.prod;
}

/* =============================================================
   INVESTMENT PLANNER
   ============================================================= */
function runPlanner() {
  if (!MARKET_DATA.loaded) { fetchAndRefreshRates().then(runPlanner); return; }

  const inicial  = parseFloat(document.getElementById('plannerInicial').value) || 0;
  const aporte   = parseFloat(document.getElementById('plannerAporte').value)  || 0;
  const meses    = Math.max(1, parseInt(document.getElementById('plannerMeses').value) || 12);
  const sim = simulateProduct({
    productKey: selectedProduct,
    initial: inicial,
    monthly: aporte,
    months: meses,
  });
  const hist = sim.history;
  const last = hist[hist.length - 1];
  const rentLiq = ((last.liq / last.totalAportado) - 1) * 100;
  const inflAcum = (Math.pow(1 + MARKET_DATA.ipca_mensal / 100, meses) - 1) * 100;

  document.getElementById('pkAportado').textContent = fmt(last.totalAportado);
  document.getElementById('pkBruto').textContent    = fmt(last.bruto);
  document.getElementById('pkIR').textContent       = sim.hasIR ? ('- ' + fmt(last.ir)) : 'Isento IR';
  document.getElementById('pkLiquido').textContent  = fmt(last.liq);
  document.getElementById('pkRentLiq').textContent  = '+' + rentLiq.toFixed(2) + '%';
  document.getElementById('pkPoder').textContent    = '+' + inflAcum.toFixed(2) + '%';
  document.getElementById('plannerResults').style.display = 'block';

  renderPlannerChart(hist, last.totalAportado);
  renderPlannerTable(hist, sim.hasIR);
}

function renderPlannerChart(hist, totalAportadoFinal) {
  const ctx = document.getElementById('plannerChart');
  if (!ctx) return;
  if (plannerChartInst) plannerChartInst.destroy();

  plannerChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hist.map(h => 'M' + h.mes),
      datasets: [
        {
          label: 'Saldo Liquido',
          data: hist.map(h => h.liq),
          borderColor: '#c9a84c', backgroundColor: 'rgba(201,168,76,.07)',
          borderWidth: 2, fill: true, tension: .35,
          pointRadius: hist.length <= 24 ? 3 : 0
        },
        {
          label: 'Total Aportado',
          data: hist.map(h => h.totalAportado),
          borderColor: '#4a4a4a', borderWidth: 1.5,
          borderDash: [5, 4], fill: false, tension: .35, pointRadius: 0
        },
        {
          label: 'Valor Real (IPCA)',
          data: hist.map(h => h.real),
          borderColor: '#9b3a3a', borderWidth: 1.5,
          borderDash: [2, 3], fill: false, tension: .35, pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'DM Sans', size: 11 }, color: '#4a4a4a', boxWidth: 10, boxHeight: 2, padding: 16 } },
        tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmt(c.parsed.y) } }
      },
      scales: {
        y: { ticks: { callback: v => 'R$' + v.toLocaleString('pt-BR'), font: { family: 'DM Sans', size: 10 }, color: '#9a9a96' }, grid: { color: '#ebebea' } },
        x: { grid: { display: false }, ticks: { font: { family: 'DM Sans', size: 10 }, color: '#9a9a96', maxTicksLimit: 8 } }
      }
    }
  });
}

function renderPlannerTable(hist, hasIR) {
  const tbody = document.getElementById('plannerTableBody');
  if (!tbody) return;
  const rows = hist.filter(h => h.mes <= 24 || h.mes % 6 === 0);
  tbody.innerHTML = rows.map(h => `
    <tr>
      <td>${h.mes}</td>
      <td>${fmt(h.totalAportado)}</td>
      <td class="col-pos">+ ${fmt(h.bruto)}</td>
      <td class="col-neg">${hasIR && h.ir > 0 ? '- ' + fmt(h.ir) : '—'}</td>
      <td><strong>${fmt(h.liq)}</strong></td>
      <td class="col-neg">${fmt(h.real)}</td>
    </tr>
  `).join('');
}

/* =============================================================
   COMPARISON
   ============================================================= */
function runComparacao() {
  if (!MARKET_DATA.loaded) { fetchAndRefreshRates().then(runComparacao); return; }

  const valor  = parseFloat(document.getElementById('compValor').value)  || 0;
  const aporte = parseFloat(document.getElementById('compAporte').value) || 0;
  const meses  = parseInt(document.getElementById('compMeses').value)    || 24;

  if (!valor) { toast('Informe um valor inicial.', 'error'); return; }

  const results = Object.entries(PRODUCTS).map(([key, p]) => {
    const sim = simulateProduct({
      productKey: key,
      initial: valor,
      monthly: aporte,
      months: meses,
    });
    const rentLiq = sim.totalAportado > 0 ? ((sim.liq / sim.totalAportado) - 1) * 100 : 0;
    return {
      key,
      name: p.name,
      ir: p.ir,
      rate: sim.rate,
      liq: sim.liq,
      bruto: sim.bruto,
      ir_val: sim.ir,
      rentLiq,
      totalAp: sim.totalAportado,
    };
  }).sort((a, b) => b.liq - a.liq);

  const best = results[0].liq;

  document.getElementById('compResult').innerHTML = `
    <div class="table-wrapper" style="margin-top:1.25rem">
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th><th>Produto</th><th>Taxa Mensal</th>
            <th>Rendimento Bruto</th><th>IR</th>
            <th>Valor Final Liquido</th><th>Rentabilidade</th><th>Vs Melhor</th>
          </tr>
        </thead>
        <tbody>
          ${results.map((r, i) => `
            <tr class="${i === 0 ? 'row-best' : ''}">
              <td><strong>${i + 1}.</strong></td>
              <td><strong>${r.name}</strong></td>
              <td>${r.rate.toFixed(4)}% a.m.</td>
              <td class="col-pos">+ ${fmt(r.bruto)}</td>
              <td class="col-neg">${r.ir ? '- ' + fmt(r.ir_val) : 'Isento'}</td>
              <td><strong>${fmt(r.liq)}</strong></td>
              <td class="col-pos">+ ${r.rentLiq.toFixed(2)}%</td>
              <td class="${r.liq === best ? 'col-pos' : 'col-neg'}">${r.liq === best ? 'Melhor' : '- ' + fmt(best - r.liq)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="gastos-note" style="margin-top:.75rem">
      Taxas: Banco Central do Brasil. ${MARKET_DATA.live ? 'Dados ao vivo.' : 'Taxas de referencia (offline).'}
      IR calculado lote a lote pela tabela regressiva (22,5% ate 180d / 20% ate 360d / 17,5% ate 720d / 15% acima).
      Acoes: media historica Ibovespa. Resultados sao estimativas.
    </p>
  `;
}

/* =============================================================
   EXPENSE PROJECTOR
   ============================================================= */
function projetarGastos() {
  if (!MARKET_DATA.loaded) { fetchAndRefreshRates().then(projetarGastos); return; }

  const gastoAtual = parseFloat(document.getElementById('gastoAtual').value) || 0;
  const anos       = parseInt(document.getElementById('gastoAnos').value) || 10;

  if (!gastoAtual) { toast('Informe o gasto mensal atual.', 'error'); return; }

  const ipca  = MARKET_DATA.ipca_mensal;
  const meses = anos * 12;
  const gastoFuturo  = gastoAtual * Math.pow(1 + ipca / 100, meses);
  const inflAcum     = (Math.pow(1 + ipca / 100, meses) - 1) * 100;
  const taxaMensal   = (getProductMonthlyRate('cdb100') / 100) * (1 - getIRRateByMonths(25));
  const capitalNec   = gastoFuturo / taxaMensal; // capital para gerar renda mensal via juros

  document.getElementById('gastoAnosLabel').textContent   = anos;
  document.getElementById('gastoAtualDisplay').textContent = fmt(gastoAtual) + '/mes';
  document.getElementById('gastoFuturo').textContent      = fmt(gastoFuturo) + '/mes';
  document.getElementById('gastoIPCA').textContent        = '+' + inflAcum.toFixed(1) + '%';
  document.getElementById('gastoCapital').textContent     = fmt(capitalNec);
  document.getElementById('gastoResult').style.display    = 'block';

  const rows = [];
  for (let a = 1; a <= anos; a++) {
    const m    = a * 12;
    const gM   = gastoAtual * Math.pow(1 + ipca / 100, m);
    const inf  = (Math.pow(1 + ipca / 100, m) - 1) * 100;
    const cap  = gM / taxaMensal;
    rows.push({ ano: a, gM, gA: gM * 12, inf, cap });
  }

  document.getElementById('gastoTableBody').innerHTML = rows.map(r => `
    <tr>
      <td>Ano ${r.ano}</td>
      <td>${fmt(r.gM)}/mes</td>
      <td>${fmt(r.gA)}</td>
      <td class="col-neg">+${r.inf.toFixed(1)}%</td>
      <td>${fmt(r.cap)}</td>
    </tr>
  `).join('');
}
