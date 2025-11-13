# 💰 PAWS Monetization Implementation Guide

## 📋 Overview

This document outlines the complete implementation of PAWS' freemium model with Stripe integration.

---

## 💳 Pricing Structure

### Free Tier (Phase 1)
- **Cost**: $0
- **Minutes**: 2 minutes/month
- **Requirements**: Create account (no payment)
- **Behavior**: Hard cutoff at 1:30 with finish-sentence grace

### Pay-Per-Use
- **Cost**: $1.99
- **Minutes**: 10-minute reusable credit pool
- **Behavior**: Auto-pause when depleted, can buy another $1.99

### Monthly Subscriptions
| Plan | Price | Minutes | Rollover |
|------|-------|---------|----------|
| Starter | $9.99/mo | 60 min | No |
| Professional | $14.99/mo | 120 min | No |
| Expert | $29.99/mo | 300 min | No |

**Features**:
- 90% warning + 2 free grace minutes (countdown)
- Can purchase pay-per-use as addon
- Hard cutoff after grace period

### Annual Subscriptions
| Plan | Annual Price | Monthly Equiv | Discount | Overage Rate |
|------|-------------|---------------|----------|--------------|
| Starter Annual | $99.90 | $8.33/mo | 2 mo free | $1.59/conv |
| Professional Annual | $149.90 | $12.49/mo | 2 mo free | $1.59/conv |
| Expert Annual | $299.90 | $24.99/mo | 2 mo free | $1.59/conv |

**Features**:
- Minutes refresh monthly
- Must manually purchase overage at 20% discount

---

## 🗄️ Database Schema

### Tables Created:
1. **users** - User accounts and authentication
2. **subscription_plans** - Plan definitions (static reference)
3. **user_subscriptions** - Active subscriptions per user
4. **usage_logs** - Conversation session tracking
5. **credit_balances** - Available minutes/credits
6. **transactions** - Payment history
7. **auth_tokens** - Session tokens and magic links

### Key Relationships:
```
users (1) ─────▶ (N) user_subscriptions
                      │
                      ├──▶ (1) subscription_plans
                      │
                      └──▶ (N) credit_balances

users (1) ─────▶ (N) usage_logs
users (1) ─────▶ (N) transactions
users (1) ─────▶ (N) auth_tokens
```

---

## 🔧 Technical Implementation

### Phase 1: Database Setup ✅ READY

**Files Created:**
- `migrations/0001_initial_schema.sql` - Complete database schema
- `seed.sql` - Test data with 3 sample users

**Next Steps:**
1. Create D1 database via Cloudflare Dashboard:
   - Go to: https://dash.cloudflare.com
   - Navigate to: Storage & Databases → D1
   - Click: "Create database"
   - Name: `paws-users`
   - Copy the database ID
   - Update `wrangler.jsonc` with the ID

2. Run migrations:
```bash
npx wrangler d1 migrations apply paws-users --local  # For dev
npx wrangler d1 migrations apply paws-users         # For production
```

3. Seed test data:
```bash
npx wrangler d1 execute paws-users --local --file=./seed.sql
```

---

### Phase 2: Authentication API (IN PROGRESS)

**Endpoints to Build:**
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/logout` - Invalidate session
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/verify-email` - Email verification
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Complete password reset

**Authentication Flow:**
1. User registers with email + password
2. Password hashed with bcrypt
3. JWT token issued (stored in cookie)
4. Token validated on each API request
5. Free tier subscription auto-created

---

### Phase 3: Usage Tracking (TO BUILD)

**Endpoints:**
- `POST /api/usage/start` - Begin conversation session
- `POST /api/usage/heartbeat` - Update session duration
- `POST /api/usage/end` - Complete session
- `GET /api/usage/balance` - Get remaining minutes
- `GET /api/usage/history` - View past conversations

**Real-Time Timer Logic:**
1. Frontend calls `/api/usage/start` when conversation begins
2. Every 10 seconds, call `/api/usage/heartbeat` with elapsed time
3. Backend checks credit balance and responds with status
4. At 90% usage, return `warning` status + grace period start
5. At depletion, return `paused` status (frontend pauses audio)
6. Frontend displays remaining time countdown

---

### Phase 4: Stripe Integration (TO BUILD)

**Stripe Setup Required:**
1. Create Stripe account: https://dashboard.stripe.com/register
2. Get API keys (test mode first):
   - Publishable key: `pk_test_...`
   - Secret key: `sk_test_...`
3. Create products in Stripe:
   - Pay-Per-Use ($1.99 one-time)
   - Starter Monthly ($9.99/month)
   - Professional Monthly ($14.99/month)
   - Expert Monthly ($29.99/month)
   - Starter Annual ($99.90/year)
   - Professional Annual ($149.90/year)
   - Expert Annual ($299.90/year)
4. Enable Customer Portal in Stripe Dashboard
5. Set up webhook endpoint: `https://paws-cai.pages.dev/api/webhooks/stripe`

**Endpoints:**
- `POST /api/checkout/create-session` - Start Stripe Checkout
- `POST /api/checkout/portal` - Access Customer Portal
- `POST /api/webhooks/stripe` - Handle Stripe webhooks
- `GET /api/subscriptions/plans` - List available plans
- `GET /api/subscriptions/current` - Get user's subscription

