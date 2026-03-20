const syncForm = document.getElementById('syncForm');
const logOutput = document.getElementById('logOutput');
const syncBtn = document.getElementById('syncBtn');
const previewBtn = document.getElementById('previewBtn');
const presentationToggle = document.getElementById('presentationToggle');
const runMeta = document.getElementById('runMeta');
const stepConnect = document.getElementById('stepConnect');
const stepPreview = document.getElementById('stepPreview');
const stepSync = document.getElementById('stepSync');
const resultList = document.getElementById('resultList');
const previewList = document.getElementById('previewList');
const previewCount = document.getElementById('previewCount');
const timelineList = document.getElementById('timelineList');
const copySummaryBtn = document.getElementById('copySummaryBtn');
const totalCount = document.getElementById('totalCount');
const successCount = document.getElementById('successCount');
const errorCount = document.getElementById('errorCount');
const statusBadge = document.getElementById('statusBadge');

let lastSyncSummaryText = '';
let lastPreviewCards = [];
let lastSyncResults = [];

const UI_FIXED_DEFAULTS = {
  jiraEmail: 'tehfeyti@gmail.com',
  jiraBaseUrl: 'https://tehfeyti-1772712475793.atlassian.net',
  trelloBoardId: '178VvA7U'
};

function setStepState(step, state) {
  if (!step) {
    return;
  }
  step.classList.remove('active', 'done');
  if (state === 'active' || state === 'done') {
    step.classList.add(state);
  }
}

function updateWorkflowState(stage) {
  if (stage === 'connect') {
    setStepState(stepConnect, 'active');
    setStepState(stepPreview, '');
    setStepState(stepSync, '');
    return;
  }
  if (stage === 'preview') {
    setStepState(stepConnect, 'done');
    setStepState(stepPreview, 'active');
    setStepState(stepSync, '');
    return;
  }
  if (stage === 'syncing') {
    setStepState(stepConnect, 'done');
    setStepState(stepPreview, 'done');
    setStepState(stepSync, 'active');
    return;
  }
  if (stage === 'completed') {
    setStepState(stepConnect, 'done');
    setStepState(stepPreview, 'done');
    setStepState(stepSync, 'done');
  }
}

function updateRunMeta(text) {
  runMeta.textContent = text;
}

function bindSecretVisibilityToggles() {
  const buttons = document.querySelectorAll('[data-toggle-target]');
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-toggle-target');
      const input = document.getElementById(targetId);
      if (!input) {
        return;
      }
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
    });
  }
}

// Load saved defaults from backend and prefill form fields.
async function loadDefaults() {
  try {
    const response = await fetch('/defaults');
    const data = await response.json();

    if (!response.ok || !data.success || !data.defaults) {
      return;
    }

    const fields = [
      'trelloApiKey',
      'trelloToken',
      'jiraEmail',
      'jiraApiToken',
      'jiraBaseUrl',
      'trelloBoardId',
      'jiraProjectKey'
    ];

    for (const fieldId of fields) {
      const input = document.getElementById(fieldId);
      const value = data.defaults[fieldId];

      if (input && typeof value === 'string' && value.trim()) {
        input.value = value;
      }
    }
  } catch (error) {
    // Keep page usable even if defaults endpoint is unavailable.
  }
}

loadDefaults();
bindSecretVisibilityToggles();

// Always apply requested site defaults for these fields.
for (const [fieldId, value] of Object.entries(UI_FIXED_DEFAULTS)) {
  const input = document.getElementById(fieldId);
  if (input) {
    input.value = value;
  }
}

