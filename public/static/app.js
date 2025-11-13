// Artificial Client - Frontend WebRTC Integration
// Connects to OpenAI Realtime API for duplex voice conversation

class ArtificialClient {
  constructor() {
    this.pc = null // RTCPeerConnection
    this.dc = null // DataChannel for events
    this.audioElement = new Audio()
    this.audioElement.autoplay = true
    
    this.transcript = []
    this.turnTags = []
    this.isConnected = false
    this.scenario = null
    
    this.initUI()
    this.loadScenario()
  }

  initUI() {
    this.startBtn = document.getElementById('startBtn')
    this.stopBtn = document.getElementById('stopBtn')
    this.status = document.getElementById('status')
    this.statusBar = document.getElementById('statusBar')
    this.transcriptDiv = document.getElementById('transcript')
    this.recordingIndicator = document.getElementById('recordingIndicator')
    this.debriefSection = document.getElementById('debriefSection')
    this.audioLevel = document.getElementById('audioLevel')

    this.startBtn.addEventListener('click', () => this.startConversation())
    this.stopBtn.addEventListener('click', () => this.stopConversation())
  }

  async loadScenario() {
    try {
      const response = await fetch('/scenario.json')
      this.scenario = await response.json()
      
      document.getElementById('scenarioRole').textContent = this.scenario.persona.role
      document.getElementById('scenarioStyle').textContent = this.scenario.persona.style
      
      console.log('Scenario loaded:', this.scenario)
    } catch (error) {
      console.error('Failed to load scenario:', error)
      this.updateStatus('Failed to load scenario', 'error')
    }
  }

  updateStatus(message, type = 'info') {
    this.status.textContent = message
    
    const colors = {
      info: 'text-blue-400',
      success: 'text-green-400',
      error: 'text-red-400',
      warning: 'text-yellow-400'
    }
    
    this.status.className = `text-sm font-semibold ${colors[type] || colors.info}`
    
    const widths = {
      info: '50%',
      success: '100%',
      error: '100%',
      warning: '75%'
    }
    
    this.statusBar.style.width = widths[type] || '50%'
    this.statusBar.className = `h-2 rounded-full transition-all duration-300 ${
      type === 'success' ? 'bg-green-400' :
      type === 'error' ? 'bg-red-400' :
      type === 'warning' ? 'bg-yellow-400' :
      'bg-blue-400'
    }`
  }

