# 🏗️ Technical Architecture

## System Overview

**Artificial Client** is a voice-based training application built on Cloudflare's edge infrastructure, leveraging OpenAI's Realtime API for natural conversation and GPT-4o for coaching analysis.

---

## Architecture Layers

### 1. Frontend Layer (Browser)

**Technology**: Vanilla JavaScript, Web APIs, TailwindCSS

**Key Components**:

```javascript
class ArtificialClient {
  // WebRTC connection to OpenAI
  pc: RTCPeerConnection
  
  // Data channel for events
  dc: DataChannel
  
  // Audio playback
  audioElement: Audio
  
  // State management
  transcript: Array<Message>
  turnTags: Array<AnalyticsTag>
  isConnected: boolean
  scenario: ScenarioConfig
}
```

**Responsibilities**:
1. **Microphone Capture**: `navigator.mediaDevices.getUserMedia()`
2. **WebRTC Connection**: Direct peer connection to OpenAI Realtime API
3. **Audio Playback**: Remote audio stream from OpenAI
4. **UI Updates**: Live transcript, status indicators, audio levels
5. **Session Management**: Start/stop conversation, cleanup resources

**APIs Used**:
- `RTCPeerConnection` - WebRTC peer connection
- `MediaStream` - Microphone audio capture
- `AudioContext` - Audio level monitoring
- `DataChannel` - Event messaging with OpenAI
- `fetch` - HTTP API calls to backend

---

### 2. Backend Layer (Cloudflare Pages Functions)

**Technology**: Hono framework, TypeScript, Cloudflare Workers Runtime

**Endpoints**:

#### `POST /api/ephemeral`

**Purpose**: Generate short-lived OpenAI session token

**Flow**:
```
1. Receive request from browser
2. Use root OPENAI_API_KEY to call OpenAI sessions API
3. Return ephemeral token (60s validity)
4. Browser uses token for WebRTC connection
```

**Security**:
- Root API key never exposed to browser
- Tokens expire after 60 seconds
- Per-session isolation

**Code**:
```typescript
app.post('/api/ephemeral', async (c) => {
  const openai = new OpenAI({ apiKey: c.env.OPENAI_API_KEY })
  
  const response = await openai.sessions.create({
    model: 'gpt-4o-realtime-preview-2024-12-17',
    voice: 'verse'
  })
  
  return c.json({
    client_secret: response.client_secret.value,
    expires_at: response.client_secret.expires_at
  })
})
```

#### `POST /api/debrief`

**Purpose**: Generate post-call coaching analysis

**Flow**:
```
1. Receive transcript and turn tags from browser
2. Call GPT-4o with coaching prompt
3. Use structured outputs for consistent JSON
4. Return score, strengths, improvements, key takeaway
```

**Input**:
```json
{
  "transcript": "USER: ...\n\nASSISTANT: ...",
  "turnTags": [
    {
      "objection_type": "Results",
      "difficulty": 3,
      "sentiment": "skeptical"
    }
  ]
}
```

**Output**:
```json
{
  "score": 7,
  "summary": "Good ownership but lacked specific recovery plan",
  "strengths": ["Acknowledged the issue", "Stayed calm"],
  "improvements": ["Provide specific dates", "Name owners"],
  "keyTakeaway": "Always come with a concrete plan"
}
```

---

### 3. AI Layer (OpenAI)

**Services Used**:

#### OpenAI Realtime API (gpt-4o-realtime-preview-2024-12-17)

**Purpose**: Duplex voice conversation with low latency

**Connection Flow**:
```
1. Browser fetches ephemeral token from /api/ephemeral
2. Browser creates RTCPeerConnection
3. Browser sends SDP offer to OpenAI sessions endpoint
4. OpenAI returns SDP answer
5. WebRTC connection established (browser ↔ OpenAI direct)
6. Audio streams in both directions
```

**Configuration**:
```javascript
{
  modalities: ['text', 'audio'],
  instructions: systemPrompt, // Scenario context
  voice: 'verse',
  input_audio_format: 'pcm16',
  output_audio_format: 'pcm16',
  input_audio_transcription: { model: 'whisper-1' },
  turn_detection: {
    type: 'server_vad',
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 500
  }
}
```

