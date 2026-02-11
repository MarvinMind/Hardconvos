# PAWS - Personalized Anxiety Work-through System

## 🎯 Project Overview

PAWS is a freemium voice-based negotiation training platform that uses AI to simulate difficult conversations. Users practice handling challenging scenarios with dynamic AI counterparties that escalate or de-escalate based on user responses.

---

## 🚀 Production URLs

- **Live Application**: https://e8376dbf.hardconvos.pages.dev
- **Production URL**: https://hardconvos.pages.dev
- **GitHub Repository**: https://github.com/Alfredlechat/Hardconvos

---

## 💰 Dual AI Model System

### **Free Tier** (Cost: $0.01/minute)
- **Model**: GPT-4o-mini + TTS-1
- **Interface**: Push-to-talk (hold button to speak)
- **Features**: Basic conversation, turn-based interaction
- **Allocation**: 2 minutes free

### **Paid Tiers** (Cost: $0.30/minute, Revenue: $1.00/minute)
- **Model**: OpenAI Realtime API
- **Interface**: Full duplex voice conversation
- **Features**:
  - Real-time interruptions
  - Advanced arguments
  - Angry counterparties
  - Premium voice quality
  - Low latency

---

## 📊 Pricing Strategy

| Plan | Price | Minutes | $/Min | Margin |
|------|-------|---------|-------|--------|
| Free | $0 | 2 | - | Loss leader |
| Pay-Per-Use | $9.99 | 10 | $1.00 | 70% |
| Starter Monthly | $59.99 | 60 | $1.00 | 70% |
| Professional Monthly | $119.99 | 120 | $1.00 | 70% |
| Expert Monthly | $299.99 | 300 | $1.00 | 70% |
| Starter Annual | $647.89 | 720 | $0.90 | 70% |
| Professional Annual | $1,295.89 | 1,440 | $0.90 | 70% |
| Expert Annual | $3,239.89 | 3,600 | $0.90 | 70% |

**Annual plans include 10% discount to encourage long-term commitment**

---

## 🏗️ Technical Architecture

### **Frontend**
- Vanilla JavaScript
- TailwindCSS for styling
- Two voice implementations:
  - `practice-free.js` - Free tier (GPT-4o-mini + TTS)
  - `practice.js` - Paid tier (OpenAI Realtime API)

### **Backend**
- **Framework**: Hono (lightweight, edge-optimized)
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Authentication**: JWT tokens with HttpOnly cookies
- **Payment Processing**: Stripe integration

### **Database Schema**
- `users` - User accounts
- `subscription_plans` - Available subscription tiers
- `user_subscriptions` - Active user subscriptions
- `credit_balances` - User minute balances
- `usage_logs` - Session tracking and usage analytics

---

## 🔧 Development Setup

### **Prerequisites**
- Node.js 20+
- npm or pnpm
- Cloudflare account
- OpenAI API key
- Stripe account (for payments)

### **Local Development**

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start local development server (requires D1 database)
npm run dev:sandbox

# Or start with PM2 (for persistent development)
pm2 start ecosystem.config.cjs
```

### **Environment Variables**

Required secrets (set via `wrangler secret put`):
- `OPENAI_API_KEY` - OpenAI API key for AI models
- `JWT_SECRET` - Secret for JWT token signing
- `STRIPE_SECRET_KEY` - Stripe secret key for payments
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook verification

---

## 📦 Deployment

### **Cloudflare Pages Deployment**

```bash
# Set Cloudflare API token
export CLOUDFLARE_API_TOKEN=your_token_here

# Deploy from /tmp to avoid account ID conflicts
cd /tmp
npx wrangler@latest pages deploy /home/user/webapp/dist --project-name hardconvos --branch main
```

### **Database Migration**

```bash
# Local database
npx wrangler d1 migrations apply paws-users --local

# Production database
npx wrangler d1 migrations apply paws-users
```

### **Set Production Secrets**

```bash
npx wrangler pages secret put OPENAI_API_KEY --project-name hardconvos
npx wrangler pages secret put JWT_SECRET --project-name hardconvos
npx wrangler pages secret put STRIPE_SECRET_KEY --project-name hardconvos
npx wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name hardconvos
```

---

## 📈 Business Metrics

### **Cost Structure**
- **Free Tier**: $0.01/min (GPT-4o-mini: $0.00015/1K tokens + TTS-1: $0.015/1K chars)
- **Paid Tier**: $0.30/min (Realtime API: $0.06 input + $0.24 output)
- **Cloudflare**: Essentially free (generous free tier)

### **Target Margins**
- **Gross Margin**: 70% on paid tiers
- **Revenue per Minute**: $1.00 (paid tiers)
- **Free Tier Strategy**: Loss leader for user acquisition

### **Scaling Capacity**
- **Tier 4** (100 concurrent sessions): 9,600 conversations/day
- **Tier 5** (500 concurrent sessions): 48,000 conversations/day
- **Bottleneck**: OpenAI Realtime API concurrent session limits

---

## 🎨 Features

### **Completed Features**
- ✅ User authentication (register/login)
- ✅ Dual AI model system (free vs paid)
- ✅ 8 subscription tiers with pricing
- ✅ Dynamic scenario generation
- ✅ Real-time temper tracking
- ✅ Live transcript display
- ✅ Usage tracking and credit management
- ✅ Stripe payment integration
- ✅ Admin dashboard with metrics

### **Scenario Library**
1. **💼 Salary Negotiation** - Negotiate your worth with a tough manager
2. **📋 HR Disciplinary** - Navigate a difficult performance review
3. **📞 Sales Gatekeeper** - Get past the receptionist to the decision-maker
4. **😤 Client Escalation** - De-escalate an angry client situation

---

## 🔐 Security

- **Password Hashing**: Bcrypt with cost factor 10
- **Session Management**: JWT tokens with 7-day expiry
- **HttpOnly Cookies**: Prevents XSS attacks
- **API Token Security**: Server-side only, never exposed to frontend
- **Input Validation**: All user inputs validated
- **SQL Injection Prevention**: Prepared statements only

---

## 📊 Admin Dashboard

Access at `/admin` (requires authentication)

**Metrics Available**:
- Total users and user distribution by plan
- Total revenue, costs, and profit margins
- Conversion rate and ARPU (Average Revenue Per User)
- Average session duration
- Recent sessions feed
- Cost analysis (free vs paid tier breakdown)
- Automated recommendations

---

## 🚧 Future Enhancements

- [ ] Integration with third-party databases (Supabase, PlanetScale)
- [ ] Advanced analytics and reporting
- [ ] Team/enterprise plans
- [ ] Custom scenario builder
- [ ] Recording and playback of practice sessions
- [ ] Progress tracking and skill development
- [ ] Leaderboard and gamification
- [ ] Mobile app (React Native)

---

## 📝 Recent Changes

### Latest Deployment (2026-02-11)
- ✅ Implemented dual AI model system
- ✅ Fixed pricing to achieve 70% gross margin
- ✅ Added feature differentiation on pricing page
- ✅ Built comprehensive admin dashboard
- ✅ Deployed to Cloudflare Pages successfully

### Migrations Applied
- `0001_initial_schema.sql` - Database setup with 5 tables
- `0002_update_pricing.sql` - Updated to profitable pricing ($1.00/min)

---

## 🆘 Support & Contact

- **GitHub Issues**: https://github.com/Alfredlechat/Hardconvos/issues
- **Email**: keithsymondson@gmail.com

---

## 📄 License

Proprietary - All rights reserved

---

**Built with ❤️ using Cloudflare Workers, Hono, and OpenAI**
