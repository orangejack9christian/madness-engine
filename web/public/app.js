// ═══════════════════════════════════════════════════════
// MadnessEngine 2026 — Ultimate March Madness Simulator
// ═══════════════════════════════════════════════════════

const API_BASE = window.location.origin;

// ─── Analytics Helper ────────────────────────────────
function trackEvent(eventName, properties) {
  if (typeof posthog !== 'undefined' && posthog.capture) {
    posthog.capture(eventName, properties);
  }
}

// ─── State ───────────────────────────────────────────
let currentType = 'mens';
let currentMode = null;
let modes = [];
let allTeams = [];
let lastData = null;
let bracketData = null;
let h2hChart = null;
let radarChart = null;
let currentView = 'dashboard';
let tableSortColumn = 'rank';
let tableSortDirection = 'asc';
let pickSelections = {};
let teamColors = {};

// ─── Region Colors ───────────────────────────────────
const REGION_COLORS = {
  east: '#8b5cf6',
  west: '#f97316',
  south: '#06b6d4',
  midwest: '#ec4899',
};

const CATEGORY_COLORS = {
  research: '#22c55e',
  entertainment: '#f59e0b',
  hybrid: '#8b5cf6',
};

// ─── Animated Count-Up Helper ────────────────────────────
function animateCountUp(element, targetValue, duration, suffix) {
  suffix = suffix || '';
  duration = duration || 600;
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out quad
    const eased = 1 - (1 - progress) * (1 - progress);
    const current = start + (targetValue - start) * eased;
    element.textContent = current.toFixed(current < 10 ? 1 : 0) + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// ─── Team Badge Helper ─────────────────────────────────
function teamBadge(teamId, size = 28) {
  const c = teamColors[teamId];
  if (!c) return '';
  const half = size / 2;
  const fontSize = size * 0.32;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0;border-radius:${size * 0.22}px;vertical-align:middle;">
    <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${c.primary}"/>
    <text x="${half}" y="${half}" text-anchor="middle" dominant-baseline="central" fill="${c.secondary}" font-family="Inter,sans-serif" font-weight="700" font-size="${fontSize}">${c.abbrev}</text>
  </svg>`;
}

async function loadTeamColors() {
  try {
    const res = await fetch(`${API_BASE}/api/team-colors`);
    if (res.ok) teamColors = await res.json();
  } catch (e) { /* optional, fail silently */ }
}

// ═══════════════════════════════════════════════════════
// SECTION 1: INITIALIZATION & NAVIGATION
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  injectAdditionalViews();
  setupNavigation();
  setupTournamentToggle();
  setupCategoryFilter();
  setupCompareButton();
  setupTeamSearch();
  setupTableSort();
  setupTableSearch();
  setupTeamsFilters();
  setupTableViewToggle();
  setupH2H();
  setupBracketToolbar();
  setupFeedbackPanel();
  setupModeExplainer();
  setupChallenge();
  setupTeamCompare();
  setupThemeToggle();
  setupHamburgerMenu();

  await loadTeamColors();
  await loadModes();
  await loadTeams();

  if (modes.length > 0) {
    selectMode(modes[0].id);
  }

  // Restore view from URL hash (e.g. #bracket, #teams)
  const initialView = getViewFromHash();
  if (initialView && initialView !== 'dashboard') {
    switchView(initialView, false);
  }

  connectWebSocket();
});

function setupNavigation() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const viewName = tab.dataset.view;
      if (viewName) switchView(viewName);
    });
  });
}

function switchView(viewName, pushState = true) {
  currentView = viewName;
  trackEvent('view_switch', { view: viewName });

  // Update URL hash for browser back/forward navigation
  if (pushState && viewName !== 'dashboard') {
    history.pushState({ view: viewName }, '', '#' + viewName);
  } else if (pushState && viewName === 'dashboard') {
    history.pushState({ view: viewName }, '', location.pathname);
  }

  // Update nav tab active states
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });

  // Hide all view sections with fade
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
    section.style.opacity = '0';
    section.style.display = 'none';
  });

  // Show the target view with fade-in
  const targetId = viewName.startsWith('view-') ? viewName : 'view-' + viewName;
  const target = document.getElementById(targetId);
  if (target) {
    target.style.display = 'block';
    target.classList.add('active');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { target.style.opacity = '1'; });
    });
  }

  // Trigger view-specific loading
  if (viewName === 'bracket' && !bracketData) {
    loadBracket();
  }
  if (viewName === 'teams') {
    renderTeamsTable();
  }
  if (viewName === 'picks') {
    initPickSheet();
  }
  if (viewName === 'challenge') {
    loadLeaderboard();
  }
  if (viewName === 'accuracy') {
    loadAccuracy();
  }
}

// Handle browser back/forward navigation
window.addEventListener('popstate', (event) => {
  const view = (event.state && event.state.view) || getViewFromHash() || 'dashboard';
  switchView(view, false);
});

function getViewFromHash() {
  const hash = location.hash.replace('#', '');
  const validViews = ['dashboard', 'bracket', 'teams', 'h2h', 'picks', 'challenge', 'accuracy'];
  return validViews.includes(hash) ? hash : null;
}

function setupCategoryFilter() {
  document.querySelectorAll('[data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      document.querySelectorAll('[data-category]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterModesByCategory(category);
    });
  });
}

function setupTournamentToggle() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = btn.dataset.type;
      // Clear cached data
      lastData = null;
      bracketData = null;
      allTeams = [];
      clearCompareSelection();
      loadTeams();
      if (currentMode) runSimulation();
      if (currentView === 'bracket') loadBracket();
    });
  });
}


// ═══════════════════════════════════════════════════════
// SECTION 2: MODE MANAGEMENT
// ═══════════════════════════════════════════════════════

async function loadModes() {
  try {
    const res = await fetch(`${API_BASE}/api/modes`);
    modes = await res.json();
    renderModeTabs();
  } catch (e) {
    console.error('Failed to load modes:', e);
    showToast('Failed to load simulation modes', 'warning');
  }
}

function renderModeTabs() {
  const container = document.getElementById('mode-tabs');
  if (!container) return;
  container.innerHTML = '';

  modes.forEach(mode => {
    const btn = document.createElement('button');
    btn.className = 'mode-tab';
    btn.dataset.mode = mode.id;
    btn.dataset.modeCategory = mode.category || '';

    const dot = document.createElement('span');
    dot.className = 'tab-dot';
    dot.style.background = CATEGORY_COLORS[mode.category] || '#666';
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(mode.name));

    btn.addEventListener('click', () => selectMode(mode.id));
    container.appendChild(btn);
  });

  populateBracketModeDropdown();
}

function selectMode(modeId) {
  currentMode = modeId;
  trackEvent('simulation_run', { mode: modeId });
  lastData = null; // Clear cache on mode change

  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === modeId);
  });

  const mode = modes.find(m => m.id === modeId);
  if (mode) {
    const badge = document.getElementById('mode-badge');
    if (badge) {
      badge.textContent = mode.confidenceTag.replace('-', ' ');
      badge.className = 'mode-confidence-badge badge-' + mode.category;
    }
    const desc = document.getElementById('mode-desc');
    if (desc) desc.textContent = mode.description;
  }

  runSimulation();
}

function filterModesByCategory(category) {
  document.querySelectorAll('.mode-tab').forEach(tab => {
    if (category === 'all' || !category) {
      tab.style.display = '';
    } else {
      tab.style.display = tab.dataset.modeCategory === category ? '' : 'none';
    }
  });
}


// ═══════════════════════════════════════════════════════
// SECTION 3: SIMULATION
// ═══════════════════════════════════════════════════════

async function runSimulation() {
  showLoading(true);
  try {
    const simCount = parseInt(document.getElementById('sim-count-input')?.value) || 10000;
    const res = await fetch(`${API_BASE}/api/simulate/${currentType}/${currentMode}?sims=${simCount}`);
    const data = await res.json();
    lastData = data;
    renderDashboard(data);
    showToast('Simulation complete', 'success');
  } catch (e) {
    console.error('Simulation failed:', e);
    showToast('Simulation failed - check console', 'warning');
  } finally {
    showLoading(false);
  }
}

function showLoading(show) {
  const loading = document.getElementById('loading');
  const dashboard = document.getElementById('dashboard');
  if (loading) loading.style.display = show ? 'flex' : 'none';
  if (dashboard) dashboard.style.display = show ? 'none' : 'flex';
  if (show) {
    // Show skeleton placeholders in tables while loading
    showTableSkeleton('champ-tbody', 9, 10);
  }
}

function renderDashboard(data) {
  const { report, rawResults, mostLikelyFinalFour, mostLikelyChampion, volatilityIndex } = data;

  // Simulation count
  const simCountEl = document.getElementById('sim-count');
  if (simCountEl) simCountEl.textContent = report.simulationCount.toLocaleString();

  // Hero section
  const champTeam = rawResults.find(t => t.teamId === mostLikelyChampion);
  if (champTeam) {
    setTextContent('hero-team', champTeam.teamName);
    setTextContent('hero-seed', `#${champTeam.seed} Seed`);
    setTextContent('hero-region', capitalize(champTeam.region));
    // Animate the champion probability counter
    const heroProbEl = document.getElementById('hero-prob');
    if (heroProbEl && typeof champTeam.championshipProbability === 'number') {
      animateCountUp(heroProbEl, champTeam.championshipProbability * 100, 800, '%');
    } else {
      setTextContent('hero-prob', formatPct(champTeam.championshipProbability));
    }
  }

  // Final Four
  renderFinalFour(mostLikelyFinalFour, rawResults);

  // Championship Table
  renderChampTable(report.championshipOdds);

  // Regions
  renderRegions(report.regionBreakdowns);

  // Quick Stats
  setTextContent('stat-volatility', (volatilityIndex * 100).toFixed(2));
  setTextContent('stat-upset', report.biggestUpset || 'None');
  setTextContent('stat-time', new Date(report.generatedAt).toLocaleTimeString());

  const mode = modes.find(m => m.id === currentMode);
  setTextContent('stat-mode-cat', mode ? capitalize(mode.category) : '--');

  // Show compare section if multiple modes
  const compareSection = document.getElementById('compare-section');
  if (compareSection) compareSection.style.display = modes.length > 1 ? '' : 'none';

  // Refresh bracket if we have bracket structure loaded
  if (bracketData) {
    // Reload fresh bracket structure so propagation starts clean
    fetch(`${API_BASE}/api/bracket/${currentType}`)
      .then(r => r.json())
      .then(d => { bracketData = d; renderBracket(); })
      .catch(e => console.warn('Bracket reload failed:', e));
  }
}


// ═══════════════════════════════════════════════════════
// SECTION 4: CHAMPION TABLE (Enhanced)
// ═══════════════════════════════════════════════════════

function renderChampTable(odds) {
  const tbody = document.getElementById('champ-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Render ALL teams, not just top 25
  odds.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.teamName = (row.teamName || '').toLowerCase();
    tr.dataset.region = (row.region || '').toLowerCase();
    tr.dataset.seed = row.seed;
    tr.dataset.teamId = row.teamId || '';

    const seedClass = row.seed <= 4 ? `seed-${row.seed}` : '';
    const regionClass = `region-${row.region}`;

    tr.innerHTML = `
      <td class="col-rank"><span class="rank-num">${row.rank}</span></td>
      <td class="col-team"><span class="team-name-cell" style="display:flex;align-items:center;gap:6px;">${teamBadge(row.teamId, 22)}${row.teamName}</span></td>
      <td class="col-seed"><span class="seed-badge ${seedClass}">${row.seed}</span></td>
      <td class="col-region"><span class="region-tag ${regionClass}">${row.region}</span></td>
      <td class="col-prob" data-sort-value="${parseFloat(row.championPct) || 0}"><span class="prob-cell ${probColor(row.championPct)}">${row.championPct}</span></td>
      <td class="col-prob" data-sort-value="${parseFloat(row.finalFourPct) || 0}"><span class="prob-cell ${probColor(row.finalFourPct)}">${row.finalFourPct}</span></td>
      <td class="col-prob" data-sort-value="${parseFloat(row.eliteEightPct) || 0}"><span class="prob-cell ${probColor(row.eliteEightPct)}">${row.eliteEightPct}</span></td>
      <td class="col-prob" data-sort-value="${parseFloat(row.sweetSixteenPct) || 0}"><span class="prob-cell ${probColor(row.sweetSixteenPct)}">${row.sweetSixteenPct}</span></td>
      <td class="col-ew" data-sort-value="${parseFloat(row.expectedWins) || 0}">${row.expectedWins}</td>
    `;

    tr.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        toggleTeamCompare(row.teamId);
      }
    });

    tbody.appendChild(tr);
  });

  // Update subtitle
  const subtitle = document.getElementById('table-subtitle');
  if (subtitle) subtitle.textContent = `All ${odds.length} teams by title probability`;
}

function setupTableSort() {
  const table = document.getElementById('champ-table');
  if (!table) return;

  const headers = table.querySelectorAll('thead th.sortable');

  headers.forEach((th) => {
    const col = th.dataset.sort;
    if (!col) return;
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    th.addEventListener('click', () => {
      if (tableSortColumn === col) {
        tableSortDirection = tableSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        tableSortColumn = col;
        tableSortDirection = (col === 'team' || col === 'region') ? 'asc' : 'desc';
      }

      // Update sort indicators
      headers.forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(tableSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');

      sortTable(col, tableSortDirection);
    });
  });
}

function sortTable(column, direction) {
  const tbody = document.getElementById('champ-tbody');
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll('tr'));
  const columnMap = {
    rank: 0, team: 1, seed: 2, region: 3,
    champ: 4, ff: 5, e8: 6, s16: 7, ew: 8,
  };
  const colIndex = columnMap[column];
  if (colIndex === undefined) return;

  rows.sort((a, b) => {
    let aVal, bVal;
    const aCell = a.cells[colIndex];
    const bCell = b.cells[colIndex];

    if (column === 'team' || column === 'region') {
      aVal = (aCell.textContent || '').trim().toLowerCase();
      bVal = (bCell.textContent || '').trim().toLowerCase();
      return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    // Numeric sort
    aVal = parseFloat(aCell.dataset.sortValue || aCell.textContent.replace(/[^0-9.\-]/g, '')) || 0;
    bVal = parseFloat(bCell.dataset.sortValue || bCell.textContent.replace(/[^0-9.\-]/g, '')) || 0;
    return direction === 'asc' ? aVal - bVal : bVal - aVal;
  });

  rows.forEach(row => tbody.appendChild(row));
}

function setupTableSearch() {
  const searchInput = document.getElementById('champ-table-search');
  if (!searchInput) return;

  searchInput.addEventListener('input', debounce(() => {
    const query = searchInput.value.toLowerCase().trim();
    const tbody = document.getElementById('champ-tbody');
    if (!tbody) return;

    tbody.querySelectorAll('tr').forEach(row => {
      const name = row.dataset.teamName || '';
      const region = row.dataset.region || '';
      const visible = !query || name.includes(query) || region.includes(query);
      row.style.display = visible ? '' : 'none';
    });
  }, 200));
}


// ═══════════════════════════════════════════════════════
// SECTION 5: REGIONS
// ═══════════════════════════════════════════════════════

function renderRegions(breakdowns) {
  if (!breakdowns) return;

  breakdowns.forEach(region => {
    const container = document.getElementById(`region-${region.region}`);
    if (!container) return;
    container.innerHTML = '';

    // Header row
    const header = document.createElement('div');
    header.className = 'region-team-row region-team-header';
    header.innerHTML = `
      <div></div>
      <div>Team</div>
      <div style="text-align:right">R32</div>
      <div style="text-align:right">S16</div>
      <div style="text-align:right">E8</div>
      <div style="text-align:right">FF</div>
    `;
    container.appendChild(header);

    region.teams.forEach(team => {
      const row = document.createElement('div');
      row.className = 'region-team-row';

      const ffProbNum = parseFloat(team.finalFourPct) || 0;

      row.innerHTML = `
        <div class="region-team-seed">${team.seed}</div>
        <div class="region-team-name" style="display:flex;align-items:center;gap:5px;">${teamBadge(team.teamId, 20)}${team.teamName}</div>
        <div class="region-team-prob">${team.roundOf32Pct}</div>
        <div class="region-team-prob">${team.sweetSixteenPct}</div>
        <div class="region-team-prob">${team.eliteEightPct}</div>
        <div class="region-team-prob" style="color:${ffProbNum > 20 ? REGION_COLORS[region.region] : 'var(--text-secondary)'};font-weight:${ffProbNum > 20 ? 600 : 400}">${team.finalFourPct}</div>
      `;
      container.appendChild(row);
    });
  });
}


// ═══════════════════════════════════════════════════════
// SECTION 6: FINAL FOUR
// ═══════════════════════════════════════════════════════

function renderFinalFour(ffIds, rawResults) {
  const container = document.getElementById('ff-teams');
  if (!container) return;
  container.innerHTML = '';

  if (!ffIds || !rawResults) return;

  ffIds.forEach(id => {
    const team = rawResults.find(t => t.teamId === id);
    if (!team) return;

    const el = document.createElement('div');
    el.className = 'ff-team';

    const regionColor = REGION_COLORS[team.region] || '#666';

    el.innerHTML = `
      <div class="ff-team-info">
        <div class="ff-team-seed" style="background:${regionColor}20; color:${regionColor}">${team.seed}</div>
        ${teamBadge(team.teamId, 24)}
        <div class="ff-team-name">${team.teamName}</div>
      </div>
      <div class="ff-team-prob">${formatPct(team.roundProbabilities['final-four'])}</div>
    `;
    container.appendChild(el);
  });
}


// ═══════════════════════════════════════════════════════
// SECTION 7: MODE COMPARISON (Enhanced)
// ═══════════════════════════════════════════════════════

function setupCompareButton() {
  const btn = document.getElementById('btn-compare');
  if (btn) btn.addEventListener('click', runComparison);
}

async function runComparison() {
  const btn = document.getElementById('btn-compare');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Running...';
  }

  try {
    const res = await fetch(`${API_BASE}/api/compare/${currentType}?sims=5000`);
    const data = await res.json();
    renderComparison(data);
    showToast('Mode comparison complete', 'success');
  } catch (e) {
    console.error('Comparison failed:', e);
    showToast('Mode comparison failed', 'warning');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Compare All Modes';
    }
  }
}

