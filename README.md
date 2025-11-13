# Artificial Client - Voice Practice MVP

> **Practice handling difficult client conversations with AI-powered voice simulation**

A browser-based application where consultants and salespeople can practice tough conversations with a realistic AI "client" that pushes back, interrupts naturally, and provides coaching feedback.

---

## 🎯 Project Overview

**Artificial Client** is a training tool that simulates difficult client conversations using OpenAI's Realtime API for natural, duplex voice interaction. Users speak with an AI-powered client who challenges them on late projects, missed milestones, and payment issues - then receive personalized coaching feedback.

### Key Features

- ✅ **Real-time voice conversation** with natural barge-in and low latency via WebRTC
- ✅ **Scenario-driven AI client** that stays in character and escalates pressure
- ✅ **Live transcript** with automatic speech-to-text
- ✅ **Post-call coaching debrief** with performance score (0-10) and actionable tips
- ✅ **Secure ephemeral tokens** for browser-to-OpenAI connection
- ✅ **Cloudflare Pages deployment** for global edge performance

---

## 🏗️ Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Browser   │────────▶│ Cloudflare Pages │         │   OpenAI    │
│  (Frontend) │         │   + Worker API   │         │  Realtime   │
└─────────────┘         └──────────────────┘         └─────────────┘
      │                          │                           │
      │  1. Request ephemeral    │                           │
      │─────────────────────────▶│                           │
      │                          │  2. Generate token        │
      │                          │──────────────────────────▶│
      │                          │◀──────────────────────────│
      │  3. Return token         │                           │
      │◀─────────────────────────│                           │
      │                                                      │
      │  4. Establish WebRTC connection                     │
      │─────────────────────────────────────────────────────▶│
      │                                                      │
      │  5. Duplex audio stream (voice in/out)              │
      │◀────────────────────────────────────────────────────▶│
```

### Technology Stack

- **Frontend**: Vanilla JavaScript, TailwindCSS, Web Audio API, WebRTC
- **Backend**: Hono (Cloudflare Pages Functions)
- **AI**: OpenAI Realtime API (gpt-4o-realtime-preview), GPT-4o (debrief)
- **Deployment**: Cloudflare Pages with edge distribution

---

## 🚀 Current Status

### ✅ Completed Features

1. **WebRTC Integration**
   - Ephemeral token generation via `/api/ephemeral`
   - Browser-to-OpenAI direct WebRTC connection
   - Audio streaming with microphone capture
   - Real-time audio level monitoring

2. **Scenario Engine**
   - JSON-based scenario configuration
   - System prompt injection with scenario context
   - COO persona: direct, data-obsessed, low tolerance for excuses
   - Scenario facts: missed milestones (SIC 62% vs 85% target)

3. **Live Conversation**
   - Real-time speech-to-text transcript
   - User and client message display
   - Visual recording indicator
   - Connection status monitoring

4. **Coaching Debrief**
   - Post-call performance analysis via GPT-4o
   - Score (0-10) with detailed feedback
   - Strengths and improvement areas
   - Key takeaway summary

5. **Production Infrastructure**
   - PM2 process management for sandbox
   - Cloudflare Pages build configuration
   - Environment variable setup (.dev.vars)
   - Git version control

### 🔄 In Progress

- Turn tagging with structured outputs for analytics
- Enhanced error handling and reconnection logic
- Difficulty escalation tracking

### 📋 Roadmap (Future Enhancements)

1. **Multiple Scenarios** - Build library of different client personas
2. **Session History** - Store transcripts in Cloudflare D1
3. **Progress Tracking** - Track improvement over multiple sessions
4. **Digital Avatar Integration** - Connect to Heygen for Zoom/Teams meetings
5. **Advanced Analytics** - Detailed turn-by-turn performance metrics

---

## 📊 Data Architecture

### Scenario Structure (JSON)

```json
{
  "persona": {
    "role": "COO of municipal services operator",
    "style": "direct, data-obsessed, low tolerance for excuses"
  },
  "facts": {
    "phase": "month 4 of 9",
    "targets": { "SIC_compliance": 85 },
    "current": { "SIC_compliance": 62 }
  },
  "objection_bank": [
    "Four months in and benefits look theoretical...",
    "Usage is inconsistent. Why should we believe..."
  ],
  "escalation": {
    "trigger_phrases": ["staff resistance", "not our fault"],
    "exec": "CFO joins to question payment triggers"
  }
}
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main application UI |
| `/api/ephemeral` | POST | Generate OpenAI ephemeral token (60s validity) |
| `/api/debrief` | POST | Generate post-call coaching feedback |
| `/scenario.json` | GET | Load current scenario configuration |

---