// Updates summary cards and top status badge.
function updateSummary({ total = 0, success = 0, failed = 0, state = 'idle', text = 'Ready to sync' }) {
  totalCount.textContent = String(total);
  successCount.textContent = String(success);
  errorCount.textContent = String(failed);
  statusBadge.textContent = text;
  statusBadge.className = `status-badge ${state}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncateText(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

function setPresentationMode(enabled) {
  document.body.classList.toggle('presentation-mode', enabled);
  presentationToggle.textContent = enabled
    ? 'Disable Presentation Mode'
    : 'Enable Presentation Mode';
}

function renderTimeline(previewCards, syncResults, durationSeconds = null) {
  if ((!previewCards || previewCards.length === 0) && (!syncResults || syncResults.length === 0)) {
    timelineList.innerHTML = `
      <li class="timeline-item placeholder">
        <span class="timeline-dot"></span>
        <div class="timeline-content">Preview cards first, then run sync to see the full Trello to Jira story.</div>
      </li>
    `;
    return;
  }

  const baseCards = previewCards && previewCards.length > 0
    ? previewCards
    : syncResults.map((item) => ({ cardName: item.cardName }));

  timelineList.innerHTML = baseCards
    .map((card, index) => {
      const match = syncResults[index];
      const cardName = escapeHtml(card.cardName || 'Untitled Trello Card');
      const hasSync = Boolean(match);
      const success = hasSync && match.success;
      const stateClass = hasSync ? (success ? 'success' : 'error') : 'pending';

      let resultText = 'Waiting for sync...';
      if (hasSync && success) {
        const key = escapeHtml(match.jiraIssueKey || 'Created');
        const issueLabel = match.jiraIssueUrl
          ? `<a href="${escapeHtml(match.jiraIssueUrl)}" target="_blank" rel="noreferrer">${key}</a>`
          : key;
        resultText = `Created Jira issue ${issueLabel}`;
      }
      if (hasSync && !success) {
        resultText = escapeHtml(truncateText(match.error || 'Issue creation failed', 120));
      }

      return `
        <li class="timeline-item ${stateClass}" style="--stagger:${index};">
          <span class="timeline-dot"></span>
          <div class="timeline-content">
            <p class="timeline-title">${cardName}</p>
            <p class="timeline-subtitle">${resultText}</p>
          </div>
        </li>
      `;
    })
    .join('');

  if (durationSeconds !== null) {
    timelineList.innerHTML += `
      <li class="timeline-item summary" style="--stagger:${baseCards.length};">
        <span class="timeline-dot"></span>
        <div class="timeline-content">
          <p class="timeline-title">Sync finished</p>
          <p class="timeline-subtitle">End-to-end duration: ${escapeHtml(durationSeconds)}s</p>
        </div>
      </li>
    `;
  }
}

presentationToggle.addEventListener('click', () => {
  const enabled = !document.body.classList.contains('presentation-mode');
  setPresentationMode(enabled);
});

document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'p' && !event.ctrlKey && !event.metaKey) {
    const targetTag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
    if (targetTag !== 'input' && targetTag !== 'textarea') {
      setPresentationMode(!document.body.classList.contains('presentation-mode'));
    }
  }
});

// Render each card result as a compact, readable list item.
function renderResultList(results) {
  if (!results || results.length === 0) {
    resultList.innerHTML = '';
    return;
  }

  resultList.innerHTML = results
    .map((item, index) => {
      const cardName = escapeHtml(item.cardName || 'Untitled Trello Card');

      if (item.success) {
        const jiraLink = item.jiraIssueUrl
          ? `<a href="${escapeHtml(item.jiraIssueUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.jiraIssueKey)}</a>`
          : `<strong>${escapeHtml(item.jiraIssueKey)}</strong>`;

        return `
          <li class="jira-issue-card success" style="--stagger:${index};">
            <div class="jira-card-top">
              <span class="system-badge jira">Jira</span>
              <span class="status-pill success">Created</span>
            </div>
            <h3 class="jira-issue-key">${jiraLink}</h3>
            <p class="jira-summary-label">Mapped from Trello card</p>
            <p class="jira-summary-value">${cardName}</p>
            <div class="jira-card-actions">
              ${item.jiraIssueUrl ? `<a class="action-link" href="${escapeHtml(item.jiraIssueUrl)}" target="_blank" rel="noreferrer">Open Jira issue</a>` : ''}
            </div>
          </li>
        `;
      }

      return `
        <li class="jira-issue-card error" style="--stagger:${index};">
          <div class="jira-card-top">
            <span class="system-badge jira">Jira</span>
            <span class="status-pill error">Failed</span>
          </div>
          <h3 class="jira-issue-key">Issue creation failed</h3>
          <p class="jira-summary-label">Card that failed</p>
          <p class="jira-summary-value">${cardName}</p>
          <p class="jira-error-text">${escapeHtml(truncateText(item.error || 'Unknown error', 220))}</p>
        </li>
      `;
    })
    .join('');
}