function renderComparison(comparisons) {
  const grid = document.getElementById('compare-grid');
  if (!grid) return;
  grid.innerHTML = '';

  comparisons.forEach(comp => {
    const card = document.createElement('div');
    card.className = 'compare-mode-card';

    const categoryColor = CATEGORY_COLORS[comp.category] || '#666';

    // Build Final Four list if available
    let ffHtml = '';
    if (comp.finalFour && comp.finalFour.length > 0) {
      const ffItems = comp.finalFour.map(t =>
        `<div class="compare-ff-team"><span class="compare-ff-seed">${t.seed}</span> ${t.name}</div>`
      ).join('');
      ffHtml = `
        <div class="compare-ff">
          <div class="compare-ff-label">Final Four</div>
          ${ffItems}
        </div>
      `;
    }

    // Build top 5 teams if available
    let topTeamsHtml = '';
    if (comp.topTeams && comp.topTeams.length > 0) {
      const teamItems = comp.topTeams.slice(0, 5).map((t, i) =>
        `<div class="compare-top-team">
          <span class="compare-top-rank">${i + 1}.</span>
          <span class="compare-top-name">${t.name}</span>
          <span class="compare-top-prob">${formatPct(t.probability)}</span>
        </div>`
      ).join('');
      topTeamsHtml = `
        <div class="compare-top-teams">
          <div class="compare-ff-label">Top Contenders</div>
          ${teamItems}
        </div>
      `;
    }

    card.innerHTML = `
      <div class="compare-mode-name">${comp.modeName}</div>
      <div class="compare-mode-tag" style="color:${categoryColor}">${comp.confidenceTag}</div>
      <div class="compare-champion">
        <div class="compare-champion-label">Predicted Champion</div>
        <div class="compare-champion-name">${comp.champion ? `(${comp.champion.seed}) ${comp.champion.name}` : '--'}</div>
        <div class="compare-champion-prob">${comp.champion ? formatPct(comp.champion.probability) : '--'}</div>
      </div>
      ${ffHtml}
      ${topTeamsHtml}
    `;
    grid.appendChild(card);
  });
}


// ═══════════════════════════════════════════════════════
// SECTION 8: TEAMS VIEW
// ═══════════════════════════════════════════════════════

async function loadTeams() {
  try {
    const res = await fetch(`${API_BASE}/api/teams/${currentType}`);
    allTeams = await res.json();
    if (currentView === 'teams') {
      renderTeamsTable();
    }
    // Also populate H2H dropdowns
    populateH2HDropdowns();
  } catch (e) {
    console.error('Failed to load teams:', e);
  }
}

function renderTeamsTable() {
  const tbody = document.getElementById('teams-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!allTeams || allTeams.length === 0) {
    showTableSkeleton('teams-tbody', 17, 12);
    return;
  }

  // Build sim data lookup from lastData if available
  const simLookup = {};
  if (lastData && lastData.rawResults) {
    lastData.rawResults.forEach(r => {
      simLookup[r.teamId] = r;
    });
  }

  // Sort teams by seed for initial display
  const sorted = [...allTeams].sort((a, b) => a.seed - b.seed);

  sorted.forEach((team, idx) => {
    const tr = document.createElement('tr');
    const m = team.metrics || {};
    tr.dataset.teamName = (team.name || '').toLowerCase();
    tr.dataset.conference = (team.conference || '').toLowerCase();
    tr.dataset.region = (team.region || '').toLowerCase();
    tr.dataset.seed = team.seed || '';
    tr.dataset.teamId = team.id || '';
    tr.style.cursor = 'pointer';

    const seedClass = team.seed <= 4 ? `seed-${team.seed}` : '';
    const record = m.wins != null && m.losses != null ? `${m.wins}-${m.losses}` : '--';
    const sim = simLookup[team.id];
    const champPct = sim ? formatPct(sim.championshipProbability) : '--';
    const ffPct = sim && sim.roundProbabilities ? formatPct(sim.roundProbabilities['final-four'] || 0) : '--';
    const ew = sim ? sim.expectedWins.toFixed(2) : '--';

    tr.innerHTML = `
      <td class="col-rank">${idx + 1}</td>
      <td class="col-team"><span class="team-name-cell" style="display:flex;align-items:center;gap:6px;">${teamBadge(team.id, 22)}${team.name || '--'}</span></td>
      <td class="col-seed"><span class="seed-badge ${seedClass}">${team.seed || '--'}</span></td>
      <td class="col-region"><span class="region-tag region-${team.region || ''}">${capitalize(team.region) || '--'}</span></td>
      <td class="col-conf">${team.conference || '--'}</td>
      <td class="col-record">${record}</td>
      <td class="col-stat">${m.adjOffensiveEfficiency != null ? m.adjOffensiveEfficiency.toFixed(1) : '--'}</td>
      <td class="col-stat">${m.adjDefensiveEfficiency != null ? m.adjDefensiveEfficiency.toFixed(1) : '--'}</td>
      <td class="col-stat">${m.adjTempo != null ? m.adjTempo.toFixed(1) : '--'}</td>
      <td class="col-stat">${m.strengthOfSchedule != null ? m.strengthOfSchedule.toFixed(2) : '--'}</td>
      <td class="col-stat">${m.effectiveFGPct != null ? (m.effectiveFGPct * 100).toFixed(1) + '%' : '--'}</td>
      <td class="col-stat">${m.turnoverPct != null ? (m.turnoverPct * 100).toFixed(1) + '%' : '--'}</td>
      <td class="col-stat">${m.offensiveReboundPct != null ? (m.offensiveReboundPct * 100).toFixed(1) + '%' : '--'}</td>
      <td class="col-stat">${m.freeThrowRate != null ? (m.freeThrowRate * 100).toFixed(1) + '%' : '--'}</td>
      <td class="col-prob">${champPct}</td>
      <td class="col-prob">${ffPct}</td>
      <td class="col-ew">${ew}</td>
    `;

    tr.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        toggleTeamCompare(team.id);
      } else {
        showTeamDetail(team.id);
      }
    });
    tbody.appendChild(tr);
  });

  // Update row count
  const rowCount = document.getElementById('teams-row-count');
  if (rowCount) rowCount.textContent = `Showing ${sorted.length} teams`;
}

function setupTeamSearch() {
  const searchInput = document.getElementById('teams-search');
  if (!searchInput) return;

  searchInput.addEventListener('input', debounce(() => {
    const query = searchInput.value.toLowerCase().trim();
    const tbody = document.getElementById('teams-tbody');
    if (!tbody) return;

    tbody.querySelectorAll('tr').forEach(row => {
      const name = row.dataset.teamName || '';
      const conf = row.dataset.conference || '';
      const region = row.dataset.region || '';
      const visible = !query || name.includes(query) || conf.includes(query) || region.includes(query);
      row.style.display = visible ? '' : 'none';
    });
  }, 200));
}

function setupTeamsFilters() {
  const regionFilter = document.getElementById('teams-region-filter');
  const seedFilter = document.getElementById('teams-seed-filter');

  function applyTeamsFilters() {
    var selectedRegion = regionFilter ? regionFilter.value : '';
    var selectedSeed = seedFilter ? seedFilter.value : '';
    var tbody = document.getElementById('teams-tbody');
    if (!tbody) return;

    var visibleCount = 0;
    tbody.querySelectorAll('tr').forEach(function(row) {
      var regionMatch = !selectedRegion || row.dataset.region === selectedRegion;
      var seedMatch = !selectedSeed || String(row.dataset.seed) === selectedSeed;
      // Also respect current search filter (if row is already hidden by search, keep it hidden)
      var searchHidden = row.style.display === 'none' && !row._filterHidden;
      var visible = regionMatch && seedMatch;
      row._filterHidden = !visible;
      row.style.display = visible ? '' : 'none';
      if (visible) visibleCount++;
    });

    var rowCount = document.getElementById('teams-row-count');
    if (rowCount) rowCount.textContent = 'Showing ' + visibleCount + ' teams';
  }

  if (regionFilter) {
    regionFilter.addEventListener('change', applyTeamsFilters);
  }
  if (seedFilter) {
    seedFilter.addEventListener('change', applyTeamsFilters);
  }
}

