# 🐾 PAWS - Personalized Anxiety Work-through System

> **"Take a PAWS before that hard conversation"**

A browser-based application where professionals practice difficult conversations with AI-powered voice simulation. PAWS uses OpenAI's Realtime API to help you rehearse tough conversations with personalized fear scenarios, adjustable difficulty levels, and coaching feedback.

---

## 🎯 Project Overview

**PAWS (Personalized Anxiety Work-through System)** is a training tool that simulates difficult conversations using OpenAI's Realtime API for natural, duplex voice interaction. Users speak with an AI-powered persona who challenges them based on their specific fears and concerns - then receive personalized coaching feedback.

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

6. **Authentication System (Phase 2)** ✅
   - User registration with email/password
   - JWT-based session management (7-day expiry)
   - Password hashing with bcryptjs
   - Protected API routes with middleware
   - Free tier auto-provisioning on signup

7. **Usage Tracking System (Phase 3)** ✅
   - Real-time conversation session tracking
   - Credit balance management (seconds-based)
   - Atomic credit deduction to prevent race conditions
   - Free tier: 2 minutes/month with 90-second hard cutoff
   - Grace period for monthly plans (2 minutes at 90% usage)
   - Session history and analytics

8. **Freemium Monetization Backend (Phase 4 - Placeholder)** ✅
   - 8 pricing tiers configured in database
   - Stripe checkout API (placeholder ready)
   - Subscription management endpoints
   - Webhook handler for payment events (structure ready)
   - Customer Portal integration (placeholder)

### 🔄 In Progress

- **Frontend UI for Authentication (Phase 5)**
  - Login/Register pages
  - Pricing page with beautiful tier display
  - Account dashboard with usage stats
  - Timer display during conversations
  - Upgrade modal when credits exhausted

### 📋 Roadmap (Next Steps)

1. **Complete Monetization Frontend** - Build login, pricing, and account pages
2. **Real Stripe Integration** - Replace placeholders with live Stripe API
3. **Setup Wizard Improvements** - Add dynamic scenario builder with temper meter
4. **Multiple Scenarios** - Expand library beyond COO client escalation
5. **Session History** - Full transcript storage and review
6. **Digital Avatar Integration** - Connect to Heygen for Zoom/Teams meetings
7. **Advanced Analytics** - Detailed turn-by-turn performance metrics

---

## 💰 Monetization System

PAWS implements a complete freemium model to control costs at scale:

### Pricing Tiers (8 Plans)

#### Free Tier
- **Price**: $0/month
- **Minutes**: 2 minutes per month
- **Features**: 
  - Email/password authentication
  - Hard cutoff at 1:30 (90 seconds) with finish-sentence grace
  - Perfect for trying the platform

#### Pay-Per-Use
- **Price**: $1.99 per purchase
- **Minutes**: 10 minutes reusable credit pool
- **Features**:
  - Credits persist across sessions until depleted
  - Auto-pause when exhausted
  - Can buy multiple times to continue
  - No expiration

#### Monthly Subscriptions
- **Starter**: $9.99/month → 60 minutes (no rollover)
- **Professional**: $14.99/month → 120 minutes (no rollover)
- **Expert**: $29.99/month → 300 minutes (no rollover)
- **Features**:
  - Warning at 90% usage
  - 2 free grace minutes with countdown timer
  - Hard cutoff after grace period
  - Can purchase pay-per-use as addon

#### Annual Subscriptions (17% Discount)
- **Starter Annual**: $99.90/year (save $19.98)
- **Professional Annual**: $149.90/year (save $29.98)
- **Expert Annual**: $299.90/year (save $59.88)
- **Features**:
  - Same as monthly, but billed annually
  - Minutes refresh every 30 days
  - Overage charged at $1.59/conversation (20% discount)

### Credit System

- **Tracking**: Seconds-based balance (not minutes)
- **Atomic Updates**: Race condition prevention on deduction
- **Grace Periods**: 
  - Free tier: Hard cutoff at 90 seconds
  - Monthly/Annual: 2-minute grace at 90% usage
- **Expiration**: Credits expire at period end (except pay-per-use)
- **Overage Handling**: Auto-pause with upgrade prompt

### Database Schema

#### Users Table
```sql
- id (UUID) - Primary key
- email (UNIQUE) - Authentication identifier
- password_hash - Bcrypt with cost factor 10
- name - Optional display name
- created_at (Unix timestamp)
- email_verified (boolean)
- status (active/suspended)
```

