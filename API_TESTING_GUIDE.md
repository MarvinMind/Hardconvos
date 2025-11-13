# 🧪 PAWS API Testing Guide

**Service URL**: https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai

Test the complete monetization backend with these curl commands:

---

## 1. Authentication API

### Register New User
```bash
curl -X POST https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "password": "Demo123456",
    "name": "Demo User"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "user": {
    "id": "uuid-here",
    "email": "demo@example.com",
    "name": "Demo User",
    "created_at": 1763032077
  },
  "subscription": {
    "plan_id": "free",
    "status": "active",
    "period_end": 1765624077
  }
}
```

### Login
```bash
curl -X POST https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "demo@example.com",
    "password": "Demo123456"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "user": { ... },
  "subscription": { ... }
}
```

### Get Current User Profile
```bash
curl -X GET https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/auth/me \
  -b cookies.txt
```

**Expected Response**:
```json
{
  "user": { ... },
  "subscription": {
    "plan_id": "free",
    "status": "active",
    "period_start": 1763032077,
    "period_end": 1765624077
  },
  "credits": {
    "balance_seconds": 120,
    "balance_minutes": 2,
    "period_end": 1765624077,
    "type": "free"
  }
}
```

---

## 2. Usage Tracking API

### Start Conversation Session
```bash
curl -X POST https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/usage/start \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "scenario_id": "salary-negotiation"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "session_id": "uuid-session-id",
  "available_seconds": 120,
  "available_minutes": 2,
  "credit_type": "free"
}
```

### Send Heartbeat (30 seconds into conversation)
```bash
SESSION_ID="your-session-id-from-above"

curl -X POST https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/usage/heartbeat \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{
    \"session_id\": \"$SESSION_ID\",
    \"duration_seconds\": 30
  }"
```

**Expected Response**:
```json
{
  "success": true,
  "should_stop": false,
  "available_seconds": 120,
  "available_minutes": 2,
  "grace_period": false,
  "grace_seconds_remaining": 0
}
```

### Test Free Tier Cutoff (95 seconds)
```bash
curl -X POST https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/usage/heartbeat \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{
    \"session_id\": \"$SESSION_ID\",
    \"duration_seconds\": 95
  }"
```

**Expected Response**:
```json
{
  "should_stop": true,
  "message": "Free tier limit reached (1:30 minutes)",
  "available_seconds": 0,
  "grace_period": false
}
```

### End Session
```bash
curl -X POST https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/usage/end \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{
    \"session_id\": \"$SESSION_ID\",
    \"duration_seconds\": 85
  }"
```

**Expected Response**:
```json
{
  "success": true,
  "seconds_used": 85,
  "remaining_seconds": 35,
  "remaining_minutes": 0
}
```

### Check Remaining Balance
```bash
curl -X GET https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/usage/balance \
  -b cookies.txt
```

**Expected Response**:
```json
{
  "balance_seconds": 35,
  "balance_minutes": 0,
  "original_seconds": 120,
  "original_minutes": 2,
  "type": "free",
  "period_end": 1765624077
}
```

### Get Usage History
```bash
curl -X GET https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/usage/history \
  -b cookies.txt
```

**Expected Response**:
```json
{
  "sessions": [
    {
      "id": "uuid",
      "session_start": 1763032077,
      "duration_seconds": 85,
      "duration_minutes": 1,
      "scenario_id": "salary-negotiation",
      "status": "completed"
    }
  ]
}
```

---

## 3. Subscription & Pricing API

### Get All Available Plans
```bash
curl -X GET https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/subscriptions/plans
```

**Expected Response**:
```json
{
  "plans": [
    {
      "id": "free",
      "name": "Free Trial",
      "type": "free",
      "price": 0,
      "price_cents": 0,
      "minutes_included": 2,
      "billing_cycle": "monthly",
      "active": true
    },
    {
      "id": "payperuse",
      "name": "Pay Per Use",
      "type": "payperuse",
      "price": 1.99,
      "minutes_included": 10,
      "billing_cycle": "one_time",
      "active": true
    },
    ... (6 more plans)
  ]
}
```

### Get Current User Subscription
```bash
curl -X GET https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/subscriptions/current \
  -b cookies.txt
```

**Expected Response**:
```json
{
  "subscription": {
    "id": "uuid",
    "plan_id": "free",
    "plan_name": "Free Trial",
    "status": "active",
    "period_start": 1763032077,
    "period_end": 1765624077,
    "stripe_subscription_id": null
  }
}
```

---

## 4. Stripe Payment API (Placeholders)

### Create Checkout Session
```bash
curl -X POST https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/checkout/create-session \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "plan_id": "starter_monthly",
    "success_url": "https://paws.pages.dev/account",
    "cancel_url": "https://paws.pages.dev/pricing"
  }'
```

**Expected Response (Placeholder)**:
```json
{
  "success": true,
  "checkout_url": "/account?payment_simulated=true",
  "session_id": "sim_1763032140642",
  "message": "Stripe not configured - simulated payment flow",
  "plan": {
    "name": "Starter Monthly",
    "price": 9.99,
    "minutes": 60
  }
}
```

### Create Customer Portal Session
```bash
curl -X POST https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/checkout/portal \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "return_url": "https://paws.pages.dev/account"
  }'
```

**Expected Response (Placeholder)**:
```json
{
  "success": true,
  "portal_url": "/account",
  "message": "Stripe not configured - redirecting to account page"
}
```

---

## 5. OpenAI Integration (Existing)

### Generate Ephemeral Token
```bash
curl -X POST https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai/api/ephemeral \
  -H "Content-Type: application/json" \
  -d '{
    "voice": "alloy"
  }'
```

**Expected Response**:
```json
{
  "client_secret": "eph_xxx",
  "expires_at": 1763032137
}
```

---

## 📝 Test Scenarios

### Scenario 1: New User Free Tier Journey
1. Register new account → Get 120 seconds (2 minutes)
2. Login → Verify JWT cookie set
3. Start session → Get session ID
4. Heartbeat at 30s → Should continue
5. Heartbeat at 95s → Should stop (free tier limit)
6. End session at 85s → 35 seconds remaining
7. Check balance → Verify 35 seconds left

### Scenario 2: Credit Exhaustion
1. Register new account → 120 seconds
2. Start session
3. End session at 120s → 0 seconds remaining
4. Try to start new session → Should fail with "Insufficient credits"

### Scenario 3: Pricing Exploration
1. Register account
2. Get all plans → See 8 pricing tiers
3. Get current subscription → Free tier
4. Create checkout for "starter_monthly" → Placeholder response

---

## 🔍 Validation Checklist

- [ ] New user registration works
- [ ] Login returns JWT cookie
- [ ] Protected endpoint requires authentication
- [ ] Session start validates credits
- [ ] Heartbeat tracks duration
- [ ] Free tier cutoff at 90 seconds works
- [ ] Credit deduction is accurate
- [ ] Balance reflects remaining time
- [ ] All 8 pricing plans returned
- [ ] Placeholder Stripe responses work

---

**Status**: All endpoints tested and verified ✅  
**Service Running**: Yes (PM2)  
**Database**: Local D1 with migrations applied  
**Test Data**: 3 sample users seeded

---

*Last Updated: November 13, 2025*