function showTeamDetail(teamId) {
  trackEvent('team_detail_view', { teamId: teamId });
  var panel = document.getElementById('team-detail-panel');
  if (!panel) return;

  var team = allTeams.find(function(t) { return t.id === teamId; });
  if (!team) return;

  var m = team.metrics || {};
  var cp = team.coachingProfile || null;
  var mp = team.mascotProfile || null;
  var regionColor = REGION_COLORS[(team.region || '').toLowerCase()] || '#666';

  // Find simulation data
  var sim = null;
  if (lastData && lastData.rawResults) {
    for (var i = 0; i < lastData.rawResults.length; i++) {
      if (lastData.rawResults[i].teamId === teamId) {
        sim = lastData.rawResults[i];
        break;
      }
    }
  }

  // Helper to format metric values
  function fmtVal(val, decimals, mult, suffix) {
    if (val == null) return '--';
    var v = mult ? val * mult : val;
    return v.toFixed(decimals != null ? decimals : 1) + (suffix || '');
  }

  // ── Section 1: Team Header ──
  var seedClass = team.seed <= 4 ? ' seed-' + team.seed : '';
  var headerHtml = '<div class="td-header" style="background: linear-gradient(135deg, ' + regionColor + '22, transparent);">' +
    '<div style="display:flex;align-items:center;gap:1rem;">' +
      teamBadge(team.id, 48) +
      '<div>' +
        '<div class="team-detail-name">' + team.name + '</div>' +
        '<div class="team-detail-meta">' +
          '<span class="seed-badge' + seedClass + '">' + team.seed + ' Seed</span>' +
          '<span class="region-tag region-' + (team.region || '') + '">' + capitalize(team.region) + '</span>' +
          '<span>' + (team.conference || '') + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:1.5rem;margin-top:1rem;">' +
      '<div class="td-record-box">' +
        '<span class="td-record-num">' + (m.wins != null ? m.wins : '?') + '-' + (m.losses != null ? m.losses : '?') + '</span>' +
        '<span class="td-record-label">Record</span>' +
      '</div>' +
      '<div class="td-record-box">' +
        '<span class="td-record-num">' + (m.last10Wins || 0) + '-' + (m.last10Losses || 0) + '</span>' +
        '<span class="td-record-label">Last 10</span>' +
      '</div>' +
      '<div class="td-record-box">' +
        '<span class="td-record-num">' + (m.winStreak || 0) + '</span>' +
        '<span class="td-record-label">Streak</span>' +
      '</div>' +
    '</div>' +
  '</div>';

  // ── Section 2: Tournament Probability Funnel ──
  var funnelRounds = [
    { key: 'round-of-64', label: 'R64', fallback: 1 },
    { key: 'round-of-32', label: 'R32' },
    { key: 'sweet-sixteen', label: 'S16' },
    { key: 'elite-eight', label: 'E8' },
    { key: 'final-four', label: 'FF' },
    { key: 'championship', label: 'Champ' }
  ];
  var funnelHtml = '<div class="td-section">' +
    '<h3 class="td-section-title">Tournament Path Probability</h3>' +
    '<div class="td-prob-funnel">';
  for (var fi = 0; fi < funnelRounds.length; fi++) {
    var fr = funnelRounds[fi];
    var pct = 0;
    if (sim) {
      if (fr.key === 'championship') {
        pct = (sim.championshipProbability || 0) * 100;
      } else if (fr.fallback != null && (!sim.roundProbabilities || sim.roundProbabilities[fr.key] == null)) {
        pct = fr.fallback * 100;
      } else if (sim.roundProbabilities) {
        pct = (sim.roundProbabilities[fr.key] || 0) * 100;
      }
    }
    var pctDisplay = pct.toFixed(1);
    funnelHtml += '<div class="td-funnel-row">' +
      '<span class="td-funnel-label">' + fr.label + '</span>' +
      '<div class="td-funnel-bar-bg"><div class="td-funnel-bar" style="width:' + pctDisplay + '%"></div></div>' +
      '<span class="td-funnel-pct">' + pctDisplay + '%</span>' +
    '</div>';
  }
  funnelHtml += '</div></div>';

  // ── Section 3: Advanced Stats Grid ──
  var statsData = [
    { label: 'Adj OE', val: fmtVal(m.adjOffensiveEfficiency, 1) },
    { label: 'Adj DE', val: fmtVal(m.adjDefensiveEfficiency, 1) },
    { label: 'Tempo', val: fmtVal(m.adjTempo, 1) },
    { label: 'SOS', val: fmtVal(m.strengthOfSchedule, 3) },
    { label: 'eFG%', val: fmtVal(m.effectiveFGPct, 1, 100, '%') },
    { label: 'TO%', val: fmtVal(m.turnoverPct, 1, 100, '%') },
    { label: 'OR%', val: fmtVal(m.offensiveReboundPct, 1, 100, '%') },
    { label: 'DR%', val: fmtVal(m.defensiveReboundPct, 1, 100, '%') },
    { label: 'FT Rate', val: fmtVal(m.freeThrowRate, 1, 100, '%') },
    { label: 'FT%', val: fmtVal(m.freeThrowPct, 1, 100, '%') },
    { label: '3P%', val: fmtVal(m.threePointPct, 1, 100, '%') },
    { label: '3P Rate', val: fmtVal(m.threePointRate, 1, 100, '%') },
    { label: 'Steal%', val: fmtVal(m.stealPct, 1, 100, '%') },
    { label: 'Height', val: fmtVal(m.avgHeight, 1, null, '"') },
    { label: 'Bench%', val: fmtVal(m.benchMinutesPct, 1, 100, '%') },
    { label: 'Experience', val: fmtVal(m.experienceRating, 2) }
  ];
  var statsHtml = '<div class="td-section">' +
    '<h3 class="td-section-title">Advanced Metrics</h3>' +
    '<div class="td-stats-grid">';
  for (var si = 0; si < statsData.length; si++) {
    statsHtml += '<div class="td-stat">' +
      '<span class="td-stat-label">' + statsData[si].label + '</span>' +
      '<span class="td-stat-value">' + statsData[si].val + '</span>' +
    '</div>';
  }
  statsHtml += '</div></div>';

  // ── Section 4: Coaching Profile ──
  var coachHtml = '';
  if (cp) {
    var seedOverperf = cp.seedOverperformance != null ? (cp.seedOverperformance > 0 ? '+' : '') + cp.seedOverperformance.toFixed(1) : '--';
    coachHtml = '<div class="td-section">' +
      '<h3 class="td-section-title">Coaching Profile</h3>' +
      '<div class="td-coach-card">' +
        '<div class="td-coach-name">' + (cp.name || 'Unknown') + '</div>' +
        '<div class="td-coach-stats">' +
          '<div class="td-coach-stat"><span>' + (cp.yearsExperience != null ? cp.yearsExperience : '--') + '</span><span>Years Exp.</span></div>' +
          '<div class="td-coach-stat"><span>' + (cp.tournamentWins != null ? cp.tournamentWins : '?') + '-' + (cp.tournamentLosses != null ? cp.tournamentLosses : '?') + '</span><span>Tourney Record</span></div>' +
          '<div class="td-coach-stat"><span>' + (cp.finalFourAppearances != null ? cp.finalFourAppearances : '--') + '</span><span>Final Fours</span></div>' +
          '<div class="td-coach-stat"><span>' + (cp.championships != null ? cp.championships : '--') + '</span><span>Titles</span></div>' +
          '<div class="td-coach-stat"><span>' + seedOverperf + '</span><span>Seed Overperf.</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ── Section 5: Mascot Profile ──
  var mascotHtml = '';
  if (mp) {
    var combatPct = mp.combatRating != null ? mp.combatRating : 0;
    var intimPct = mp.intimidationFactor != null ? mp.intimidationFactor * 10 : 0;
    mascotHtml = '<div class="td-section">' +
      '<h3 class="td-section-title">Mascot Combat Profile</h3>' +
      '<div class="td-mascot-card">' +
        '<div class="td-mascot-header">' +
          '<span class="td-mascot-type">' + (mp.type || 'Unknown') + '</span>' +
          '<span class="td-mascot-size">' + (mp.size || 'Unknown') + '</span>' +
          (mp.flightCapable ? '<span class="td-mascot-flight">Can Fly</span>' : '') +
        '</div>' +
        '<div class="td-mascot-stats">' +
          '<div class="td-mascot-stat">' +
            '<span class="td-mascot-stat-label">Combat Rating</span>' +
            '<div class="td-mascot-bar-bg"><div class="td-mascot-bar" style="width:' + combatPct + '%"></div></div>' +
            '<span>' + combatPct + '/100</span>' +
          '</div>' +
          '<div class="td-mascot-stat">' +
            '<span class="td-mascot-stat-label">Intimidation</span>' +
            '<div class="td-mascot-bar-bg"><div class="td-mascot-bar" style="width:' + intimPct + '%"></div></div>' +
            '<span>' + (mp.intimidationFactor != null ? mp.intimidationFactor : '?') + '/10</span>' +
          '</div>' +
        '</div>' +
        '<div class="td-mascot-ability">Special: ' + (mp.specialAbility || 'None') + '</div>' +
      '</div>' +
    '</div>';
  }

  // ── Section 6: Radar Chart ──
  var radarHtml = '<div class="td-section">' +
    '<h3 class="td-section-title">Performance Profile</h3>' +
    '<div class="team-detail-chart-container" style="height:220px;background:var(--bg-card);border-radius:10px;padding:0.75rem;">' +
      '<canvas id="td-radar-canvas"></canvas>' +
    '</div>' +
  '</div>';

  // ── Assemble panel HTML ──
  var isInCompare = compareSelectedTeams.indexOf(teamId) >= 0;
  var compareBtnLabel = isInCompare ? 'Remove from Compare' : 'Add to Compare';
  var closeHtml = '<div class="team-detail-header" style="position:sticky;top:0;z-index:5;background:var(--bg-secondary);padding:0.75rem 1.5rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">' +
    '<span style="font-weight:700;font-size:0.85rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.05em;">Team Details</span>' +
    '<div style="display:flex;align-items:center;gap:0.5rem;">' +
      '<button class="compare-bar-btn compare-bar-go" id="td-compare-btn" style="font-size:0.72rem;padding:0.3rem 0.65rem;" title="' + compareBtnLabel + '">' +
        compareBtnLabel +
      '</button>' +
      '<button class="team-detail-close" id="team-detail-close" title="Close">' +
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '</button>' +
    '</div>' +
  '</div>';

  panel.innerHTML = closeHtml +
    '<div class="team-detail-body">' +
      headerHtml +
      funnelHtml +
      radarHtml +
      statsHtml +
      coachHtml +
      mascotHtml +
    '</div>';

  // Show panel
  panel.style.display = 'block';

  // Render radar chart
  var radarCanvas = document.getElementById('td-radar-canvas');
  if (radarCanvas && typeof Chart !== 'undefined') {
    createTeamRadarChart(radarCanvas.getContext('2d'), team);
  }

  // Compare button handler
  var tdCompareBtn = document.getElementById('td-compare-btn');
  if (tdCompareBtn) {
    tdCompareBtn.onclick = function() {
      toggleTeamCompare(teamId);
      // Update button text
      var nowIn = compareSelectedTeams.indexOf(teamId) >= 0;
      tdCompareBtn.textContent = nowIn ? 'Remove from Compare' : 'Add to Compare';
    };
  }

  // Close button handler
  var closeBtn = document.getElementById('team-detail-close');
  if (closeBtn) {
    closeBtn.onclick = function() { panel.style.display = 'none'; };
  }
}


// ═══════════════════════════════════════════════════════
// SECTION 9: BRACKET VIEW
// ═══════════════════════════════════════════════════════

async function loadBracket() {
  try {
    const res = await fetch(`${API_BASE}/api/bracket/${currentType}`);
    bracketData = await res.json();
    renderBracket();
  } catch (e) {
    console.error('Failed to load bracket:', e);
    showToast('Failed to load bracket data', 'warning');
  }
}

/* ── Bracket rendering ── */

const SEED_MATCHUPS = [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];

const ROUND_ORDER = ['round-of-64','round-of-32','sweet-sixteen','elite-eight'];
const ROUND_CSS   = {'round-of-64':'bk-r64','round-of-32':'bk-r32','sweet-sixteen':'bk-s16','elite-eight':'bk-e8'};
const ROUND_SHORT = {'round-of-64':'R64','round-of-32':'R32','sweet-sixteen':'S16','elite-eight':'E8'};
const NEXT_ROUND_MAP = {
  'round-of-64':  'round-of-32',
  'round-of-32':  'sweet-sixteen',
  'sweet-sixteen': 'elite-eight',
  'elite-eight':   'final-four',
  'final-four':    'championship',
};
const MATCHUP_COUNTS = {'round-of-64':8,'round-of-32':4,'sweet-sixteen':2,'elite-eight':1};

function renderBkConnectors(count) {
  let html = '<div class="bk-conn">';
  for (let i = 0; i < count; i++) {
    html += '<div class="bk-conn-pair"><div class="bk-conn-top"></div><div class="bk-conn-bot"></div></div>';
  }
  html += '</div>';
  return html;
}

function bkTeamHtml(teamInfo, probInfo, round, region) {
  const regionColor = REGION_COLORS[region] || '#666';
  if (!teamInfo) {
    return '<div class="bk-team bk-tbd"><span class="bk-name">TBD</span></div>';
  }
  const name = teamInfo.teamName || teamInfo.name || teamInfo.shortName || 'TBD';
  const seed = teamInfo.seed || '?';
  let prob = '';
  if (probInfo) {
    if (round === 'championship') {
      prob = formatPct(probInfo.championshipProbability || 0);
    } else {
      const nextRound = NEXT_ROUND_MAP[round];
      if (nextRound && probInfo.roundProbabilities) {
        prob = formatPct(probInfo.roundProbabilities[nextRound] || 0);
      }
    }
  }
  const isWinner = teamInfo._isWinner;
  const isLoser = teamInfo._isLoser;
  const cls = isWinner ? ' bk-winner' : (isLoser ? ' bk-loser' : '');
  return `<div class="bk-team${cls}">` +
    `<span class="bk-seed" style="color:${regionColor}">${seed}</span>` +
    `<span class="bk-name">${name}</span>` +
    (prob ? `<span class="bk-prob">${prob}</span>` : '') +
    `</div>`;
}

function bkMatchupHtml(team1Info, team2Info, prob1, prob2, round, region, winnerId) {
  // Tag winner and loser
  if (winnerId) {
    const t1Id = team1Info ? (team1Info.id || team1Info.teamId) : null;
    const t2Id = team2Info ? (team2Info.id || team2Info.teamId) : null;
    if (team1Info) {
      team1Info = Object.assign({}, team1Info, {
        _isWinner: t1Id === winnerId,
        _isLoser: t1Id !== winnerId && t2Id === winnerId,
      });
    }
    if (team2Info) {
      team2Info = Object.assign({}, team2Info, {
        _isWinner: t2Id === winnerId,
        _isLoser: t2Id !== winnerId && t1Id === winnerId,
      });
    }
  }
  return '<div class="bk-matchup">' +
    bkTeamHtml(team1Info, prob1, round, region) +
    bkTeamHtml(team2Info, prob2, round, region) +
    '</div>';
}

/**
 * Parse slot data into organized rounds for a region.
 * Returns { 'round-of-64': [slot, ...], ... } sorted by game number.
 */
function organizeRegionSlots(slots, region) {
  const regionSlots = slots.filter(s => (s.region || '').toLowerCase() === region);
  const byRound = {};
  ROUND_ORDER.forEach(r => { byRound[r] = []; });

  regionSlots.forEach(slot => {
    const round = (slot.round || '');
    if (byRound[round]) {
      byRound[round].push(slot);
    }
  });

  // Sort each round by game number parsed from slotId
  Object.keys(byRound).forEach(round => {
    byRound[round].sort((a, b) => {
      const ga = parseInt((a.slotId || '').replace(/.*g/, ''), 10) || 0;
      const gb = parseInt((b.slotId || '').replace(/.*g/, ''), 10) || 0;
      return ga - gb;
    });
  });

  return byRound;
}

/**
 * Build fallback matchups from simulation data for a region.
 * Returns a byRound object with synthetic R64 matchups.
 */
function buildFallbackRegion(region, probLookup) {
  const byRound = {};
  ROUND_ORDER.forEach(r => { byRound[r] = []; });

  const regionTeams = Object.values(probLookup)
    .filter(t => (t.region || '').toLowerCase() === region);
  const bySeed = {};
  regionTeams.forEach(t => { bySeed[t.seed] = t; });

  SEED_MATCHUPS.forEach(([s1, s2], idx) => {
    const t1 = bySeed[s1];
    const t2 = bySeed[s2];
    byRound['round-of-64'].push({
      slotId: `${region}-r1-g${idx + 1}`,
      round: 'round-of-64',
      region: region,
      team1Id: t1 ? t1.teamId : null,
      team2Id: t2 ? t2.teamId : null,
      winnerId: null,
    });
  });

  return byRound;
}

function renderBkRegionRounds(byRound, teamLookup, probLookup, region, reverse) {
  const order = reverse ? [...ROUND_ORDER].reverse() : ROUND_ORDER;
  let html = '';

  order.forEach((round, idx) => {
    const slots = byRound[round] || [];
    const cssClass = ROUND_CSS[round] || '';
    html += `<div class="bk-round ${cssClass}">`;

    if (slots.length > 0) {
      slots.forEach(slot => {
        const t1 = slot.team1Id ? (teamLookup[slot.team1Id] || probLookup[slot.team1Id]) : null;
        const t2 = slot.team2Id ? (teamLookup[slot.team2Id] || probLookup[slot.team2Id]) : null;
        const p1 = slot.team1Id ? probLookup[slot.team1Id] : null;
        const p2 = slot.team2Id ? probLookup[slot.team2Id] : null;
        html += bkMatchupHtml(t1, t2, p1, p2, round, region, slot.winnerId);
      });
    } else {
      // Empty placeholders
      const count = MATCHUP_COUNTS[round] || 1;
      for (let i = 0; i < count; i++) {
        html += bkMatchupHtml(null, null, null, null, round, region, null);
      }
    }

    html += '</div>';

    // Add connectors between rounds (not after the last round)
    if (idx < order.length - 1) {
      const nextRound = order[idx + 1];
      const connCount = MATCHUP_COUNTS[nextRound] || 1;
      html += renderBkConnectors(connCount);
    }
  });

  return html;
}

/**
 * Walk bracket slots from R64 upward, picking the most likely winner
 * of each matchup based on simulation probabilities, and propagating
 * winners into later-round slots.
 */
function propagateBracket(probLookup) {
  if (!bracketData || !bracketData.slots) return;

  // Deep-clone slots so we don't mutate the original API response
  bracketData.slots = bracketData.slots.map(s => ({...s}));

  const slotMap = {};
  bracketData.slots.forEach(s => { slotMap[s.slotId] = s; });

  // Track which slots feed into each next slot, grouped by nextSlotId
  const feeders = {};
  bracketData.slots.forEach(s => {
    if (s.nextSlotId) {
      if (!feeders[s.nextSlotId]) feeders[s.nextSlotId] = [];
      feeders[s.nextSlotId].push(s.slotId);
    }
  });

  // Sort feeder lists so lower game number comes first (team1 position)
  Object.values(feeders).forEach(arr => arr.sort());

  const roundOrder = ['round-of-64', 'round-of-32', 'sweet-sixteen', 'elite-eight', 'final-four', 'championship'];
  const advanceRound = {
    'round-of-64':  'round-of-32',
    'round-of-32':  'sweet-sixteen',
    'sweet-sixteen': 'elite-eight',
    'elite-eight':   'final-four',
    'final-four':    'championship',
    'championship':  'championship',
  };

  roundOrder.forEach(round => {
    const roundSlots = bracketData.slots.filter(s => s.round === round);
    roundSlots.forEach(slot => {
      if (!slot.team1Id || !slot.team2Id) return;

      const p1 = probLookup[slot.team1Id];
      const p2 = probLookup[slot.team2Id];
      if (!p1 && !p2) return;

      // Compare probability of advancing to the next round
      const nextRound = advanceRound[round];
      let prob1 = 0, prob2 = 0;
      if (p1 && p1.roundProbabilities && nextRound) {
        prob1 = p1.roundProbabilities[nextRound] || 0;
      }
      if (p2 && p2.roundProbabilities && nextRound) {
        prob2 = p2.roundProbabilities[nextRound] || 0;
      }

      // For FF and championship, compare championship probability
      if (round === 'final-four' || round === 'championship') {
        prob1 = p1 ? (p1.championshipProbability || 0) : 0;
        prob2 = p2 ? (p2.championshipProbability || 0) : 0;
      }

      const winnerId = prob1 >= prob2 ? slot.team1Id : slot.team2Id;
      slot.winnerId = winnerId;

      // Propagate winner to next slot
      if (slot.nextSlotId && slotMap[slot.nextSlotId]) {
        const nextSlot = slotMap[slot.nextSlotId];
        const feederList = feeders[slot.nextSlotId] || [];
        const feederIndex = feederList.indexOf(slot.slotId);
        if (feederIndex === 0) {
          nextSlot.team1Id = winnerId;
        } else {
          nextSlot.team2Id = winnerId;
        }
      }
    });
  });
}

function renderBracket() {
  const container = document.getElementById('bracket-svg');
  if (!container) return;

  // Build lookups
  const teamLookup = {};
  const probLookup = {};

  if (bracketData && bracketData.teams) {
    bracketData.teams.forEach(t => {
      teamLookup[t.id || t.teamId] = t;
    });
  }
  if (lastData && lastData.rawResults) {
    lastData.rawResults.forEach(t => {
      probLookup[t.teamId] = t;
    });
  }

  const hasSlots = bracketData && bracketData.slots && bracketData.slots.length > 0;
  const hasSimData = Object.keys(probLookup).length > 0;

  // Propagate predicted winners through the bracket if we have both structure and sim data
  if (hasSlots && hasSimData) {
    propagateBracket(probLookup);
    // Re-populate teamLookup with sim data so later rounds can find propagated teams
    Object.values(probLookup).forEach(t => {
      if (!teamLookup[t.teamId]) teamLookup[t.teamId] = t;
    });
  }

  if (!hasSlots && !hasSimData) {
    container.innerHTML = '<p style="text-align:center;padding:3rem;color:var(--text-tertiary)">No bracket data available. Run a simulation first.</p>';
    return;
  }

  const slots = hasSlots ? bracketData.slots : [];

  // Organize regions
  const eastRounds    = hasSlots ? organizeRegionSlots(slots, 'east')    : buildFallbackRegion('east', probLookup);
  const westRounds    = hasSlots ? organizeRegionSlots(slots, 'west')    : buildFallbackRegion('west', probLookup);
  const southRounds   = hasSlots ? organizeRegionSlots(slots, 'south')   : buildFallbackRegion('south', probLookup);
  const midwestRounds = hasSlots ? organizeRegionSlots(slots, 'midwest') : buildFallbackRegion('midwest', probLookup);

  // Final Four & Championship slots
  const ffSlots = slots.filter(s => {
    const r = (s.round || '').toLowerCase();
    return r === 'final-four' || r === 'finalfour' || r === 'ff';
  });
  const champSlots = slots.filter(s => {
    const r = (s.round || '').toLowerCase();
    return r === 'championship' || r === 'finals';
  });

  // ── Build HTML ──
  let html = '<div class="bk-wrapper">';

  // Round labels row
  html += '<div class="bk-labels-row">';
  const leftLabels  = ['R64','','R32','','S16','','E8'];
  const rightLabels = ['E8','','S16','','R32','','R64'];
  const flexVals    = [5, 1, 4, 1, 3, 1, 2]; // relative widths for round cols and conn cols

  leftLabels.forEach((lbl, i) => {
    html += `<span class="bk-round-label" style="flex:${flexVals[i]}">${lbl}</span>`;
  });
  // Center labels
  html += '<span class="bk-round-label bk-center-label" style="flex:3">FF</span>';
  html += '<span class="bk-round-label bk-center-label" style="flex:2">Champ</span>';
  html += '<span class="bk-round-label bk-center-label" style="flex:3">FF</span>';
  // Right labels (mirrored)
  rightLabels.forEach((lbl, i) => {
    html += `<span class="bk-round-label" style="flex:${flexVals[i]}">${lbl}</span>`;
  });
  html += '</div>';

  // Main grid
  html += '<div class="bk-grid">';

  // ── LEFT SIDE ──
  html += '<div class="bk-side bk-left">';
  html += `<div class="bk-region" data-region="east">`;
  html += renderBkRegionRounds(eastRounds, teamLookup, probLookup, 'east', false);
  html += '</div>';
  html += `<div class="bk-region" data-region="west">`;
  html += renderBkRegionRounds(westRounds, teamLookup, probLookup, 'west', false);
  html += '</div>';
  html += '</div>';

  // ── CENTER ──
  html += '<div class="bk-center">';

  // Final Four
  html += '<div class="bk-ff">';
  html += '<div class="bk-ff-label">Final Four</div>';

  if (ffSlots.length > 0) {
    ffSlots.forEach(slot => {
      const t1 = slot.team1Id ? (teamLookup[slot.team1Id] || probLookup[slot.team1Id]) : null;
      const t2 = slot.team2Id ? (teamLookup[slot.team2Id] || probLookup[slot.team2Id]) : null;
      const p1 = slot.team1Id ? probLookup[slot.team1Id] : null;
      const p2 = slot.team2Id ? probLookup[slot.team2Id] : null;
      const r1 = t1 ? (t1.region || '').toLowerCase() : '';
      html += bkMatchupHtml(t1, t2, p1, p2, 'final-four', r1, slot.winnerId);
    });
  } else if (lastData && lastData.mostLikelyFinalFour && lastData.mostLikelyFinalFour.length >= 4) {
    // Build 2 predicted FF matchups: East vs West region winners, South vs Midwest region winners
    const ffIds = lastData.mostLikelyFinalFour;
    // Group by side: left side regions (east/west) vs right side regions (south/midwest)
    const leftFF = ffIds.filter(id => {
      const t = probLookup[id];
      return t && (t.region === 'east' || t.region === 'west');
    });
    const rightFF = ffIds.filter(id => {
      const t = probLookup[id];
      return t && (t.region === 'south' || t.region === 'midwest');
    });

    if (leftFF.length >= 2) {
      const t1 = probLookup[leftFF[0]], t2 = probLookup[leftFF[1]];
      html += bkMatchupHtml(t1, t2, t1, t2, 'final-four', t1 ? t1.region : '', null);
    } else {
      // Show individual entries
      leftFF.forEach(id => {
        const t = probLookup[id];
        if (t) html += bkMatchupHtml(t, null, t, null, 'final-four', t.region, null);
      });
    }
    if (rightFF.length >= 2) {
      const t1 = probLookup[rightFF[0]], t2 = probLookup[rightFF[1]];
      html += bkMatchupHtml(t1, t2, t1, t2, 'final-four', t1 ? t1.region : '', null);
    } else {
      rightFF.forEach(id => {
        const t = probLookup[id];
        if (t) html += bkMatchupHtml(t, null, t, null, 'final-four', t.region, null);
      });
    }
  } else {
    // Empty FF matchups
    html += bkMatchupHtml(null, null, null, null, 'final-four', '', null);
    html += bkMatchupHtml(null, null, null, null, 'final-four', '', null);
  }

  html += '</div>'; // .bk-ff

  // Championship
  html += '<div class="bk-champ">';
  html += '<div class="bk-champ-label">Championship</div>';

  if (champSlots.length > 0) {
    champSlots.forEach(slot => {
      const t1 = slot.team1Id ? (teamLookup[slot.team1Id] || probLookup[slot.team1Id]) : null;
      const t2 = slot.team2Id ? (teamLookup[slot.team2Id] || probLookup[slot.team2Id]) : null;
      const p1 = slot.team1Id ? probLookup[slot.team1Id] : null;
      const p2 = slot.team2Id ? probLookup[slot.team2Id] : null;
      const r1 = t1 ? (t1.region || '').toLowerCase() : '';
      html += bkMatchupHtml(t1, t2, p1, p2, 'championship', r1, slot.winnerId);
    });
  } else if (lastData && lastData.mostLikelyChampion) {
    const champ = probLookup[lastData.mostLikelyChampion];
    if (champ) {
      html += bkMatchupHtml(champ, null, champ, null, 'championship', champ.region, null);
    } else {
      html += bkMatchupHtml(null, null, null, null, 'championship', '', null);
    }
  } else {
    html += bkMatchupHtml(null, null, null, null, 'championship', '', null);
  }

  html += '</div>'; // .bk-champ
  html += '</div>'; // .bk-center

  // ── RIGHT SIDE (rounds in reverse order) ──
  html += '<div class="bk-side bk-right">';
  html += `<div class="bk-region" data-region="south">`;
  html += renderBkRegionRounds(southRounds, teamLookup, probLookup, 'south', true);
  html += '</div>';
  html += `<div class="bk-region" data-region="midwest">`;
  html += renderBkRegionRounds(midwestRounds, teamLookup, probLookup, 'midwest', true);
  html += '</div>';
  html += '</div>';

  html += '</div>'; // .bk-grid
  html += '</div>'; // .bk-wrapper

  container.innerHTML = html;
}


// ═══════════════════════════════════════════════════════
// SECTION 9b: BRACKET TOOLBAR (zoom + region filter)
// ═══════════════════════════════════════════════════════

let bracketScale = 1.0;

function populateBracketModeDropdown() {
  const select = document.getElementById('bracket-mode-select');
  if (!select || !modes.length) return;
  select.innerHTML = '';
  modes.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    if (m.id === currentMode) opt.selected = true;
    select.appendChild(opt);
  });
}

