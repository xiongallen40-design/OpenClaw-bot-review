# OpenClaw Bot Dashboard

A lightweight web dashboard for viewing all your [OpenClaw](https://github.com/openclaw/openclaw) bot configurations at a glance.

## Background

When running multiple OpenClaw agents across different platforms (Feishu, Discord, etc.), it becomes hard to track which bot uses which model. This dashboard reads your `openclaw.json` config and displays everything in a clean UI.

## Features

- **Bot Overview** — Card wall showing all agents with name, emoji, model, platform bindings, and Feishu App ID
- **Model List** — View all configured providers and models, with info on which agents use them
- **Auto Refresh** — Configurable refresh interval (manual, 10s, 30s, 1min, 5min, 10min)
- **Live Config** — Reads directly from `~/.openclaw/openclaw.json`, no manual sync needed

## Getting Started

```bash
# Clone the repo
git clone https://github.com/xmanrui/OpenClaw-bot-review.git
cd OpenClaw-bot-review

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- Next.js + TypeScript
- Tailwind CSS
- No database — reads config file directly

## Requirements

- Node.js 18+
- OpenClaw installed with config at `~/.openclaw/openclaw.json`

## Configuration

By default, the dashboard reads config from `~/.openclaw/openclaw.json`. To use a custom path, set the `OPENCLAW_HOME` environment variable:

```bash
OPENCLAW_HOME=/opt/openclaw npm run dev
```