// Render Trello preview cards before actual sync.
function renderPreviewList(cards) {
  if (!cards || cards.length === 0) {
    previewCount.textContent = 'No cards found';
    previewList.innerHTML = '';
    return;
  }

  previewCount.textContent = `${cards.length} cards found`;
  previewList.innerHTML = cards
    .map((item, index) => {
      const cardName = escapeHtml(item.cardName || 'Untitled Trello Card');
      const link = item.cardUrl
        ? `<a class="action-link" href="${escapeHtml(item.cardUrl)}" target="_blank" rel="noreferrer">Open in Trello</a>`
        : '';
      const description = item.cardDescriptionPreview
        ? escapeHtml(truncateText(item.cardDescriptionPreview, 180))
        : 'No description';

      const accentClasses = ['accent-1', 'accent-2', 'accent-3', 'accent-4'];
      const accentClass = accentClasses[index % accentClasses.length];

      return `
        <li class="trello-preview-card ${accentClass}" style="--stagger:${index};">
          <div class="trello-card-cover"></div>
          <div class="trello-card-body">
            <div class="trello-card-top">
              <span class="system-badge trello">Trello Card</span>
              <span class="trello-micro-tag">Preview</span>
            </div>
            <h3 class="trello-card-title">${cardName}</h3>
            <p class="trello-card-description">${description}</p>
            <div class="trello-card-actions">
              ${link}
            </div>
          </div>
        </li>
      `;
    })
    .join('');
}

function getPayloadFromForm() {
  return {
    trelloApiKey: document.getElementById('trelloApiKey').value.trim(),
    trelloToken: document.getElementById('trelloToken').value.trim(),
    jiraEmail: document.getElementById('jiraEmail').value.trim(),
    jiraApiToken: document.getElementById('jiraApiToken').value.trim(),
    jiraBaseUrl: document.getElementById('jiraBaseUrl').value.trim(),
    trelloBoardId: document.getElementById('trelloBoardId').value.trim(),
    jiraProjectKey: document.getElementById('jiraProjectKey').value.trim()
  };
}

previewBtn.addEventListener('click', async () => {
  updateWorkflowState('preview');
  updateRunMeta('Previewing cards...');
  previewBtn.disabled = true;
  previewBtn.textContent = 'Loading Preview...';
  renderLogs([{ text: 'Fetching Trello cards preview...', type: 'info' }]);

  try {
    const response = await fetch('/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getPayloadFromForm())
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      renderPreviewList([]);
      renderTimeline([], [], null);
      renderLogs([
        { text: 'Preview failed.', type: 'error' },
        { text: data.message || 'Unknown error', type: 'error' }
      ]);
      return;
    }

    renderPreviewList(data.cards);
    lastPreviewCards = data.cards;
    renderTimeline(lastPreviewCards, [], null);
    updateRunMeta(`Preview ready: ${data.totalCards} cards`);
    renderLogs([{ text: `Preview loaded. Trello cards found: ${data.totalCards}`, type: 'success' }]);
  } catch (error) {
    renderPreviewList([]);
    renderTimeline([], [], null);
    renderLogs([
      { text: 'Preview failed due to a network or server error.', type: 'error' },
      { text: error.message, type: 'error' }
    ]);
    updateWorkflowState('connect');
    updateRunMeta('Preview failed');
  } finally {
    previewBtn.disabled = false;
    previewBtn.textContent = 'Preview Trello Cards';
  }
});