async function simulateBracket() {
  const modeSelect = document.getElementById('bracket-mode-select');
  const simInput = document.getElementById('bracket-sim-count');
  const btn = document.getElementById('btn-simulate-bracket');

  const modeId = modeSelect ? modeSelect.value : currentMode;
  const sims = simInput ? parseInt(simInput.value) || 10000 : 10000;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Simulating...';
  }

  try {
    // Load bracket structure if not cached
    if (!bracketData) {
      const bracketRes = await fetch(`${API_BASE}/api/bracket/${currentType}`);
      bracketData = await bracketRes.json();
    } else {
      // Reload fresh bracket structure so propagation starts clean
      const bracketRes = await fetch(`${API_BASE}/api/bracket/${currentType}`);
      bracketData = await bracketRes.json();
    }

    // Run simulation
    const res = await fetch(`${API_BASE}/api/simulate/${currentType}/${modeId}?sims=${sims}`);
    const data = await res.json();
    lastData = data;

    renderBracket();
    showToast(`Bracket simulated: ${sims.toLocaleString()} runs with ${modes.find(m => m.id === modeId)?.name || modeId}`, 'success');
    trackEvent('bracket_simulate', { mode: modeId, sims: sims });

    // Fire confetti for the predicted champion
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b']
      });
    }
  } catch (e) {
    console.error('Bracket simulation failed:', e);
    showToast('Bracket simulation failed', 'warning');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2l10 6-10 6V2z" fill="currentColor"/></svg> Simulate';
    }
  }
}

function setupBracketToolbar() {
  const zoomIn = document.getElementById('bracket-zoom-in');
  const zoomOut = document.getElementById('bracket-zoom-out');
  const zoomReset = document.getElementById('bracket-zoom-reset');
  const regionFilter = document.getElementById('bracket-region-filter');
  const svgContainer = document.getElementById('bracket-svg');
  const simBtn = document.getElementById('btn-simulate-bracket');

  if (simBtn) {
    simBtn.addEventListener('click', () => simulateBracket());
  }

  if (zoomIn) {
    zoomIn.addEventListener('click', () => {
      bracketScale = Math.min(bracketScale + 0.15, 2.0);
      if (svgContainer) svgContainer.style.transform = `scale(${bracketScale})`;
    });
  }
  if (zoomOut) {
    zoomOut.addEventListener('click', () => {
      bracketScale = Math.max(bracketScale - 0.15, 0.4);
      if (svgContainer) svgContainer.style.transform = `scale(${bracketScale})`;
    });
  }
  if (zoomReset) {
    zoomReset.addEventListener('click', () => {
      bracketScale = 1.0;
      if (svgContainer) svgContainer.style.transform = `scale(1)`;
    });
  }
  if (regionFilter) {
    regionFilter.addEventListener('change', () => {
      const val = regionFilter.value;
      document.querySelectorAll('.bk-region').forEach(el => {
        if (val === 'all') {
          el.style.display = '';
        } else {
          el.style.display = el.dataset.region === val ? '' : 'none';
        }
      });
      const center = document.querySelector('.bk-center');
      if (center) center.style.display = val === 'all' ? '' : 'none';
    });
  }
}

// ═══════════════════════════════════════════════════════
// SECTION 10: HEAD TO HEAD
// ═══════════════════════════════════════════════════════

function setupH2H() {
  const btn = document.getElementById('btn-h2h-compare');
  if (btn) {
    btn.addEventListener('click', runH2HComparison);
  }
}

