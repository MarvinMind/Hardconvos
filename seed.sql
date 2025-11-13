-- PAWS Seed Data for Testing
-- Creates test users with various subscription levels

-- Test user 1: Free tier (email: test@example.com, password: test123)
INSERT OR IGNORE INTO users (id, email, password_hash, name, created_at, email_verified, status) VALUES
('user_free_test', 'test@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Free User', strftime('%s', 'now'), 1, 'active');

-- Test user 2: Pay-per-use (email: payperuse@example.com, password: test123)
INSERT OR IGNORE INTO users (id, email, password_hash, name, created_at, email_verified, status) VALUES
('user_payperuse_test', 'payperuse@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Pay Per Use User', strftime('%s', 'now'), 1, 'active');

-- Test user 3: Monthly subscriber (email: monthly@example.com, password: test123)
INSERT OR IGNORE INTO users (id, email, password_hash, name, created_at, email_verified, status) VALUES
('user_monthly_test', 'monthly@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Monthly Subscriber', strftime('%s', 'now'), 1, 'active');

-- Free tier subscription for test user 1
INSERT OR IGNORE INTO user_subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, created_at, updated_at) VALUES
('sub_free_test', 'user_free_test', 'free', 'active', strftime('%s', 'now'), strftime('%s', 'now', '+1 month'), strftime('%s', 'now'), strftime('%s', 'now'));

-- Pay-per-use credit for test user 2
INSERT OR IGNORE INTO user_subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, created_at, updated_at) VALUES
('sub_payperuse_test', 'user_payperuse_test', 'payperuse', 'active', strftime('%s', 'now'), strftime('%s', 'now', '+1 year'), strftime('%s', 'now'), strftime('%s', 'now'));

-- Monthly subscription for test user 3
INSERT OR IGNORE INTO user_subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, created_at, updated_at) VALUES
('sub_monthly_test', 'user_monthly_test', 'starter_monthly', 'active', strftime('%s', 'now'), strftime('%s', 'now', '+1 month'), strftime('%s', 'now'), strftime('%s', 'now'));

-- Credit balances
-- Free user: 2 minutes (120 seconds)
INSERT OR IGNORE INTO credit_balances (id, user_id, subscription_id, balance_seconds, original_balance_seconds, period_start, period_end, type, created_at, updated_at) VALUES
('credit_free_test', 'user_free_test', 'sub_free_test', 120, 120, strftime('%s', 'now'), strftime('%s', 'now', '+1 month'), 'free', strftime('%s', 'now'), strftime('%s', 'now'));

-- Pay-per-use user: 10 minutes (600 seconds)
INSERT OR IGNORE INTO credit_balances (id, user_id, subscription_id, balance_seconds, original_balance_seconds, period_start, period_end, type, created_at, updated_at) VALUES
('credit_payperuse_test', 'user_payperuse_test', 'sub_payperuse_test', 600, 600, strftime('%s', 'now'), strftime('%s', 'now', '+1 year'), 'payperuse', strftime('%s', 'now'), strftime('%s', 'now'));

-- Monthly user: 60 minutes (3600 seconds)
INSERT OR IGNORE INTO credit_balances (id, user_id, subscription_id, balance_seconds, original_balance_seconds, period_start, period_end, type, created_at, updated_at) VALUES
('credit_monthly_test', 'user_monthly_test', 'sub_monthly_test', 3600, 3600, strftime('%s', 'now'), strftime('%s', 'now', '+1 month'), 'monthly', strftime('%s', 'now'), strftime('%s', 'now'));
