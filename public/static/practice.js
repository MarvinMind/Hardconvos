// PAWS Practice Session - Enhanced WebRTC with Dynamic Scenario
// Connects to OpenAI Realtime API with personalized configuration

class PAWSPractice {
  constructor() {
    this.pc = null // RTCPeerConnection
    this.dc = null // DataChannel for events
    this.audioElement = new Audio()
    this.audioElement.autoplay = true
    
    this.transcript = []
    this.turnTags = []
    this.isConnected = false
    this.config = null
    this.dynamicScenario = null
    this.currentTemperLevel = 2
    this.escalationLog = []
    
    this.initUI()
    this.loadConfiguration()
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
    this.scenarioTitle = document.getElementById('scenarioTitle')
    this.scenarioInfo = document.getElementById('scenarioInfo')

    this.startBtn.addEventListener('click', () => this.startConversation())
    this.stopBtn.addEventListener('click', () => this.stopConversation())
  }

  async loadConfiguration() {
    try {
      // Load configuration from sessionStorage (set by setup wizard)
      const configStr = sessionStorage.getItem('pawsConfig')
      if (!configStr) {
        this.updateStatus('No configuration found - redirecting to setup', 'error')
        setTimeout(() => window.location.href = '/setup', 2000)
        return
      }
      
      this.config = JSON.parse(configStr)
      
      // Generate dynamic scenario from backend
      const response = await fetch('/api/scenario/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.config)
      })
      
      if (!response.ok) {
        throw new Error('Failed to generate scenario')
      }
      
      this.dynamicScenario = await response.json()
      this.currentTemperLevel = this.dynamicScenario.startLevel
      
      // Update UI with scenario info
      this.scenarioTitle.textContent = this.config.scenario.icon + ' ' + this.config.scenario.title
      this.scenarioInfo.innerHTML = `
        <div class="text-sm text-slate-300">
          <strong>Persona:</strong> ${this.config.persona.voice} (${this.config.persona.gender}, ${this.config.persona.age})<br>
          <strong>Starting Temper:</strong> ${this.currentTemperLevel}/10<br>
          <strong>Active Triggers:</strong> ${this.dynamicScenario.triggers.length}<br>
          <strong>De-escalators:</strong> ${this.dynamicScenario.deescalators.length}
        </div>
      `
      
      // Show live temper indicator
      this.createLiveTemperIndicator()
      
      console.log('Configuration loaded:', this.config)
      console.log('Dynamic scenario generated:', this.dynamicScenario)
    } catch (error) {
      console.error('Failed to load configuration:', error)
      this.updateStatus('Failed to load configuration', 'error')
    }
  }

  createLiveTemperIndicator() {
    const indicator = document.createElement('div')
    indicator.className = 'live-temper-indicator'
    indicator.id = 'liveTemperIndicator'
    indicator.innerHTML = `
      <div class="live-temper-title">Current Mood</div>
      <div class="live-temper-level" id="liveTemperEmoji">😊</div>
      <div class="live-temper-bars" id="liveTemperBars">
        ${Array.from({length: 10}, (_, i) => `
          <div class="live-temper-bar" data-level="${i + 1}"></div>
        `).join('')}
      </div>
      <div class="text-center text-sm text-slate-400 mt-2">
        Level <span id="liveTemperValue">${this.currentTemperLevel}</span>/10
      </div>
    `
    document.body.appendChild(indicator)
    this.updateLiveTemper(this.currentTemperLevel)
  }

  updateLiveTemper(level) {
    this.currentTemperLevel = level
    
    const emojis = ['', '😊', '😊', '😐', '😐', '😒', '😒', '😤', '😤', '😡', '😡']
    const colors = ['', '#22c55e', '#22c55e', '#facc15', '#facc15', '#fb923c', '#fb923c', '#ef4444', '#ef4444', '#dc2626', '#dc2626']
    
    const emojiEl = document.getElementById('liveTemperEmoji')
    const valueEl = document.getElementById('liveTemperValue')
    const bars = document.querySelectorAll('.live-temper-bar')
    
    if (emojiEl) emojiEl.textContent = emojis[level] || '😊'
    if (valueEl) valueEl.textContent = level
    
    bars.forEach((bar, i) => {
      if (i < level) {
        bar.classList.add('active')
        bar.style.setProperty('--color', colors[i + 1])
      } else {
        bar.classList.remove('active')
      }
    })
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
      if (!this.dynamicScenario) {
        throw new Error('Scenario not loaded yet')
      }
      
      this.updateStatus('Requesting session token...', 'info')
      
      // Step 1: Get ephemeral token with configured voice
      const tokenResponse = await fetch('/api/ephemeral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: this.config.persona.voice })
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
      
      // Set up microphone audio
      const ms = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      
      ms.getTracks().forEach(track => this.pc.addTrack(track, ms))
      
      // Monitor audio levels
      this.monitorAudioLevels(ms)
      
      // Set up data channel for events
      this.dc = this.pc.createDataChannel('oai-events')
      this.dc.onopen = () => console.log('Data channel opened')
      this.dc.onmessage = (e) => this.handleServerEvent(JSON.parse(e.data))
      
      // Step 3: Create offer and get answer from OpenAI
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)
      
      this.updateStatus('Establishing connection...', 'info')
      
      const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client_secret}`,
          'Content-Type': 'application/sdp'
        },
        body: offer.sdp
      })
      
      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text()
        throw new Error(`WebRTC connection failed: ${errorText}`)
      }
      
      const answerSdp = await sdpResponse.text()
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp
      })
      
      this.updateStatus('Connected!', 'success')
      this.isConnected = true
      
      // Update UI
      this.startBtn.classList.add('hidden')
      this.stopBtn.classList.remove('hidden')
      this.recordingIndicator.classList.remove('hidden')
      
      // Send dynamic scenario instructions via data channel
      this.sendSessionConfig()
      
    } catch (error) {
      console.error('Error starting conversation:', error)
      this.updateStatus('Connection failed: ' + error.message, 'error')
    }
  }

  sendSessionConfig() {
    // Wait for data channel to be open
    if (this.dc && this.dc.readyState === 'open') {
      // Send session update with dynamic scenario prompt
      this.dc.send(JSON.stringify({
        type: 'session.update',
        session: {
          instructions: this.dynamicScenario.systemPrompt,
          voice: this.config.persona.voice,
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500
          }
        }
      }))
      
      console.log('Session configuration sent with dynamic scenario')
    } else {
      // Retry after a delay
      setTimeout(() => this.sendSessionConfig(), 100)
    }
  }

  handleServerEvent(event) {
    console.log('Server event:', event)
    
    // Handle conversation events
    if (event.type === 'conversation.item.created') {
      const item = event.item
      if (item.type === 'message') {
        const role = item.role
        const text = item.content?.[0]?.transcript || ''
        
        if (text) {
          this.addTranscript(role === 'user' ? 'You' : 'Client', text)
        }
      }
    }
    
    // Handle transcript updates
    if (event.type === 'response.audio_transcript.delta') {
      // Real-time transcript updates
      console.log('Transcript delta:', event.delta)
    }
    
    if (event.type === 'response.audio_transcript.done') {
      const transcript = event.transcript
      if (transcript) {
        this.addTranscript('AI', transcript)
        
        // Analyze for temper changes
        this.analyzeTemperChange(transcript)
      }
    }
    
    if (event.type === 'input_audio_buffer.speech_started') {
      console.log('User started speaking')
    }
    
    if (event.type === 'input_audio_buffer.speech_stopped') {
      console.log('User stopped speaking')
    }
    
    // Log turn completion for analytics
    if (event.type === 'response.done') {
      this.turnTags.push({
        timestamp: new Date().toISOString(),
        type: 'response_complete',
        temperLevel: this.currentTemperLevel
      })
    }
  }

  analyzeTemperChange(transcript) {
    // Simple keyword matching for temper changes (could be enhanced with GPT-4 analysis)
    const lowerTranscript = transcript.toLowerCase()
    
    // Check triggers
    this.dynamicScenario.triggers.forEach(trigger => {
      const concern = this.config.scenario.concern_options.find(c => c.id === trigger.id)
      if (concern) {
        const triggered = concern.trigger_phrases.some(phrase => 
          lowerTranscript.includes(phrase.toLowerCase())
        )
        
        if (triggered) {
          const newLevel = Math.min(
            this.currentTemperLevel + trigger.points,
            this.dynamicScenario.maxLevel
          )
          
          if (newLevel !== this.currentTemperLevel) {
            this.escalationLog.push({
              timestamp: Date.now(),
              type: 'escalation',
              trigger: trigger.label,
              from: this.currentTemperLevel,
              to: newLevel,
              points: trigger.points
            })
            
            this.updateLiveTemper(newLevel)
            console.log(`⚠️ TRIGGER: ${trigger.label} (+${trigger.points}) → Level ${newLevel}`)
          }
        }
      }
    })
    
    // Check de-escalators
    this.dynamicScenario.deescalators.forEach(deescalator => {
      const option = this.config.scenario.deescalation_options.find(d => d.id === deescalator.id)
      if (option) {
        const triggered = option.example_phrases.some(phrase => 
          lowerTranscript.includes(phrase.toLowerCase())
        )
        
        if (triggered) {
          const newLevel = Math.max(
            this.currentTemperLevel - deescalator.points,
            1
          )
          
          if (newLevel !== this.currentTemperLevel) {
            this.escalationLog.push({
              timestamp: Date.now(),
              type: 'deescalation',
              deescalator: deescalator.label,
              from: this.currentTemperLevel,
              to: newLevel,
              points: deescalator.points
            })
            
            this.updateLiveTemper(newLevel)
            console.log(`✅ DE-ESCALATION: ${deescalator.label} (-${deescalator.points}) → Level ${newLevel}`)
          }
        }
      }
    })
  }

  addTranscript(speaker, text) {
    this.transcript.push({ speaker, text, timestamp: new Date().toISOString() })
    
    const messageDiv = document.createElement('div')
    messageDiv.className = `mb-2 p-3 rounded ${
      speaker === 'You' ? 'bg-blue-900/30 border-l-4 border-blue-500' : 'bg-slate-700/50 border-l-4 border-purple-500'
    }`
    messageDiv.innerHTML = `
      <div class="font-semibold text-sm mb-1 ${speaker === 'You' ? 'text-blue-300' : 'text-purple-300'}">
        ${speaker}
      </div>
      <div class="text-slate-200 text-sm">${text}</div>
    `
    
    this.transcriptDiv.appendChild(messageDiv)
    this.transcriptDiv.scrollTop = this.transcriptDiv.scrollHeight
  }

  monitorAudioLevels(stream) {
    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    const microphone = audioContext.createMediaStreamSource(stream)
    
    analyser.fftSize = 256
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    
    microphone.connect(analyser)
    
    const updateLevel = () => {
      if (!this.isConnected) return
      
      analyser.getByteFrequencyData(dataArray)
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length
      const level = Math.min(100, (average / 128) * 100)
      
      this.audioLevel.style.width = `${level}%`
      
      requestAnimationFrame(updateLevel)
    }
    
    updateLevel()
  }

  async stopConversation() {
    this.isConnected = false
    
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    
    if (this.dc) {
      this.dc.close()
      this.dc = null
    }
    
    this.updateStatus('Conversation ended', 'info')
    this.stopBtn.classList.add('hidden')
    this.recordingIndicator.classList.add('hidden')
    
    // Generate debrief
    await this.generateDebrief()
  }

  async generateDebrief() {
    this.debriefSection.classList.remove('hidden')
    
    try {
      const transcriptText = this.transcript
        .map(t => `${t.speaker}: ${t.text}`)
        .join('\n')
      
      const response = await fetch('/api/debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptText,
          turnTags: this.turnTags,
          escalationLog: this.escalationLog,
          config: this.config,
          finalTemperLevel: this.currentTemperLevel
        })
      })
      
      const debrief = await response.json()
      
      // Render enhanced debrief with escalation journey
      this.renderDebrief(debrief)
      
    } catch (error) {
      console.error('Error generating debrief:', error)
      document.getElementById('debriefContent').innerHTML = `
        <div class="text-red-400">
          <i class="fas fa-exclamation-circle mr-2"></i>
          Failed to generate debrief: ${error.message}
        </div>
      `
    }
  }

  renderDebrief(debrief) {
    const content = document.getElementById('debriefContent')
    
    content.innerHTML = `
      <div class="grid md:grid-cols-2 gap-6">
        <!-- Performance Score -->
        <div class="bg-slate-900 rounded-lg p-6 border border-slate-700">
          <h3 class="text-xl font-semibold mb-4">
            <i class="fas fa-star mr-2 text-yellow-400"></i>
            Performance Score
          </h3>
          <div class="text-center">
            <div class="text-6xl font-bold text-blue-400 mb-2">${debrief.score}/10</div>
            <p class="text-slate-400">${debrief.summary || 'Good effort!'}</p>
          </div>
        </div>

        <!-- Escalation Journey -->
        <div class="bg-slate-900 rounded-lg p-6 border border-slate-700">
          <h3 class="text-xl font-semibold mb-4">
            <i class="fas fa-chart-line mr-2 text-red-400"></i>
            Emotional Journey
          </h3>
          ${this.renderEscalationJourney()}
        </div>

        <!-- Strengths -->
        <div class="bg-slate-900 rounded-lg p-6 border border-slate-700">
          <h3 class="text-xl font-semibold mb-4">
            <i class="fas fa-check-circle mr-2 text-green-400"></i>
            What You Did Well
          </h3>
          <ul class="space-y-2">
            ${(debrief.strengths || []).map(s => `
              <li class="text-slate-300 flex items-start">
                <i class="fas fa-check text-green-400 mr-2 mt-1"></i>
                <span>${s}</span>
              </li>
            `).join('')}
          </ul>
        </div>

        <!-- Improvements -->
        <div class="bg-slate-900 rounded-lg p-6 border border-slate-700">
          <h3 class="text-xl font-semibold mb-4">
            <i class="fas fa-lightbulb mr-2 text-yellow-400"></i>
            Areas to Improve
          </h3>
          <ul class="space-y-2">
            ${(debrief.improvements || []).map(i => `
              <li class="text-slate-300 flex items-start">
                <i class="fas fa-arrow-up text-yellow-400 mr-2 mt-1"></i>
                <span>${i}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>

      <!-- Key Takeaway -->
      <div class="mt-6 bg-blue-900/30 border border-blue-500/50 rounded-lg p-6">
        <h3 class="text-xl font-semibold mb-2">
          <i class="fas fa-key mr-2 text-blue-400"></i>
          Key Takeaway
        </h3>
        <p class="text-slate-300 text-lg">${debrief.keyTakeaway || 'Keep practicing!'}</p>
      </div>

      <!-- Actions -->
      <div class="mt-6 flex gap-4 justify-center">
        <button onclick="location.href='/setup'" class="btn-secondary">
          <i class="fas fa-cog mr-2"></i>
          Adjust Configuration
        </button>
        <button onclick="location.reload()" class="btn-primary">
          <i class="fas fa-redo mr-2"></i>
          Practice Again
        </button>
      </div>
    `
  }

  renderEscalationJourney() {
    if (this.escalationLog.length === 0) {
      return '<p class="text-slate-400 text-sm">No significant escalation changes detected.</p>'
    }

    return `
      <div class="space-y-3">
        ${this.escalationLog.map(log => {
          const isEscalation = log.type === 'escalation'
          return `
            <div class="flex items-start gap-3 text-sm">
              <div class="${isEscalation ? 'text-red-400' : 'text-green-400'}">
                <i class="fas ${isEscalation ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
              </div>
              <div class="flex-1">
                <div class="font-semibold ${isEscalation ? 'text-red-300' : 'text-green-300'}">
                  ${isEscalation ? log.trigger : log.deescalator}
                </div>
                <div class="text-slate-400">
                  Level ${log.from} → ${log.to} (${isEscalation ? '+' : ''}${isEscalation ? log.points : -log.points})
                </div>
              </div>
            </div>
          `
        }).join('')}
      </div>
      <div class="mt-4 text-center text-sm text-slate-400">
        Final Level: ${this.currentTemperLevel}/${this.dynamicScenario.maxLevel}
      </div>
    `
  }
}

// Initialize practice session
const practice = new PAWSPractice()