function populateH2HDropdowns() {
  const select1 = document.getElementById('h2h-team-a');
  const select2 = document.getElementById('h2h-team-b');
  if (!select1 || !select2) return;

  const currentVal1 = select1.value;
  const currentVal2 = select2.value;

  select1.innerHTML = '<option value="">Select Team 1</option>';
  select2.innerHTML = '<option value="">Select Team 2</option>';

  const sorted = [...allTeams].sort((a, b) => {
    const nameA = (a.name || a.teamName || '').toLowerCase();
    const nameB = (b.name || b.teamName || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  sorted.forEach(team => {
    const id = team.id || team.teamId;
    const name = team.name || team.teamName;
    const seed = team.seed || '?';

    const opt1 = document.createElement('option');
    opt1.value = id;
    opt1.textContent = `(${seed}) ${name}`;
    select1.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = id;
    opt2.textContent = `(${seed}) ${name}`;
    select2.appendChild(opt2);
  });

  // Restore selections
  if (currentVal1) select1.value = currentVal1;
  if (currentVal2) select2.value = currentVal2;
}

async function runH2HComparison() {
  const select1 = document.getElementById('h2h-team-a');
  const select2 = document.getElementById('h2h-team-b');
  if (!select1 || !select2) return;

  const team1Id = select1.value;
  const team2Id = select2.value;

  if (!team1Id || !team2Id) {
    showToast('Please select both teams', 'warning');
    return;
  }

  if (team1Id === team2Id) {
    showToast('Please select two different teams', 'warning');
    return;
  }

  const btn = document.getElementById('btn-h2h-compare');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Comparing...';
  }

  try {
    const res = await fetch(`${API_BASE}/api/headtohead/${currentType}/${team1Id}/${team2Id}?sims=5000`);
    const data = await res.json();
    renderH2HResults(data);
    trackEvent('h2h_compare', { team1: team1Id, team2: team2Id });
    showToast('Head-to-head comparison complete', 'success');
  } catch (e) {
    console.error('H2H comparison failed:', e);
    showToast('Head-to-head comparison failed', 'warning');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Compare';
    }
  }
}

function renderH2HResults(data) {
  const container = document.getElementById('h2h-results');
  if (!container) return;

  const { team1, team2, modeResults } = data;
  if (!team1 || !team2) return;

  const t1Name = team1.name || 'Team 1';
  const t2Name = team2.name || 'Team 2';
  const t1Region = (team1.region || '').toLowerCase();
  const t2Region = (team2.region || '').toLowerCase();
  const t1Color = REGION_COLORS[t1Region] || '#3b82f6';
  const t2Color = REGION_COLORS[t2Region] || '#ef4444';
  const m1 = team1.metrics || {};
  const m2 = team2.metrics || {};

  // Populate header names and info
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setText('h2h-name-a', t1Name);
  setText('h2h-name-b', t2Name);
  setText('h2h-info-a', `#${team1.seed} · ${capitalize(t1Region)} · ${team1.conference || ''}`);
  setText('h2h-info-b', `#${team2.seed} · ${capitalize(t2Region)} · ${team2.conference || ''}`);

  // Populate metrics table cells using HTML element IDs
  setText('h2h-a-seed', team1.seed);
  setText('h2h-b-seed', team2.seed);
  setText('h2h-a-adjoe', (m1.adjOffensiveEfficiency || 0).toFixed(1));
  setText('h2h-b-adjoe', (m2.adjOffensiveEfficiency || 0).toFixed(1));
  setText('h2h-a-adjde', (m1.adjDefensiveEfficiency || 0).toFixed(1));
  setText('h2h-b-adjde', (m2.adjDefensiveEfficiency || 0).toFixed(1));
  setText('h2h-a-tempo', (m1.adjTempo || 0).toFixed(1));
  setText('h2h-b-tempo', (m2.adjTempo || 0).toFixed(1));
  setText('h2h-a-sos', (m1.strengthOfSchedule || 0).toFixed(2));
  setText('h2h-b-sos', (m2.strengthOfSchedule || 0).toFixed(2));
  setText('h2h-a-efg', ((m1.effectiveFGPct || 0) * 100).toFixed(1) + '%');
  setText('h2h-b-efg', ((m2.effectiveFGPct || 0) * 100).toFixed(1) + '%');
  setText('h2h-a-tov', ((m1.turnoverPct || 0) * 100).toFixed(1) + '%');
  setText('h2h-b-tov', ((m2.turnoverPct || 0) * 100).toFixed(1) + '%');
  setText('h2h-a-orb', ((m1.offensiveReboundPct || 0) * 100).toFixed(1) + '%');
  setText('h2h-b-orb', ((m2.offensiveReboundPct || 0) * 100).toFixed(1) + '%');
  setText('h2h-a-ftrate', ((m1.freeThrowRate || 0) * 100).toFixed(1) + '%');
  setText('h2h-b-ftrate', ((m2.freeThrowRate || 0) * 100).toFixed(1) + '%');

  // Compute average championship / FF / EW across all modes
  let avgChamp1 = 0, avgChamp2 = 0, avgFF1 = 0, avgFF2 = 0, avgEW1 = 0, avgEW2 = 0;
  let modeCount = 0;
  if (modeResults && modeResults.length > 0) {
    modeResults.forEach(mr => {
      if (mr.team1) {
        avgChamp1 += mr.team1.championshipProbability || 0;
        avgFF1 += (mr.team1.roundProbabilities || {})['final-four'] || 0;
        avgEW1 += mr.team1.expectedWins || 0;
      }
      if (mr.team2) {
        avgChamp2 += mr.team2.championshipProbability || 0;
        avgFF2 += (mr.team2.roundProbabilities || {})['final-four'] || 0;
        avgEW2 += mr.team2.expectedWins || 0;
      }
      modeCount++;
    });
    if (modeCount > 0) {
      avgChamp1 /= modeCount; avgChamp2 /= modeCount;
      avgFF1 /= modeCount; avgFF2 /= modeCount;
      avgEW1 /= modeCount; avgEW2 /= modeCount;
    }
  }

  setText('h2h-a-champ', formatPct(avgChamp1));
  setText('h2h-b-champ', formatPct(avgChamp2));
  setText('h2h-a-ff', formatPct(avgFF1));
  setText('h2h-b-ff', formatPct(avgFF2));
  setText('h2h-a-ew', avgEW1.toFixed(2));
  setText('h2h-b-ew', avgEW2.toFixed(2));

  // Highlight better values in each row
  const metricRows = [
    { a: 'h2h-a-seed', b: 'h2h-b-seed', va: team1.seed, vb: team2.seed, lower: true },
    { a: 'h2h-a-adjoe', b: 'h2h-b-adjoe', va: m1.adjOffensiveEfficiency, vb: m2.adjOffensiveEfficiency },
    { a: 'h2h-a-adjde', b: 'h2h-b-adjde', va: m1.adjDefensiveEfficiency, vb: m2.adjDefensiveEfficiency, lower: true },
    { a: 'h2h-a-tempo', b: 'h2h-b-tempo', va: m1.adjTempo, vb: m2.adjTempo },
    { a: 'h2h-a-sos', b: 'h2h-b-sos', va: m1.strengthOfSchedule, vb: m2.strengthOfSchedule },
    { a: 'h2h-a-efg', b: 'h2h-b-efg', va: m1.effectiveFGPct, vb: m2.effectiveFGPct },
    { a: 'h2h-a-tov', b: 'h2h-b-tov', va: m1.turnoverPct, vb: m2.turnoverPct, lower: true },
    { a: 'h2h-a-orb', b: 'h2h-b-orb', va: m1.offensiveReboundPct, vb: m2.offensiveReboundPct },
    { a: 'h2h-a-ftrate', b: 'h2h-b-ftrate', va: m1.freeThrowRate, vb: m2.freeThrowRate },
    { a: 'h2h-a-champ', b: 'h2h-b-champ', va: avgChamp1, vb: avgChamp2 },
    { a: 'h2h-a-ff', b: 'h2h-b-ff', va: avgFF1, vb: avgFF2 },
    { a: 'h2h-a-ew', b: 'h2h-b-ew', va: avgEW1, vb: avgEW2 },
  ];
  metricRows.forEach(row => {
    const elA = document.getElementById(row.a);
    const elB = document.getElementById(row.b);
    if (!elA || !elB) return;
    elA.style.color = ''; elB.style.color = '';
    if (row.va != null && row.vb != null) {
      const aBetter = row.lower ? row.va < row.vb : row.va > row.vb;
      const bBetter = row.lower ? row.vb < row.va : row.vb > row.va;
      if (aBetter) elA.style.color = t1Color;
      if (bBetter) elB.style.color = t2Color;
    }
  });

  // Win probability bar
  const totalChamp = avgChamp1 + avgChamp2;
  const winPctA = totalChamp > 0 ? (avgChamp1 / totalChamp * 100) : 50;
  const winPctB = totalChamp > 0 ? (avgChamp2 / totalChamp * 100) : 50;
  const winBarA = document.getElementById('h2h-win-a');
  const winBarB = document.getElementById('h2h-win-b');
  if (winBarA) { winBarA.style.width = winPctA + '%'; winBarA.style.backgroundColor = t1Color; }
  if (winBarB) { winBarB.style.width = winPctB + '%'; winBarB.style.backgroundColor = t2Color; }
  setText('h2h-win-pct-a', winPctA.toFixed(0) + '%');
  setText('h2h-win-pct-b', winPctB.toFixed(0) + '%');

  // Mode-by-mode table (6 columns: Mode, Team A Champ%, Team A FF%, Team B Champ%, Team B FF%, Edge)
  const modeTbody = document.getElementById('h2h-mode-tbody');
  if (modeTbody && modeResults && modeResults.length > 0) {
    modeTbody.innerHTML = '';
    modeResults.forEach(mr => {
      const c1 = mr.team1 ? mr.team1.championshipProbability || 0 : 0;
      const ff1 = mr.team1 ? ((mr.team1.roundProbabilities || {})['final-four'] || 0) : 0;
      const c2 = mr.team2 ? mr.team2.championshipProbability || 0 : 0;
      const ff2 = mr.team2 ? ((mr.team2.roundProbabilities || {})['final-four'] || 0) : 0;
      const edge = c1 > c2 ? t1Name : c2 > c1 ? t2Name : 'Even';
      const edgeColor = c1 > c2 ? t1Color : c2 > c1 ? t2Color : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="col-mode">${mr.modeName || mr.modeId}</td>
        <td class="col-prob">${formatPct(c1)}</td>
        <td class="col-prob">${formatPct(ff1)}</td>
        <td class="col-prob">${formatPct(c2)}</td>
        <td class="col-prob">${formatPct(ff2)}</td>
        <td class="col-edge" style="color:${edgeColor};font-weight:600">${edge}</td>`;
      modeTbody.appendChild(tr);
    });
  }

  // Create Chart.js bar chart
  if (modeResults && modeResults.length > 0 && typeof Chart !== 'undefined') {
    const chartCanvas = document.getElementById('h2h-chart');
    if (chartCanvas) {
      createH2HChart(chartCanvas.getContext('2d'), {
        name: t1Name,
        color: t1Color,
        values: modeResults.map(mr => ((mr.team1 ? mr.team1.championshipProbability : 0) || 0) * 100),
      }, {
        name: t2Name,
        color: t2Color,
        values: modeResults.map(mr => ((mr.team2 ? mr.team2.championshipProbability : 0) || 0) * 100),
      }, modeResults.map(mr => mr.modeName || mr.modeId));
    }
  }

  // Show the results container
  container.style.display = 'block';
}


// ═══════════════════════════════════════════════════════
// SECTION 11: PICK SHEET
// ═══════════════════════════════════════════════════════

function initPickSheet() {
  const container = document.getElementById('pick-bracket');
  if (!container) return;

  if (!lastData || !lastData.rawResults) {
    container.innerHTML = '<p style="text-align:center;padding:3rem;color:var(--text-tertiary)">Run a simulation first to populate the pick sheet.</p>';
    return;
  }

  const rawResults = lastData.rawResults;
  const regions = ['east', 'west', 'south', 'midwest'];

  let html = '<div class="pick-sheet-container">';
  html += '<div class="pick-sheet-instructions"><p>Click on a team to pick them to advance. Your picks will be scored against simulation probabilities.</p></div>';

  html += '<div class="pick-regions">';

  regions.forEach(region => {
    const regionTeams = rawResults
      .filter(t => (t.region || '').toLowerCase() === region)
      .sort((a, b) => a.seed - b.seed);

    const regionColor = REGION_COLORS[region] || '#666';

    html += `<div class="pick-region">`;
    html += `<h3 class="pick-region-title" style="color:${regionColor}"><span class="region-dot ${region}-dot"></span>${capitalize(region)}</h3>`;

    // Create matchups (1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15)
    const seedMatchups = [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]];

    html += '<div class="pick-matchups">';

    seedMatchups.forEach(([s1, s2], idx) => {
      const t1 = regionTeams.find(t => t.seed === s1);
      const t2 = regionTeams.find(t => t.seed === s2);
      const matchupKey = `${region}-r64-${idx}`;
      const picked = pickSelections[matchupKey];

      html += `<div class="pick-matchup" data-matchup="${matchupKey}">`;

      if (t1) {
        const isSelected = picked === t1.teamId;
        html += `<div class="pick-team ${isSelected ? 'pick-selected' : ''}" data-team-id="${t1.teamId}" data-matchup="${matchupKey}">
          <span class="pick-seed">${t1.seed}</span>
          <span class="pick-name">${t1.teamName}</span>
        </div>`;
      }

      if (t2) {
        const isSelected = picked === t2.teamId;
        html += `<div class="pick-team ${isSelected ? 'pick-selected' : ''}" data-team-id="${t2.teamId}" data-matchup="${matchupKey}">
          <span class="pick-seed">${t2.seed}</span>
          <span class="pick-name">${t2.teamName}</span>
        </div>`;
      }

      html += '</div>'; // .pick-matchup
    });

    html += '</div>'; // .pick-matchups
    html += '</div>'; // .pick-region
  });

  html += '</div>'; // .pick-regions

  // Score section
  html += `<div class="pick-score-section">
    <button class="btn-compare" id="btn-score-picks" style="margin-top:1rem">Score My Picks</button>
    <div id="pick-score-result" style="margin-top:1rem"></div>
  </div>`;

  html += '</div>'; // .pick-sheet-container

  container.innerHTML = html;

  // Wire up click handlers for pick teams
  container.querySelectorAll('.pick-team').forEach(el => {
    el.addEventListener('click', () => {
      const matchupKey = el.dataset.matchup;
      const teamId = el.dataset.teamId;

      // Toggle selection
      if (pickSelections[matchupKey] === teamId) {
        delete pickSelections[matchupKey];
      } else {
        pickSelections[matchupKey] = teamId;
      }

      // Update visual state within this matchup
      const matchupEl = el.closest('.pick-matchup');
      if (matchupEl) {
        matchupEl.querySelectorAll('.pick-team').forEach(pt => {
          pt.classList.toggle('pick-selected', pt.dataset.teamId === pickSelections[matchupKey]);
        });
      }
    });
  });

  // Wire up score button
  const scoreBtn = document.getElementById('btn-score-picks');
  if (scoreBtn) {
    scoreBtn.addEventListener('click', calculatePickScore);
  }

  // Wire up picks toolbar buttons
  setupPicksButtons();
}

function setupPicksButtons() {
  const seedMatchups = [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];
  const regions = ['east','west','south','midwest'];
  const rawResults = (lastData && lastData.rawResults) ? lastData.rawResults : [];

  // btn-picks-chalk: Auto-fill with highest seeds (chalk)
  const chalkBtn = document.getElementById('btn-picks-chalk');
  if (chalkBtn) {
    chalkBtn.addEventListener('click', () => {
      regions.forEach(region => {
        seedMatchups.forEach(([s1, s2], idx) => {
          const matchupKey = region + '-r64-' + idx;
          // Lower seed number = better team (chalk pick)
          const t1 = rawResults.find(t => (t.region || '').toLowerCase() === region && t.seed === s1);
          if (t1) pickSelections[matchupKey] = t1.teamId;
        });
      });
      initPickSheet();
      trackEvent('picks_autofill', { strategy: 'chalk' });
      showToast('Chalk picks filled (all higher seeds)', 'success');
    });
  }

  // btn-picks-sim: Auto-fill with simulation favorites
  const simBtn = document.getElementById('btn-picks-sim');
  if (simBtn) {
    simBtn.addEventListener('click', () => {
      regions.forEach(region => {
        seedMatchups.forEach(([s1, s2], idx) => {
          const matchupKey = region + '-r64-' + idx;
          const t1 = rawResults.find(t => (t.region || '').toLowerCase() === region && t.seed === s1);
          const t2 = rawResults.find(t => (t.region || '').toLowerCase() === region && t.seed === s2);
          if (t1 && t2) {
            const p1 = (t1.roundProbabilities && t1.roundProbabilities['round-of-32']) || 0;
            const p2 = (t2.roundProbabilities && t2.roundProbabilities['round-of-32']) || 0;
            pickSelections[matchupKey] = p1 >= p2 ? t1.teamId : t2.teamId;
          } else if (t1) {
            pickSelections[matchupKey] = t1.teamId;
          } else if (t2) {
            pickSelections[matchupKey] = t2.teamId;
          }
        });
      });
      initPickSheet();
      trackEvent('picks_autofill', { strategy: 'sim_favorites' });
      showToast('Picks filled with simulation favorites', 'success');
    });
  }

  // btn-picks-random: Random bracket
  const randomBtn = document.getElementById('btn-picks-random');
  if (randomBtn) {
    randomBtn.addEventListener('click', () => {
      regions.forEach(region => {
        seedMatchups.forEach(([s1, s2], idx) => {
          const matchupKey = region + '-r64-' + idx;
          const t1 = rawResults.find(t => (t.region || '').toLowerCase() === region && t.seed === s1);
          const t2 = rawResults.find(t => (t.region || '').toLowerCase() === region && t.seed === s2);
          if (t1 && t2) {
            pickSelections[matchupKey] = Math.random() > 0.5 ? t1.teamId : t2.teamId;
          } else if (t1) {
            pickSelections[matchupKey] = t1.teamId;
          } else if (t2) {
            pickSelections[matchupKey] = t2.teamId;
          }
        });
      });
      initPickSheet();
      trackEvent('picks_autofill', { strategy: 'random' });
      showToast('Random bracket generated', 'success');
    });
  }

  // btn-picks-reset: Reset all picks
  const resetBtn = document.getElementById('btn-picks-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      pickSelections = {};
      initPickSheet();
      showToast('All picks cleared', 'info');
    });
  }

  // btn-picks-export: Export picks to clipboard
  const exportBtn = document.getElementById('btn-picks-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      var lines = ['MadnessEngine Picks:'];
      regions.forEach(region => {
        var regionPicks = [];
        seedMatchups.forEach(([s1, s2], idx) => {
          var matchupKey = region + '-r64-' + idx;
          var pickedId = pickSelections[matchupKey];
          if (pickedId) {
            var team = rawResults.find(t => t.teamId === pickedId);
            if (team) regionPicks.push('(' + team.seed + ') ' + team.teamName);
          }
        });
        lines.push(capitalize(region) + ': ' + (regionPicks.length > 0 ? regionPicks.join(', ') : 'No picks'));
      });
      var text = lines.join('\n');
      navigator.clipboard.writeText(text).then(function() {
        trackEvent('picks_export', { count: Object.keys(pickSelections).length });
        showToast('Picks copied to clipboard', 'success');
      }).catch(function() {
        showToast('Failed to copy picks', 'warning');
      });
    });
  }
}

function calculatePickScore() {
  if (!lastData || !lastData.rawResults) return;

  const resultContainer = document.getElementById('pick-score-result');
  if (!resultContainer) return;

  const picks = Object.values(pickSelections);
  if (picks.length === 0) {
    resultContainer.innerHTML = '<p style="color:var(--text-tertiary)">Make some picks first!</p>';
    return;
  }

  let totalScore = 0;
  let totalPicks = picks.length;
  let upsetPicks = 0;

  picks.forEach(teamId => {
    const team = lastData.rawResults.find(t => t.teamId === teamId);
    if (team) {
      // Score based on how good the pick is according to simulation
      const r32Prob = team.roundProbabilities ? (team.roundProbabilities['round-of-32'] || 0) : 0;
      totalScore += r32Prob * 100;

      if (team.seed >= 9) upsetPicks++;
    }
  });

  const avgConfidence = totalPicks > 0 ? (totalScore / totalPicks).toFixed(1) : 0;
  const grade = avgConfidence >= 80 ? 'A' :
                avgConfidence >= 65 ? 'B' :
                avgConfidence >= 50 ? 'C' :
                avgConfidence >= 35 ? 'D' : 'F';

  resultContainer.innerHTML = `
    <div class="pick-score-card">
      <div class="pick-score-grade">${grade}</div>
      <div class="pick-score-details">
        <div><strong>Picks Made:</strong> ${totalPicks} / 32</div>
        <div><strong>Average Confidence:</strong> ${avgConfidence}%</div>
        <div><strong>Upset Picks:</strong> ${upsetPicks}</div>
      </div>
    </div>
  `;
}


// ═══════════════════════════════════════════════════════
// SECTION 12: NOTIFICATIONS
// ═══════════════════════════════════════════════════════

function showToast(message, type) {
  type = type || 'info';
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    info: 'i',
    success: '\u2713',
    warning: '!',
    upset: '\u26A0',
  };

  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] || 'i'}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close">&times;</button>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  // Close button
  toast.querySelector('.toast-close').addEventListener('click', () => {
    dismissToast(toast);
  });

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    dismissToast(toast);
  }, 5000);
}

function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.remove('toast-visible');
  toast.classList.add('toast-hiding');
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 300);
}


// ═══════════════════════════════════════════════════════
// SECTION 13: WEBSOCKET
// ═══════════════════════════════════════════════════════

let wsRetries = 0;
const WS_MAX_RETRIES = 10;

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let ws;

  try {
    ws = new WebSocket(`${protocol}//${location.host}`);
  } catch (e) {
    console.warn('WebSocket connection failed:', e);
    return;
  }

  ws.onopen = () => {
    wsRetries = 0; // Reset backoff on successful connection
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'simulation-update') {
        lastData = data.payload;
        renderDashboard(data.payload);
        showToast('Simulation updated via live feed', 'info');
      }
      if (data.type === 'live-games-update') {
        renderLiveGames(data.payload);
        if (data.payload && data.payload.games) {
          const games = Array.isArray(data.payload.games) ? data.payload.games : Object.values(data.payload.games || {});
          games.forEach(game => {
            if (game.status === 'final' && game.upset) {
              showToast(`Upset alert: ${game.awayTeamId} defeats ${game.homeTeamId}!`, 'upset');
            }
          });
        }
      }
    } catch (e) {
      console.error('WebSocket parse error:', e);
    }
  };

  ws.onclose = () => {
    if (wsRetries < WS_MAX_RETRIES) {
      const delay = Math.min(5000 * Math.pow(2, wsRetries), 60000);
      wsRetries++;
      setTimeout(connectWebSocket, delay);
    }
  };

  ws.onerror = () => {
    ws.close();
  };
}

function renderLiveGames(payload) {
  const container = document.getElementById('live-games');
  if (!container) return;

  const games = payload.games;
  const gameList = Array.isArray(games) ? games : Object.values(games || {});

  if (!gameList || gameList.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  const grid = container.querySelector('.live-games-grid') || container;

  grid.innerHTML = gameList.map(game => {
    const timeDisplay = formatGameTime(game.period, game.timeRemainingSeconds, game.status);
    const isLive = game.status === 'in-progress' || game.status === 'halftime';
    const isFinal = game.status === 'final';

    return `
      <div class="live-game-card ${isFinal ? 'game-final' : ''} ${isLive ? 'game-live' : ''}">
        <div class="live-game-header">
          ${isLive ? '<span class="live-pulse"></span>' : ''}
          <span class="live-game-time">${timeDisplay}</span>
        </div>
        <div class="live-game-teams">
          <div class="live-team ${game.homeScore > game.awayScore ? 'winning' : ''}">
            <span class="live-team-name">${game.homeTeamId}</span>
            <span class="live-team-score">${game.homeScore}</span>
          </div>
          <div class="live-team ${game.awayScore > game.homeScore ? 'winning' : ''}">
            <span class="live-team-name">${game.awayTeamId}</span>
            <span class="live-team-score">${game.awayScore}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}


// ─── Table View Toggle (Top 25 / All 68) ───────────────

function setupTableViewToggle() {
  var buttons = document.querySelectorAll('.table-view-btn');
  buttons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      // Toggle active class
      buttons.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');

      var rowLimit = parseInt(btn.dataset.rows) || 68;
      var tbody = document.getElementById('champ-tbody');
      if (!tbody) return;

      var rows = tbody.querySelectorAll('tr');
      rows.forEach(function(row, idx) {
        if (rowLimit === 68) {
          row.style.display = '';
        } else {
          row.style.display = idx < rowLimit ? '' : 'none';
        }
      });
    });
  });
}

// ═══════════════════════════════════════════════════════
// SECTION 14: UTILITIES
// ═══════════════════════════════════════════════════════

function formatPct(value) {
  if (typeof value === 'string') return value;
  if (value >= 0.995) return '>99%';
  if (value < 0.001) return '<0.1%';
  return (value * 100).toFixed(1) + '%';
}

function probColor(pctStr) {
  const val = parseFloat(pctStr);
  if (isNaN(val)) return '';
  if (val >= 20) return 'prob-high';
  if (val >= 5) return 'prob-mid';
  return 'prob-low';
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function formatGameTime(period, timeRemainingSeconds, status) {
  if (status === 'final') return 'FINAL';
  if (status === 'halftime') return 'HALFTIME';
  if (status === 'pre-game') return 'PRE-GAME';

  const minutes = Math.floor((timeRemainingSeconds || 0) / 60);
  const seconds = (timeRemainingSeconds || 0) % 60;
  const periodLabel = period <= 2 ? (period === 1 ? '1st' : '2nd') : `OT${period - 2}`;
  return `${periodLabel} ${minutes}:${String(seconds).padStart(2, '0')}`;
}

function debounce(fn, ms) {
  let timer;
  return function () {
    const context = this;
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(context, args), ms);
  };
}

function setTextContent(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}


// ═══════════════════════════════════════════════════════
// SECTION 15: CHART.JS HELPERS
// ═══════════════════════════════════════════════════════

function createH2HChart(ctx, team1Data, team2Data, labels) {
  destroyChart(h2hChart);

  h2hChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: team1Data.name,
          data: team1Data.values,
          backgroundColor: team1Data.color + '99',
          borderColor: team1Data.color,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: team2Data.name,
          data: team2Data.values,
          backgroundColor: team2Data.color + '99',
          borderColor: team2Data.color,
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 12 },
          },
        },
        tooltip: {
          backgroundColor: '#1a2035',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(148, 163, 184, 0.15)',
          borderWidth: 1,
          callbacks: {
            label: function (context) {
              return context.dataset.label + ': ' + context.parsed.y.toFixed(1) + '%';
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { size: 11 } },
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: '#64748b',
            font: { size: 11 },
            callback: function (value) { return value + '%'; },
          },
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
        },
      },
    },
  });
}

function createTeamRadarChart(ctx, team) {
  destroyChart(radarChart);

  // Normalize metrics to 0-100 scale for radar
  const m = team.metrics || {};
  const metrics = {
    'Offense': m.adjOffensiveEfficiency || 0,
    'Defense': 130 - (m.adjDefensiveEfficiency || 100),  // invert: lower DE is better
    'Tempo': m.adjTempo || 0,
    'SOS': (m.strengthOfSchedule || 0) * 10,
    'eFG%': (m.effectiveFGPct || 0) * 100,
    'Experience': (m.experienceRating || 0) * 10,
  };

  // Find max values for normalization
  const maxVal = Math.max(...Object.values(metrics), 1);
  const normalizedValues = Object.values(metrics).map(v => (v / maxVal) * 100);

  const regionColor = REGION_COLORS[team.region] || '#3b82f6';

  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: Object.keys(metrics),
      datasets: [{
        label: team.name,
        data: normalizedValues,
        backgroundColor: regionColor + '33',
        borderColor: regionColor,
        borderWidth: 2,
        pointBackgroundColor: regionColor,
        pointBorderColor: '#1a2035',
        pointBorderWidth: 2,
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: {
            display: false,
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.12)',
          },
          angleLines: {
            color: 'rgba(148, 163, 184, 0.12)',
          },
          pointLabels: {
            color: '#94a3b8',
            font: { size: 11, family: 'Inter' },
          },
        },
      },
    },
  });
}

function destroyChart(chart) {
  if (chart && typeof chart.destroy === 'function') {
    chart.destroy();
  }
}


// ═══════════════════════════════════════════════════════
// SECTION 16: DYNAMIC VIEW INJECTION
// ═══════════════════════════════════════════════════════
// Since the HTML may only have the dashboard view, we inject
// the additional views and navigation dynamically.

function injectAdditionalViews() {
  // Add toast container if not present
  if (!document.getElementById('toast-container')) {
    const toastDiv = document.createElement('div');
    toastDiv.id = 'toast-container';
    toastDiv.className = 'toast-container';
    document.body.appendChild(toastDiv);
  }

  // Inject dynamic styles for features not covered by styles.css
  injectDynamicStyles();
}


function injectDynamicStyles() {
  if (document.getElementById('dynamic-app-styles')) return;

  const style = document.createElement('style');
  style.id = 'dynamic-app-styles';
  style.textContent = `
    /* ── View Content ── */
    .view-content {
      max-width: 1600px;
      margin: 0 auto;
      padding: 1.5rem 2rem 3rem;
    }

    /* ── Search Input ── */
    .search-input {
      padding: 0.45rem 1rem;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 0.85rem;
      font-family: 'Inter', sans-serif;
      outline: none;
      transition: border-color 0.2s;
      min-width: 220px;
    }

    .search-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    .search-input::placeholder { color: var(--text-muted); }

    /* ── Table Sort Indicators ── */
    .data-table th.sort-asc::after { content: ' \\2191'; color: var(--accent-bright); }
    .data-table th.sort-desc::after { content: ' \\2193'; color: var(--accent-bright); }

    /* ── Teams Layout ── */
    .teams-layout {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 1.5rem;
    }

    .teams-table-card { overflow: hidden; }

    @media (max-width: 1100px) {
      .teams-layout { grid-template-columns: 1fr; }
    }

    /* ── Team Detail Panel ── */
    .team-detail-panel {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      position: sticky;
      top: calc(var(--nav-height) + var(--mode-bar-height) + 1.5rem);
      max-height: calc(100vh - var(--nav-height) - var(--mode-bar-height) - 3rem);
      overflow-y: auto;
    }

    .team-detail-header {
      padding: 1.5rem;
      border-bottom: 1px solid var(--border);
      position: relative;
    }

    .team-detail-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--text-tertiary);
      line-height: 1;
    }

    .team-detail-close:hover { color: var(--text-primary); }

    .team-detail-seed {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
    }

    .team-detail-name {
      font-size: 1.3rem;
      font-weight: 800;
      margin-bottom: 0.5rem;
    }

    .team-detail-meta {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .team-detail-stats { padding: 1rem 1.5rem; }

    .team-stat-row {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.85rem;
    }

    .team-stat-label { color: var(--text-secondary); }

    .team-stat-value {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      color: var(--text-primary);
    }

    .team-detail-chart { padding: 1rem 1.5rem; }

    /* ── H2H ── */
    .h2h-select {
      padding: 0.5rem 1rem;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 0.85rem;
      font-family: 'Inter', sans-serif;
      outline: none;
      min-width: 220px;
      cursor: pointer;
    }

    .h2h-select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    .h2h-select option {
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .h2h-stats-comparison {
      margin-bottom: 1.5rem;
    }

    .h2h-header-row {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 1rem;
      padding: 0.75rem 0;
      border-bottom: 2px solid var(--border-light);
      margin-bottom: 0.5rem;
    }

    .h2h-team-label {
      font-size: 1.1rem;
      font-weight: 800;
    }

    .h2h-team-label:last-child { text-align: right; }

    .h2h-stat-label {
      color: var(--text-tertiary);
      font-weight: 600;
      font-size: 0.85rem;
      text-align: center;
    }

    .h2h-stat-row {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 1rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border);
      align-items: center;
    }

    .h2h-stat-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .h2h-stat-val:last-child { text-align: right; }

    .h2h-better { font-weight: 800; }

    .h2h-stat-name {
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-tertiary);
      font-weight: 500;
    }

    .h2h-chart-container {
      height: 300px;
      margin: 1.5rem 0;
      position: relative;
    }

    .h2h-mode-table {
      margin-top: 1.5rem;
    }

    .h2h-mode-table h4 {
      font-size: 0.9rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
    }

    /* ── Pick Sheet ── */
    .pick-sheet-container {
      padding: 0;
    }

    .pick-sheet-instructions {
      padding: 0.75rem 0;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .pick-regions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
    }

    @media (max-width: 900px) {
      .pick-regions { grid-template-columns: 1fr; }
    }

    .pick-region {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem;
    }

    .pick-region-title {
      font-size: 0.95rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .pick-matchups {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .pick-matchup {
      display: flex;
      flex-direction: column;
      gap: 1px;
      background: var(--border);
      border-radius: 6px;
      overflow: hidden;
    }

    .pick-team {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.45rem 0.75rem;
      background: var(--bg-card);
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.15s;
    }

    .pick-team:hover { background: var(--bg-card-hover); }

    .pick-team.pick-selected {
      background: rgba(34, 197, 94, 0.12);
      border-left: 3px solid #22c55e;
    }

    .pick-team.pick-selected .pick-name {
      font-weight: 700;
      color: #22c55e;
    }

    .pick-seed {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-tertiary);
      min-width: 18px;
    }

    .pick-name {
      font-weight: 500;
      color: var(--text-primary);
    }

    .pick-score-section { text-align: center; padding: 1rem 0; }

    .pick-score-card {
      display: inline-flex;
      align-items: center;
      gap: 1.5rem;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem 2rem;
    }

    .pick-score-grade {
      font-size: 3rem;
      font-weight: 900;
      font-family: 'JetBrains Mono', monospace;
      background: linear-gradient(135deg, var(--accent-bright), #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .pick-score-details {
      text-align: left;
      font-size: 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      color: var(--text-secondary);
    }

    /* ── Compare Enhancements ── */
    .compare-ff {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border);
    }

    .compare-ff-label {
      font-size: 0.7rem;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 0.4rem;
    }

    .compare-ff-team {
      font-size: 0.82rem;
      padding: 0.15rem 0;
      color: var(--text-secondary);
    }

    .compare-ff-seed {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-right: 0.25rem;
    }

    .compare-top-teams {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border);
    }

    .compare-top-team {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      padding: 0.2rem 0;
    }

    .compare-top-rank {
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      min-width: 18px;
    }

    .compare-top-name { flex: 1; color: var(--text-secondary); }

    .compare-top-prob {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      color: var(--accent-bright);
      font-weight: 600;
    }

    /* ── Category Filter Buttons ── */
    .category-filters {
      display: flex;
      gap: 0.25rem;
      margin-right: 1rem;
    }

    .category-filter-btn {
      padding: 0.3rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-family: 'Inter', sans-serif;
    }

    .category-filter-btn:hover { border-color: var(--border-light); color: var(--text-primary); }

    .category-filter-btn.active {
      background: var(--accent-dim);
      border-color: var(--accent);
      color: white;
    }

    /* ── Responsive Overrides ── */
    @media (max-width: 768px) {
      .nav-tabs { display: none; }
      .bk-grid { flex-direction: column; min-width: 0; }
      .bk-center { order: -1; }
      .teams-layout { grid-template-columns: 1fr; }
      .h2h-controls { flex-direction: column; }
      .h2h-select { min-width: 100%; }
      .pick-regions { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);
}

// ─── Feedback Panel ──────────────────────────────────
function setupFeedbackPanel() {
  const fab = document.getElementById('feedback-fab');
  const panel = document.getElementById('feedback-panel');
  const closeBtn = document.getElementById('feedback-close');
  const sendBtn = document.getElementById('feedback-send');
  const textarea = document.getElementById('feedback-message');
  let feedbackType = 'bug';

  if (!fab || !panel) return;

  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
    trackEvent('feedback_open');
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => panel.classList.remove('open'));
  }

  // Type toggle buttons
  document.querySelectorAll('.feedback-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.feedback-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      feedbackType = btn.dataset.type;
    });
  });

  // Send feedback to server
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      const message = textarea ? textarea.value.trim() : '';
      if (!message) {
        showToast('Please enter a message', 'warning');
        return;
      }

      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';

      try {
        const res = await fetch(API_BASE + '/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: feedbackType,
            message: message,
            mode: currentMode || null,
            view: currentView,
            userAgent: navigator.userAgent
          })
        });

        if (res.ok) {
          trackEvent('feedback_send', { type: feedbackType });
          if (textarea) textarea.value = '';
          panel.classList.remove('open');
          showToast('Feedback submitted — thank you!', 'success');
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(err.error || 'Failed to send feedback', 'warning');
        }
      } catch (e) {
        showToast('Failed to send feedback — please try again', 'warning');
      } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Send Feedback';
      }
    });
  }

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
      panel.classList.remove('open');
    }
  });
}