copySummaryBtn.addEventListener('click', async () => {
  if (!lastSyncSummaryText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(lastSyncSummaryText);
    copySummaryBtn.textContent = 'Copied';
    setTimeout(() => {
      copySummaryBtn.textContent = 'Copy Demo Summary';
    }, 1500);
  } catch (error) {
    renderLogs([
      { text: 'Could not copy summary automatically. You can copy it manually from logs.', type: 'error' }
    ]);
  }
});

// Render logs as simple lines in the result panel.
function renderLogs(lines) {
  logOutput.innerHTML = lines
    .map((line) => {
      if (line.type === 'success') {
        return `<div class="log-success">${line.text}</div>`;
      }
      if (line.type === 'error') {
        return `<div class="log-error">${line.text}</div>`;
      }
      return `<div>${line.text}</div>`;
    })
    .join('');
}

syncForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  // Collect all user input values from the form.
  const payload = getPayloadFromForm();

  syncBtn.disabled = true;
  previewBtn.disabled = true;
  copySummaryBtn.disabled = true;
  updateWorkflowState('syncing');
  updateRunMeta('Sync in progress...');
  lastSyncSummaryText = '';
  syncBtn.textContent = 'Syncing...';
  renderResultList([]);
  updateSummary({ state: 'running', text: 'Sync in progress...' });
  renderLogs([{ text: 'Starting sync process...', type: 'info' }]);

  try {
    // Call backend /sync endpoint to run Trello -> Jira sync.
    const response = await fetch('/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      lastSyncResults = [];
      updateSummary({ state: 'error', text: 'Sync failed' });
      updateRunMeta('Sync failed');
      updateWorkflowState('preview');
      renderLogs([
        { text: 'Sync failed.', type: 'error' },
        { text: data.message || 'Unknown error', type: 'error' }
      ]);
      return;
    }

    const successful = data.results.filter((item) => item.success).length;
    const failed = data.results.length - successful;
    const durationInSeconds = typeof data.durationMs === 'number' ? (data.durationMs / 1000).toFixed(2) : '0.00';
    lastSyncResults = data.results;

    updateSummary({
      total: data.totalCards,
      success: successful,
      failed,
      state: failed > 0 ? 'warning' : 'success',
      text: failed > 0 ? 'Completed with partial failures' : 'Completed successfully'
    });

    const lines = [
      { text: `Sync completed in ${durationInSeconds}s. Total Trello cards: ${data.totalCards}`, type: 'success' }
    ];

    // Show one log line per card with success or failure.
    for (const item of data.results) {
      if (item.success) {
        lines.push({
          text: `SUCCESS: ${item.cardName} -> Jira Issue ${item.jiraIssueKey}`,
          type: 'success'
        });
      } else {
        lines.push({
          text: `ERROR: ${item.cardName} -> ${item.error}`,
          type: 'error'
        });
      }
    }

    renderLogs(lines);
    renderResultList(data.results);
    renderTimeline(lastPreviewCards, lastSyncResults, durationInSeconds);
    updateWorkflowState('completed');
    updateRunMeta(`Last sync: ${durationInSeconds}s`);

    lastSyncSummaryText = [
      'Trello-to-Jira Sync Demo Summary',
      `Total Trello cards: ${data.totalCards}`,
      `Created Jira issues: ${successful}`,
      `Failed: ${failed}`,
      `Duration: ${durationInSeconds}s`
    ].join('\n');
    copySummaryBtn.disabled = false;
  } catch (error) {
    lastSyncResults = [];
    updateSummary({ state: 'error', text: 'Sync failed' });
    updateRunMeta('Sync failed');
    updateWorkflowState('preview');
    renderLogs([
      { text: 'Sync failed due to a network or server error.', type: 'error' },
      { text: error.message, type: 'error' }
    ]);
  } finally {
    syncBtn.disabled = false;
    previewBtn.disabled = false;
    syncBtn.textContent = 'Sync Trello Cards to Jira';
  }
});

updateSummary({});
setPresentationMode(false);
renderTimeline([], [], null);
updateWorkflowState('connect');
updateRunMeta('No run yet');