## 🛠️ Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- OpenAI API key with Realtime API access
- Cloudflare account (for deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd webapp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .dev.vars.example .dev.vars
   ```
   
   Edit `.dev.vars` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-your-actual-key-here
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start development server**
   
   **For sandbox environment (PM2):**
   ```bash
   pm2 start ecosystem.config.cjs
   ```
   
   **For local machine:**
   ```bash
   npm run dev:sandbox
   ```

6. **Access the application**
   - Local: http://localhost:3000
   - Sandbox: https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai

### Testing the Application

1. Click **"Start Conversation"**
2. Allow microphone access when prompted
3. Speak naturally - the AI client will respond and push back
4. Click **"End Conversation"** to receive coaching debrief

---

## 🌐 Deployment to Cloudflare Pages

### First-Time Setup

1. **Authenticate with Cloudflare**
   ```bash
   npx wrangler login
   ```

2. **Create Cloudflare Pages project**
   ```bash
   npx wrangler pages project create artificial-client \
     --production-branch main \
     --compatibility-date 2024-01-01
   ```

3. **Set OpenAI API key as secret**
   ```bash
   npx wrangler pages secret put OPENAI_API_KEY --project-name artificial-client
   # Enter your OpenAI API key when prompted
   ```

4. **Deploy**
   ```bash
   npm run deploy:prod
   ```

### Subsequent Deployments

```bash
npm run build
npx wrangler pages deploy dist --project-name artificial-client
```

Your app will be available at:
- Production: `https://artificial-client.pages.dev`
- Branch: `https://main.artificial-client.pages.dev`

---

## 📖 User Guide

### How to Use

1. **Review the Scenario**
   - See the client persona (COO of municipal services)
   - Understand the context (project late, metrics below target)

2. **Start the Conversation**
   - Click "Start Conversation"
   - Allow microphone access
   - Wait for the client to introduce themselves and state concerns

3. **Respond Naturally**
   - Speak as you would in a real client call
   - The AI will interrupt if you ramble or avoid specifics
   - Be prepared to provide: owners, dates, checkpoints, mitigation plans

4. **Handle Escalation**
   - If you blame others or avoid accountability, difficulty increases
   - The "CFO may join" to pressure on payment terms
   - Stay calm and provide concrete recovery plans

5. **Review Your Debrief**
   - See your performance score (0-10)
   - Review what you did well
   - Study improvement areas
   - Apply key takeaway to next attempt

### Success Criteria

The AI client is looking for:
- ✅ **Ownership** - Acknowledge the miss without blaming others
- ✅ **Concrete Plan** - 14-day corrective plan with named owners
- ✅ **Leading Indicators** - Metrics that move before lagging benefits
- ✅ **Reasonable Compromise** - Payment holdback tied to clear milestones

---

## 🔒 Security & Privacy

- ✅ **No API keys exposed** - Root OpenAI key stored in Cloudflare secrets
- ✅ **Ephemeral tokens** - 60-second validity, browser-only
- ✅ **Direct WebRTC** - Audio streams browser ↔ OpenAI (not via our servers)
- ✅ **No storage** - Transcripts kept in browser memory only (MVP)
- ✅ **CORS enabled** - Secure cross-origin API calls

---

## 📝 Development Notes

### PM2 Commands (Sandbox)

```bash
pm2 list                           # List running services
pm2 logs artificial-client --nostream  # Check logs (non-blocking)
pm2 restart artificial-client      # Restart service
pm2 delete artificial-client       # Stop and remove service
```

### Build Output

```
dist/
├── _worker.js          # Compiled Hono backend
├── _routes.json        # Cloudflare routing config
├── scenario.json       # Scenario configuration
└── static/
    ├── app.js          # Frontend WebRTC logic
    └── style.css       # Additional styles
```

### Key Files

- `src/index.tsx` - Hono backend with API routes
- `public/static/app.js` - WebRTC client implementation
- `public/scenario.json` - Current scenario configuration
- `ecosystem.config.cjs` - PM2 process configuration
- `wrangler.jsonc` - Cloudflare deployment config

---

## 🐛 Troubleshooting

### WebRTC Connection Fails

- **Check API key**: Ensure `OPENAI_API_KEY` is set correctly
- **Corporate networks**: Some firewalls block WebRTC (try mobile hotspot)
- **Browser permissions**: Allow microphone access when prompted
- **Console logs**: Check browser DevTools for detailed errors

### No Audio Output

- **Check speakers**: Ensure system audio is working
- **Browser settings**: Verify audio output device in browser settings
- **Remote audio track**: Check browser console for "Received remote audio track"

### Token Expiry

- **60-second validity**: Start speaking within 1 minute of connecting
- **Auto-reconnect**: Not yet implemented (reload page for new session)

### Build Errors

```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

---

## 📄 License

MIT License - See LICENSE file for details

---

## 👥 Contributing

This is an MVP prototype. For the next phase:
1. Add multiple scenarios (CFO, CTO, Procurement Director)
2. Store session history in Cloudflare D1
3. Implement progress tracking dashboard
4. Integrate Heygen digital avatars for Zoom/Teams

---

## 🔗 Resources

- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Hono Framework](https://hono.dev/)
- [WebRTC API Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

---

## 📊 Current URLs

- **Sandbox**: https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai
- **Production**: (Deploy with `npm run deploy:prod`)

---

**Last Updated**: 2025-11-13  
**Status**: ✅ MVP Complete - Ready for testing with OpenAI API key