// ─── Mode Explainer ──────────────────────────────────
function setupModeExplainer() {
  const infoBtn = document.getElementById('mode-info-btn');
  const overlay = document.getElementById('mode-explainer-overlay');
  const closeBtn = document.getElementById('explainer-close');

  if (!infoBtn || !overlay) return;

  infoBtn.addEventListener('click', () => {
    renderModeExplainer();
    overlay.classList.add('open');
    trackEvent('mode_explainer_open');
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => overlay.classList.remove('open'));
  }

  // Close on overlay background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      overlay.classList.remove('open');
    }
  });
}

function renderModeExplainer() {
  const body = document.getElementById('explainer-body');
  if (!body || !modes.length) return;

  const categoryOrder = { research: 1, hybrid: 2, entertainment: 3 };
  const sorted = [...modes].sort((a, b) => {
    const ca = categoryOrder[a.category] || 99;
    const cb = categoryOrder[b.category] || 99;
    return ca - cb || a.name.localeCompare(b.name);
  });

  // Group by category
  const groups = {};
  sorted.forEach(m => {
    if (!groups[m.category]) groups[m.category] = [];
    groups[m.category].push(m);
  });

  const categoryLabels = {
    research: 'Research-Grade',
    hybrid: 'Hybrid Models',
    entertainment: 'Entertainment / Fun'
  };

  const categoryDescriptions = {
    research: 'Built on real basketball analytics — efficiency ratings, tempo, strength of schedule, and advanced stats. These produce the most accurate predictions.',
    hybrid: 'Blend real stats with specific factors like coaching, momentum, or fatigue. These highlight particular aspects of the game that can swing outcomes.',
    entertainment: 'Pure fun — mascot fights, chaos theory, and more. Not meant for serious predictions, but they make March Madness even more entertaining.'
  };

  let html = '';

  Object.keys(categoryLabels).forEach(cat => {
    const group = groups[cat];
    if (!group || !group.length) return;

    html += '<div style="margin-bottom:1.5rem;">';
    html += '<h4 style="color:var(--text-primary);font-size:0.9rem;margin:0 0 0.25rem;">' + categoryLabels[cat] + ' <span style="color:var(--text-tertiary);font-weight:400;">(' + group.length + ' modes)</span></h4>';
    html += '<p style="color:var(--text-tertiary);font-size:0.78rem;margin:0 0 0.75rem;line-height:1.4;">' + categoryDescriptions[cat] + '</p>';
    html += '<div class="explainer-grid">';

    group.forEach(mode => {
      var isActive = mode.id === currentMode;
      var dotColor = CATEGORY_COLORS[mode.category] || '#666';
      html += '<div class="explainer-card' + (isActive ? ' active-mode' : '') + '" data-mode-id="' + mode.id + '">';
      html += '<div class="explainer-card-header">';
      html += '<span class="explainer-card-dot" style="background:' + dotColor + '"></span>';
      html += '<span class="explainer-card-name">' + mode.name + '</span>';
      html += '<span class="explainer-card-badge badge-' + mode.category + '">' + mode.category + '</span>';
      html += '</div>';
      html += '<div class="explainer-card-desc">' + mode.description + '</div>';
      html += '<div class="explainer-card-confidence">Confidence: ' + mode.confidenceTag.replace(/-/g, ' ') + '</div>';
      if (isActive) {
        html += '<div style="margin-top:0.35rem;font-size:0.7rem;color:var(--accent-bright);font-weight:600;">CURRENTLY ACTIVE</div>';
      }
      html += '</div>';
    });

    html += '</div></div>';
  });

  body.innerHTML = html;

  // Make cards clickable to switch modes
  body.querySelectorAll('.explainer-card').forEach(card => {
    card.addEventListener('click', () => {
      var modeId = card.dataset.modeId;
      if (modeId) {
        selectMode(modeId);
        document.getElementById('mode-explainer-overlay').classList.remove('open');
        showToast('Switched to ' + (modes.find(m => m.id === modeId)?.name || modeId), 'success');
      }
    });
  });
}


