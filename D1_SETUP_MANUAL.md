# D1 Database Setup - Manual Steps via Dashboard

## ✅ Database Created Successfully!

**Database Name**: `paws-users`  
**Database ID**: `ec96c0e1-5dd6-40c1-b2aa-40140e979b59`  
**Status**: Created, ready for migrations  
**wrangler.jsonc**: Already updated with correct database ID

## Step 1: Access the Database Console

1. Go to https://dash.cloudflare.com/
2. Navigate to **Workers & Pages** > **D1**
3. Find and click on **paws-users** database
4. Click on the **Console** tab

## Step 2: Apply Initial Schema Migration

Copy and paste the contents of `/home/user/webapp/migrations/0001_initial_schema.sql` into the console:

```sql
-- PAWS User Management Schema
-- Supports authentication, usage tracking, and subscription management

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- UUID
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL, -- Unix timestamp
  last_login_at INTEGER,
  email_verified INTEGER DEFAULT 0, -- 0 = false, 1 = true
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Subscription plans reference (static data)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY, -- 'free', 'payperuse', 'starter_monthly', etc.
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('free', 'payperuse', 'monthly', 'annual')),
  price_cents INTEGER NOT NULL, -- In cents (e.g., 199 for $1.99)
  minutes_included INTEGER, -- NULL for unlimited or pay-per-use
  billing_cycle TEXT CHECK (billing_cycle IN ('one_time', 'monthly', 'annual')),
  stripe_price_id TEXT,
  active INTEGER DEFAULT 1 -- 0 = false, 1 = true
);

-- User subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id TEXT PRIMARY KEY, -- UUID
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  stripe_subscription_id TEXT, -- NULL for pay-per-use
  stripe_customer_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'paused')),
  current_period_start INTEGER NOT NULL, -- Unix timestamp
  current_period_end INTEGER NOT NULL, -- Unix timestamp
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe ON user_subscriptions(stripe_subscription_id);

-- Usage tracking (conversation sessions)
CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY, -- UUID
  user_id TEXT NOT NULL,
  session_start INTEGER NOT NULL, -- Unix timestamp
  session_end INTEGER, -- Unix timestamp (NULL if in progress)
  duration_seconds INTEGER DEFAULT 0, -- Actual conversation time
  scenario_id TEXT, -- e.g., 'salary-negotiation'
  credits_used INTEGER DEFAULT 0, -- Minutes or credits consumed
  subscription_id TEXT, -- Which subscription/credit pool was used
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'exceeded')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id)
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_session_start ON usage_logs(session_start);
CREATE INDEX IF NOT EXISTS idx_usage_logs_status ON usage_logs(status);

-- Credit balances (for pay-per-use and tracking monthly minutes)
CREATE TABLE IF NOT EXISTS credit_balances (
  id TEXT PRIMARY KEY, -- UUID
  user_id TEXT NOT NULL,
  subscription_id TEXT, -- NULL for free tier
  balance_seconds INTEGER DEFAULT 0, -- Remaining time in seconds
  original_balance_seconds INTEGER DEFAULT 0, -- Original allocation
  period_start INTEGER NOT NULL, -- Unix timestamp
  period_end INTEGER NOT NULL, -- Unix timestamp (when credits expire)
  type TEXT CHECK (type IN ('free', 'payperuse', 'monthly', 'annual', 'grace')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id)
);

CREATE INDEX IF NOT EXISTS idx_credit_balances_user_id ON credit_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_balances_period_end ON credit_balances(period_end);

-- Payment transactions log
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, -- UUID
  user_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  description TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_payment ON transactions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- Session tokens (for passwordless auth/magic links)
CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY, -- UUID
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  type TEXT CHECK (type IN ('session', 'magic_link', 'password_reset')),
  expires_at INTEGER NOT NULL, -- Unix timestamp
  created_at INTEGER NOT NULL,
  used_at INTEGER, -- Unix timestamp (NULL if not used)
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_token_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires_at ON auth_tokens(expires_at);

-- Insert default subscription plans
INSERT OR IGNORE INTO subscription_plans (id, name, type, price_cents, minutes_included, billing_cycle, active) VALUES
('free', 'Free Trial', 'free', 0, 2, 'monthly', 1),
('payperuse', 'Pay Per Use', 'payperuse', 199, 10, 'one_time', 1),
('starter_monthly', 'Starter Monthly', 'monthly', 999, 60, 'monthly', 1),
('professional_monthly', 'Professional Monthly', 'monthly', 1499, 120, 'monthly', 1),
('expert_monthly', 'Expert Monthly', 'monthly', 2999, 300, 'monthly', 1),
('starter_annual', 'Starter Annual', 'annual', 9990, 60, 'annual', 1),
('professional_annual', 'Professional Annual', 'annual', 14990, 120, 'annual', 1),
('expert_annual', 'Expert Annual', 'annual', 29990, 300, 'annual', 1);
```

Click **Execute** to run the migration.

## Step 3: Apply Pricing Update Migration

Copy and paste the contents of `/home/user/webapp/migrations/0002_update_pricing.sql` into the console and execute.

## Step 4: Bind Database to Cloudflare Pages

1. Go to **Workers & Pages**
2. Find your **hardconvos** project
3. Click on it
4. Go to **Settings** > **Functions**
5. Scroll to **D1 database bindings**
6. Click **Add binding**
   - Variable name: `DB`
   - D1 database: Select `paws-users`
7. Click **Save**

## Step 5: Set Environment Secrets

Run these commands from your local machine or the sandbox:

```bash
# Set OPENAI_API_KEY
npx wrangler pages secret put OPENAI_API_KEY --project-name hardconvos
# Paste your OpenAI API key when prompted

# Set JWT_SECRET (generate a random string)
npx wrangler pages secret put JWT_SECRET --project-name hardconvos
# Use a random string like: your-super-secret-jwt-key-change-this-in-production

# Optional: Set Stripe keys if you want payments
npx wrangler pages secret put STRIPE_SECRET_KEY --project-name hardconvos
npx wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name hardconvos
```

## Step 6: Deploy to Production

```bash
cd /home/user/webapp
npm run build
npx wrangler pages deploy dist --project-name hardconvos
```

## Step 7: Test Registration

After deployment, test that everything works:

```bash
curl -X POST https://hardconvos.pages.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123","name":"Test User"}'
```

You should see a success response with user data and free tier subscription!

## Verification Checklist

- ✅ Database created: `paws-users`
- ✅ wrangler.jsonc updated with correct database_id
- ⏳ Migration 0001 applied via Console
- ⏳ Migration 0002 applied via Console
- ⏳ Database bound to Cloudflare Pages project
- ⏳ Environment secrets set
- ⏳ Production deployment
- ⏳ Registration tested

## Troubleshooting

If registration still fails:
1. Check the D1 database binding is correct in Pages settings
2. Verify OPENAI_API_KEY secret is set
3. Check browser console for errors
4. Review Cloudflare Pages logs for deployment issues