**Event Types**:
- `conversation.item.created` - New message in conversation
- `response.audio_transcript.delta` - Streaming transcript
- `conversation.item.input_audio_transcription.completed` - User speech transcribed
- `response.done` - Response complete
- `error` - Error occurred

#### GPT-4o (Chat Completions)

**Purpose**: Generate coaching debrief

**Configuration**:
```javascript
{
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: coachingPrompt },
    { role: 'user', content: transcriptAndTags }
  ],
  response_format: { type: 'json_object' },
  temperature: 0.7
}
```

---

## Data Flow

### Conversation Start Flow

```
┌─────────┐                   ┌──────────┐                   ┌─────────┐
│ Browser │                   │ Backend  │                   │ OpenAI  │
└─────────┘                   └──────────┘                   └─────────┘
     │                              │                              │
     │ 1. POST /api/ephemeral       │                              │
     ├─────────────────────────────▶│                              │
     │                              │ 2. sessions.create()         │
     │                              ├─────────────────────────────▶│
     │                              │◀─────────────────────────────┤
     │                              │ 3. ephemeral token           │
     │◀─────────────────────────────┤                              │
     │ 4. token                     │                              │
     │                              │                              │
     │ 5. Create RTCPeerConnection  │                              │
     │────────┐                     │                              │
     │        │                     │                              │
     │◀───────┘                     │                              │
     │                              │                              │
     │ 6. POST /sessions (SDP offer)│                              │
     ├─────────────────────────────────────────────────────────────▶│
     │                              │                              │
     │◀─────────────────────────────────────────────────────────────┤
     │ 7. SDP answer                │                              │
     │                              │                              │
     │ 8. WebRTC connection established                            │
     ├═════════════════════════════════════════════════════════════▶│
     │                              │                              │
     │ 9. Audio stream (bidirectional)                             │
     │◀═════════════════════════════════════════════════════════════▶│
```

### Conversation End Flow

```
┌─────────┐                   ┌──────────┐                   ┌─────────┐
│ Browser │                   │ Backend  │                   │ OpenAI  │
└─────────┘                   └──────────┘                   └─────────┘
     │                              │                              │
     │ 1. User clicks "End"         │                              │
     │────────┐                     │                              │
     │        │                     │                              │
     │◀───────┘                     │                              │
     │                              │                              │
     │ 2. Close WebRTC connection   │                              │
     ├─────────────────────────────────────────────────────────────▶│
     │                              │                              │
     │ 3. POST /api/debrief         │                              │
     │   { transcript, turnTags }   │                              │
     ├─────────────────────────────▶│                              │
     │                              │ 4. chat.completions.create() │
     │                              ├─────────────────────────────▶│
     │                              │◀─────────────────────────────┤
     │                              │ 5. coaching analysis         │
     │◀─────────────────────────────┤                              │
     │ 6. Display debrief           │                              │
     │────────┐                     │                              │
     │        │                     │                              │
     │◀───────┘                     │                              │
```

---

## Scenario Engine

### System Prompt Construction

The AI client's behavior is controlled by a dynamically-generated system prompt that combines:

1. **Persona Definition**
   - Role (e.g., "COO of municipal services operator")
   - Style (e.g., "direct, data-obsessed, low tolerance for excuses")
   - Voice instructions (e.g., "business formal, steady pace")

2. **Scenario Facts**
   - Current project phase
   - Target vs actual metrics
   - Contract payment terms

3. **Behavioral Rules**
   - Speak in short sentences (10-20 words)
   - Interrupt when user rambles
   - Ask for specifics: owners, dates, checkpoints
   - Escalate difficulty every 2-3 turns

4. **Objection Bank**
   - Pre-written challenging questions
   - Used strategically during conversation

5. **Escalation Triggers**
   - Phrases that trigger difficulty increase
   - e.g., "staff resistance", "not our fault", "need more time"

### Prompt Template

