# Trello-to-Jira Sync (Basic Version)

A school-project prototype that demonstrates Trello API + Jira API integration.

## What It Shows

- Preview Trello cards before syncing
- Sync cards to Jira issues
- Live summary counters (total, success, failed)
- Clear per-card success/failure cards
- Clickable Jira issue links after creation
- Copyable demo summary for presentation

## Project Structure

- `public/index.html`
- `public/style.css`
- `public/script.js`
- `server.js`

## Run Locally

1. Install dependencies:
   npm.cmd install
2. Start app:
   npm.cmd start
3. Open browser:
   http://localhost:3000

## Environment Variables

Copy `.env.example` to `.env` and fill values:

- `TRELLO_API_KEY`
- `TRELLO_TOKEN`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_BASE_URL`
- `TRELLO_BOARD_ID`
- `JIRA_PROJECT_KEY`
- `ALLOW_SENSITIVE_PREFILL` (optional)

## Deploy to Vercel

1. Push project to GitHub (keep `.env` out of git).
2. Import repo in Vercel.
3. Add all environment variables in Vercel Project Settings.
4. Deploy.

## Presentation Flow (2-3 minutes)

1. Click **Preview Trello Cards**.
2. Show card list and explain this is live Trello data.
3. Click **Sync Trello Cards to Jira**.
4. Show snapshot counters update.
5. Open one clickable Jira issue link.
6. Click **Copy Demo Summary** and paste into slide/speaker notes.

## Important Security Note

If tokens were ever exposed in chat/screenshots, rotate them before publishing.
