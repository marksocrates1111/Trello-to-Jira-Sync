require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Server-side defaults from environment variables.
// These are used as fallback when form fields are left blank.
const SERVER_DEFAULTS = {
  trelloApiKey: process.env.TRELLO_API_KEY || '',
  trelloToken: process.env.TRELLO_TOKEN || '',
  jiraEmail: process.env.JIRA_EMAIL || '',
  jiraApiToken: process.env.JIRA_API_TOKEN || '',
  jiraBaseUrl: process.env.JIRA_BASE_URL || '',
  trelloBoardId: process.env.TRELLO_BOARD_ID || '',
  jiraProjectKey: process.env.JIRA_PROJECT_KEY || ''
};

// Only expose sensitive defaults to browser when explicitly enabled.
const ALLOW_SENSITIVE_PREFILL = process.env.ALLOW_SENSITIVE_PREFILL === 'true';

// Picks request value first, then saved default.
function pickValue(requestValue, defaultValue) {
  if (typeof requestValue === 'string' && requestValue.trim()) {
    return requestValue.trim();
  }
  if (typeof defaultValue === 'string' && defaultValue.trim()) {
    return defaultValue.trim();
  }
  return '';
}

// Resolves runtime config by preferring request values, then environment defaults.
function resolveSyncConfig(body = {}) {
  return {
    trelloApiKey: pickValue(body.trelloApiKey, SERVER_DEFAULTS.trelloApiKey),
    trelloToken: pickValue(body.trelloToken, SERVER_DEFAULTS.trelloToken),
    jiraEmail: pickValue(body.jiraEmail, SERVER_DEFAULTS.jiraEmail),
    jiraApiToken: pickValue(body.jiraApiToken, SERVER_DEFAULTS.jiraApiToken),
    jiraBaseUrl: pickValue(body.jiraBaseUrl, SERVER_DEFAULTS.jiraBaseUrl),
    trelloBoardId: pickValue(body.trelloBoardId, SERVER_DEFAULTS.trelloBoardId),
    jiraProjectKey: pickValue(body.jiraProjectKey, SERVER_DEFAULTS.jiraProjectKey)
  };
}

// Basic validation for required fields.
function validateSyncConfig(config) {
  if (
    !config.trelloApiKey ||
    !config.trelloToken ||
    !config.jiraEmail ||
    !config.jiraApiToken ||
    !config.jiraBaseUrl ||
    !config.trelloBoardId ||
    !config.jiraProjectKey
  ) {
    return 'Missing required fields. Please fill in all inputs.';
  }

  // Common demo mistake: pasting a Jira API token into the Trello token field.
  if (/^AT[A-Z0-9]/.test(config.trelloToken) && config.trelloToken.includes('=')) {
    return 'Trello Token looks like a Jira API token. Generate a Trello token from https://trello.com/app-key and paste that into Trello Token.';
  }

  return '';
}

// Fetch all cards from the selected Trello board.
async function fetchTrelloCards(config) {
  const trelloUrl = `https://api.trello.com/1/boards/${encodeURIComponent(
    config.trelloBoardId
  )}/cards?key=${encodeURIComponent(config.trelloApiKey)}&token=${encodeURIComponent(
    config.trelloToken
  )}`;

  const trelloResponse = await fetch(trelloUrl);

  if (!trelloResponse.ok) {
    const errorText = await trelloResponse.text();
    throw new Error(`Failed to fetch Trello cards: ${errorText}`);
  }

  return trelloResponse.json();
}

// Parse incoming JSON requests from the frontend.
app.use(express.json());

// Serve static frontend files from /public.
app.use(express.static(path.join(__dirname, 'public')));

// Simple health endpoint to confirm server is running.
app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Server is running' });
});

// Returns saved values so frontend can auto-fill the form.
app.get('/defaults', (req, res) => {
  const safeDefaults = {
    jiraEmail: SERVER_DEFAULTS.jiraEmail,
    jiraBaseUrl: SERVER_DEFAULTS.jiraBaseUrl,
    trelloBoardId: SERVER_DEFAULTS.trelloBoardId,
    jiraProjectKey: SERVER_DEFAULTS.jiraProjectKey
  };

  if (ALLOW_SENSITIVE_PREFILL) {
    safeDefaults.trelloApiKey = SERVER_DEFAULTS.trelloApiKey;
    safeDefaults.trelloToken = SERVER_DEFAULTS.trelloToken;
    safeDefaults.jiraApiToken = SERVER_DEFAULTS.jiraApiToken;
  }

  res.json({
    success: true,
    defaults: safeDefaults
  });
});

// Preview endpoint: lets you verify Trello card data before running full sync.
app.post('/preview', async (req, res) => {
  const config = resolveSyncConfig(req.body);
  const validationMessage = validateSyncConfig(config);

  if (validationMessage) {
    return res.status(400).json({
      success: false,
      message: validationMessage
    });
  }

  try {
    const trelloCards = await fetchTrelloCards(config);

    const previewCards = trelloCards.map((card) => ({
      cardName: card.name,
      cardDescriptionPreview: card.desc ? card.desc.slice(0, 120) : '',
      cardUrl: card.url || ''
    }));

    return res.json({
      success: true,
      totalCards: previewCards.length,
      cards: previewCards
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Main sync endpoint: receives credentials and IDs, then syncs Trello cards to Jira.
app.post('/sync', async (req, res) => {
  const startedAt = Date.now();
  const config = resolveSyncConfig(req.body);
  const validationMessage = validateSyncConfig(config);

  if (validationMessage) {
    return res.status(400).json({
      success: false,
      message: validationMessage
    });
  }

  try {
    // 1) Fetch cards from Trello board.
    const trelloCards = await fetchTrelloCards(config);

    // Jira auth is Basic Auth using email:apiToken base64 encoded.
    const authValue = Buffer.from(`${config.jiraEmail}:${config.jiraApiToken}`).toString('base64');

    const results = [];

    // 2) For each Trello card, create a Jira issue.
    for (const card of trelloCards) {
      const jiraIssuePayload = {
        fields: {
          project: { key: config.jiraProjectKey },
          summary: card.name || 'Untitled Trello Card',
          issuetype: { name: 'Task' },
          // Jira Cloud expects description in Atlassian Document Format (ADF).
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: card.desc && card.desc.trim() ? card.desc : 'No description'
                  }
                ]
              }
            ]
          }
        }
      };

      const jiraResponse = await fetch(
        `${config.jiraBaseUrl.replace(/\/$/, '')}/rest/api/3/issue`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Basic ${authValue}`
          },
          body: JSON.stringify(jiraIssuePayload)
        }
      );

      if (jiraResponse.ok) {
        const createdIssue = await jiraResponse.json();
        results.push({
          cardName: card.name,
          success: true,
          jiraIssueKey: createdIssue.key,
          jiraIssueUrl: `${config.jiraBaseUrl.replace(/\/$/, '')}/browse/${createdIssue.key}`
        });
      } else {
        const jiraErrorText = await jiraResponse.text();
        results.push({
          cardName: card.name,
          success: false,
          error: jiraErrorText
        });
      }
    }

    // Return the per-card results to display in frontend logs.
    return res.json({
      success: true,
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      totalCards: trelloCards.length,
      results
    });
  } catch (error) {
    const statusCode = error.message.startsWith('Failed to fetch Trello cards:') ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 400 ? error.message : `Unexpected error: ${error.message}`
    });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Trello-to-Jira Sync app running on http://localhost:${PORT}`);
  });
}

module.exports = app;