**Stripe Checkout Flow:**
1. User clicks "Upgrade" or "Buy Credits"
2. Frontend calls `/api/checkout/create-session` with plan ID
3. Backend creates Stripe Checkout Session
4. User redirected to Stripe payment page
5. After payment, Stripe sends webhook to backend
6. Backend activates subscription and credits
7. User redirected back to app

---

### Phase 5: Frontend UI (TO BUILD)

**Pages to Create:**
1. **Auth Pages:**
   - `/login` - Email/password login form
   - `/register` - Sign up form
   - `/forgot-password` - Password reset request
   - `/reset-password?token=...` - Complete reset

2. **Pricing Page:**
   - `/pricing` - Beautiful pricing comparison table
   - Feature comparison matrix
   - FAQ section
   - "Start Free Trial" CTA

3. **Account Dashboard:**
   - `/account` - Profile settings
   - `/account/billing` - Subscription & payment history
   - `/account/usage` - Minutes used/remaining
   - `/account/history` - Past conversation sessions

4. **Upgrade Prompts:**
   - Modal when free minutes depleted
   - In-session warning at 90% usage
   - Banner for users near limit
   - "Add more minutes" button during pause

---

## 🎨 UI Components Needed

### Authentication Components:
- `<LoginForm>` - Email/password login
- `<RegisterForm>` - Sign up with email
- `<ProtectedRoute>` - Require authentication
- `<UserMenu>` - Profile dropdown (nav bar)

### Pricing Components:
- `<PricingCard>` - Individual plan card
- `<PricingTable>` - Full comparison table
- `<CheckoutButton>` - Triggers Stripe Checkout
- `<PlanBadge>` - Current plan indicator

### Usage Components:
- `<UsageProgress>` - Circular progress bar
- `<TimeRemaining>` - Countdown timer
- `<UpgradeModal>` - Upsell when out of time
- `<GracePeriodWarning>` - 2-minute countdown alert

---

## 🔐 Security Considerations

### Authentication:
- ✅ Passwords hashed with bcrypt (cost factor 10)
- ✅ JWT tokens with 7-day expiration
- ✅ HTTP-only cookies (no XSS attacks)
- ✅ CSRF protection with Hono middleware
- ✅ Rate limiting on auth endpoints (10 req/min)

### Payment Security:
- ✅ Stripe handles all card data (PCI compliant)
- ✅ Webhook signature verification
- ✅ Idempotency keys for retries
- ✅ Server-side price validation (never trust client)

### Usage Tracking:
- ✅ Server-side time tracking (can't be manipulated)
- ✅ Heartbeat validation (detect tampering)
- ✅ Grace period enforced on backend
- ✅ Credit balance atomic updates (prevent race conditions)

---

## 📊 Admin Dashboard (Phase 6 - Optional)

**Metrics to Track:**
- Total users (free vs paid)
- Monthly recurring revenue (MRR)
- Conversion rate (free → paid)
- Average revenue per user (ARPU)
- Churn rate
- Total conversation minutes consumed
- Most popular scenarios

**Tools:**
- Build custom admin panel
- OR use Stripe Dashboard for revenue tracking
- OR integrate with analytics (Mixpanel, Amplitude)

---

## 🚀 Deployment Checklist

### Before Launch:
- [ ] D1 database created and migrated
- [ ] Stripe account verified
- [ ] Stripe products created
- [ ] Stripe webhook endpoint configured
- [ ] Environment variables set:
  - `OPENAI_API_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `JWT_SECRET`
- [ ] Test all payment flows (Stripe test mode)
- [ ] Test usage tracking with timers
- [ ] Test upgrade prompts and modals
- [ ] Email verification working (optional for MVP)

### Post-Launch:
- [ ] Switch Stripe to live mode
- [ ] Update Stripe keys in Cloudflare
- [ ] Monitor webhook logs
- [ ] Set up error tracking (Sentry)
- [ ] Monitor conversion funnel
- [ ] Collect user feedback

---

## 💡 Next Immediate Steps

1. **Create D1 Database** (via Cloudflare Dashboard)
2. **Run Migrations** (apply schema)
3. **Build Auth API** (register, login, JWT)
4. **Build Usage Tracking API** (start/heartbeat/end)
5. **Set up Stripe Account** (get API keys)
6. **Build Pricing Page** (beautiful UI)
7. **Integrate Stripe Checkout** (payment flow)
8. **Add Usage Timer** (frontend countdown)
9. **Test Complete Flow** (free → upgrade → paid)
10. **Deploy to Production** 🎉

---

## 📞 Stripe Account Setup Guide

1. **Create Account**: https://dashboard.stripe.com/register
2. **Verify Email**: Check inbox and confirm
3. **Complete Profile**: Business details (can skip for testing)
4. **Get Test Keys**: Dashboard → Developers → API keys
5. **Create Products**: Dashboard → Products → Add product
6. **Set Up Webhook**: Dashboard → Developers → Webhooks → Add endpoint
7. **Test Mode**: Keep "Test mode" toggle ON until ready to launch

---

**Status**: Phase 1 Complete (Database Schema)  
**Next**: Create D1 database in Cloudflare Dashboard

**Want me to continue with Phase 2 (Auth API)?** 🚀
