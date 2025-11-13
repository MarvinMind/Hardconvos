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
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
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
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
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

// API: Generate ephemeral token for OpenAI Realtime API
app.post('/api/ephemeral', async (c) => {
  try {
    const { OPENAI_API_KEY } = c.env
    const body = await c.req.json()
    const voice = body.voice || 'verse'
    
    if (!OPENAI_API_KEY) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
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
      expires_at: data.client_secret.expires_at
    })
  } catch (error: any) {
    console.error('Error creating ephemeral token:', error)
    return c.json({ 
      error: 'Failed to create session token',
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

// Main page - redirect to setup
app.get('/', (c) => {
  return c.redirect('/setup')
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
    <body class="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 min-h-screen text-white">
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <!-- Header -->
            <div class="text-center mb-6">
                <h1 class="text-3xl font-bold mb-2 flex items-center justify-center">
                    <span class="text-5xl mr-3">🐾</span>
                    PAWS Setup
                </h1>
                <p class="text-slate-400 italic">Configure your personalized fear rehearsal</p>
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
app.get('/practice', (c) => {
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
    <body class="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 min-h-screen text-white">
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <!-- Header -->
            <div class="text-center mb-8">
                <h1 class="text-4xl font-bold mb-2 flex items-center justify-center">
                    <span class="text-6xl mr-3">🐾</span>
                    PAWS
                </h1>
                <p class="text-slate-400 italic">Take a PAWS before that hard conversation</p>
                <p class="text-slate-500 text-sm mt-1">Personalized Anxiety Work-through System</p>
            </div>

            <!-- Main Content -->
            <div class="grid md:grid-cols-2 gap-6">
                <!-- Left Panel: Session Controls -->
                <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
                    <h2 class="text-xl font-semibold mb-4">
                        <i class="fas fa-microphone mr-2 text-green-400"></i>
                        Session Control
                    </h2>
                    
                    <!-- Status -->
                    <div class="mb-6">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm text-slate-400">Status:</span>
                            <span id="status" class="text-sm font-semibold text-yellow-400">Disconnected</span>
                        </div>
                        <div class="w-full bg-slate-700 rounded-full h-2">
                            <div id="statusBar" class="bg-yellow-400 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                        </div>
                    </div>

                    <!-- Scenario Info -->
                    <div class="mb-6 p-4 bg-slate-900 rounded border border-slate-700">
                        <h3 class="text-sm font-semibold mb-2 text-blue-300">Your Scenario:</h3>
                        <p id="scenarioTitle" class="text-sm text-slate-300 mb-2 font-semibold">Loading...</p>
                        <div id="scenarioInfo" class="text-xs text-slate-400">
                          Configuring your personalized session...
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

                    <!-- Recording Indicator -->
                    <div id="recordingIndicator" class="hidden mt-4 flex items-center justify-center">
                        <div class="recording-indicator bg-red-500 rounded-full p-3 pulse-ring">
                            <i class="fas fa-microphone text-white text-xl"></i>
                        </div>
                        <span class="ml-3 text-sm font-semibold text-red-400">LIVE</span>
                    </div>

                    <!-- Audio Levels -->
                    <div class="mt-4">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-xs text-slate-400">Your Audio Level:</span>
                        </div>
                        <div class="w-full bg-slate-700 rounded-full h-2">
                            <div id="audioLevel" class="bg-green-500 h-2 rounded-full transition-all duration-100" style="width: 0%"></div>
                        </div>
                    </div>
                </div>

                <!-- Right Panel: Live Captions -->
                <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
                    <h2 class="text-xl font-semibold mb-4">
                        <i class="fas fa-closed-captioning mr-2 text-purple-400"></i>
                        Live Transcript
                    </h2>
                    
                    <div id="transcript" class="h-96 overflow-y-auto space-y-3 text-sm">
                        <div class="text-slate-400 text-center py-8">
                            <i class="fas fa-info-circle text-3xl mb-2"></i>
                            <p>Transcript will appear here when you start the conversation</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Debrief Section -->
            <div id="debriefSection" class="hidden mt-6 bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h2 class="text-2xl font-semibold mb-4">
                    <i class="fas fa-clipboard-check mr-2 text-yellow-400"></i>
                    Coaching Debrief
                </h2>
                
                <div id="debriefContent" class="space-y-4">
                    <div class="flex items-center justify-center py-8">
                        <i class="fas fa-spinner fa-spin text-3xl text-blue-400"></i>
                        <span class="ml-3 text-slate-400">Analyzing your performance...</span>
                    </div>
                </div>
            </div>
        </div>

        <script src="/static/practice.js"></script>
    </body>
    </html>
  `)
})

export default app
