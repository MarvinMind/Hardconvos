import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import OpenAI from 'openai'

type Bindings = {
  OPENAI_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for all routes
app.use('*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))
app.use('/scenario.json', serveStatic({ root: './public' }))

// API: Generate ephemeral token for OpenAI Realtime API
app.post('/api/ephemeral', async (c) => {
  try {
    const { OPENAI_API_KEY } = c.env
    
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
        voice: 'verse'
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

// Main page
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
                        <h3 class="text-sm font-semibold mb-2 text-blue-300">Scenario Loaded:</h3>
                        <p id="scenarioRole" class="text-sm text-slate-300 mb-1">COO of municipal services operator</p>
                        <p id="scenarioStyle" class="text-xs text-slate-400">Direct, data-obsessed, low tolerance for excuses</p>
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

        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
