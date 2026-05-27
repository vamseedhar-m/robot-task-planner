// In production FastAPI serves both the API and the frontend from the same origin,
// so relative URLs work. In local dev via the Python HTTP server (:5174) we need
// to explicitly point at the FastAPI server.
const API_URL = window.location.port === '5174' ? 'http://localhost:8000' : '';

let currentPlan = null;
let scenariosCache = null;
let _pendingGenerate = false;

// Default scene used when the user types a custom task without expanding the JSON section.
const DEFAULT_SCENE = {
  objects: [],
  locations: [],
  robot_constraints: {
    max_payload_kg: 5.0,
    reach_radius_m: 0.90,
    max_grip_force_n: 50.0,
    max_speed_ms: 1.0,
    workspace_bounds: { x_min: -1.0, x_max: 1.0, y_min: -1.0, y_max: 1.0, z_min: 0.0, z_max: 1.5 }
  }
};

// ── BYOK helpers ───────────────────────────────────────────────────────────

const LS_KEY = 'rtp_anthropic_api_key';

function getApiKey() {
  return localStorage.getItem(LS_KEY) || '';
}

function saveApiKey(key) {
  if (key) {
    localStorage.setItem(LS_KEY, key);
  } else {
    localStorage.removeItem(LS_KEY);
  }
  updateKeyButtonUI();
}

function updateKeyButtonUI() {
  const btn = document.getElementById('api-key-btn');
  const label = document.getElementById('key-btn-label');
  if (!btn) return;
  const hasKey = !!getApiKey();
  btn.classList.toggle('has-key', hasKey);
  if (label) label.textContent = hasKey ? 'API Key ✓' : 'API Key';
}

function openKeyModal(fromGenerate = false) {
  _pendingGenerate = fromGenerate;
  const modal = document.getElementById('key-modal');
  const input = document.getElementById('key-input');
  const saveBtn = document.getElementById('modal-save');
  if (!modal) return;
  input.value = getApiKey();
  input.type = 'password';
  document.getElementById('key-reveal').textContent = 'Show';
  saveBtn.textContent = fromGenerate ? 'Save & Generate' : 'Save';
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
}

function closeKeyModal() {
  document.getElementById('key-modal').classList.add('hidden');
  _pendingGenerate = false;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  updateKeyButtonUI();
  loadScenarios();
  bindEvents();
});

function bindEvents() {
  document.getElementById('plan-btn').addEventListener('click', submitPlan);
  document.getElementById('fit-btn').addEventListener('click', () => {
    GRAPH.fitView(document.getElementById('graph-area'));
  });
  document.getElementById('reasoning-toggle').addEventListener('click', toggleReasoning);
  document.getElementById('close-sidebar').addEventListener('click', closeSidebar);

  // Scene JSON toggle
  document.getElementById('scene-toggle').addEventListener('click', () => {
    const section = document.getElementById('scene-section');
    const btn = document.getElementById('scene-toggle');
    const isHidden = section.classList.contains('hidden');
    section.classList.toggle('hidden', !isHidden);
    btn.classList.toggle('open', isHidden);
  });

  // Cmd/Ctrl+Enter submits
  document.getElementById('task-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitPlan();
  });

  // ── API Key modal (button click handled via onclick in HTML) ───────────
  document.getElementById('modal-close').addEventListener('click', closeKeyModal);

  // Click backdrop to dismiss
  document.getElementById('key-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeKeyModal();
  });

  // Show / hide key text
  document.getElementById('key-reveal').addEventListener('click', () => {
    const input = document.getElementById('key-input');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    document.getElementById('key-reveal').textContent = isHidden ? 'Hide' : 'Show';
  });

  // Save key (and optionally trigger generation)
  document.getElementById('modal-save').addEventListener('click', () => {
    const key = document.getElementById('key-input').value.trim();
    if (!key) { showToast('Paste your API key first.', 'error'); return; }
    saveApiKey(key);
    closeKeyModal();
    showToast('API key saved.', 'info');
    if (_pendingGenerate) submitPlan();
  });

  // Clear stored key
  document.getElementById('modal-clear').addEventListener('click', () => {
    saveApiKey('');
    document.getElementById('key-input').value = '';
    showToast('API key cleared.', 'info');
  });

  // Escape closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeKeyModal();
  });
}

// ── Scenarios ──────────────────────────────────────────────────────────────

