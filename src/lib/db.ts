// Database utilities for PAWS
import { generateId, now } from './auth'

export interface DBUser {
  id: string
  email: string
  password_hash: string
  name: string | null
  created_at: number
  last_login_at: number | null
  email_verified: number
  status: string
}

export interface DBSubscription {
  id: string
  user_id: string
  plan_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  status: string
  current_period_start: number
  current_period_end: number
  cancel_at_period_end: number
  created_at: number
  updated_at: number
}

export interface DBCreditBalance {
  id: string
  user_id: string
  subscription_id: string | null
  balance_seconds: number
  original_balance_seconds: number
  period_start: number
  period_end: number
  type: string
  created_at: number
  updated_at: number
}

export interface DBUsageLog {
  id: string
  user_id: string
  session_start: number
  session_end: number | null
  duration_seconds: number
  scenario_id: string | null
  credits_used: number
  subscription_id: string | null
  status: string
  created_at: number
}

export interface SubscriptionPlan {
  id: string
  name: string
  type: string
  price_cents: number
  minutes_included: number | null
  billing_cycle: string
  stripe_price_id: string | null
  active: number
}

// User management
export async function createUser(
  db: D1Database,
  email: string,
  passwordHash: string,
  name: string | null
): Promise<DBUser> {
  const id = generateId()
  const created_at = now()
  
  await db
    .prepare(`
      INSERT INTO users (id, email, password_hash, name, created_at, email_verified, status)
      VALUES (?, ?, ?, ?, ?, 0, 'active')
    `)
    .bind(id, email, passwordHash, name, created_at)
    .run()
  
  return {
    id,
    email,
    password_hash: passwordHash,
    name,
    created_at,
    last_login_at: null,
    email_verified: 0,
    status: 'active'
  }
}

export async function getUserByEmail(db: D1Database, email: string): Promise<DBUser | null> {
  const result = await db
    .prepare('SELECT * FROM users WHERE email = ? AND status = "active"')
    .bind(email)
    .first<DBUser>()
  
  return result || null
}

export async function getUserById(db: D1Database, userId: string): Promise<DBUser | null> {
  const result = await db
    .prepare('SELECT * FROM users WHERE id = ? AND status = "active"')
    .bind(userId)
    .first<DBUser>()
  
  return result || null
}

export async function updateLastLogin(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
    .bind(now(), userId)
    .run()
}

// Subscription management
export async function createFreeSubscription(
  db: D1Database,
  userId: string
): Promise<DBSubscription> {
  const id = generateId()
  const currentTime = now()
  const monthFromNow = currentTime + (30 * 24 * 60 * 60) // 30 days
  
  await db
    .prepare(`
      INSERT INTO user_subscriptions 
      (id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at)
      VALUES (?, ?, 'free', 'active', ?, ?, 0, ?, ?)
    `)
    .bind(id, userId, currentTime, monthFromNow, currentTime, currentTime)
    .run()
  
  // Create initial credit balance (2 minutes = 120 seconds)
  await createCreditBalance(db, userId, id, 120, 'free', monthFromNow)
  
  return {
    id,
    user_id: userId,
    plan_id: 'free',
    stripe_subscription_id: null,
    stripe_customer_id: null,
    status: 'active',
    current_period_start: currentTime,
    current_period_end: monthFromNow,
    cancel_at_period_end: 0,
    created_at: currentTime,
    updated_at: currentTime
  }
}

export async function getUserSubscription(
  db: D1Database,
  userId: string
): Promise<DBSubscription | null> {
  const result = await db
    .prepare(`
      SELECT * FROM user_subscriptions 
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .bind(userId)
    .first<DBSubscription>()
  
  return result || null
}

// Credit balance management
export async function createCreditBalance(
  db: D1Database,
  userId: string,
  subscriptionId: string,
  seconds: number,
  type: string,
  periodEnd: number
): Promise<void> {
  const id = generateId()
  const currentTime = now()
  
  await db
    .prepare(`
      INSERT INTO credit_balances
      (id, user_id, subscription_id, balance_seconds, original_balance_seconds, period_start, period_end, type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(id, userId, subscriptionId, seconds, seconds, currentTime, periodEnd, type, currentTime, currentTime)
    .run()
}

export async function getCreditBalance(
  db: D1Database,
  userId: string
): Promise<DBCreditBalance | null> {
  const currentTime = now()
  
  const result = await db
    .prepare(`
      SELECT * FROM credit_balances 
      WHERE user_id = ? AND period_end > ? AND balance_seconds > 0
      ORDER BY period_end ASC
      LIMIT 1
    `)
    .bind(userId, currentTime)
    .first<DBCreditBalance>()
  
  return result || null
}

export async function deductCredits(
  db: D1Database,
  creditBalanceId: string,
  seconds: number
): Promise<void> {
  await db
    .prepare(`
      UPDATE credit_balances 
      SET balance_seconds = balance_seconds - ?,
          updated_at = ?
      WHERE id = ? AND balance_seconds >= ?
    `)
    .bind(seconds, now(), creditBalanceId, seconds)
    .run()
}

// Usage tracking
export async function createUsageLog(
  db: D1Database,
  userId: string,
  subscriptionId: string | null,
  scenarioId: string | null
): Promise<string> {
  const id = generateId()
  const currentTime = now()
  
  await db
    .prepare(`
      INSERT INTO usage_logs
      (id, user_id, session_start, duration_seconds, scenario_id, subscription_id, status, created_at)
      VALUES (?, ?, ?, 0, ?, ?, 'active', ?)
    `)
    .bind(id, userId, currentTime, scenarioId, subscriptionId, currentTime)
    .run()
  
  return id
}

export async function updateUsageLog(
  db: D1Database,
  logId: string,
  durationSeconds: number,
  status: string
): Promise<void> {
  const currentTime = now()
  
  await db
    .prepare(`
      UPDATE usage_logs 
      SET duration_seconds = ?,
          status = ?,
          session_end = ?
      WHERE id = ?
    `)
    .bind(durationSeconds, status, currentTime, logId)
    .run()
}

export async function getUsageHistory(
  db: D1Database,
  userId: string,
  limit: number = 10
): Promise<DBUsageLog[]> {
  const results = await db
    .prepare(`
      SELECT * FROM usage_logs 
      WHERE user_id = ?
      ORDER BY session_start DESC
      LIMIT ?
    `)
    .bind(userId, limit)
    .all<DBUsageLog>()
  
  return results.results || []
}

// Subscription plans
export async function getAllPlans(db: D1Database): Promise<SubscriptionPlan[]> {
  const results = await db
    .prepare('SELECT * FROM subscription_plans WHERE active = 1 ORDER BY price_cents ASC')
    .all<SubscriptionPlan>()
  
  return results.results || []
}

export async function getPlanById(db: D1Database, planId: string): Promise<SubscriptionPlan | null> {
  const result = await db
    .prepare('SELECT * FROM subscription_plans WHERE id = ? AND active = 1')
    .bind(planId)
    .first<SubscriptionPlan>()
  
  return result || null
}