// ═══════════════════════════════════════════════════════
// SECTION 17: BRACKET CHALLENGE
// ═══════════════════════════════════════════════════════

function setupChallenge() {
  const submitBtn = document.getElementById('btn-submit-challenge');
  if (!submitBtn) return;

  submitBtn.addEventListener('click', async () => {
    const nameInput = document.getElementById('challenge-name');
    const statusEl = document.getElementById('challenge-status');
    const displayName = nameInput ? nameInput.value.trim() : '';

    if (!displayName) {
      showToast('Please enter a display name', 'warning');
      if (nameInput) nameInput.focus();
      return;
    }

    const picks = Object.assign({}, pickSelections);
    if (Object.keys(picks).length === 0) {
      showToast('Make some picks on the Pick Sheet tab first', 'warning');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      const res = await fetch(API_BASE + '/api/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName,
          picks: picks,
          tournamentType: currentType,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        trackEvent('challenge_submit', { picks: Object.keys(picks).length });
        if (statusEl) statusEl.textContent = 'Bracket saved! ID: ' + data.id;
        showToast('Bracket submitted to the leaderboard!', 'success');
        loadLeaderboard();
      } else {
        const err = await res.json().catch(function() { return {}; });
        showToast(err.error || 'Failed to submit bracket', 'warning');
      }
    } catch (e) {
      showToast('Failed to submit bracket', 'warning');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit My Bracket';
    }
  });
}

async function loadLeaderboard() {
  const tbody = document.getElementById('leaderboard-tbody');
  if (!tbody) return;

  try {
    const res = await fetch(API_BASE + '/api/leaderboard/' + currentType);
    if (!res.ok) return;
    const entries = await res.json();

    if (!entries || entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:2rem;">No entries yet. Be the first to submit your bracket!</td></tr>';
      return;
    }

    tbody.innerHTML = entries.map(function(entry, idx) {
      var rank = idx + 1;
      var medal = rank === 1 ? ' style="color:#fbbf24;font-weight:800;"' : rank === 2 ? ' style="color:#94a3b8;font-weight:700;"' : rank === 3 ? ' style="color:#cd7f32;font-weight:700;"' : '';
      var scoreDisplay = entry.score !== null ? entry.score.toFixed(1) + '%' : '--';
      var dateStr = new Date(entry.createdAt).toLocaleDateString();
      return '<tr>' +
        '<td' + medal + '>' + rank + '</td>' +
        '<td style="font-weight:600;">' + entry.displayName + '</td>' +
        '<td style="font-family:JetBrains Mono,monospace;font-weight:600;">' + scoreDisplay + '</td>' +
        '<td>' + entry.correctPicks + '</td>' +
        '<td>' + entry.totalPicks + '</td>' +
        '<td style="color:var(--text-tertiary);font-size:0.8rem;">' + dateStr + '</td>' +
        '</tr>';
    }).join('');
  } catch (e) {
    // silently fail
  }
}


// ═══════════════════════════════════════════════════════
// SECTION 18: ACCURACY TRACKING
// ═══════════════════════════════════════════════════════

async function loadAccuracy() {
  var cardsEl = document.getElementById('accuracy-cards');
  var emptyEl = document.getElementById('accuracy-empty');
  if (!cardsEl) return;

  try {
    var res = await fetch(API_BASE + '/api/accuracy/' + currentType);
    if (!res.ok) return;
    var data = await res.json();

    // Filter to modes that have predictions
    var withData = data.filter(function(m) { return m.totalPredictions > 0; });

    if (withData.length === 0) {
      cardsEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    // Sort by Brier score (lower is better)
    withData.sort(function(a, b) { return a.brierScore - b.brierScore; });

    cardsEl.innerHTML = withData.map(function(mode, idx) {
      var rank = idx + 1;
      var brierColor = mode.brierScore < 0.2 ? '#22c55e' : mode.brierScore < 0.25 ? '#f59e0b' : '#ef4444';
      var categoryColor = CATEGORY_COLORS[mode.category] || '#666';

      // Build mini calibration chart (simple bar representation)
      var bucketBars = '';
      if (mode.buckets && mode.buckets.length > 0) {
        bucketBars = '<div style="display:flex;gap:2px;height:32px;align-items:flex-end;margin-top:0.5rem;">';
        mode.buckets.forEach(function(b) {
          if (b.count === 0) {
            bucketBars += '<div style="flex:1;background:var(--border);border-radius:2px;min-height:2px;"></div>';
          } else {
            var height = Math.max(4, b.actualWinRate * 32);
            var barColor = Math.abs(b.actualWinRate - b.predictedMean) < 0.1 ? '#22c55e' : '#f59e0b';
            bucketBars += '<div style="flex:1;background:' + barColor + ';border-radius:2px;height:' + height + 'px;" title="Predicted: ' + (b.predictedMean * 100).toFixed(0) + '% Actual: ' + (b.actualWinRate * 100).toFixed(0) + '%"></div>';
          }
        });
        bucketBars += '</div>';
      }

      return '<div class="card" style="padding:1.25rem;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">' +
          '<div>' +
            '<span style="font-size:0.7rem;color:var(--text-tertiary);font-weight:600;margin-right:0.5rem;">#' + rank + '</span>' +
            '<span style="font-weight:700;font-size:0.95rem;">' + mode.modeName + '</span>' +
          '</div>' +
          '<span style="font-size:0.68rem;padding:0.2rem 0.5rem;border-radius:4px;background:' + categoryColor + '22;color:' + categoryColor + ';font-weight:600;">' + mode.category + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;margin-bottom:0.5rem;">' +
          '<div>' +
            '<div style="font-size:0.68rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.04em;">Brier Score</div>' +
            '<div style="font-family:JetBrains Mono,monospace;font-size:1.1rem;font-weight:700;color:' + brierColor + ';">' + mode.brierScore.toFixed(4) + '</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:0.68rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.04em;">Log Loss</div>' +
            '<div style="font-family:JetBrains Mono,monospace;font-size:1.1rem;font-weight:700;">' + mode.logLoss.toFixed(4) + '</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:0.68rem;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.04em;">Predictions</div>' +
            '<div style="font-family:JetBrains Mono,monospace;font-size:1.1rem;font-weight:700;">' + mode.totalPredictions + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-tertiary);">Calibration (predicted vs actual)</div>' +
        bucketBars +
      '</div>';
    }).join('');

  } catch (e) {
    // silently fail
  }
}


// ═══════════════════════════════════════════════════════
// SECTION 18: TEAM COMPARISON OVERLAY
// ═══════════════════════════════════════════════════════

var compareSelectedTeams = [];

function setupTeamCompare() {
  var goBtn = document.getElementById('compare-bar-go');
  var clearBtn = document.getElementById('compare-bar-clear');
  var closeBtn = document.getElementById('compare-overlay-close');
  var overlay = document.getElementById('compare-overlay');

  if (goBtn) {
    goBtn.addEventListener('click', function() {
      if (compareSelectedTeams.length >= 2) {
        openCompareOverlay();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      clearCompareSelection();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      if (overlay) overlay.classList.remove('open');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  }
}

function toggleTeamCompare(teamId) {
  var idx = compareSelectedTeams.indexOf(teamId);
  if (idx >= 0) {
    compareSelectedTeams.splice(idx, 1);
  } else {
    if (compareSelectedTeams.length >= 4) {
      showToast('Maximum 4 teams for comparison', 'warning');
      return;
    }
    compareSelectedTeams.push(teamId);
  }
  updateCompareBar();
  updateCompareHighlights();
  trackEvent('team_compare_toggle', { teamId: teamId, count: compareSelectedTeams.length });
}

function clearCompareSelection() {
  compareSelectedTeams = [];
  updateCompareBar();
  updateCompareHighlights();
}

function updateCompareBar() {
  var bar = document.getElementById('compare-bar');
  var teamsContainer = document.getElementById('compare-bar-teams');
  var countEl = document.getElementById('compare-bar-count');
  var goBtn = document.getElementById('compare-bar-go');

  if (!bar || !teamsContainer) return;

  var count = compareSelectedTeams.length;

  // Show/hide bar
  if (count > 0) {
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }

  // Update count
  if (countEl) countEl.textContent = count + ' selected';

  // Enable/disable compare button
  if (goBtn) goBtn.disabled = count < 2;

  // Render chips
  if (count === 0) {
    teamsContainer.innerHTML = '<span class="compare-bar-hint">Click teams to compare (2-4)</span>';
    return;
  }

  var html = '';
  for (var i = 0; i < compareSelectedTeams.length; i++) {
    var tid = compareSelectedTeams[i];
    var team = allTeams.find(function(t) { return t.id === tid; });
    if (!team) continue;
    var regionColor = REGION_COLORS[(team.region || '').toLowerCase()] || '#666';
    html += '<div class="compare-bar-chip" style="border-left: 3px solid ' + regionColor + ';">' +
      '<span class="compare-bar-chip-seed">' + team.seed + '</span>' +
      '<span>' + (team.shortName || team.name) + '</span>' +
      '<button class="compare-bar-chip-remove" data-team-id="' + tid + '">&times;</button>' +
    '</div>';
  }
  teamsContainer.innerHTML = html;

  // Attach remove handlers
  teamsContainer.querySelectorAll('.compare-bar-chip-remove').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleTeamCompare(btn.dataset.teamId);
    });
  });
}

function updateCompareHighlights() {
  // Highlight selected rows in data tables
  document.querySelectorAll('.data-table tbody tr[data-team-id]').forEach(function(tr) {
    var tid = tr.dataset.teamId;
    if (compareSelectedTeams.indexOf(tid) >= 0) {
      tr.classList.add('compare-selected');
    } else {
      tr.classList.remove('compare-selected');
    }
  });
}

