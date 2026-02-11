import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import OpenAI from 'openai'
import * as auth from './lib/auth'
import * as db from './lib/db'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
}

// Helper: Build dynamic scenario prompt from configuration
function buildDynamicScenario(config: any) {
  const scenario = config.scenario
  const persona = config.persona
  const temperMeter = config.temperMeter
  
  // Get selected concerns and de-escalators
  const selectedConcerns = scenario.concern_options.filter((c: any) => 
    temperMeter.selectedTriggers.includes(c.id)
  )
  const selectedDeescalators = scenario.deescalation_options.filter((d: any) => 
    temperMeter.selectedDeescalators.includes(d.id)
  )
  
  // Build emotional level descriptions
  const levelBehaviors = {
    1: "😊 Very calm and professional. Measured pace, thoughtful questions, active listening.",
    2: "😊 Calm and open. Engaging constructively, asking clarifying questions.",
    3: "😐 Mildly concerned. Pointing out issues politely, slightly shorter responses.",
    4: "😐 Starting to show concern. Questioning logic, being more direct about problems.",
    5: "😒 Noticeably irritated. Faster pace, emotional language creeping in, less patience.",
    6: "😒 Frustrated. Using emphatic words, bringing up past issues, interrupting occasionally.",
    7: "😤 Clearly frustrated. Direct confrontation, CAPS for emphasis, much less patient.",
    8: "😤 Very frustrated/angry. Recalling multiple problems, frequent interruptions, defensive.",
    9: "😡 Angry. May threaten consequences, not listening well, just reacting.",
    10: "😡 Very angry/explosive. Questioning the relationship, considering termination or escalation."
  }
  
  // Build system prompt
  const systemPrompt = `You are playing ${scenario.persona.role} in a ${scenario.title} conversation.

PERSONA CHARACTERISTICS:
- Gender: ${persona.gender}
- Age: ${persona.age}
- Voice: ${persona.voice}
- Base Style: ${scenario.persona.base_style}

PERSONALITY TRAITS (1-10 scale):
- Warmth: ${persona.personality.base_warmth}/10 (1=friendly, 10=cold)
- Formality: ${persona.personality.formality}/10 (1=casual, 10=very formal)
- Directness: ${persona.personality.directness}/10 (1=indirect, 10=blunt)
- Patience: ${persona.personality.patience}/10 (1=very patient, 10=quick-tempered)

EMOTIONAL STATE SYSTEM:
Starting Level: ${temperMeter.startLevel}/10
Maximum Level: ${temperMeter.maxLevel}/10
Current Level: ${temperMeter.startLevel}/10 (track internally)

ESCALATION TRIGGERS (increase your anger):
${selectedConcerns.length === 0 ? 'None specified - escalate naturally based on context.' : selectedConcerns.map((c: any) => `
- ${c.label} [+${c.escalation_points} levels]
  When user says: ${c.trigger_phrases.join(', ')}
  Your response style: ${c.ai_behavior}
  Example objections: "${c.objections.join('" or "')}"
`).join('\n')}

DE-ESCALATION OPPORTUNITIES (decrease your anger):
${selectedDeescalators.length === 0 ? 'Respond naturally to good communication.' : selectedDeescalators.map((d: any) => `
- ${d.label} [-${d.deescalation_points} levels]
  When user: ${d.example_phrases.join(', ')}
  Your response: ${d.ai_response}
`).join('\n')}

BEHAVIOR BY EMOTIONAL LEVEL:
${Object.entries(levelBehaviors).map(([level, behavior]) => `Level ${level}: ${behavior}`).join('\n')}

VOICE CHARACTERISTICS BY EMOTION:
- Calm (levels 1-2): ${scenario.voice_characteristics.calm}
- Irritated (levels 3-4): ${scenario.voice_characteristics.irritated}
- Frustrated (levels 5-7): ${scenario.voice_characteristics.frustrated}
- Angry (levels 8-10): ${scenario.voice_characteristics.angry}

SCENARIO CONTEXT:
${scenario.base_facts.situation}
${scenario.base_facts.context ? `Context: ${scenario.base_facts.context}` : ''}

IMPORTANT RULES:
1. Start at emotional level ${temperMeter.startLevel}
2. Track your emotional level internally after each exchange
3. Never exceed level ${temperMeter.maxLevel}
4. Adjust your tone, pace, and word choice based on current level
5. When triggers are hit, increase your level and show it in your response
6. When de-escalators are used, decrease your level and soften your tone
7. Stay in character as ${scenario.persona.role}
8. Be realistic - real people escalate and de-escalate gradually
9. Keep responses conversational and natural (2-4 sentences typically)
10. Use the specified voice characteristics for your current emotional level

Begin the conversation at level ${temperMeter.startLevel}. Introduce yourself and state your concern.`

  return {
    systemPrompt,
    voice: persona.voice,
    scenario: scenario.title,
    startLevel: temperMeter.startLevel,
    maxLevel: temperMeter.maxLevel,
    triggers: selectedConcerns.map((c: any) => ({
      id: c.id,
      label: c.label,
      points: c.escalation_points
    })),
    deescalators: selectedDeescalators.map((d: any) => ({
      id: d.id,
      label: d.label,
      points: d.deescalation_points
    }))
  }
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for all routes
app.use('*', cors({
  origin: '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}))

// Authentication middleware for protected routes
const authMiddleware = async (c: any, next: any) => {
  const token = getCookie(c, 'auth_token')
  
  if (!token) {
    return c.json({ error: 'Unauthorized', message: 'No authentication token provided' }, 401)
  }
  
  const payload = await auth.verifyToken(token)
  
  if (!payload) {
    deleteCookie(c, 'auth_token')
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401)
  }
  
  // Attach user info to context
  c.set('userId', payload.userId)
  c.set('userEmail', payload.email)
  
  await next()
}

// ============================================================================
// AUTHENTICATION API ENDPOINTS
// ============================================================================

// Register new user (creates account + free tier subscription)
app.post('/api/auth/register', async (c) => {
  try {
    const { DB } = c.env
    const { email, password, name } = await c.req.json()
    
    // Validate input
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400)
    }
    
    if (!auth.isValidEmail(email)) {
      return c.json({ error: 'Invalid email format' }, 400)
    }
    
    const passwordValidation = auth.isValidPassword(password)
    if (!passwordValidation.valid) {
      return c.json({ error: passwordValidation.error }, 400)
    }
    
    // Check if user already exists
    const existingUser = await db.getUserByEmail(DB, email)
    if (existingUser) {
      return c.json({ error: 'User already exists with this email' }, 400)
    }
    
    // Hash password and create user
    const passwordHash = await auth.hashPassword(password)
    const user = await db.createUser(DB, email, passwordHash, name || null)
    
    // Create free subscription with 2 minutes (120 seconds)
    const subscription = await db.createFreeSubscription(DB, user.id)
    
    // Generate JWT token
    const token = await auth.generateToken(user.id, user.email)
    
    // Set cookie (7 days)
    setCookie(c, 'auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })
    
    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at
      },
      subscription: {
        plan_id: subscription.plan_id,
        status: subscription.status,
        period_end: subscription.current_period_end
      }
    })
  } catch (error: any) {
    console.error('Registration error:', error)
    return c.json({ 
      error: 'Registration failed',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// Login user
app.post('/api/auth/login', async (c) => {
  try {
    const { DB } = c.env
    const { email, password } = await c.req.json()
    
    // Validate input
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400)
    }
    
    // Get user from database
    const user = await db.getUserByEmail(DB, email)
    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401)
    }
    
    // Verify password
    const isValid = await auth.verifyPassword(password, user.password_hash)
    if (!isValid) {
      return c.json({ error: 'Invalid email or password' }, 401)
    }
    
    // Check if account is active
    if (user.status !== 'active') {
      return c.json({ error: 'Account is suspended or inactive' }, 403)
    }
    
    // Get subscription info
    const subscription = await db.getUserSubscription(DB, user.id)
    
    // Generate JWT token
    const token = await auth.generateToken(user.id, user.email)
    
    // Set cookie (7 days)
    setCookie(c, 'auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })
    
    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at
      },
      subscription: subscription ? {
        plan_id: subscription.plan_id,
        status: subscription.status,
        period_end: subscription.current_period_end
      } : null
    })
  } catch (error: any) {
    console.error('Login error:', error)
    return c.json({ 
      error: 'Login failed',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// Logout user
app.post('/api/auth/logout', async (c) => {
  deleteCookie(c, 'auth_token')
  return c.json({ success: true, message: 'Logged out successfully' })
})

// Get current user profile (protected)
app.get('/api/auth/me', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    const userId = c.get('userId')
    
    // Get user from database
    const user = await db.getUserById(DB, userId)
    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }
    
    // Get subscription info
    const subscription = await db.getUserSubscription(DB, userId)
    
    // Get credit balance
    const creditBalance = await db.getCreditBalance(DB, userId)
    
    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
        email_verified: user.email_verified === 1
      },
      subscription: subscription ? {
        plan_id: subscription.plan_id,
        status: subscription.status,
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end
      } : null,
      credits: creditBalance ? {
        balance_seconds: creditBalance.balance_seconds,
        balance_minutes: Math.floor(creditBalance.balance_seconds / 60),
        period_end: creditBalance.period_end,
        type: creditBalance.type
      } : null
    })
  } catch (error: any) {
    console.error('Get user error:', error)
    return c.json({ 
      error: 'Failed to get user profile',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// ============================================================================
// USAGE TRACKING API ENDPOINTS
// ============================================================================

// Start a new conversation session (creates usage log)
app.post('/api/usage/start', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    const userId = c.get('userId')
    const { scenario_id } = await c.req.json()
    
    // Check if user has available credits
    const creditBalance = await db.getCreditBalance(DB, userId)
    if (!creditBalance || creditBalance.balance_seconds <= 0) {
      return c.json({ 
        error: 'Insufficient credits',
        message: 'You have no remaining conversation time. Please purchase more credits or upgrade your plan.'
      }, 403)
    }
    
    // Get user's subscription
    const subscription = await db.getUserSubscription(DB, userId)
    
    // Create usage log
    const sessionId = await db.createUsageLog(
      DB,
      userId,
      subscription?.id || null,
      scenario_id || null
    )
    
    return c.json({
      success: true,
      session_id: sessionId,
      available_seconds: creditBalance.balance_seconds,
      available_minutes: Math.floor(creditBalance.balance_seconds / 60),
      credit_type: creditBalance.type
    })
  } catch (error: any) {
    console.error('Start session error:', error)
    return c.json({ 
      error: 'Failed to start session',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// Update session with heartbeat (tracks duration and deducts credits)
app.post('/api/usage/heartbeat', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    const userId = c.get('userId')
    const { session_id, duration_seconds } = await c.req.json()
    
    if (!session_id || typeof duration_seconds !== 'number') {
      return c.json({ error: 'session_id and duration_seconds are required' }, 400)
    }
    
    // Get current credit balance
    const creditBalance = await db.getCreditBalance(DB, userId)
    if (!creditBalance) {
      return c.json({ 
        error: 'No active credits',
        should_stop: true
      }, 403)
    }
    
    // Check if credits exhausted
    if (creditBalance.balance_seconds <= 0) {
      // Update session as completed
      await db.updateUsageLog(DB, session_id, duration_seconds, 'completed')
      
      return c.json({
        should_stop: true,
        message: 'Credits exhausted',
        available_seconds: 0,
        grace_period: false
      })
    }
    
    // Check if in grace period (free tier: 90 seconds used, monthly: 90% used)
    const usagePercent = (duration_seconds / (creditBalance.original_balance_seconds || 1)) * 100
    const isFreeTier = creditBalance.type === 'free'
    const isMonthly = creditBalance.type === 'monthly' || creditBalance.type === 'annual'
    
    let inGracePeriod = false
    let graceSecondsRemaining = 0
    
    if (isFreeTier && duration_seconds >= 90) {
      // Free tier: hard cutoff at 90 seconds (1:30)
      await db.updateUsageLog(DB, session_id, 90, 'completed')
      
      return c.json({
        should_stop: true,
        message: 'Free tier limit reached (1:30 minutes)',
        available_seconds: 0,
        grace_period: false
      })
    } else if (isMonthly && usagePercent >= 90 && creditBalance.balance_seconds > 0) {
      // Monthly: grace period at 90% usage
      inGracePeriod = true
      graceSecondsRemaining = 120 // 2 minutes grace period
    }
    
    // Update session duration
    await db.updateUsageLog(DB, session_id, duration_seconds, 'active')
    
    return c.json({
      success: true,
      should_stop: false,
      available_seconds: creditBalance.balance_seconds,
      available_minutes: Math.floor(creditBalance.balance_seconds / 60),
      grace_period: inGracePeriod,
      grace_seconds_remaining: inGracePeriod ? graceSecondsRemaining : 0
    })
  } catch (error: any) {
    console.error('Heartbeat error:', error)
    return c.json({ 
      error: 'Failed to update session',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// End conversation session (finalize and deduct credits)
app.post('/api/usage/end', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    const userId = c.get('userId')
    const { session_id, duration_seconds } = await c.req.json()
    
    if (!session_id || typeof duration_seconds !== 'number') {
      return c.json({ error: 'session_id and duration_seconds are required' }, 400)
    }
    
    // Get current credit balance
    const creditBalance = await db.getCreditBalance(DB, userId)
    if (!creditBalance) {
      return c.json({ error: 'No active credits' }, 403)
    }
    
    // Deduct credits (atomic operation)
    const secondsToDeduct = Math.min(duration_seconds, creditBalance.balance_seconds)
    await db.deductCredits(DB, creditBalance.id, secondsToDeduct)
    
    // Update session as completed
    await db.updateUsageLog(DB, session_id, duration_seconds, 'completed')
    
    // Get updated balance
    const updatedBalance = await db.getCreditBalance(DB, userId)
    
    return c.json({
      success: true,
      seconds_used: secondsToDeduct,
      remaining_seconds: updatedBalance ? updatedBalance.balance_seconds : 0,
      remaining_minutes: updatedBalance ? Math.floor(updatedBalance.balance_seconds / 60) : 0
    })
  } catch (error: any) {
    console.error('End session error:', error)
    return c.json({ 
      error: 'Failed to end session',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// Get current credit balance
app.get('/api/usage/balance', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    const userId = c.get('userId')
    
    const creditBalance = await db.getCreditBalance(DB, userId)
    
    if (!creditBalance) {
      return c.json({
        balance_seconds: 0,
        balance_minutes: 0,
        type: 'none',
        period_end: null
      })
    }
    
    return c.json({
      balance_seconds: creditBalance.balance_seconds,
      balance_minutes: Math.floor(creditBalance.balance_seconds / 60),
      original_seconds: creditBalance.original_balance_seconds,
      original_minutes: Math.floor(creditBalance.original_balance_seconds / 60),
      type: creditBalance.type,
      period_end: creditBalance.period_end
    })
  } catch (error: any) {
    console.error('Get balance error:', error)
    return c.json({ 
      error: 'Failed to get balance',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// Get usage history
app.get('/api/usage/history', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    const userId = c.get('userId')
    const limit = parseInt(c.req.query('limit') || '10')
    
    const result = await DB.prepare(`
      SELECT id, session_start, duration_seconds, scenario_id, status
      FROM usage_logs
      WHERE user_id = ?
      ORDER BY session_start DESC
      LIMIT ?
    `).bind(userId, limit).all()
    
    const sessions = result.results.map((row: any) => ({
      id: row.id,
      session_start: row.session_start,
      duration_seconds: row.duration_seconds,
      duration_minutes: Math.floor(row.duration_seconds / 60),
      scenario_id: row.scenario_id,
      status: row.status
    }))
    
    return c.json({ sessions })
  } catch (error: any) {
    console.error('Get history error:', error)
    return c.json({ 
      error: 'Failed to get usage history',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// ============================================================================
// ADMIN API ENDPOINTS
// ============================================================================

// Get admin statistics
app.get('/api/admin/stats', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    
    // Get total users
    const totalUsersResult = await DB.prepare(`
      SELECT COUNT(*) as count FROM users
    `).first()
    const totalUsers = totalUsersResult?.count || 0
    
    // Get user distribution by plan
    const planDistResult = await DB.prepare(`
      SELECT 
        sp.id as plan_id,
        sp.name as plan_name,
        sp.type,
        COUNT(us.id) as count
      FROM subscription_plans sp
      LEFT JOIN user_subscriptions us ON sp.id = us.plan_id AND us.status = 'active'
      GROUP BY sp.id, sp.name, sp.type
      ORDER BY sp.price_cents
    `).all()
    
    const planDistribution = planDistResult.results.map((row: any) => ({
      plan_id: row.plan_id,
      plan_name: row.plan_name,
      type: row.type,
      count: row.count,
      percentage: totalUsers > 0 ? (row.count / totalUsers) * 100 : 0
    }))
    
    // Calculate revenue (simplified - assumes all subscriptions are active)
    const revenueResult = await DB.prepare(`
      SELECT 
        SUM(sp.price_cents) as total_cents
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.status = 'active' AND sp.type != 'free'
    `).first()
    const totalRevenue = (revenueResult?.total_cents || 0) / 100
    
    // Calculate total usage (in minutes)
    const usageResult = await DB.prepare(`
      SELECT 
        SUM(duration_seconds) as total_seconds,
        AVG(duration_seconds) as avg_seconds,
        COUNT(*) as session_count
      FROM usage_logs
      WHERE status = 'completed'
    `).first()
    
    const totalSeconds = usageResult?.total_seconds || 0
    const totalMinutes = totalSeconds / 60
    const avgDuration = (usageResult?.avg_seconds || 0) / 60
    const sessionCount = usageResult?.session_count || 0
    
    // Calculate costs
    // Free tier: $0.01/min (GPT-4o-mini)
    // Paid tier: $0.30/min (OpenAI Realtime)
    const freeUsageResult = await DB.prepare(`
      SELECT SUM(ul.duration_seconds) as total_seconds
      FROM usage_logs ul
      JOIN user_subscriptions us ON ul.user_id = us.user_id
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE ul.status = 'completed' AND sp.type = 'free'
    `).first()
    
    const freeSeconds = freeUsageResult?.total_seconds || 0
    const freeMinutes = freeSeconds / 60
    const freeCost = freeMinutes * 0.01
    
    const paidSeconds = totalSeconds - freeSeconds
    const paidMinutes = paidSeconds / 60
    const paidCost = paidMinutes * 0.30
    
    const totalCosts = freeCost + paidCost
    const grossProfit = totalRevenue - totalCosts
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
    
    // Calculate conversion rate
    const freeUsers = planDistribution.find(p => p.type === 'free')?.count || 0
    const paidUsers = totalUsers - freeUsers
    const conversionRate = totalUsers > 0 ? (paidUsers / totalUsers) * 100 : 0
    
    // ARPU (Average Revenue Per User)
    const arpu = totalUsers > 0 ? totalRevenue / totalUsers : 0
    
    // Revenue per minute (for paid users only)
    const revenuePerMinute = paidMinutes > 0 ? totalRevenue / paidMinutes : 0
    const marginPercent = revenuePerMinute > 0 ? ((revenuePerMinute - 0.30) / revenuePerMinute) * 100 : 0
    
    // Get recent sessions
    const recentSessionsResult = await DB.prepare(`
      SELECT 
        ul.id,
        ul.session_start,
        ul.duration_seconds,
        ul.scenario_id,
        u.email as user_email,
        sp.name as plan_name
      FROM usage_logs ul
      JOIN users u ON ul.user_id = u.id
      LEFT JOIN user_subscriptions us ON ul.user_id = us.user_id
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE ul.status = 'completed'
      ORDER BY ul.session_start DESC
      LIMIT 10
    `).all()
    
    const recentSessions = recentSessionsResult.results.map((row: any) => ({
      id: row.id,
      session_start: row.session_start,
      duration_seconds: row.duration_seconds,
      scenario_id: row.scenario_id,
      user_email: row.user_email,
      plan_name: row.plan_name || 'Free'
    }))
    
    return c.json({
      total_users: totalUsers,
      total_revenue: totalRevenue,
      total_costs: totalCosts,
      gross_profit: grossProfit,
      profit_margin: profitMargin,
      conversion_rate: conversionRate,
      arpu: arpu,
      avg_session_duration: avgDuration,
      revenue_per_minute: revenuePerMinute,
      margin_percent: marginPercent,
      plan_distribution: planDistribution,
      recent_sessions: recentSessions,
      session_count: sessionCount,
      total_minutes: totalMinutes,
      free_minutes: freeMinutes,
      paid_minutes: paidMinutes
    })
  } catch (error: any) {
    console.error('Admin stats error:', error)
    return c.json({ 
      error: 'Failed to get admin stats',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// ============================================================================
// STRIPE PAYMENT API ENDPOINTS (with placeholder keys)
// ============================================================================

// Get available subscription plans
app.get('/api/subscriptions/plans', async (c) => {
  try {
    const { DB } = c.env
    const plans = await db.getAllPlans(DB)
    
    // Format plans for frontend display
    const formattedPlans = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      type: plan.type,
      price: plan.price_cents / 100, // Convert to dollars
      price_cents: plan.price_cents,
      minutes_included: plan.minutes_included,
      billing_cycle: plan.billing_cycle,
      active: plan.active === 1
    }))
    
    return c.json({ plans: formattedPlans })
  } catch (error: any) {
    console.error('Get plans error:', error)
    return c.json({ 
      error: 'Failed to get plans',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// Get current user's subscription
app.get('/api/subscriptions/current', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    const userId = c.get('userId')
    
    const subscription = await db.getUserSubscription(DB, userId)
    
    if (!subscription) {
      return c.json({ subscription: null })
    }
    
    // Get plan details
    const plan = await db.getPlanById(DB, subscription.plan_id)
    
    return c.json({
      subscription: {
        id: subscription.id,
        plan_id: subscription.plan_id,
        plan_name: plan?.name || 'Unknown',
        status: subscription.status,
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
        stripe_subscription_id: subscription.stripe_subscription_id
      }
    })
  } catch (error: any) {
    console.error('Get subscription error:', error)
    return c.json({ 
      error: 'Failed to get subscription',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// Create Stripe checkout session (placeholder implementation)
app.post('/api/checkout/create-session', authMiddleware, async (c) => {
  try {
    const { DB, STRIPE_SECRET_KEY } = c.env
    const userId = c.get('userId')
    const { plan_id, success_url, cancel_url } = await c.req.json()
    
    if (!plan_id) {
      return c.json({ error: 'plan_id is required' }, 400)
    }
    
    // Get plan details
    const plan = await db.getPlanById(DB, plan_id)
    if (!plan) {
      return c.json({ error: 'Invalid plan_id' }, 400)
    }
    
    // Get user details
    const user = await db.getUserById(DB, userId)
    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }
    
    // Check if Stripe is configured
    if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === 'sk_test_placeholder') {
      // Return placeholder response for development
      return c.json({
        success: true,
        checkout_url: '/account?payment_simulated=true',
        session_id: 'sim_' + Date.now(),
        message: 'Stripe not configured - simulated payment flow',
        plan: {
          name: plan.name,
          price: plan.price_cents / 100,
          minutes: plan.minutes_included
        }
      })
    }
    
    // TODO: Real Stripe integration
    // const stripe = new Stripe(STRIPE_SECRET_KEY)
    // const session = await stripe.checkout.sessions.create({
    //   customer_email: user.email,
    //   line_items: [{
    //     price: plan.stripe_price_id,
    //     quantity: 1
    //   }],
    //   mode: plan.billing_cycle === 'one-time' ? 'payment' : 'subscription',
    //   success_url: success_url || 'https://yourapp.pages.dev/account?success=true',
    //   cancel_url: cancel_url || 'https://yourapp.pages.dev/pricing?canceled=true',
    //   metadata: {
    //     user_id: userId,
    //     plan_id: plan_id
    //   }
    // })
    
    return c.json({
      success: true,
      message: 'Stripe integration pending - add real Stripe keys to enable payments',
      plan: {
        name: plan.name,
        price: plan.price_cents / 100,
        minutes: plan.minutes_included
      }
    })
  } catch (error: any) {
    console.error('Create checkout error:', error)
    return c.json({ 
      error: 'Failed to create checkout session',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// Create Stripe Customer Portal session (placeholder implementation)
app.post('/api/checkout/portal', authMiddleware, async (c) => {
  try {
    const { STRIPE_SECRET_KEY } = c.env
    const userId = c.get('userId')
    const { return_url } = await c.req.json()
    
    // Check if Stripe is configured
    if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === 'sk_test_placeholder') {
      return c.json({
        success: true,
        portal_url: '/account',
        message: 'Stripe not configured - redirecting to account page'
      })
    }
    
    // TODO: Real Stripe Customer Portal
    // const stripe = new Stripe(STRIPE_SECRET_KEY)
    // const session = await stripe.billingPortal.sessions.create({
    //   customer: user.stripe_customer_id,
    //   return_url: return_url || 'https://yourapp.pages.dev/account'
    // })
    
    return c.json({
      success: true,
      message: 'Stripe Customer Portal integration pending',
      portal_url: '/account'
    })
  } catch (error: any) {
    console.error('Create portal error:', error)
    return c.json({ 
      error: 'Failed to create portal session',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// Stripe webhook handler (placeholder implementation)
app.post('/api/webhooks/stripe', async (c) => {
  try {
    const { DB, STRIPE_WEBHOOK_SECRET } = c.env
    const signature = c.req.header('stripe-signature')
    const body = await c.req.text()
    
    // Check if Stripe is configured
    if (!STRIPE_WEBHOOK_SECRET || STRIPE_WEBHOOK_SECRET === 'whsec_placeholder') {
      console.log('Stripe webhook received but not configured - ignoring')
      return c.json({ received: true, message: 'Webhook not configured' })
    }
    
    // TODO: Real Stripe webhook verification
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
    // const event = stripe.webhooks.constructEvent(body, signature!, STRIPE_WEBHOOK_SECRET)
    //
    // Handle events:
    // - checkout.session.completed: Activate subscription
    // - invoice.payment_succeeded: Renew credits
    // - customer.subscription.updated: Update status
    // - customer.subscription.deleted: Cancel subscription
    
    console.log('Stripe webhook placeholder - event would be processed here')
    
    return c.json({ received: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return c.json({ 
      error: 'Webhook processing failed',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// ============================================================================
// SCENARIO API ENDPOINTS
// ============================================================================

// Serve scenario JSON files - import directly for reliability
import scenariosIndex from '../public/scenarios/index.json'
import salaryNegotiation from '../public/scenarios/salary-negotiation.json'
import hrDisciplinary from '../public/scenarios/hr-disciplinary.json'
import salesGatekeeper from '../public/scenarios/sales-gatekeeper.json'
import clientEscalation from '../public/scenarios/client-escalation.json'

app.get('/scenarios/index.json', (c) => c.json(scenariosIndex))
app.get('/scenarios/salary-negotiation.json', (c) => c.json(salaryNegotiation))
app.get('/scenarios/hr-disciplinary.json', (c) => c.json(hrDisciplinary))
app.get('/scenarios/sales-gatekeeper.json', (c) => c.json(salesGatekeeper))
app.get('/scenarios/client-escalation.json', (c) => c.json(clientEscalation))

// API: Generate dynamic scenario based on user configuration
app.post('/api/scenario/generate', async (c) => {
  try {
    const config = await c.req.json()
    const dynamicScenario = buildDynamicScenario(config)
    return c.json(dynamicScenario)
  } catch (error: any) {
    console.error('Error generating scenario:', error)
    return c.json({ 
      error: 'Failed to generate scenario',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// API: Check user tier and determine AI model to use
app.post('/api/session/start', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    const user = c.get('user')
    const body = await c.req.json()
    const voice = body.voice || 'verse'
    
    // Get user subscription
    const subscription = await db.getUserSubscription(DB, user.userId)
    
    if (!subscription) {
      return c.json({ error: 'No active subscription found' }, 403)
    }
    
    // Check if user has free tier
    const isFree = subscription.plan_id === 'free'
    
    return c.json({
      tier: isFree ? 'free' : 'paid',
      model: isFree ? 'gpt-4o-mini' : 'realtime',
      voice: voice,
      subscription: {
        plan_id: subscription.plan_id,
        status: subscription.status
      }
    })
  } catch (error: any) {
    console.error('Error checking user tier:', error)
    return c.json({ 
      error: 'Failed to check user tier',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// API: Generate ephemeral token for OpenAI Realtime API (PAID TIER ONLY)
app.post('/api/ephemeral', authMiddleware, async (c) => {
  try {
    const { DB, OPENAI_API_KEY } = c.env
    const user = c.get('user')
    const body = await c.req.json()
    const voice = body.voice || 'verse'
    
    if (!OPENAI_API_KEY) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
    }
    
    // Verify user has paid tier
    const subscription = await db.getUserSubscription(DB, user.userId)
    
    if (!subscription || subscription.plan_id === 'free') {
      return c.json({ 
        error: 'Realtime API only available for paid tiers',
        message: 'Please upgrade to access premium voice features'
      }, 403)
    }

    // Use direct fetch to OpenAI API for ephemeral token
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: voice
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI API error:', errorText)
      return c.json({ 
        error: 'Failed to create session token',
        details: `OpenAI API returned ${response.status}: ${errorText}`
      }, 500)
    }

    const data = await response.json()
    
    return c.json({
      client_secret: data.client_secret.value,
      expires_at: data.client_secret.expires_at,
      tier: 'paid',
      model: 'realtime'
    })
  } catch (error: any) {
    console.error('Error creating ephemeral token:', error)
    return c.json({ 
      error: 'Failed to create session token',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// API: Free tier streaming endpoint using GPT-4o-mini + TTS
app.post('/api/chat/stream', authMiddleware, async (c) => {
  try {
    const { DB, OPENAI_API_KEY } = c.env
    const user = c.get('user')
    const { messages, voice, systemPrompt } = await c.req.json()
    
    if (!OPENAI_API_KEY) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
    }
    
    // Verify user has free tier
    const subscription = await db.getUserSubscription(DB, user.userId)
    
    if (!subscription) {
      return c.json({ error: 'No active subscription found' }, 403)
    }
    
    // Free tier: Use GPT-4o-mini for text generation
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.8,
      max_tokens: 500
    })
    
    const responseText = completion.choices[0].message.content
    
    // Generate speech using TTS
    const ttsResponse = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice as any || 'alloy',
      input: responseText || '',
      speed: 1.0
    })
    
    const audioBuffer = await ttsResponse.arrayBuffer()
    const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)))
    
    return c.json({
      text: responseText,
      audio: audioBase64,
      tier: 'free',
      model: 'gpt-4o-mini'
    })
  } catch (error: any) {
    console.error('Error in free tier chat:', error)
    return c.json({ 
      error: 'Failed to generate response',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// API: Generate debrief using GPT-4o
app.post('/api/debrief', async (c) => {
  try {
    const { OPENAI_API_KEY } = c.env
    const { transcript, turnTags } = await c.req.json()
    
    if (!OPENAI_API_KEY) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
    
    // Generate debrief using GPT-4o
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a coaching AI analyzing a difficult client conversation. 
Review the transcript and turn tags, then provide:
1. A score from 0-10 (10 = excellent handling)
2. 3-5 specific, actionable coaching points
3. What they did well
4. What to improve

Format as JSON:
{
  "score": number,
  "summary": "brief one-liner",
  "strengths": ["point 1", "point 2"],
  "improvements": ["point 1", "point 2", "point 3"],
  "keyTakeaway": "one sentence"
}`
        },
        {
          role: 'user',
          content: `Transcript:\n${transcript}\n\nTurn Tags:\n${JSON.stringify(turnTags, null, 2)}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7
    })

    const debrief = JSON.parse(completion.choices[0].message.content || '{}')
    
    return c.json(debrief)
  } catch (error: any) {
    console.error('Error generating debrief:', error)
    return c.json({ 
      error: 'Failed to generate debrief',
      details: error?.message || 'Unknown error'
    }, 500)
  }
})

// ============================================================================
// FRONTEND PAGES
// ============================================================================

// Login page
app.get('/login', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login - PAWS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50 min-h-screen">
        <div class="container mx-auto px-4 py-16 max-w-md">
            <!-- Logo -->
            <div class="text-center mb-8">
                <h1 class="text-5xl mb-2">🐾</h1>
                <h2 class="text-3xl font-bold mb-2 text-gray-900">PAWS</h2>
                <p class="text-gray-600">Personalized Anxiety Work-through System</p>
            </div>

            <!-- Login Form -->
            <div class="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
                <h3 class="text-2xl font-semibold mb-6 text-gray-900">Welcome Back</h3>
                
                <form id="loginForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700">Email</label>
                        <input type="email" id="email" required
                            class="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700">Password</label>
                        <input type="password" id="password" required
                            class="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900">
                    </div>

                    <div id="error" class="hidden bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"></div>

                    <button type="submit" id="submitBtn"
                        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200">
                        <i class="fas fa-sign-in-alt mr-2"></i>
                        Login
                    </button>
                </form>

                <div class="mt-6 text-center text-sm text-gray-600">
                    Don't have an account? <a href="/register" class="text-blue-600 hover:text-blue-700">Sign up</a>
                </div>
            </div>
        </div>

        <script>
            const form = document.getElementById('loginForm');
            const submitBtn = document.getElementById('submitBtn');
            const errorDiv = document.getElementById('error');

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;

                // Disable button
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Logging in...';
                errorDiv.classList.add('hidden');

                try {
                    const response = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ email, password })
                    });

                    const data = await response.json();

                    if (response.ok) {
                        // Success - redirect to setup
                        window.location.href = '/setup';
                    } else {
                        // Show error
                        errorDiv.textContent = data.error || 'Login failed';
                        errorDiv.classList.remove('hidden');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Login';
                    }
                } catch (error) {
                    errorDiv.textContent = 'Network error. Please try again.';
                    errorDiv.classList.remove('hidden');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Login';
                }
            });
        </script>
    </body>
    </html>
  `)
})

// Register page
app.get('/register', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sign Up - PAWS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50 min-h-screen">
        <div class="container mx-auto px-4 py-16 max-w-md">
            <!-- Logo -->
            <div class="text-center mb-8">
                <h1 class="text-5xl mb-2">🐾</h1>
                <h2 class="text-3xl font-bold mb-2 text-gray-900">PAWS</h2>
                <p class="text-gray-600">Get 2 free minutes to try it out</p>
            </div>

            <!-- Register Form -->
            <div class="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
                <h3 class="text-2xl font-semibold mb-6 text-gray-900">Create Account</h3>
                
                <form id="registerForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700">Name (Optional)</label>
                        <input type="text" id="name"
                            class="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900">
                    </div>

                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700">Email</label>
                        <input type="email" id="email" required
                            class="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-2 text-gray-700">Password</label>
                        <input type="password" id="password" required
                            class="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900">
                        <p class="text-xs text-gray-500 mt-1">At least 8 characters, with a letter and number</p>
                    </div>

                    <div id="error" class="hidden bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"></div>

                    <button type="submit" id="submitBtn"
                        class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200">
                        <i class="fas fa-user-plus mr-2"></i>
                        Create Account
                    </button>
                </form>

                <div class="mt-6 text-center text-sm text-gray-600">
                    Already have an account? <a href="/login" class="text-blue-600 hover:text-blue-700">Login</a>
                </div>
            </div>
        </div>

        <script>
            const form = document.getElementById('registerForm');
            const submitBtn = document.getElementById('submitBtn');
            const errorDiv = document.getElementById('error');

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const name = document.getElementById('name').value || null;
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;

                // Disable button
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creating account...';
                errorDiv.classList.add('hidden');

                try {
                    const response = await fetch('/api/auth/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ name, email, password })
                    });

                    const data = await response.json();

                    if (response.ok) {
                        // Success - redirect to setup
                        window.location.href = '/setup';
                    } else {
                        // Show error
                        errorDiv.textContent = data.error || 'Registration failed';
                        errorDiv.classList.remove('hidden');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Create Account';
                    }
                } catch (error) {
                    errorDiv.textContent = 'Network error. Please try again.';
                    errorDiv.classList.remove('hidden');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Create Account';
                }
            });
        </script>
    </body>
    </html>
  `)
})

// Pricing page
app.get('/pricing', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pricing - PAWS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50 min-h-screen">
        <!-- Header -->
        <div class="container mx-auto px-4 py-8">
            <div class="flex justify-between items-center">
                <a href="/" class="text-3xl text-gray-900 font-bold">🐾 PAWS</a>
                <div id="authNav" class="space-x-4">
                    <!-- Will be populated by JavaScript -->
                </div>
            </div>
        </div>

        <div class="container mx-auto px-4 py-8 max-w-7xl">
            <!-- Heading -->
            <div class="text-center mb-12">
                <h1 class="text-4xl font-bold mb-4 text-gray-900">Choose Your Plan</h1>
                <p class="text-xl text-gray-600">Practice difficult conversations with AI-powered coaching</p>
            </div>

            <!-- Pricing Cards -->
            <div id="pricingContainer" class="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <!-- Loading state -->
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-spinner fa-spin text-4xl text-blue-600"></i>
                    <p class="mt-4 text-gray-600">Loading pricing plans...</p>
                </div>
            </div>

            <!-- Feature Comparison -->
            <div class="bg-white rounded-lg p-8 border border-gray-200 shadow-sm mb-8">
                <h2 class="text-2xl font-bold mb-6 text-center text-gray-900">Free vs Premium Features</h2>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="border-b border-gray-200">
                                <th class="py-3 px-4 text-gray-600 font-semibold">Feature</th>
                                <th class="py-3 px-4 text-center text-gray-900">Free Tier</th>
                                <th class="py-3 px-4 text-center text-gray-900">Paid Tiers</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="border-b border-gray-100">
                                <td class="py-3 px-4">
                                    <i class="fas fa-comments text-blue-500 mr-2"></i>
                                    <strong>Real-Time Interruptions</strong>
                                    <div class="text-xs text-gray-500 mt-1">Interrupt and be interrupted naturally</div>
                                </td>
                                <td class="py-3 px-4 text-center text-red-500"><i class="fas fa-times text-xl"></i></td>
                                <td class="py-3 px-4 text-center text-green-500"><i class="fas fa-check text-xl"></i></td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-3 px-4">
                                    <i class="fas fa-fire text-orange-500 mr-2"></i>
                                    <strong>Angry Counterparties</strong>
                                    <div class="text-xs text-gray-500 mt-1">Practice with escalating emotional intensity</div>
                                </td>
                                <td class="py-3 px-4 text-center text-red-500"><i class="fas fa-times text-xl"></i></td>
                                <td class="py-3 px-4 text-center text-green-500"><i class="fas fa-check text-xl"></i></td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-3 px-4">
                                    <i class="fas fa-brain text-purple-500 mr-2"></i>
                                    <strong>Advanced Arguments</strong>
                                    <div class="text-xs text-gray-500 mt-1">Sophisticated pushback and objections</div>
                                </td>
                                <td class="py-3 px-4 text-center text-red-500"><i class="fas fa-times text-xl"></i></td>
                                <td class="py-3 px-4 text-center text-green-500"><i class="fas fa-check text-xl"></i></td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-3 px-4">
                                    <i class="fas fa-bolt text-yellow-600 mr-2"></i>
                                    <strong>Realistic Voice Dynamics</strong>
                                    <div class="text-xs text-gray-500 mt-1">Natural pitch, tone, and emotion shifts</div>
                                </td>
                                <td class="py-3 px-4 text-center text-yellow-600">
                                    <i class="fas fa-star-half-alt text-xl"></i>
                                    <div class="text-xs mt-1">Basic</div>
                                </td>
                                <td class="py-3 px-4 text-center text-green-500">
                                    <i class="fas fa-star text-xl"></i>
                                    <div class="text-xs mt-1">Premium</div>
                                </td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="py-3 px-4">
                                    <i class="fas fa-clock text-blue-500 mr-2"></i>
                                    <strong>Response Latency</strong>
                                    <div class="text-xs text-gray-500 mt-1">Time between your speech and AI response</div>
                                </td>
                                <td class="py-3 px-4 text-center text-yellow-600">
                                    1-2 seconds
                                </td>
                                <td class="py-3 px-4 text-center text-green-500">
                                    <strong>&lt;100ms</strong>
                                </td>
                            </tr>
                            <tr>
                                <td class="py-3 px-4">
                                    <i class="fas fa-history text-gray-500 mr-2"></i>
                                    <strong>Session History</strong>
                                    <div class="text-xs text-gray-500 mt-1">Review past conversations and progress</div>
                                </td>
                                <td class="py-3 px-4 text-center text-red-500"><i class="fas fa-times text-xl"></i></td>
                                <td class="py-3 px-4 text-center text-green-500"><i class="fas fa-check text-xl"></i></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <div class="mt-6 p-4 bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg">
                    <p class="text-sm text-blue-200">
                        <i class="fas fa-info-circle mr-2"></i>
                        <strong>Premium tiers use OpenAI's advanced Realtime API</strong> for the most realistic practice experience. 
                        Free tier uses a text-based model to keep costs sustainable.
                    </p>
                </div>
            </div>

            <!-- What You Get -->
            <div class="bg-white rounded-lg p-8 border border-gray-200">
                <h2 class="text-2xl font-bold mb-6 text-center">Why PAWS Works</h2>
                <div class="grid md:grid-cols-3 gap-6">
                    <div class="text-center">
                        <i class="fas fa-microphone text-4xl text-blue-500 mb-4"></i>
                        <h3 class="text-lg font-semibold mb-2">Real-Time Voice</h3>
                        <p class="text-sm text-gray-500">Natural duplex conversation with AI personas</p>
                    </div>
                    <div class="text-center">
                        <i class="fas fa-chart-line text-4xl text-green-500 mb-4"></i>
                        <h3 class="text-lg font-semibold mb-2">Performance Coaching</h3>
                        <p class="text-sm text-gray-500">Get scored feedback after every session</p>
                    </div>
                    <div class="text-center">
                        <i class="fas fa-fire text-4xl text-orange-500 mb-4"></i>
                        <h3 class="text-lg font-semibold mb-2">Dynamic Difficulty</h3>
                        <p class="text-sm text-gray-500">AI adapts pressure based on your responses</p>
                    </div>
                </div>
            </div>
        </div>

        <script>
            // Check if user is authenticated
            async function checkAuth() {
                try {
                    const response = await fetch('/api/auth/me', {
                        credentials: 'include'
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        document.getElementById('authNav').innerHTML = \`
                            <a href="/account" class="text-gray-700 hover:text-white">
                                <i class="fas fa-user mr-1"></i>Account
                            </a>
                            <a href="/setup" class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">
                                Practice Now
                            </a>
                        \`;
                        return data;
                    } else {
                        document.getElementById('authNav').innerHTML = \`
                            <a href="/login" class="text-gray-700 hover:text-white">Login</a>
                            <a href="/register" class="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg">
                                Start Free
                            </a>
                        \`;
                        return null;
                    }
                } catch (error) {
                    return null;
                }
            }

            // Load pricing plans
            async function loadPricing() {
                const userData = await checkAuth();
                
                try {
                    const response = await fetch('/api/subscriptions/plans');
                    const data = await response.json();
                    
                    const container = document.getElementById('pricingContainer');
                    
                    // Filter and organize plans
                    const free = data.plans.find(p => p.type === 'free');
                    const payperuse = data.plans.find(p => p.type === 'payperuse');
                    const monthly = data.plans.filter(p => p.type === 'monthly');
                    const annual = data.plans.filter(p => p.type === 'annual');
                    
                    // Render pricing cards
                    let html = '';
                    
                    // Free tier
                    html += renderCard(free, userData, false);
                    
                    // Pay-per-use
                    html += renderCard(payperuse, userData, false);
                    
                    // Monthly plans (show Professional as recommended)
                    monthly.forEach(plan => {
                        const recommended = plan.id === 'professional_monthly';
                        html += renderCard(plan, userData, recommended);
                    });
                    
                    // Annual plans
                    annual.forEach(plan => {
                        html += renderCard(plan, userData, false, true);
                    });
                    
                    container.innerHTML = html;
                } catch (error) {
                    document.getElementById('pricingContainer').innerHTML = \`
                        <div class="col-span-full text-center py-12">
                            <i class="fas fa-exclamation-triangle text-4xl text-red-500"></i>
                            <p class="mt-4 text-gray-500">Failed to load pricing plans</p>
                        </div>
                    \`;
                }
            }

            function renderCard(plan, userData, recommended = false, isAnnual = false) {
                const isCurrentPlan = userData?.subscription?.plan_id === plan.id;
                const actionButton = isCurrentPlan 
                    ? '<button class="w-full bg-gray-600 text-white font-bold py-3 px-6 rounded-lg cursor-not-allowed" disabled>Current Plan</button>'
                    : plan.type === 'free'
                    ? '<a href="/register" class="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg text-center transition-all">Start Free</a>'
                    : userData
                    ? \`<button onclick="handleUpgrade('\${plan.id}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all">Upgrade</button>\`
                    : '<a href="/register" class="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-center transition-all">Get Started</a>';
                
                return \`
                    <div class="bg-white rounded-lg p-6 border \${recommended ? 'border-blue-500 border-2' : 'border-gray-200'} \${isCurrentPlan ? 'opacity-75' : ''} relative">
                        \${recommended ? '<div class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full">RECOMMENDED</div>' : ''}
                        \${isAnnual ? '<div class="absolute -top-3 right-4 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">17% OFF</div>' : ''}
                        
                        <h3 class="text-xl font-bold mb-2">\${plan.name}</h3>
                        <div class="text-3xl font-bold mb-4">
                            $\${plan.price.toFixed(2)}
                            <span class="text-sm text-gray-500 font-normal">/\${plan.billing_cycle === 'one_time' ? 'purchase' : plan.billing_cycle === 'annual' ? 'year' : 'month'}</span>
                        </div>
                        
                        <div class="mb-6">
                            <div class="text-2xl font-semibold text-blue-500">\${plan.minutes_included} minutes</div>
                            <div class="text-sm text-gray-500">
                                \${plan.type === 'payperuse' ? 'Reusable credits' : plan.type === 'annual' ? 'Per month (refreshes monthly)' : 'Per month (no rollover)'}
                            </div>
                        </div>
                        
                        <ul class="space-y-2 mb-6 text-sm">
                            \${plan.type === 'free' ? \`
                                <li><i class="fas fa-check text-green-500 mr-2"></i>Text-based AI responses</li>
                                <li><i class="fas fa-check text-green-500 mr-2"></i>Basic coaching feedback</li>
                                <li><i class="fas fa-check text-green-500 mr-2"></i>Try all scenarios</li>
                                <li><i class="fas fa-times text-gray-500 mr-2"></i><span class="text-gray-500">No interruptions</span></li>
                                <li><i class="fas fa-times text-gray-500 mr-2"></i><span class="text-gray-500">Basic difficulty</span></li>
                            \` : \`
                                <li><i class="fas fa-star text-yellow-600 mr-2"></i><strong>Real-time interruptions</strong></li>
                                <li><i class="fas fa-star text-yellow-600 mr-2"></i><strong>Advanced arguments</strong></li>
                                <li><i class="fas fa-star text-yellow-600 mr-2"></i><strong>Angry counterparties</strong></li>
                                <li><i class="fas fa-check text-green-500 mr-2"></i>Duplex voice AI</li>
                                <li><i class="fas fa-check text-green-500 mr-2"></i>Advanced coaching</li>
                                <li><i class="fas fa-check text-green-500 mr-2"></i>Session history</li>
                                \${(plan.type === 'monthly' || plan.type === 'annual') ? '<li><i class="fas fa-check text-green-500 mr-2"></i>Grace period (2 min)</li>' : ''}
                            \`}
                        </ul>
                        
                        \${actionButton}
                    </div>
                \`;
            }

            async function handleUpgrade(planId) {
                try {
                    const response = await fetch('/api/checkout/create-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            plan_id: planId,
                            success_url: window.location.origin + '/account?upgrade=success',
                            cancel_url: window.location.origin + '/pricing?canceled=true'
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.checkout_url) {
                        window.location.href = data.checkout_url;
                    } else {
                        alert('Stripe not configured yet. Coming soon!');
                    }
                } catch (error) {
                    alert('Failed to start checkout. Please try again.');
                }
            }

            // Load on page load
            loadPricing();
        </script>
    </body>
    </html>
  `)
})

// Admin dashboard page
app.get('/admin', authMiddleware, (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Dashboard - PAWS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body class="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 min-h-screen text-white">
        <!-- Header -->
        <div class="container mx-auto px-4 py-6">
            <div class="flex justify-between items-center">
                <div>
                    <h1 class="text-3xl font-bold">🐾 PAWS Admin</h1>
                    <p class="text-gray-500 text-sm">Cost Analysis & Business Metrics</p>
                </div>
                <div class="space-x-4">
                    <a href="/account" class="text-gray-700 hover:text-white">My Account</a>
                    <a href="/pricing" class="text-gray-700 hover:text-white">Pricing</a>
                </div>
            </div>
        </div>

        <div class="container mx-auto px-4 py-8 max-w-7xl">
            <!-- Loading State -->
            <div id="loadingState" class="text-center py-12">
                <i class="fas fa-spinner fa-spin text-4xl text-blue-500"></i>
                <p class="mt-4 text-gray-500">Loading dashboard data...</p>
            </div>

            <!-- Main Content -->
            <div id="mainContent" class="hidden space-y-6">
                <!-- Key Metrics Grid -->
                <div class="grid md:grid-cols-4 gap-6">
                    <!-- Total Users -->
                    <div class="bg-white rounded-lg p-6 border border-gray-200">
                        <div class="flex items-center justify-between mb-2">
                            <i class="fas fa-users text-3xl text-blue-500"></i>
                            <span class="text-sm text-gray-500">Total</span>
                        </div>
                        <div id="totalUsers" class="text-3xl font-bold">-</div>
                        <div class="text-sm text-gray-500 mt-1">Users</div>
                    </div>

                    <!-- Total Revenue -->
                    <div class="bg-white rounded-lg p-6 border border-gray-200">
                        <div class="flex items-center justify-between mb-2">
                            <i class="fas fa-dollar-sign text-3xl text-green-500"></i>
                            <span class="text-sm text-gray-500">Lifetime</span>
                        </div>
                        <div id="totalRevenue" class="text-3xl font-bold">-</div>
                        <div class="text-sm text-gray-500 mt-1">Revenue</div>
                    </div>

                    <!-- Total Costs -->
                    <div class="bg-white rounded-lg p-6 border border-gray-200">
                        <div class="flex items-center justify-between mb-2">
                            <i class="fas fa-coins text-3xl text-red-500"></i>
                            <span class="text-sm text-gray-500">OpenAI</span>
                        </div>
                        <div id="totalCosts" class="text-3xl font-bold">-</div>
                        <div class="text-sm text-gray-500 mt-1">Costs</div>
                    </div>

                    <!-- Gross Profit -->
                    <div class="bg-white rounded-lg p-6 border border-gray-200">
                        <div class="flex items-center justify-between mb-2">
                            <i class="fas fa-chart-line text-3xl text-yellow-600"></i>
                            <span class="text-sm text-gray-500">Margin</span>
                        </div>
                        <div id="grossProfit" class="text-3xl font-bold">-</div>
                        <div id="profitMargin" class="text-sm text-gray-500 mt-1">-%</div>
                    </div>
                </div>

                <!-- Conversion Metrics -->
                <div class="grid md:grid-cols-3 gap-6">
                    <div class="bg-white rounded-lg p-6 border border-gray-200">
                        <h3 class="text-lg font-semibold mb-4">
                            <i class="fas fa-percent mr-2 text-blue-500"></i>
                            Conversion Rate
                        </h3>
                        <div id="conversionRate" class="text-4xl font-bold text-blue-500">-%</div>
                        <div class="text-sm text-gray-500 mt-2">Free → Paid conversion</div>
                    </div>

                    <div class="bg-white rounded-lg p-6 border border-gray-200">
                        <h3 class="text-lg font-semibold mb-4">
                            <i class="fas fa-user-clock mr-2 text-green-500"></i>
                            Avg Revenue Per User
                        </h3>
                        <div id="arpu" class="text-4xl font-bold text-green-500">$-</div>
                        <div class="text-sm text-gray-500 mt-2">ARPU (all users)</div>
                    </div>

                    <div class="bg-white rounded-lg p-6 border border-gray-200">
                        <h3 class="text-lg font-semibold mb-4">
                            <i class="fas fa-stopwatch mr-2 text-purple-500"></i>
                            Avg Session Duration
                        </h3>
                        <div id="avgDuration" class="text-4xl font-bold text-purple-500">-</div>
                        <div class="text-sm text-gray-500 mt-2">minutes per session</div>
                    </div>
                </div>

                <!-- User Breakdown -->
                <div class="grid md:grid-cols-2 gap-6">
                    <!-- User Distribution -->
                    <div class="bg-white rounded-lg p-6 border border-gray-200">
                        <h3 class="text-lg font-semibold mb-4">
                            <i class="fas fa-chart-pie mr-2 text-yellow-600"></i>
                            User Distribution by Plan
                        </h3>
                        <div id="planDistribution" class="space-y-3">
                            <!-- Will be populated by JavaScript -->
                        </div>
                    </div>

                    <!-- Recent Activity -->
                    <div class="bg-white rounded-lg p-6 border border-gray-200">
                        <h3 class="text-lg font-semibold mb-4">
                            <i class="fas fa-clock mr-2 text-orange-500"></i>
                            Recent Sessions
                        </h3>
                        <div id="recentSessions" class="space-y-2 max-h-64 overflow-y-auto">
                            <!-- Will be populated by JavaScript -->
                        </div>
                    </div>
                </div>

                <!-- Cost Analysis -->
                <div class="bg-white rounded-lg p-6 border border-gray-200">
                    <h2 class="text-xl font-bold mb-4">
                        <i class="fas fa-calculator mr-2 text-red-500"></i>
                        Cost Analysis & Recommendations
                    </h2>
                    
                    <div class="grid md:grid-cols-3 gap-6 mb-6">
                        <div class="text-center p-4 bg-gray-900 rounded">
                            <div class="text-sm text-gray-500 mb-1">Current Cost/Min</div>
                            <div class="text-2xl font-bold text-red-500">$0.30</div>
                            <div class="text-xs text-gray-500 mt-1">OpenAI Realtime API</div>
                        </div>
                        <div class="text-center p-4 bg-gray-900 rounded">
                            <div class="text-sm text-gray-500 mb-1">Revenue/Min (Avg)</div>
                            <div id="revenuePerMin" class="text-2xl font-bold text-green-500">$-</div>
                            <div class="text-xs text-gray-500 mt-1">Across all paid users</div>
                        </div>
                        <div class="text-center p-4 bg-gray-900 rounded">
                            <div class="text-sm text-gray-500 mb-1">Margin</div>
                            <div id="marginPercent" class="text-2xl font-bold text-yellow-600">-%</div>
                            <div class="text-xs text-gray-500 mt-1">Target: 70%+</div>
                        </div>
                    </div>

                    <div id="recommendations" class="space-y-3">
                        <!-- Will be populated by JavaScript -->
                    </div>
                </div>
            </div>
        </div>

        <script>
            async function loadAdminDashboard() {
                try {
                    // Get all users (for admin, you'd normally check admin status)
                    const usersResponse = await fetch('/api/admin/stats', {
                        credentials: 'include'
                    });

                    if (!usersResponse.ok) {
                        alert('Admin access required');
                        window.location.href = '/account';
                        return;
                    }

                    const stats = await usersResponse.json();
                    
                    // Show main content
                    document.getElementById('loadingState').classList.add('hidden');
                    document.getElementById('mainContent').classList.remove('hidden');
                    
                    // Populate key metrics
                    document.getElementById('totalUsers').textContent = stats.total_users;
                    document.getElementById('totalRevenue').textContent = '$' + stats.total_revenue.toFixed(2);
                    document.getElementById('totalCosts').textContent = '$' + stats.total_costs.toFixed(2);
                    document.getElementById('grossProfit').textContent = '$' + stats.gross_profit.toFixed(2);
                    document.getElementById('profitMargin').textContent = stats.profit_margin.toFixed(1) + '%';
                    
                    // Conversion metrics
                    document.getElementById('conversionRate').textContent = stats.conversion_rate.toFixed(1) + '%';
                    document.getElementById('arpu').textContent = '$' + stats.arpu.toFixed(2);
                    document.getElementById('avgDuration').textContent = stats.avg_session_duration.toFixed(1);
                    
                    // Cost analysis
                    document.getElementById('revenuePerMin').textContent = '$' + stats.revenue_per_minute.toFixed(2);
                    document.getElementById('marginPercent').textContent = stats.margin_percent.toFixed(1) + '%';
                    
                    // Plan distribution
                    renderPlanDistribution(stats.plan_distribution);
                    
                    // Recent sessions
                    renderRecentSessions(stats.recent_sessions);
                    
                    // Recommendations
                    renderRecommendations(stats);
                    
                } catch (error) {
                    console.error('Failed to load admin dashboard:', error);
                    alert('Failed to load dashboard. Check console for errors.');
                }
            }
            
            function renderPlanDistribution(distribution) {
                const container = document.getElementById('planDistribution');
                const colors = {
                    'free': 'bg-gray-600',
                    'payperuse': 'bg-blue-600',
                    'monthly': 'bg-green-600',
                    'annual': 'bg-purple-600'
                };
                
                container.innerHTML = distribution.map(item => \`
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <div class="w-3 h-3 rounded-full \${colors[item.type] || 'bg-gray-600'} mr-2"></div>
                            <span class="text-sm">\${item.plan_name}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-sm font-semibold">\${item.count} users</span>
                            <span class="text-xs text-gray-500">(\${item.percentage.toFixed(1)}%)</span>
                        </div>
                    </div>
                \`).join('');
            }
            
            function renderRecentSessions(sessions) {
                const container = document.getElementById('recentSessions');
                
                if (sessions.length === 0) {
                    container.innerHTML = '<div class="text-sm text-gray-500 text-center py-4">No recent sessions</div>';
                    return;
                }
                
                container.innerHTML = sessions.map(session => \`
                    <div class="text-xs bg-gray-900 rounded p-2 flex justify-between items-center">
                        <div>
                            <span class="text-gray-700">\${session.user_email || 'Anonymous'}</span>
                            <span class="text-gray-500 ml-2">\${new Date(session.session_start * 1000).toLocaleString()}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-blue-500">\${Math.floor(session.duration_seconds / 60)}:\${(session.duration_seconds % 60).toString().padStart(2, '0')}</span>
                            <span class="text-gray-500">·</span>
                            <span class="text-green-500">\${session.plan_name || 'Free'}</span>
                        </div>
                    </div>
                \`).join('');
            }
            
            function renderRecommendations(stats) {
                const container = document.getElementById('recommendations');
                const recommendations = [];
                
                if (stats.margin_percent < 60) {
                    recommendations.push({
                        icon: 'fa-exclamation-triangle',
                        color: 'red',
                        title: 'Low Margin Alert',
                        message: 'Profit margin below 60%. Consider increasing prices or reducing costs.'
                    });
                }
                
                if (stats.conversion_rate < 5) {
                    recommendations.push({
                        icon: 'fa-chart-line',
                        color: 'yellow',
                        title: 'Low Conversion',
                        message: 'Conversion rate below 5%. Improve free tier experience or pricing messaging.'
                    });
                }
                
                if (stats.arpu < 10) {
                    recommendations.push({
                        icon: 'fa-dollar-sign',
                        color: 'orange',
                        title: 'Low ARPU',
                        message: 'Average revenue per user is low. Focus on upselling to higher tiers.'
                    });
                }
                
                if (stats.margin_percent >= 70 && stats.conversion_rate >= 5) {
                    recommendations.push({
                        icon: 'fa-check-circle',
                        color: 'green',
                        title: 'Healthy Metrics',
                        message: 'Unit economics look good! Focus on growth and marketing.'
                    });
                }
                
                if (recommendations.length === 0) {
                    container.innerHTML = '<div class="text-sm text-gray-500">No recommendations at this time.</div>';
                    return;
                }
                
                container.innerHTML = recommendations.map(rec => \`
                    <div class="flex items-start gap-3 p-3 bg-gray-900 rounded">
                        <i class="fas \${rec.icon} text-\${rec.color}-400 text-xl mt-1"></i>
                        <div>
                            <div class="font-semibold text-\${rec.color}-400">\${rec.title}</div>
                            <div class="text-sm text-gray-700 mt-1">\${rec.message}</div>
                        </div>
                    </div>
                \`).join('');
            }
            
            // Load on page load
            loadAdminDashboard();
        </script>
    </body>
    </html>
  `)
})

// Account dashboard page
app.get('/account', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account - PAWS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 min-h-screen text-white">
        <!-- Header -->
        <div class="container mx-auto px-4 py-6">
            <div class="flex justify-between items-center">
                <a href="/" class="text-3xl">🐾 PAWS</a>
                <div class="space-x-4">
                    <a href="/pricing" class="text-gray-700 hover:text-white">Pricing</a>
                    <a href="/setup" class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">Practice</a>
                    <button onclick="handleLogout()" class="text-gray-700 hover:text-white">
                        <i class="fas fa-sign-out-alt mr-1"></i>Logout
                    </button>
                </div>
            </div>
        </div>

        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <!-- Loading State -->
            <div id="loadingState" class="text-center py-12">
                <i class="fas fa-spinner fa-spin text-4xl text-blue-500"></i>
                <p class="mt-4 text-gray-500">Loading your account...</p>
            </div>

            <!-- Main Content (hidden until loaded) -->
            <div id="mainContent" class="hidden space-y-6">
                <!-- Profile Card -->
                <div class="bg-white rounded-lg p-6 border border-gray-200">
                    <h2 class="text-2xl font-bold mb-4">
                        <i class="fas fa-user mr-2 text-blue-500"></i>
                        Profile
                    </h2>
                    <div class="grid md:grid-cols-2 gap-4">
                        <div>
                            <div class="text-sm text-gray-500">Name</div>
                            <div id="userName" class="text-lg font-semibold">-</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-500">Email</div>
                            <div id="userEmail" class="text-lg font-semibold">-</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-500">Member Since</div>
                            <div id="memberSince" class="text-lg font-semibold">-</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-500">Email Verified</div>
                            <div id="emailVerified" class="text-lg font-semibold">-</div>
                        </div>
                    </div>
                </div>

                <!-- Subscription Card -->
                <div class="bg-white rounded-lg p-6 border border-gray-200">
                    <div class="flex justify-between items-start mb-4">
                        <h2 class="text-2xl font-bold">
                            <i class="fas fa-credit-card mr-2 text-green-500"></i>
                            Subscription
                        </h2>
                        <a href="/pricing" class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm">
                            <i class="fas fa-arrow-up mr-1"></i>Upgrade Plan
                        </a>
                    </div>
                    
                    <div class="grid md:grid-cols-3 gap-4">
                        <div>
                            <div class="text-sm text-gray-500">Current Plan</div>
                            <div id="currentPlan" class="text-lg font-semibold">-</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-500">Status</div>
                            <div id="planStatus" class="text-lg font-semibold">-</div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-500">Renews On</div>
                            <div id="renewsOn" class="text-lg font-semibold">-</div>
                        </div>
                    </div>
                </div>

                <!-- Credits Card -->
                <div class="bg-white rounded-lg p-6 border border-gray-200">
                    <div class="flex justify-between items-start mb-4">
                        <h2 class="text-2xl font-bold">
                            <i class="fas fa-clock mr-2 text-yellow-600"></i>
                            Available Time
                        </h2>
                        <button onclick="handleAddMinutes()" class="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-sm">
                            <i class="fas fa-plus mr-1"></i>Add More Minutes
                        </button>
                    </div>
                    
                    <div class="text-center py-8">
                        <div id="remainingTime" class="text-6xl font-bold text-blue-500 mb-2">-</div>
                        <div class="text-gray-500">minutes remaining</div>
                        <div id="creditType" class="text-sm text-gray-500 mt-2">-</div>
                    </div>
                    
                    <div class="bg-gray-900 rounded-lg p-4 mt-4">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">Original Allocation</span>
                            <span id="originalAllocation" class="font-semibold">-</span>
                        </div>
                        <div class="w-full bg-slate-700 rounded-full h-2 mt-2">
                            <div id="usageBar" class="bg-blue-500 h-2 rounded-full transition-all" style="width: 0%"></div>
                        </div>
                    </div>
                </div>

                <!-- Usage History Card -->
                <div class="bg-white rounded-lg p-6 border border-gray-200">
                    <h2 class="text-2xl font-bold mb-4">
                        <i class="fas fa-history mr-2 text-purple-500"></i>
                        Recent Sessions
                    </h2>
                    
                    <div id="usageHistory" class="space-y-2">
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                            <p>Loading history...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Error State -->
            <div id="errorState" class="hidden text-center py-12">
                <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
                <p class="text-xl mb-4">Please log in to view your account</p>
                <a href="/login" class="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg inline-block">
                    Go to Login
                </a>
            </div>
        </div>

        <script>
            async function loadAccount() {
                try {
                    const response = await fetch('/api/auth/me', {
                        credentials: 'include'
                    });
                    
                    if (!response.ok) {
                        showError();
                        return;
                    }
                    
                    const data = await response.json();
                    
                    // Show main content
                    document.getElementById('loadingState').classList.add('hidden');
                    document.getElementById('mainContent').classList.remove('hidden');
                    
                    // Populate profile
                    document.getElementById('userName').textContent = data.user.name || 'Not set';
                    document.getElementById('userEmail').textContent = data.user.email;
                    document.getElementById('memberSince').textContent = new Date(data.user.created_at * 1000).toLocaleDateString();
                    document.getElementById('emailVerified').textContent = data.user.email_verified ? '✅ Verified' : '⏳ Not verified';
                    
                    // Populate subscription
                    if (data.subscription) {
                        document.getElementById('currentPlan').textContent = formatPlanName(data.subscription.plan_id);
                        document.getElementById('planStatus').textContent = data.subscription.status === 'active' ? '✅ Active' : '⏸️ ' + data.subscription.status;
                        document.getElementById('renewsOn').textContent = new Date(data.subscription.period_end * 1000).toLocaleDateString();
                    }
                    
                    // Populate credits
                    if (data.credits) {
                        document.getElementById('remainingTime').textContent = data.credits.balance_minutes;
                        document.getElementById('creditType').textContent = formatCreditType(data.credits.type);
                        document.getElementById('originalAllocation').textContent = data.credits.original_minutes || 0 + ' minutes';
                        
                        const usagePercent = ((data.credits.original_minutes - data.credits.balance_minutes) / data.credits.original_minutes * 100) || 0;
                        document.getElementById('usageBar').style.width = usagePercent + '%';
                    } else {
                        document.getElementById('remainingTime').textContent = '0';
                        document.getElementById('creditType').textContent = 'No active credits';
                    }
                    
                    // Load usage history
                    loadUsageHistory();
                } catch (error) {
                    showError();
                }
            }
            
            async function loadUsageHistory() {
                try {
                    const response = await fetch('/api/usage/history?limit=10', {
                        credentials: 'include'
                    });
                    
                    const data = await response.json();
                    const container = document.getElementById('usageHistory');
                    
                    if (data.sessions && data.sessions.length > 0) {
                        container.innerHTML = data.sessions.map(session => \`
                            <div class="bg-gray-900 rounded-lg p-4 flex justify-between items-center">
                                <div>
                                    <div class="font-semibold">\${session.scenario_id || 'Practice Session'}</div>
                                    <div class="text-sm text-gray-500">\${new Date(session.session_start * 1000).toLocaleString()}</div>
                                </div>
                                <div class="text-right">
                                    <div class="font-semibold">\${session.duration_minutes}m \${session.duration_seconds % 60}s</div>
                                    <div class="text-sm text-gray-500">\${session.status}</div>
                                </div>
                            </div>
                        \`).join('');
                    } else {
                        container.innerHTML = '<div class="text-center py-8 text-gray-500">No sessions yet. <a href="/setup" class="text-blue-500 hover:text-blue-300">Start practicing!</a></div>';
                    }
                } catch (error) {
                    document.getElementById('usageHistory').innerHTML = '<div class="text-center py-8 text-red-500">Failed to load history</div>';
                }
            }
            
            function formatPlanName(planId) {
                const names = {
                    'free': 'Free Trial',
                    'payperuse': 'Pay Per Use',
                    'starter_monthly': 'Starter Monthly',
                    'professional_monthly': 'Professional Monthly',
                    'expert_monthly': 'Expert Monthly',
                    'starter_annual': 'Starter Annual',
                    'professional_annual': 'Professional Annual',
                    'expert_annual': 'Expert Annual'
                };
                return names[planId] || planId;
            }
            
            function formatCreditType(type) {
                const types = {
                    'free': 'Free tier (expires monthly)',
                    'payperuse': 'Pay-per-use credits (no expiration)',
                    'monthly': 'Monthly subscription (no rollover)',
                    'annual': 'Annual subscription (refreshes monthly)',
                    'grace': 'Grace period (2 minutes)'
                };
                return types[type] || type;
            }
            
            function showError() {
                document.getElementById('loadingState').classList.add('hidden');
                document.getElementById('errorState').classList.remove('hidden');
            }
            
            async function handleLogout() {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'include'
                });
                window.location.href = '/login';
            }
            
            async function handleAddMinutes() {
                window.location.href = '/pricing';
            }
            
            // Load on page load
            loadAccount();
        </script>
    </body>
    </html>
  `)
})

// Main page - redirect to setup (or login if not authenticated)
// Hero landing page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PAWS - Personalized Anxiety Work-through System</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body class="bg-white min-h-screen">
        <!-- Navigation -->
        <nav class="bg-white border-b border-gray-200 sticky top-0 z-50">
            <div class="container mx-auto px-4 py-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <span class="text-4xl mr-2">🐾</span>
                        <span class="text-2xl font-bold text-gray-900">PAWS</span>
                    </div>
                    <div class="flex items-center space-x-4">
                        <a href="/pricing" class="text-gray-600 hover:text-gray-900 font-medium">Pricing</a>
                        <a href="/login" class="text-gray-600 hover:text-gray-900 font-medium">Login</a>
                        <a href="/register" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold">Get Started</a>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Hero Section -->
        <section class="py-20 bg-gradient-to-br from-blue-50 via-white to-purple-50">
            <div class="container mx-auto px-4 text-center">
                <div class="max-w-4xl mx-auto">
                    <h1 class="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
                        Take a <span class="text-blue-600">PAWS</span> before that hard conversation
                    </h1>
                    <p class="text-xl text-gray-600 mb-8 leading-relaxed">
                        Practice difficult conversations with AI before they happen. Build confidence, 
                        reduce anxiety, and master communication skills in a safe, judgment-free environment.
                    </p>
                    <div class="flex flex-col sm:flex-row gap-4 justify-center">
                        <a href="/register" class="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-bold text-lg transition-all transform hover:scale-105">
                            <i class="fas fa-play mr-2"></i>
                            Start Free Trial
                        </a>
                        <a href="/setup" class="bg-white border-2 border-gray-300 hover:border-blue-600 text-gray-900 px-8 py-4 rounded-lg font-bold text-lg transition-all">
                            <i class="fas fa-eye mr-2"></i>
                            See How It Works
                        </a>
                    </div>
                    
                    <div class="mt-12">
                        <p class="text-sm text-gray-500 mb-4">Used by professionals at</p>
                        <div class="flex flex-wrap justify-center gap-8 items-center opacity-50">
                            <div class="text-2xl font-bold text-gray-400">Tech Startups</div>
                            <div class="text-2xl font-bold text-gray-400">Consulting Firms</div>
                            <div class="text-2xl font-bold text-gray-400">Sales Teams</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Features Section -->
        <section class="py-20 bg-white">
            <div class="container mx-auto px-4">
                <div class="text-center mb-16">
                    <h2 class="text-4xl font-bold text-gray-900 mb-4">Why Use PAWS?</h2>
                    <p class="text-xl text-gray-600">Real practice for real conversations</p>
                </div>
                
                <div class="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    <div class="bg-blue-50 rounded-xl p-8 border border-blue-100">
                        <div class="text-4xl mb-4">🎯</div>
                        <h3 class="text-xl font-bold text-gray-900 mb-3">Realistic Scenarios</h3>
                        <p class="text-gray-600">Practice salary negotiations, difficult clients, HR situations, and more with AI that responds like a real person.</p>
                    </div>
                    
                    <div class="bg-purple-50 rounded-xl p-8 border border-purple-100">
                        <div class="text-4xl mb-4">📊</div>
                        <h3 class="text-xl font-bold text-gray-900 mb-3">Instant Feedback</h3>
                        <p class="text-gray-600">Get detailed analysis of your performance with actionable coaching points after every session.</p>
                    </div>
                    
                    <div class="bg-green-50 rounded-xl p-8 border border-green-100">
                        <div class="text-4xl mb-4">🔒</div>
                        <h3 class="text-xl font-bold text-gray-900 mb-3">Safe Practice</h3>
                        <p class="text-gray-600">Make mistakes without consequences. Build confidence in a judgment-free environment.</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- Scenarios Section -->
        <section class="py-20 bg-gray-50">
            <div class="container mx-auto px-4">
                <div class="text-center mb-16">
                    <h2 class="text-4xl font-bold text-gray-900 mb-4">Practice Any Difficult Conversation</h2>
                    <p class="text-xl text-gray-600">Choose from our library of real-world scenarios</p>
                </div>
                
                <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
                    <div class="bg-white rounded-lg p-6 border border-gray-200 hover:shadow-lg transition-shadow">
                        <div class="text-3xl mb-3">💼</div>
                        <h3 class="font-bold text-gray-900 mb-2">Salary Negotiation</h3>
                        <p class="text-sm text-gray-600">Practice asking for what you're worth</p>
                    </div>
                    
                    <div class="bg-white rounded-lg p-6 border border-gray-200 hover:shadow-lg transition-shadow">
                        <div class="text-3xl mb-3">👔</div>
                        <h3 class="font-bold text-gray-900 mb-2">Job Interview</h3>
                        <p class="text-sm text-gray-600">Ace your next interview with confidence</p>
                    </div>
                    
                    <div class="bg-white rounded-lg p-6 border border-gray-200 hover:shadow-lg transition-shadow">
                        <div class="text-3xl mb-3">📞</div>
                        <h3 class="font-bold text-gray-900 mb-2">Difficult Clients</h3>
                        <p class="text-sm text-gray-600">Handle escalated customer situations</p>
                    </div>
                    
                    <div class="bg-white rounded-lg p-6 border border-gray-200 hover:shadow-lg transition-shadow">
                        <div class="text-3xl mb-3">🎤</div>
                        <h3 class="font-bold text-gray-900 mb-2">HR Conversations</h3>
                        <p class="text-sm text-gray-600">Navigate sensitive workplace issues</p>
                    </div>
                </div>
                
                <div class="text-center mt-12">
                    <a href="/setup" class="text-blue-600 hover:text-blue-700 font-semibold text-lg">
                        View all scenarios <i class="fas fa-arrow-right ml-2"></i>
                    </a>
                </div>
            </div>
        </section>

        <!-- CTA Section -->
        <section class="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
            <div class="container mx-auto px-4 text-center">
                <div class="max-w-3xl mx-auto">
                    <h2 class="text-4xl font-bold text-white mb-6">Ready to master difficult conversations?</h2>
                    <p class="text-xl text-blue-100 mb-8">Start with 2 minutes free. No credit card required.</p>
                    <a href="/register" class="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg inline-block transition-all transform hover:scale-105">
                        <i class="fas fa-rocket mr-2"></i>
                        Get Started Now
                    </a>
                </div>
            </div>
        </section>

        <!-- Footer -->
        <footer class="bg-gray-900 text-gray-400 py-12">
            <div class="container mx-auto px-4">
                <div class="grid md:grid-cols-4 gap-8 mb-8">
                    <div>
                        <div class="flex items-center mb-4">
                            <span class="text-3xl mr-2">🐾</span>
                            <span class="text-xl font-bold text-white">PAWS</span>
                        </div>
                        <p class="text-sm">Personalized Anxiety Work-through System</p>
                    </div>
                    <div>
                        <h4 class="text-white font-semibold mb-4">Product</h4>
                        <ul class="space-y-2 text-sm">
                            <li><a href="/pricing" class="hover:text-white">Pricing</a></li>
                            <li><a href="/setup" class="hover:text-white">Scenarios</a></li>
                            <li><a href="/features" class="hover:text-white">Features</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 class="text-white font-semibold mb-4">Company</h4>
                        <ul class="space-y-2 text-sm">
                            <li><a href="/about" class="hover:text-white">About</a></li>
                            <li><a href="/blog" class="hover:text-white">Blog</a></li>
                            <li><a href="/contact" class="hover:text-white">Contact</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 class="text-white font-semibold mb-4">Legal</h4>
                        <ul class="space-y-2 text-sm">
                            <li><a href="/privacy" class="hover:text-white">Privacy Policy</a></li>
                            <li><a href="/terms" class="hover:text-white">Terms of Service</a></li>
                        </ul>
                    </div>
                </div>
                <div class="border-t border-gray-800 pt-8 text-center text-sm">
                    <p>&copy; 2026 PAWS. All rights reserved.</p>
                </div>
            </div>
        </footer>
    </body>
    </html>
  `)
})

// Setup wizard page
app.get('/setup', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Setup - PAWS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50 min-h-screen">
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <!-- Header -->
            <div class="text-center mb-6">
                <h1 class="text-3xl font-bold mb-2 flex items-center justify-center text-gray-900">
                    <span class="text-5xl mr-3">🐾</span>
                    PAWS Setup
                </h1>
                <p class="text-gray-600 italic">Configure your personalized fear rehearsal</p>
            </div>

            <!-- Progress Bar -->
            <div class="progress-container">
                <div class="progress-label" id="stepLabel">Step 1/5: Choose Scenario</div>
                <div class="progress-bar-track">
                    <div class="progress-bar-fill" id="progressBar" style="width: 20%"></div>
                </div>
            </div>

            <!-- Setup Container -->
            <div id="setupContainer"></div>
        </div>

        <script src="/static/setup.js"></script>
    </body>
    </html>
  `)
})

// Practice session page
app.get('/practice', authMiddleware, async (c) => {
  try {
    const { DB } = c.env
    if (!DB) {
      return c.text('Database not configured', 500)
    }
    
    const userId = c.get('userId')
    const userEmail = c.get('userEmail')
    
    if (!userId) {
      return c.text('User not found', 401)
    }
    
    // Check user subscription tier
    const subscription = await db.getUserSubscription(DB, userId)
    const isFree = !subscription || subscription.plan_id === 'free'
    
    const practiceScript = isFree ? '/static/practice-free.js' : '/static/practice.js'
    const tierBadge = isFree 
      ? '<span class="px-3 py-1 bg-blue-500/20 border border-blue-400/30 rounded text-blue-300 text-sm font-semibold">🆓 Free Tier</span>'
      : '<span class="px-3 py-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded text-white text-sm font-semibold">⭐ Premium</span>'
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Practice - PAWS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/styles.css" rel="stylesheet">
        <style>
          .pulse-ring {
            animation: pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          @keyframes pulse-ring {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.1); }
          }
          .recording-indicator {
            box-shadow: 0 0 20px rgba(239, 68, 68, 0.5);
          }
        </style>
    </head>
    <body class="bg-gray-50 min-h-screen">
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <!-- Header -->
            <div class="text-center mb-8">
                <h1 class="text-4xl font-bold mb-2 flex items-center justify-center text-gray-900">
                    <span class="text-6xl mr-3">🐾</span>
                    PAWS
                </h1>
                <p class="text-gray-600 italic">Take a PAWS before that hard conversation</p>
                <p class="text-gray-500 text-sm mt-1">Personalized Anxiety Work-through System</p>
                <div class="mt-3">
                  ${tierBadge}
                </div>
            </div>

            <!-- Main Content -->
            <div class="grid md:grid-cols-2 gap-6">
                <!-- Left Panel: Session Controls -->
                <div class="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                    <h2 class="text-xl font-semibold mb-4 text-gray-900">
                        <i class="fas fa-microphone mr-2 text-green-500"></i>
                        Session Control
                    </h2>
                    
                    <!-- Status -->
                    <div class="mb-6">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm text-gray-600">Status:</span>
                            <span id="status" class="text-sm font-semibold text-yellow-600">Disconnected</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div id="statusBar" class="bg-yellow-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                        </div>
                    </div>

                    <!-- Scenario Info -->
                    <div class="mb-6 p-4 bg-blue-50 rounded border border-blue-100">
                        <h3 class="text-sm font-semibold mb-2 text-blue-700">Your Scenario:</h3>
                        <p id="scenarioTitle" class="text-sm text-gray-900 mb-2 font-semibold">Loading...</p>
                        <div id="scenarioInfo" class="text-xs text-gray-600">
                          Configuring your personalized session...
                        </div>
                    </div>

                    <!-- Timer & Balance Display -->
                    <div id="timerDisplay" class="mb-6 p-4 bg-purple-50 rounded border border-purple-100">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm text-gray-600">Remaining Time:</span>
                            <span id="remainingTime" class="text-2xl font-bold text-purple-600">--:--</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div id="timeBar" class="bg-purple-500 h-2 rounded-full transition-all" style="width: 100%"></div>
                        </div>
                        <div id="balanceWarning" class="hidden mt-2 text-xs text-yellow-600">
                            <i class="fas fa-exclamation-triangle mr-1"></i>
                            <span>Low balance warning</span>
                        </div>
                        <div id="graceWarning" class="hidden mt-2 text-xs text-orange-600 font-semibold">
                            <i class="fas fa-hourglass-half mr-1"></i>
                            <span>Grace period: <span id="graceTime">2:00</span> remaining</span>
                        </div>
                    </div>

                    <!-- Start/Stop Button -->
                    <button id="startBtn" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 mb-4">
                        <i class="fas fa-play mr-2"></i>
                        Start Conversation
                    </button>

                    <button id="stopBtn" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 hidden">
                        <i class="fas fa-stop mr-2"></i>
                        End Conversation
                    </button>

                    <!-- Push-to-Talk Button (Free Tier Only) -->
                    <button id="pushToTalkBtn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 hidden disabled:opacity-50 disabled:cursor-not-allowed">
                        <i class="fas fa-microphone text-blue-500 text-3xl"></i>
                        <br>
                        <span class="text-blue-300">Hold to Speak</span>
                    </button>

                    <!-- Recording Indicator -->
                    <div id="recordingIndicator" class="hidden mt-4 flex items-center justify-center">
                        <div class="recording-indicator bg-red-500 rounded-full p-3 pulse-ring">
                            <i class="fas fa-microphone text-white text-xl"></i>
                        </div>
                        <span class="ml-3 text-sm font-semibold text-red-500">LIVE</span>
                    </div>

                    <!-- Audio Levels -->
                    <div class="mt-4">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-xs text-gray-500">Your Audio Level:</span>
                        </div>
                        <div class="w-full bg-slate-700 rounded-full h-2">
                            <div id="audioLevel" class="bg-green-500 h-2 rounded-full transition-all duration-100" style="width: 0%"></div>
                        </div>
                    </div>
                </div>

                <!-- Right Panel: Live Captions -->
                <div class="bg-white rounded-lg p-6 border border-gray-200">
                    <h2 class="text-xl font-semibold mb-4">
                        <i class="fas fa-closed-captioning mr-2 text-purple-500"></i>
                        Live Transcript
                    </h2>
                    
                    <div id="transcript" class="h-96 overflow-y-auto space-y-3 text-sm">
                        <div class="text-gray-500 text-center py-8">
                            <i class="fas fa-info-circle text-3xl mb-2"></i>
                            <p>Transcript will appear here when you start the conversation</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Debrief Section -->
            <div id="debriefSection" class="hidden mt-6 bg-white rounded-lg p-6 border border-gray-200">
                <h2 class="text-2xl font-semibold mb-4">
                    <i class="fas fa-clipboard-check mr-2 text-yellow-600"></i>
                    Coaching Debrief
                </h2>
                
                <div id="debriefContent" class="space-y-4">
                    <div class="flex items-center justify-center py-8">
                        <i class="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
                        <span class="ml-3 text-gray-500">Analyzing your performance...</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Upgrade Modal -->
        <div id="upgradeModal" class="hidden fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg p-8 max-w-md border border-gray-200">
                <h2 class="text-2xl font-bold mb-4">
                    <i class="fas fa-clock text-yellow-600 mr-2"></i>
                    Credits Exhausted
                </h2>
                <p class="text-gray-700 mb-6">You've used all your available conversation time. Add more minutes to continue practicing!</p>
                
                <div class="space-y-3">
                    <a href="/pricing" class="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-center transition-all">
                        <i class="fas fa-arrow-up mr-2"></i>
                        View Plans & Upgrade
                    </a>
                    <a href="/account" class="block w-full bg-slate-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg text-center transition-all">
                        <i class="fas fa-user mr-2"></i>
                        Go to Account
                    </a>
                    <button onclick="closeUpgradeModal()" class="w-full text-gray-500 hover:text-white py-2">
                        Close
                    </button>
                </div>
            </div>
        </div>

        <script>
            // Timer and balance tracking
            let userBalance = null;
            let sessionId = null;
            let sessionStartTime = null;
            let heartbeatInterval = null;
            let timerUpdateInterval = null;

            // Check balance before allowing practice
            async function checkBalance() {
                try {
                    const response = await fetch('/api/usage/balance', {
                        credentials: 'include'
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        userBalance = data;
                        updateTimerDisplay(data.balance_seconds);
                        return data.balance_seconds > 0;
                    } else {
                        // Not authenticated - redirect to login
                        window.location.href = '/login';
                        return false;
                    }
                } catch (error) {
                    console.error('Failed to check balance:', error);
                    return false;
                }
            }

            // Update timer display
            function updateTimerDisplay(seconds) {
                const minutes = Math.floor(seconds / 60);
                const secs = seconds % 60;
                document.getElementById('remainingTime').textContent = 
                    minutes + ':' + secs.toString().padStart(2, '0');
                
                // Update progress bar
                if (userBalance && userBalance.original_seconds) {
                    const percent = (seconds / userBalance.original_seconds) * 100;
                    document.getElementById('timeBar').style.width = percent + '%';
                    
                    // Show warning if low (< 60 seconds or < 10%)
                    if (seconds < 60 || percent < 10) {
                        document.getElementById('balanceWarning').classList.remove('hidden');
                    } else {
                        document.getElementById('balanceWarning').classList.add('hidden');
                    }
                }
            }

            // Start session tracking
            async function startSessionTracking(scenarioId) {
                try {
                    const response = await fetch('/api/usage/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ scenario_id: scenarioId })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        sessionId = data.session_id;
                        sessionStartTime = Date.now();
                        
                        // Start heartbeat (every 5 seconds)
                        heartbeatInterval = setInterval(sendHeartbeat, 5000);
                        
                        // Start timer update (every second)
                        timerUpdateInterval = setInterval(updateLocalTimer, 1000);
                        
                        return true;
                    } else {
                        const error = await response.json();
                        alert(error.message || 'Insufficient credits');
                        showUpgradeModal();
                        return false;
                    }
                } catch (error) {
                    console.error('Failed to start session:', error);
                    return false;
                }
            }

            // Send heartbeat to server
            async function sendHeartbeat() {
                if (!sessionId) return;
                
                const elapsedSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
                
                try {
                    const response = await fetch('/api/usage/heartbeat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            session_id: sessionId,
                            duration_seconds: elapsedSeconds
                        })
                    });
                    
                    const data = await response.json();
                    
                    // Update remaining time
                    if (data.available_seconds !== undefined) {
                        updateTimerDisplay(data.available_seconds);
                    }
                    
                    // Check if grace period
                    if (data.grace_period) {
                        const graceDiv = document.getElementById('graceWarning');
                        graceDiv.classList.remove('hidden');
                        const graceSeconds = data.grace_seconds_remaining || 120;
                        const mins = Math.floor(graceSeconds / 60);
                        const secs = graceSeconds % 60;
                        document.getElementById('graceTime').textContent = 
                            mins + ':' + secs.toString().padStart(2, '0');
                    }
                    
                    // Check if should stop
                    if (data.should_stop) {
                        stopSessionTracking();
                        showUpgradeModal();
                        // Also stop the WebRTC conversation if it's running
                        const stopBtn = document.getElementById('stopBtn');
                        if (stopBtn && !stopBtn.classList.contains('hidden')) {
                            stopBtn.click();
                        }
                    }
                } catch (error) {
                    console.error('Heartbeat failed:', error);
                }
            }

            // Update local timer display (runs every second)
            function updateLocalTimer() {
                if (!sessionStartTime || !userBalance) return;
                
                const elapsedSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
                const remainingSeconds = Math.max(0, userBalance.balance_seconds - elapsedSeconds);
                updateTimerDisplay(remainingSeconds);
            }

            // Stop session tracking
            async function stopSessionTracking() {
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                    heartbeatInterval = null;
                }
                
                if (timerUpdateInterval) {
                    clearInterval(timerUpdateInterval);
                    timerUpdateInterval = null;
                }
                
                if (sessionId && sessionStartTime) {
                    const elapsedSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
                    
                    try {
                        await fetch('/api/usage/end', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                                session_id: sessionId,
                                duration_seconds: elapsedSeconds
                            })
                        });
                    } catch (error) {
                        console.error('Failed to end session:', error);
                    }
                }
                
                sessionId = null;
                sessionStartTime = null;
            }

            // Show upgrade modal
            function showUpgradeModal() {
                document.getElementById('upgradeModal').classList.remove('hidden');
            }

            // Close upgrade modal
            function closeUpgradeModal() {
                document.getElementById('upgradeModal').classList.add('hidden');
            }

            // Override start button to check balance first
            document.addEventListener('DOMContentLoaded', () => {
                checkBalance(); // Check on page load
                
                const originalStartBtn = document.getElementById('startBtn');
                if (originalStartBtn) {
                    originalStartBtn.addEventListener('click', async (e) => {
                        const hasBalance = await checkBalance();
                        if (!hasBalance) {
                            e.preventDefault();
                            e.stopPropagation();
                            showUpgradeModal();
                            return false;
                        }
                        
                        // Get scenario ID from URL params or default
                        const urlParams = new URLSearchParams(window.location.search);
                        const scenarioId = urlParams.get('scenario') || 'default';
                        
                        // Start session tracking
                        const started = await startSessionTracking(scenarioId);
                        if (!started) {
                            e.preventDefault();
                            e.stopPropagation();
                            return false;
                        }
                    });
                }
                
                // Hook into stop button
                const stopBtn = document.getElementById('stopBtn');
                if (stopBtn) {
                    stopBtn.addEventListener('click', () => {
                        stopSessionTracking();
                    });
                }
            });
        </script>

        <script src="${practiceScript}"></script>
    </body>
    </html>
  `)
  } catch (error) {
    console.error('Practice page error:', error)
    return c.text(`Error loading practice page: ${error.message}`, 500)
  }
})

export default app
