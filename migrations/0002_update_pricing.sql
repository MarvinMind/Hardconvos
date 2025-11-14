-- Migration: Update pricing to profitable levels
-- Cost per minute: $0.30 (OpenAI Realtime API)
-- Target margin: 70% for sustainability
-- New price per minute: $1.00

-- Update Pay-Per-Use plan
UPDATE subscription_plans 
SET 
  price_cents = 999,  -- $9.99 for 10 minutes ($1.00/min)
  updated_at = strftime('%s', 'now')
WHERE id = 'payperuse';

-- Update Starter Monthly plan
UPDATE subscription_plans 
SET 
  price_cents = 5999,  -- $59.99 for 60 minutes ($1.00/min)
  updated_at = strftime('%s', 'now')
WHERE id = 'starter_monthly';

-- Update Professional Monthly plan
UPDATE subscription_plans 
SET 
  price_cents = 11999,  -- $119.99 for 120 minutes ($1.00/min)
  updated_at = strftime('%s', 'now')
WHERE id = 'professional_monthly';

-- Update Expert Monthly plan
UPDATE subscription_plans 
SET 
  price_cents = 29999,  -- $299.99 for 300 minutes ($1.00/min)
  updated_at = strftime('%s', 'now')
WHERE id = 'expert_monthly';

-- Update Starter Annual plan (10% annual discount = $0.90/min)
UPDATE subscription_plans 
SET 
  price_cents = 64789,  -- $647.89 for 60 min × 12 months ($0.90/min)
  updated_at = strftime('%s', 'now')
WHERE id = 'starter_annual';

-- Update Professional Annual plan (10% annual discount)
UPDATE subscription_plans 
SET 
  price_cents = 129589,  -- $1,295.89 for 120 min × 12 months ($0.90/min)
  updated_at = strftime('%s', 'now')
WHERE id = 'professional_annual';

-- Update Expert Annual plan (10% annual discount)
UPDATE subscription_plans 
SET 
  price_cents = 323989,  -- $3,239.89 for 300 min × 12 months ($0.90/min)
  updated_at = strftime('%s', 'now')
WHERE id = 'expert_annual';

-- Reduce Free Tier to 1 minute (cost: $0.30)
UPDATE subscription_plans 
SET 
  minutes_included = 1,  -- 1 minute instead of 2
  updated_at = strftime('%s', 'now')
WHERE id = 'free';

-- Note: Free tier now gives 1 minute (60 seconds) to try the service
-- This costs us $0.30 per user but reduces loss exposure