async function loadScenarios() {
  try {
    const res = await fetch(`${API_URL}/scenarios`);
    if (!res.ok) throw new Error('Could not load scenarios');
    scenariosCache = await res.json();
    renderScenarioButtons(scenariosCache);
  } catch {
    document.getElementById('scenarios-nav').innerHTML =
      '<span class="nav-error">⚠ Backend offline — run uvicorn main:app --reload in the backend folder</span>';
  }
}

function renderScenarioButtons(scenarios) {
  const nav = document.getElementById('scenarios-nav');
  nav.innerHTML = '<span class="nav-label">Try a demo:</span>';
  scenarios.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'scenario-btn';
    btn.textContent = s.name;
    btn.title = s.description;
    btn.addEventListener('click', () => loadScenario(s, btn));
    nav.appendChild(btn);
  });
}

function loadScenario(scenario, btn) {
  document.getElementById('task-input').value = scenario.task_description;
  document.getElementById('scene-input').value = JSON.stringify(scenario.scene, null, 2);
  document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ── Plan submission ────────────────────────────────────────────────────────

async function submitPlan() {
  const taskText = document.getElementById('task-input').value.trim();
  const sceneText = document.getElementById('scene-input').value.trim();

  if (!taskText) { showToast('Enter a task description.', 'error'); return; }

  // Require API key — open modal if missing
  if (!getApiKey()) {
    openKeyModal(true);
    return;
  }

  let sceneJson;
  if (!sceneText) {
    sceneJson = { ...DEFAULT_SCENE };
  } else {
    try {
      sceneJson = JSON.parse(sceneText);
    } catch {
      showToast('Scene JSON is invalid. Check syntax and try again.', 'error');
      return;
    }
  }

  sceneJson.task_description = taskText;

  setLoading(true);
  clearGraph();
  closeSidebar();

  try {
    const res = await fetch(`${API_URL}/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': getApiKey()
      },
      body: JSON.stringify(sceneJson)
    });

    const data = await res.json();

    if (!res.ok) {
      // If the server rejects the key, clear it so the modal reopens next time
      if (res.status === 401) saveApiKey('');
      throw new Error(data.detail || `Server error ${res.status}`);
    }

    currentPlan = data;
    try {
      renderPlan(data);
    } catch (renderErr) {
      console.error('[renderPlan error]', renderErr);
      throw new Error(`Plan generated but rendering failed: ${renderErr.message}`);
    }
  } catch (err) {
    console.error('[submitPlan error]', err);
    showError(err.message);
    showEmptyState(true);
  } finally {
    setLoading(false);
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────

function renderPlan(plan) {
  showEmptyState(false);

  document.getElementById('plan-title').textContent = plan.title;
  document.getElementById('stat-steps').textContent = plan.total_steps;
  document.getElementById('stat-decisions').textContent = plan.decision_points;
  const warnCount = plan.constraint_warnings.length;
  const warnEl = document.getElementById('stat-warnings');
  warnEl.textContent = warnCount;
  warnEl.className = 'stat-value' + (warnCount > 0 ? ' stat-warn' : '');

  document.getElementById('graph-toolbar').classList.remove('hidden');
  document.getElementById('graph-legend').classList.remove('hidden');

  const graphArea = document.getElementById('graph-area');
  GRAPH.renderGraph(graphArea, plan, showStepDetails);

  document.getElementById('reasoning-text').textContent = plan.reasoning;
  renderConstraintSummary(plan.constraint_warnings);
}

function renderConstraintSummary(warnings) {
  const el = document.getElementById('constraint-summary');
  if (warnings.length === 0) {
    el.innerHTML = '<span class="ok-badge">All constraints satisfied</span>';
    return;
  }
  el.innerHTML = warnings.map(w => `
    <div class="constraint-warn ${w.severity}">
      <span class="warn-type">${w.type.replace(/_/g, ' ')}</span>
      <span class="warn-msg">${w.message}</span>
    </div>
  `).join('');
}

function clearGraph() {
  const graphArea = document.getElementById('graph-area');
  const svg = graphArea && graphArea.querySelector('svg');
  if (svg) svg.remove();
  document.getElementById('graph-toolbar').classList.add('hidden');
  document.getElementById('graph-legend').classList.add('hidden');
  document.getElementById('plan-title').textContent = '';
  document.getElementById('stat-steps').textContent = '—';
  document.getElementById('stat-decisions').textContent = '—';
  document.getElementById('stat-warnings').textContent = '—';
  document.getElementById('constraint-summary').innerHTML = '';
  document.getElementById('reasoning-panel').classList.add('hidden');
  document.getElementById('reasoning-toggle').textContent = 'Show Reasoning';
}

function showEmptyState(visible) {
  const state = document.getElementById('empty-state');
  if (!state) return;
  state.style.display = (visible || !currentPlan) ? 'flex' : 'none';
}

// ── Step details sidebar ───────────────────────────────────────────────────

function showStepDetails(step) {
  const sidebar = document.getElementById('step-details');
  sidebar.classList.remove('hidden');

  const color = GRAPH.ACTION_COLORS[step.action_type] || '#8b949e';
  const hasWarnings = step.constraint_warnings && step.constraint_warnings.length > 0;

  document.getElementById('step-name').textContent = step.name;
  document.getElementById('step-name').style.color = color;

  document.getElementById('step-action-badge').textContent = step.action_type.toUpperCase();
  document.getElementById('step-action-badge').style.background = color + '22';
  document.getElementById('step-action-badge').style.color = color;
  document.getElementById('step-action-badge').style.borderColor = color + '66';

  document.getElementById('step-description').textContent = step.description;

  document.getElementById('step-preconditions').innerHTML =
    (step.preconditions || []).map(p => `<li><code>${p}</code></li>`).join('') || '<li class="empty">none</li>';

  document.getElementById('step-effects').innerHTML =
    (step.effects || []).map(e => `<li><code>${e}</code></li>`).join('') || '<li class="empty">none</li>';

  const params = step.parameters || {};
  const paramEntries = [
    params.approach_speed_ms != null ? ['approach_speed', `${params.approach_speed_ms} m/s`] : null,
    params.grip_force_n != null ? ['grip_force', `${params.grip_force_n} N`] : null,
    params.clearance_height_m != null ? ['clearance_height', `${params.clearance_height_m} m`] : null,
    params.approach_vector ? ['approach_vector', `(${params.approach_vector.x}, ${params.approach_vector.y}, ${params.approach_vector.z})`] : null
  ].filter(Boolean);

  const paramsEl = document.getElementById('step-params');
  paramsEl.innerHTML = paramEntries.length > 0
    ? paramEntries.map(([k, v]) =>
        `<div class="param-row"><span class="param-key">${k}</span><span class="param-val">${v}</span></div>`
      ).join('')
    : '<span class="empty">no physical parameters</span>';

  document.getElementById('step-failures').innerHTML =
    (step.failure_modes || []).map(f =>
      `<div class="failure-row">
        <span class="failure-cond">${f.condition}</span>
        <span class="failure-sep">→</span>
        <span class="failure-rec">${f.recovery}</span>
      </div>`
    ).join('') || '<span class="empty">none defined</span>';

  const warnEl = document.getElementById('step-warnings');
  if (hasWarnings) {
    warnEl.classList.remove('hidden');
    document.getElementById('step-warnings-list').innerHTML =
      step.constraint_warnings.map(w =>
        `<div class="constraint-warn ${w.severity}">
          <span class="warn-type">${w.type.replace(/_/g, ' ')}</span>
          <span class="warn-msg">${w.message}</span>
        </div>`
      ).join('');
  } else {
    warnEl.classList.add('hidden');
  }

  const branchEl = document.getElementById('step-branches');
  if (step.is_decision_point && step.branches && step.branches.length > 0) {
    branchEl.classList.remove('hidden');
    document.getElementById('step-branches-list').innerHTML =
      step.branches.map(b =>
        `<div class="branch-row">
          <span class="branch-cond">${b.condition}</span>
          <span class="branch-arrow">→</span>
          <code class="branch-next">${b.next_step_id}</code>
        </div>`
      ).join('');
  } else {
    branchEl.classList.add('hidden');
  }
}

function closeSidebar() {
  document.getElementById('step-details').classList.add('hidden');
}

// ── Reasoning toggle ───────────────────────────────────────────────────────

function toggleReasoning() {
  const panel = document.getElementById('reasoning-panel');
  const btn = document.getElementById('reasoning-toggle');
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    btn.textContent = 'Hide Reasoning';
    btn.classList.add('active');
  } else {
    panel.classList.add('hidden');
    btn.textContent = 'Show Reasoning';
    btn.classList.remove('active');
  }
}

// ── UI helpers ─────────────────────────────────────────────────────────────

function setLoading(on) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !on);
  document.getElementById('plan-btn').disabled = on;
  if (on) {
    showEmptyState(false);
    clearError();
  }
}

function showError(message) {
  const el = document.getElementById('error-banner');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

function clearError() {
  const el = document.getElementById('error-banner');
  if (el) el.classList.add('hidden');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