```
You are The Client, a senior executive at a paying customer organisation.

**Your Role:** {persona.role}
**Your Style:** {persona.style}
**Voice Instructions:** {persona.voice_instructions}

**Scenario Facts:**
- Phase: {facts.phase}
- Target SIC Compliance: {facts.targets.SIC_compliance}%
- Current SIC Compliance: {facts.current.SIC_compliance}%
...

**Hot Buttons:**
- {hot_buttons[0]}
- {hot_buttons[1]}
...

**Objection Bank (use these strategically):**
1. {objection_bank[0]}
2. {objection_bank[1]}
...

**Escalation Trigger:**
If the consultant uses phrases like "{trigger_phrases}", escalate by saying: "{exec}"

**Your Goals:**
1. Pressure-test the consultant
2. Speak in short sentences
3. Ask for specifics
...
```

### Scenario Configuration (JSON)

```json
{
  "persona": {
    "role": "string",
    "style": "string",
    "voice_instructions": "string"
  },
  "facts": {
    "phase": "string",
    "targets": { "metric": number },
    "current": { "metric": number },
    "contract": { "payment_milestone": "string" }
  },
  "hot_buttons": ["string"],
  "objection_bank": ["string"],
  "escalation": {
    "trigger_phrases": ["string"],
    "exec": "string"
  },
  "success_criteria": ["string"]
}
```

---

## State Management

### Browser State

```typescript
interface AppState {
  // WebRTC
  pc: RTCPeerConnection | null
  dc: DataChannel | null
  audioElement: Audio
  
  // Conversation
  transcript: Message[]
  turnTags: TurnTag[]
  isConnected: boolean
  
  // Scenario
  scenario: ScenarioConfig | null
  
  // UI
  status: string
  statusType: 'info' | 'success' | 'error' | 'warning'
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface TurnTag {
  objection_type: 'Results' | 'Data' | 'Governance' | 'Payment' | 'Plan'
  difficulty: 1 | 2 | 3 | 4 | 5
  sentiment: 'neutral' | 'skeptical' | 'frustrated'
  next_probe?: string
}
```

### Backend State

**Stateless**: Each request is independent
- No session storage in MVP
- All state maintained in browser
- Future: Store sessions in Cloudflare D1

---

## Security Model

### API Key Protection

1. **Root key stored in Cloudflare secrets**
   - Not in source code
   - Not in environment variables in git
   - Injected at runtime via `.dev.vars` (local) or Cloudflare dashboard (production)

2. **Ephemeral tokens for browser**
   - 60-second validity
   - Single-use per session
   - Cannot be reused after expiry

3. **No credentials in frontend**
   - Browser never sees root API key
   - Browser only receives short-lived tokens

### CORS Configuration

```typescript
app.use('*', cors())
```

- Allow all origins (MVP)
- Future: Restrict to specific domains in production

### Data Privacy

- No server-side logging of conversations (MVP)
- Transcripts stored in browser memory only
- No persistent storage (MVP)
- Future: Add opt-in transcript storage with explicit user consent

---

## Performance Considerations

### Latency Optimization

1. **Edge deployment** (Cloudflare Pages)
   - Token generation at edge locations worldwide
   - Minimal round-trip time for `/api/ephemeral`

2. **Direct WebRTC** (Browser ↔ OpenAI)
   - No proxy servers in audio path
   - Audio packets travel direct route
   - Typical latency: 400-800ms round-trip

3. **Efficient audio codecs**
   - PCM16 format for low latency
   - Server-side VAD (Voice Activity Detection)
   - 300ms prefix padding, 500ms silence detection

### Resource Usage

**Browser**:
- Audio: ~64 kbps (PCM16)
- Transcript updates: ~1 KB per turn
- Total memory: ~5-10 MB

**Cloudflare Worker**:
- `/api/ephemeral`: ~100ms execution, <1MB memory
- `/api/debrief`: ~2-5s execution (GPT-4o call), <1MB memory

**OpenAI**:
- Realtime API: ~$0.06/minute (audio)
- GPT-4o: ~$0.005/debrief call

---

## Error Handling

### Connection Errors

```typescript
try {
  const response = await fetch('/api/ephemeral', { method: 'POST' })
  if (!response.ok) throw new Error('Failed to get token')
} catch (error) {
  updateStatus(`Error: ${error.message}`, 'error')
  cleanup()
}
```

### WebRTC Errors