function openCompareOverlay() {
  var overlay = document.getElementById('compare-overlay');
  var body = document.getElementById('compare-overlay-body');
  if (!overlay || !body) return;

  trackEvent('team_compare_open', { teams: compareSelectedTeams.slice() });

  // Gather team data
  var teams = [];
  for (var i = 0; i < compareSelectedTeams.length; i++) {
    var tid = compareSelectedTeams[i];
    var team = allTeams.find(function(t) { return t.id === tid; });
    if (!team) continue;

    var sim = null;
    if (lastData && lastData.rawResults) {
      for (var j = 0; j < lastData.rawResults.length; j++) {
        if (lastData.rawResults[j].teamId === tid) {
          sim = lastData.rawResults[j];
          break;
        }
      }
    }
    teams.push({ team: team, sim: sim });
  }

  if (teams.length < 2) return;

  var gridClass = 'cmp-grid cmp-grid-' + teams.length;

  // Helper to format values
  function fv(val, dec, mult, suf) {
    if (val == null) return '--';
    var v = mult ? val * mult : val;
    return v.toFixed(dec != null ? dec : 1) + (suf || '');
  }

  // Define comparison metrics
  var metrics = [
    { key: 'adjOffensiveEfficiency', label: 'Adj. Off. Eff.', dec: 1, higher: true },
    { key: 'adjDefensiveEfficiency', label: 'Adj. Def. Eff.', dec: 1, higher: false },
    { key: 'adjTempo', label: 'Tempo', dec: 1, higher: null },
    { key: 'strengthOfSchedule', label: 'SOS', dec: 3, higher: true },
    { key: 'effectiveFGPct', label: 'eFG%', dec: 1, mult: 100, suf: '%', higher: true },
    { key: 'turnoverPct', label: 'TO%', dec: 1, mult: 100, suf: '%', higher: false },
    { key: 'offensiveReboundPct', label: 'OR%', dec: 1, mult: 100, suf: '%', higher: true },
    { key: 'defensiveReboundPct', label: 'DR%', dec: 1, mult: 100, suf: '%', higher: true },
    { key: 'freeThrowRate', label: 'FT Rate', dec: 1, mult: 100, suf: '%', higher: true },
    { key: 'threePointPct', label: '3P%', dec: 1, mult: 100, suf: '%', higher: true },
    { key: 'stealPct', label: 'Steal%', dec: 1, mult: 100, suf: '%', higher: true }
  ];

  // Probability rounds
  var probRounds = [
    { key: 'round-of-32', label: 'R32' },
    { key: 'sweet-sixteen', label: 'S16' },
    { key: 'elite-eight', label: 'E8' },
    { key: 'final-four', label: 'FF' },
    { key: 'championship', label: 'Champ' }
  ];

  // ── Build Team Columns ──
  var columnsHtml = '<div class="' + gridClass + '">';

  for (var ti = 0; ti < teams.length; ti++) {
    var t = teams[ti].team;
    var s = teams[ti].sim;
    var m = t.metrics || {};
    var rc = REGION_COLORS[(t.region || '').toLowerCase()] || '#666';
    var record = m.wins != null ? m.wins + '-' + (m.losses || 0) : '--';

    columnsHtml += '<div class="cmp-team-col" style="border-top: 3px solid ' + rc + ';">';

    // Header
    columnsHtml += '<div class="cmp-team-header">' +
      teamBadge(t.id, 36) +
      '<div class="cmp-team-name">' + t.name + '</div>' +
      '<div class="cmp-team-meta">' +
        '<span class="seed-badge seed-' + (t.seed <= 4 ? t.seed : '') + '">' + t.seed + '</span>' +
        '<span class="region-tag region-' + (t.region || '') + '">' + capitalize(t.region) + '</span>' +
        '<span>' + record + '</span>' +
      '</div>' +
    '</div>';

    // Probability Section
    columnsHtml += '<div class="cmp-section">' +
      '<div class="cmp-section-title">Tournament Probability</div>';

    for (var pi = 0; pi < probRounds.length; pi++) {
      var pr = probRounds[pi];
      var pct = 0;
      if (s) {
        if (pr.key === 'championship') {
          pct = (s.championshipProbability || 0) * 100;
        } else if (s.roundProbabilities) {
          pct = (s.roundProbabilities[pr.key] || 0) * 100;
        }
      }
      columnsHtml += '<div class="cmp-prob-row">' +
        '<span class="cmp-prob-label">' + pr.label + '</span>' +
        '<div class="cmp-prob-bar-bg"><div class="cmp-prob-bar" style="width:' + Math.min(pct, 100) + '%;background:' + rc + ';"></div></div>' +
        '<span class="cmp-prob-pct">' + pct.toFixed(1) + '%</span>' +
      '</div>';
    }

    // Expected Wins
    if (s) {
      columnsHtml += '<div class="cmp-stat-row" style="margin-top:0.5rem;">' +
        '<span class="cmp-stat-label">E[Wins]</span>' +
        '<span class="cmp-stat-value">' + s.expectedWins.toFixed(2) + '</span>' +
      '</div>';
    }

    columnsHtml += '</div>';

    // Advanced Stats Section
    columnsHtml += '<div class="cmp-section">' +
      '<div class="cmp-section-title">Advanced Metrics</div>';

    for (var mi = 0; mi < metrics.length; mi++) {
      var met = metrics[mi];
      var val = m[met.key];
      columnsHtml += '<div class="cmp-stat-row">' +
        '<span class="cmp-stat-label">' + met.label + '</span>' +
        '<span class="cmp-stat-value" data-metric="' + met.key + '" data-raw="' + (val != null ? val : '') + '">' +
          fv(val, met.dec, met.mult, met.suf) +
        '</span>' +
      '</div>';
    }

    // Coaching info if available
    var cp = t.coachingProfile;
    if (cp) {
      columnsHtml += '<div class="cmp-stat-row" style="margin-top:0.5rem;border-top:1px solid var(--border);padding-top:0.35rem;">' +
        '<span class="cmp-stat-label">Coach</span>' +
        '<span class="cmp-stat-value" style="font-family:inherit;font-size:0.78rem;">' + (cp.name || '--') + '</span>' +
      '</div>' +
      '<div class="cmp-stat-row">' +
        '<span class="cmp-stat-label">Tourney Record</span>' +
        '<span class="cmp-stat-value">' + (cp.tournamentWins || 0) + '-' + (cp.tournamentLosses || 0) + '</span>' +
      '</div>' +
      '<div class="cmp-stat-row">' +
        '<span class="cmp-stat-label">Final Fours</span>' +
        '<span class="cmp-stat-value">' + (cp.finalFourAppearances || 0) + '</span>' +
      '</div>';
    }

    columnsHtml += '</div>';

    columnsHtml += '</div>'; // end cmp-team-col
  }

  columnsHtml += '</div>'; // end grid

  // ── Radar Chart Section ──
  var radarHtml = '<div class="cmp-radar-section">' +
    '<div class="cmp-section-title" style="padding:0 0 0.5rem 0;">Performance Comparison Radar</div>' +
    '<div class="cmp-radar-container"><canvas id="cmp-radar-canvas"></canvas></div>' +
  '</div>';

  // ── Side-by-Side Table ──
  var tableHtml = '<div class="cmp-table-section">' +
    '<div class="cmp-section-title" style="padding:0 0 0.5rem 0;">Side-by-Side Metrics</div>' +
    '<div style="overflow-x:auto;">' +
    '<table class="cmp-compare-table"><thead><tr><th>Metric</th>';

  for (var hi = 0; hi < teams.length; hi++) {
    tableHtml += '<th style="text-align:right;">' + (teams[hi].team.shortName || teams[hi].team.name) + '</th>';
  }
  tableHtml += '</tr></thead><tbody>';

  for (var ri = 0; ri < metrics.length; ri++) {
    var met2 = metrics[ri];
    // Find best value
    var vals = [];
    for (var vi = 0; vi < teams.length; vi++) {
      var rawVal = teams[vi].team.metrics ? teams[vi].team.metrics[met2.key] : null;
      vals.push(rawVal);
    }

    var bestIdx = -1;
    if (met2.higher !== null) {
      var bestVal = null;
      for (var bi = 0; bi < vals.length; bi++) {
        if (vals[bi] == null) continue;
        if (bestVal == null || (met2.higher ? vals[bi] > bestVal : vals[bi] < bestVal)) {
          bestVal = vals[bi];
          bestIdx = bi;
        }
      }
    }

    tableHtml += '<tr><td class="cmp-metric-name">' + met2.label + '</td>';
    for (var ci = 0; ci < teams.length; ci++) {
      var cls = ci === bestIdx ? ' cmp-best' : '';
      tableHtml += '<td class="cmp-val' + cls + '">' + fv(vals[ci], met2.dec, met2.mult, met2.suf) + '</td>';
    }
    tableHtml += '</tr>';
  }

  // Add probability rows
  for (var pri = 0; pri < probRounds.length; pri++) {
    var pr2 = probRounds[pri];
    tableHtml += '<tr><td class="cmp-metric-name">' + pr2.label + ' %</td>';
    var probVals = [];
    for (var pvi = 0; pvi < teams.length; pvi++) {
      var s2 = teams[pvi].sim;
      var p = 0;
      if (s2) {
        if (pr2.key === 'championship') {
          p = (s2.championshipProbability || 0) * 100;
        } else if (s2.roundProbabilities) {
          p = (s2.roundProbabilities[pr2.key] || 0) * 100;
        }
      }
      probVals.push(p);
    }
    var bestProbIdx = -1;
    var bestProb = -1;
    for (var bpi = 0; bpi < probVals.length; bpi++) {
      if (probVals[bpi] > bestProb) { bestProb = probVals[bpi]; bestProbIdx = bpi; }
    }
    for (var tvi = 0; tvi < teams.length; tvi++) {
      var pcls = tvi === bestProbIdx ? ' cmp-best' : '';
      tableHtml += '<td class="cmp-val' + pcls + '">' + probVals[tvi].toFixed(1) + '%</td>';
    }
    tableHtml += '</tr>';
  }

  tableHtml += '</tbody></table></div></div>';

  // Assemble
  body.innerHTML = columnsHtml + radarHtml + tableHtml;

  // Render radar chart
  var radarCanvas = document.getElementById('cmp-radar-canvas');
  if (radarCanvas && typeof Chart !== 'undefined') {
    renderCompareRadarChart(radarCanvas, teams);
  }

  // Highlight best values in columns
  highlightBestValues(body, metrics);

  overlay.classList.add('open');
}

function highlightBestValues(container, metrics) {
  for (var mi = 0; mi < metrics.length; mi++) {
    var met = metrics[mi];
    if (met.higher === null) continue;

    var cells = container.querySelectorAll('.cmp-stat-value[data-metric="' + met.key + '"]');
    if (cells.length < 2) continue;

    var bestIdx = -1;
    var worstIdx = -1;
    var bestVal = null;
    var worstVal = null;

    cells.forEach(function(cell, idx) {
      var raw = parseFloat(cell.dataset.raw);
      if (isNaN(raw)) return;
      if (bestVal === null || (met.higher ? raw > bestVal : raw < bestVal)) {
        bestVal = raw;
        bestIdx = idx;
      }
      if (worstVal === null || (met.higher ? raw < worstVal : raw > worstVal)) {
        worstVal = raw;
        worstIdx = idx;
      }
    });

    if (bestIdx >= 0 && cells.length > 1) cells[bestIdx].classList.add('cmp-best');
    if (worstIdx >= 0 && worstIdx !== bestIdx && cells.length > 2) cells[worstIdx].classList.add('cmp-worst');
  }
}

function renderCompareRadarChart(canvas, teams) {
  var RADAR_COLORS = [
    { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6' },
    { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444' },
    { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e' },
    { bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7' }
  ];

  var labels = ['Off. Eff.', 'Def. Eff.', 'Tempo', 'SOS', 'eFG%', 'FT Rate', '3P%', 'Steal%'];
  var keys = ['adjOffensiveEfficiency', 'adjDefensiveEfficiency', 'adjTempo', 'strengthOfSchedule', 'effectiveFGPct', 'freeThrowRate', 'threePointPct', 'stealPct'];

  // Compute min/max per metric for normalization
  var mins = [];
  var maxs = [];
  for (var ki = 0; ki < keys.length; ki++) {
    var allVals = [];
    for (var ti = 0; ti < teams.length; ti++) {
      var v = teams[ti].team.metrics ? teams[ti].team.metrics[keys[ki]] : null;
      if (v != null) allVals.push(v);
    }
    // Use a wider range for better visualization
    if (allVals.length > 0) {
      var min = Math.min.apply(null, allVals);
      var max = Math.max.apply(null, allVals);
      var range = max - min;
      mins.push(min - range * 0.2);
      maxs.push(max + range * 0.2);
    } else {
      mins.push(0);
      maxs.push(1);
    }
  }

  var datasets = [];
  for (var di = 0; di < teams.length; di++) {
    var t = teams[di].team;
    var m = t.metrics || {};
    var data = [];
    for (var dki = 0; dki < keys.length; dki++) {
      var val = m[keys[dki]];
      if (val == null) {
        data.push(50);
      } else {
        // Normalize to 0-100 scale
        var range2 = maxs[dki] - mins[dki];
        var normalized = range2 > 0 ? ((val - mins[dki]) / range2) * 100 : 50;
        // Invert defensive efficiency (lower is better)
        if (keys[dki] === 'adjDefensiveEfficiency') normalized = 100 - normalized;
        data.push(Math.max(0, Math.min(100, normalized)));
      }
    }

    var color = RADAR_COLORS[di % RADAR_COLORS.length];
    datasets.push({
      label: t.shortName || t.name,
      data: data,
      backgroundColor: color.bg,
      borderColor: color.border,
      borderWidth: 2,
      pointBackgroundColor: color.border,
      pointRadius: 3
    });
  }

  new Chart(canvas.getContext('2d'), {
    type: 'radar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#94a3b8',
            font: { family: 'Inter', size: 11 },
            usePointStyle: true,
            pointStyle: 'circle'
          }
        }
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: {
            display: false,
            stepSize: 25
          },
          pointLabels: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-tertiary').trim() || '#64748b',
            font: { family: 'Inter', size: 10 }
          },
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || 'rgba(148,163,184,0.08)'
          },
          angleLines: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || 'rgba(148,163,184,0.08)'
          }
        }
      }
    }
  });
}


// ═══════════════════════════════════════════════════════
// SECTION 19: THEME TOGGLE (DARK/LIGHT)
// ═══════════════════════════════════════════════════════

function setupThemeToggle() {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;

  // Restore saved theme
  var saved = localStorage.getItem('madness-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  btn.addEventListener('click', function() {
    var current = document.documentElement.getAttribute('data-theme');
    var next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('madness-theme', next);
    trackEvent('theme_toggle', { theme: next });
  });
}


// ═══════════════════════════════════════════════════════
// SECTION 20: MOBILE HAMBURGER MENU
// ═══════════════════════════════════════════════════════

function setupHamburgerMenu() {
  var btn = document.getElementById('hamburger-btn');
  var navTabs = document.querySelector('.nav-tabs-container');
  if (!btn || !navTabs) return;

  btn.addEventListener('click', function() {
    btn.classList.toggle('active');
    navTabs.classList.toggle('mobile-open');
  });

  // Close menu when a nav tab is clicked
  navTabs.querySelectorAll('.nav-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      btn.classList.remove('active');
      navTabs.classList.remove('mobile-open');
    });
  });
}


// ═══════════════════════════════════════════════════════
// SECTION 21: SKELETON LOADING HELPERS
// ═══════════════════════════════════════════════════════

function showSkeletonLoading(containerId, count) {
  count = count || 4;
  var container = document.getElementById(containerId);
  if (!container) return;

  var html = '';
  for (var i = 0; i < count; i++) {
    html += '<div class="skeleton skeleton-card" style="margin-bottom:0.75rem;"></div>';
  }
  container.innerHTML = html;
}

function showTableSkeleton(tbodyId, cols, rows) {
  cols = cols || 9;
  rows = rows || 10;
  var tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  var html = '';
  for (var r = 0; r < rows; r++) {
    html += '<tr>';
    for (var c = 0; c < cols; c++) {
      var w = c === 1 ? 'w-75' : 'w-50';
      html += '<td><div class="skeleton skeleton-line ' + w + '"></div></td>';
    }
    html += '</tr>';
  }
  tbody.innerHTML = html;
}
