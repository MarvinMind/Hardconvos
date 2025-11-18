-- Migration: Update pricing to profitable levels
-- Cost per minute: $0.30 (OpenAI Realtime API for paid tiers)
-- Free tier: $0.01/minute (GPT-4o-mini + TTS)
-- Target margin: 70% for sustainability
-- New price per minute: $1.00

-- Update Pay-Per-Use plan
UPDATE subscription_plans 
SET price_cents = 999  -- $9.99 for 10 minutes ($1.00/min)
WHERE id = 'payperuse';

-- Update Starter Monthly plan
UPDATE subscription_plans 
SET price_cents = 5999  -- $59.99 for 60 minutes ($1.00/min)
WHERE id = 'starter_monthly';

-- Update Professional Monthly plan
UPDATE subscription_plans 
SET price_cents = 11999  -- $119.99 for 120 minutes ($1.00/min)
WHERE id = 'professional_monthly';

-- Update Expert Monthly plan
UPDATE subscription_plans 
SET price_cents = 29999  -- $299.99 for 300 minutes ($1.00/min)
WHERE id = 'expert_monthly';

-- Update Starter Annual plan (10% annual discount = $0.90/min)
UPDATE subscription_plans 
SET price_cents = 64789  -- $647.89 for 60 min × 12 months ($0.90/min)
WHERE id = 'starter_annual';

-- Update Professional Annual plan (10% annual discount)
UPDATE subscription_plans 
SET price_cents = 129589  -- $1,295.89 for 120 min × 12 months ($0.90/min)
WHERE id = 'professional_annual';

-- Update Expert Annual plan (10% annual discount)
UPDATE subscription_plans 
SET price_cents = 323989  -- $3,239.89 for 300 min × 12 months ($0.90/min)
WHERE id = 'expert_annual';

-- Keep Free Tier at 2 minutes (user request)
-- Free tier uses GPT-4o-mini + TTS (cost: $0.01/min = $0.02 total)
-- Paid tiers use OpenAI Realtime API with full duplex, interruptions, better quality