```typescript
pc.addEventListener('iceconnectionstatechange', () => {
  if (pc.iceConnectionState === 'failed') {
    console.error('WebRTC connection failed')
    updateStatus('Connection lost', 'error')
    cleanup()
  }
})
```

### API Errors

```typescript
dc.addEventListener('message', (e) => {
  const event = JSON.parse(e.data)
  if (event.type === 'error') {
    console.error('Realtime API error:', event.error)
    updateStatus(`Error: ${event.error.message}`, 'error')
  }
})
```

---

## Future Architecture Enhancements

### Phase 2: Session History

**Add Cloudflare D1 database**:
```typescript
// wrangler.jsonc
{
  "d1_databases": [{
    "binding": "DB",
    "database_name": "artificial-client-sessions",
    "database_id": "..."
  }]
}
```

**Schema**:
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  scenario_id TEXT,
  transcript JSON,
  turn_tags JSON,
  debrief JSON,
  score INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_sessions ON sessions(user_id, created_at);
```

### Phase 3: Multi-Scenario Support

**Scenarios table**:
```sql
CREATE TABLE scenarios (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  config JSON,
  difficulty_level INTEGER,
  created_at DATETIME
);
```

**UI changes**:
- Scenario selector dropdown
- Difficulty slider
- Progress tracking across scenarios

### Phase 4: Digital Avatar Integration

**Heygen Integration**:
```typescript
// New endpoint: /api/avatar
app.post('/api/avatar', async (c) => {
  const { sessionId } = await c.req.json()
  
  // Create Heygen streaming avatar
  const avatar = await heygen.createStreamingAvatar({
    scenario: loadScenario(sessionId),
    voice: 'professional_female',
    quality: 'high'
  })
  
  return c.json({ avatarUrl: avatar.webrtcUrl })
})
```

**Zoom/Teams Bot**:
- Connect avatar to meeting via Zoom SDK
- Route audio through OpenAI Realtime API
- Display video avatar in meeting

### Phase 5: Analytics Dashboard

**Metrics to track**:
- Average score over time
- Most challenging objection types
- Common failure patterns
- Improvement trajectory

**Cloudflare Analytics Engine**:
```typescript
c.env.ANALYTICS.writeDataPoint({
  indexes: [userId, scenarioId],
  blobs: [objectionType, sentiment],
  doubles: [score, duration]
})
```

---

## Deployment Architecture

### Development

```
Local Machine
├── Node.js runtime
├── Wrangler dev server
├── Hot module reloading
└── .dev.vars (local secrets)
```

### Sandbox (Current)

```
E2B Sandbox
├── PM2 process manager
├── Wrangler pages dev
├── Port 3000 exposed
└── Public URL via sandbox proxy
```

### Production (Cloudflare)

```
Cloudflare Pages
├── Edge workers (global)
├── Static assets (cached)
├── Environment secrets
└── Custom domain support
```

---

## API Reference

### Browser → Backend

#### `POST /api/ephemeral`

Request:
```
POST /api/ephemeral
Content-Type: application/json
```

Response:
```json
{
  "client_secret": "eph_xxxxx",
  "expires_at": 1234567890
}
```

#### `POST /api/debrief`

Request:
```json
{
  "transcript": "USER: ...\nASSISTANT: ...",
  "turnTags": [...]
}
```

Response:
```json
{
  "score": 7,
  "summary": "...",
  "strengths": ["..."],
  "improvements": ["..."],
  "keyTakeaway": "..."
}
```

### Browser → OpenAI

#### `POST https://api.openai.com/v1/realtime/sessions`

Request:
```
POST /v1/realtime/sessions
Authorization: Bearer {ephemeral_token}
Content-Type: application/sdp

{SDP_OFFER}
```

Response:
```
{SDP_ANSWER}
```

---

## Conclusion

This architecture provides:
- ✅ **Low latency** via edge deployment and direct WebRTC
- ✅ **Security** via ephemeral tokens and secret management
- ✅ **Scalability** via Cloudflare's global network
- ✅ **Extensibility** for future features (D1, analytics, avatars)

The modular design separates concerns cleanly:
- **Browser**: UI and WebRTC
- **Backend**: Token generation and debrief
- **OpenAI**: Conversation AI

This makes it easy to add features without breaking existing functionality.