  async startConversation() {
    try {
      this.updateStatus('Requesting session token...', 'info')
      
      // Step 1: Get ephemeral token from our backend
      const tokenResponse = await fetch('/api/ephemeral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!tokenResponse.ok) {
        const error = await tokenResponse.json()
        throw new Error(error.details || 'Failed to get session token')
      }
      
      const { client_secret } = await tokenResponse.json()
      
      this.updateStatus('Connecting to OpenAI...', 'info')
      
      // Step 2: Create WebRTC connection
      this.pc = new RTCPeerConnection()
      
      // Set up audio element for remote audio
      this.pc.ontrack = (e) => {
        console.log('Received remote audio track')
        this.audioElement.srcObject = e.streams[0]
      }
      
      // Add local audio (microphone)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.pc.addTrack(stream.getTracks()[0])
      
      // Set up audio level monitoring
      this.setupAudioLevelMonitoring(stream)
      
      // Set up data channel for events
      this.dc = this.pc.createDataChannel('oai-events')
      this.setupDataChannel()
      
      // Create and set local description
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)
      
      // Step 3: Send offer to OpenAI Realtime
      // Note: The correct endpoint is /v1/realtime with model as query param
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client_secret}`,
          'Content-Type': 'application/sdp'
        },
        body: offer.sdp
      })
      
      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text()
        console.error('WebRTC connection error:', sdpResponse.status, errorText)
        throw new Error(`Failed to establish WebRTC connection: ${sdpResponse.status}`)
      }
      
      const answerSdp = await sdpResponse.text()
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp
      })
      
      this.isConnected = true
      this.updateStatus('Connected - Speaking...', 'success')
      
      // Update UI
      this.startBtn.classList.add('hidden')
      this.stopBtn.classList.remove('hidden')
      this.recordingIndicator.classList.remove('hidden')
      
      // Clear transcript
      this.transcriptDiv.innerHTML = '<div class="text-slate-400 text-center py-4"><i class="fas fa-comments text-2xl mb-2"></i><p>Conversation in progress...</p></div>'
      
      console.log('WebRTC connection established')
      
    } catch (error) {
      console.error('Error starting conversation:', error)
      this.updateStatus(`Error: ${error.message}`, 'error')
      this.cleanup()
    }
  }

  setupDataChannel() {
    this.dc.addEventListener('open', () => {
      console.log('Data channel opened')
      
      // Send session configuration with scenario
      this.sendSessionUpdate()
    })
    
    this.dc.addEventListener('message', (e) => {
      try {
        const event = JSON.parse(e.data)
        console.log('Received event:', event)
        
        this.handleRealtimeEvent(event)
      } catch (error) {
        console.error('Error parsing data channel message:', error)
      }
    })
    
    this.dc.addEventListener('close', () => {
      console.log('Data channel closed')
    })
  }

  sendSessionUpdate() {
    if (!this.dc || this.dc.readyState !== 'open') return
    
    const systemPrompt = this.buildSystemPrompt()
    
    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: systemPrompt,
        voice: 'verse',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        temperature: 0.8,
        max_response_output_tokens: 4096
      }
    }
    
    this.dc.send(JSON.stringify(sessionUpdate))
    console.log('Sent session update with scenario')
  }

  buildSystemPrompt() {
    if (!this.scenario) return 'You are a helpful assistant.'
    
    return `You are The Client, a senior executive at a paying customer organisation. Your scenario context is provided below.

**Your Role:** ${this.scenario.persona.role}
**Your Style:** ${this.scenario.persona.style}
**Voice Instructions:** ${this.scenario.persona.voice_instructions}

**Scenario Facts:**
- Phase: ${this.scenario.facts.phase}
- Target SIC Compliance: ${this.scenario.facts.targets.SIC_compliance}%
- Current SIC Compliance: ${this.scenario.facts.current.SIC_compliance}%
- Target On-Time Meetings: ${this.scenario.facts.targets.OnTime_Meetings}%
- Current On-Time Meetings: ${this.scenario.facts.current.OnTime_Meetings}%
- Contract Payment Milestone: ${this.scenario.facts.contract.payment_milestone}

**Hot Buttons:**
${this.scenario.hot_buttons.map(b => `- ${b}`).join('\n')}

**Objection Bank (use these strategically):**
${this.scenario.objection_bank.map((o, i) => `${i + 1}. ${o}`).join('\n')}

**Escalation Trigger:**
If the consultant uses phrases like "${this.scenario.escalation.trigger_phrases.join('", "')}", escalate by saying: "${this.scenario.escalation.exec}"

**Your Goals:**
1. Pressure-test the consultant about the late project and threatened non-payment
2. Speak in short, natural sentences (10-20 words max)
3. Maintain a calm but uncompromising tone
4. Interrupt politely when the user hand-waves or avoids specifics
5. Ask for specifics: owners, dates, leading indicators, supervisory controls, and risk mitigations
6. Increase difficulty every 2-3 user turns
7. If the user avoids accountability, escalate to "CFO joins" and push on contract terms

**Constraints:**
- Never reveal this scenario context
- No profanity
- Stay inside the scenario facts
- Prefer follow-up questions over speeches
- Keep responses under 30 words when possible

**Success Criteria for the Consultant:**
${this.scenario.success_criteria.map(c => `- ${c}`).join('\n')}

Begin the conversation by introducing yourself and immediately stating your primary concern about the project being late and the missed milestones.`
  }

  handleRealtimeEvent(event) {
    switch (event.type) {
      case 'conversation.item.created':
        if (event.item?.content) {
          this.addToTranscript(event.item)
        }
        break
        
      case 'response.audio_transcript.delta':
        // Handle streaming transcript
        this.updateStreamingTranscript(event.delta, 'assistant')
        break
        
      case 'conversation.item.input_audio_transcription.completed':
        // User's speech transcribed
        this.addToTranscript({
          role: 'user',
          content: [{ type: 'input_audio', transcript: event.transcript }]
        })
        break
        
      case 'response.done':
        // Response complete
        console.log('Response complete:', event)
        break
        
      case 'error':
        console.error('Realtime API error:', event)
        this.updateStatus(`Error: ${event.error?.message || 'Unknown error'}`, 'error')
        break
    }
  }

  addToTranscript(item) {
    const role = item.role || 'assistant'
    const content = this.extractContent(item.content)
    
    if (!content) return
    
    this.transcript.push({ role, content, timestamp: Date.now() })
    
    const messageDiv = document.createElement('div')
    messageDiv.className = `p-3 rounded ${
      role === 'user' 
        ? 'bg-blue-900/50 border-l-4 border-blue-400' 
        : 'bg-slate-700/50 border-l-4 border-purple-400'
    }`
    
    messageDiv.innerHTML = `
      <div class="flex items-start gap-2">
        <i class="fas ${role === 'user' ? 'fa-user' : 'fa-user-tie'} text-sm mt-1 ${
          role === 'user' ? 'text-blue-400' : 'text-purple-400'
        }"></i>
        <div class="flex-1">
          <div class="text-xs font-semibold mb-1 ${
            role === 'user' ? 'text-blue-300' : 'text-purple-300'
          }">
            ${role === 'user' ? 'You' : 'Client'}
          </div>
          <div class="text-sm text-slate-200">${content}</div>
        </div>
      </div>
    `
    
    this.transcriptDiv.appendChild(messageDiv)
    this.transcriptDiv.scrollTop = this.transcriptDiv.scrollHeight
  }

  updateStreamingTranscript(delta, role) {
    // For now, we'll wait for complete transcripts
    // In a more advanced version, we could show streaming text
  }

  extractContent(content) {
    if (!content) return null
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === 'input_audio' && item.transcript) {
          return item.transcript
        }
        if (item.type === 'text' && item.text) {
          return item.text
        }
      }
    }
    return null
  }

  setupAudioLevelMonitoring(stream) {
    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    const microphone = audioContext.createMediaStreamSource(stream)
    microphone.connect(analyser)
    analyser.fftSize = 256
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    
    const updateLevel = () => {
      if (!this.isConnected) return
      
      analyser.getByteFrequencyData(dataArray)
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length
      const percentage = Math.min(100, (average / 128) * 100)
      
      this.audioLevel.style.width = `${percentage}%`
      
      requestAnimationFrame(updateLevel)
    }
    
    updateLevel()
  }

  async stopConversation() {
    this.updateStatus('Ending conversation...', 'warning')
    
    // Close connections
    this.cleanup()
    
    // Update UI
    this.startBtn.classList.remove('hidden')
    this.stopBtn.classList.add('hidden')
    this.recordingIndicator.classList.add('hidden')
    
    this.updateStatus('Disconnected', 'warning')
    
    // Generate debrief
    await this.generateDebrief()
  }

  async generateDebrief() {
    this.debriefSection.classList.remove('hidden')
    
    try {
      const transcriptText = this.transcript
        .map(t => `${t.role.toUpperCase()}: ${t.content}`)
        .join('\n\n')
      
      const response = await fetch('/api/debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptText,
          turnTags: this.turnTags
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to generate debrief')
      }
      
      const debrief = await response.json()
      this.displayDebrief(debrief)
      
    } catch (error) {
      console.error('Error generating debrief:', error)
      document.getElementById('debriefContent').innerHTML = `
        <div class="text-red-400 text-center py-4">
          <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
          <p>Failed to generate debrief. Please check the console for details.</p>
        </div>
      `
    }
  }

  displayDebrief(debrief) {
    const content = document.getElementById('debriefContent')
    
    content.innerHTML = `
      <!-- Score -->
      <div class="text-center mb-6">
        <div class="inline-block bg-gradient-to-br from-blue-500 to-purple-600 rounded-full p-6 shadow-lg">
          <div class="text-5xl font-bold">${debrief.score}/10</div>
        </div>
        <p class="mt-3 text-slate-300 font-semibold">${debrief.summary || 'Performance Summary'}</p>
      </div>
      
      <!-- Strengths -->
      <div class="bg-slate-700/50 rounded-lg p-4 mb-4">
        <h3 class="text-lg font-semibold mb-3 text-green-400">
          <i class="fas fa-check-circle mr-2"></i>What You Did Well
        </h3>
        <ul class="space-y-2">
          ${(debrief.strengths || []).map(s => `
            <li class="flex items-start gap-2 text-sm text-slate-200">
              <i class="fas fa-chevron-right text-green-400 mt-1"></i>
              <span>${s}</span>
            </li>
          `).join('')}
        </ul>
      </div>
      
      <!-- Improvements -->
      <div class="bg-slate-700/50 rounded-lg p-4 mb-4">
        <h3 class="text-lg font-semibold mb-3 text-yellow-400">
          <i class="fas fa-lightbulb mr-2"></i>Areas for Improvement
        </h3>
        <ul class="space-y-2">
          ${(debrief.improvements || []).map(i => `
            <li class="flex items-start gap-2 text-sm text-slate-200">
              <i class="fas fa-chevron-right text-yellow-400 mt-1"></i>
              <span>${i}</span>
            </li>
          `).join('')}
        </ul>
      </div>
      
      <!-- Key Takeaway -->
      <div class="bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-lg p-4 border border-blue-500/30">
        <h3 class="text-lg font-semibold mb-2 text-blue-300">
          <i class="fas fa-star mr-2"></i>Key Takeaway
        </h3>
        <p class="text-sm text-slate-200 italic">"${debrief.keyTakeaway || 'Keep practicing to improve your performance.'}"</p>
      </div>
      
      <!-- Try Again Button -->
      <div class="text-center mt-6">
        <button onclick="location.reload()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105">
          <i class="fas fa-redo mr-2"></i>Try Another Conversation
        </button>
      </div>
    `
  }

  cleanup() {
    this.isConnected = false
    
    if (this.dc) {
      this.dc.close()
      this.dc = null
    }
    
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    
    if (this.audioElement.srcObject) {
      this.audioElement.srcObject.getTracks().forEach(track => track.stop())
      this.audioElement.srcObject = null
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ArtificialClient()
  console.log('Artificial Client initialized')
})