#### Subscription Plans (8 predefined)
```sql
- id - Plan identifier (free, payperuse, starter_monthly, etc.)
- name - Display name
- type - free/payperuse/monthly/annual
- price_cents - Amount in cents
- minutes_included - Time allocation
- billing_cycle - monthly/annual/one_time
- stripe_price_id - Stripe Price ID (when configured)
```

#### User Subscriptions
```sql
- id (UUID)
- user_id → users.id
- plan_id → subscription_plans.id
- stripe_subscription_id - Stripe Subscription ID
- status - active/canceled/past_due
- current_period_start/end (Unix timestamp)
```

#### Credit Balances
```sql
- id (UUID)
- user_id → users.id
- balance_seconds - Remaining time in seconds
- original_balance_seconds - Initial allocation
- period_end - Expiration timestamp
- type - free/payperuse/monthly/annual/grace
```

#### Usage Logs
```sql
- id (UUID)
- user_id → users.id
- session_start (Unix timestamp)
- duration_seconds - Conversation length
- scenario_id - Which scenario was practiced
- status - active/completed/interrupted
```

### Payment Integration (Stripe - Placeholder)

**Current Status**: Backend ready with placeholder responses

**To Enable Real Payments**:
1. Create Stripe account at https://stripe.com
2. Get API keys (test + production)
3. Create Price IDs for all 8 plans in Stripe Dashboard
4. Add to wrangler.jsonc secrets:
   ```bash
   npx wrangler pages secret put STRIPE_SECRET_KEY --project-name paws
   npx wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name paws
   ```
5. Update `stripe_price_id` in database for each plan
6. Deploy updated code

**Webhook Events to Handle**:
- `checkout.session.completed` - Activate subscription
- `invoice.payment_succeeded` - Renew monthly credits
- `customer.subscription.updated` - Update status
- `customer.subscription.deleted` - Cancel subscription

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

#### Authentication (Phase 2)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/register` | POST | None | Create new account + free tier (2 min/month) |
| `/api/auth/login` | POST | None | Authenticate and receive JWT cookie |
| `/api/auth/logout` | POST | None | Clear authentication cookie |
| `/api/auth/me` | GET | Required | Get current user profile + credits |

#### Usage Tracking (Phase 3)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/usage/start` | POST | Required | Begin conversation session |
| `/api/usage/heartbeat` | POST | Required | Update duration + check credits |
| `/api/usage/end` | POST | Required | End session + deduct credits |
| `/api/usage/balance` | GET | Required | Get remaining time balance |
| `/api/usage/history` | GET | Required | Get past conversation sessions |

#### Subscriptions & Payment (Phase 4 - Placeholders)
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/subscriptions/plans` | GET | None | List all 8 pricing tiers |
| `/api/subscriptions/current` | GET | Required | Get user's active subscription |
| `/api/checkout/create-session` | POST | Required | Create Stripe checkout (placeholder) |
| `/api/checkout/portal` | POST | Required | Access Customer Portal (placeholder) |
| `/api/webhooks/stripe` | POST | None | Handle Stripe payment events (placeholder) |

#### OpenAI & Scenarios
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/ephemeral` | POST | Required* | Generate OpenAI ephemeral token (60s) |
| `/api/debrief` | POST | Required* | Generate coaching feedback |
| `/api/scenario/generate` | POST | None | Build dynamic scenario prompt |
| `/scenarios/*.json` | GET | None | Load scenario configuration files |

*Note: Will require authentication after frontend Phase 5 is complete

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

1. **Set OpenAI API key as secret** ⚠️ **REQUIRED NEXT STEP**
   ```bash
   npx wrangler pages secret put OPENAI_API_KEY --project-name paws
   # Enter your OpenAI API key when prompted
   ```

2. **Deploy updates**
   ```bash
   npm run deploy:prod
   ```

### Subsequent Deployments

```bash
npm run build
npx wrangler pages deploy dist --project-name paws
```

Your app is available at:
- Production: `https://paws-cai.pages.dev` ⭐ (Fixed URL - always points to latest)
- Latest Deploy: `https://77ef69c1.paws-cai.pages.dev`

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

- **Production (Fixed URL)**: https://paws-cai.pages.dev ⭐
- **Latest Deployment**: https://77ef69c1.paws-cai.pages.dev
- **GitHub**: https://github.com/Alfredlechat/Hardconvos.git

---

**Last Updated**: 2025-11-13  
**Status**: ✅ Deployed to Cloudflare Pages - **⚠️ Awaiting OpenAI API key configuration**
