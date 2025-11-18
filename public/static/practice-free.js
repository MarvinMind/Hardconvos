// PAWS Practice Session - Free Tier Implementation
// Uses GPT-4o-mini + TTS (non-realtime, turn-based)

class PAWSPracticeFree {
  constructor() {
    this.audioElement = new Audio()
    this.audioElement.autoplay = true
    this.mediaRecorder = null
    this.audioChunks = []
    this.isRecording = false
    this.isProcessing = false
    
    this.transcript = []
    this.messages = []
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
    this.pushToTalkBtn = document.getElementById('pushToTalkBtn')
    this.status = document.getElementById('status')
    this.statusBar = document.getElementById('statusBar')
    this.transcriptDiv = document.getElementById('transcript')
    this.recordingIndicator = document.getElementById('recordingIndicator')
    this.scenarioTitle = document.getElementById('scenarioTitle')
    this.scenarioInfo = document.getElementById('scenarioInfo')

    this.startBtn.addEventListener('click', () => this.startConversation())
    this.stopBtn.addEventListener('click', () => this.stopConversation())
    
    // Push-to-talk for free tier
    this.pushToTalkBtn.addEventListener('mousedown', () => this.startRecording())
    this.pushToTalkBtn.addEventListener('mouseup', () => this.stopRecording())
    this.pushToTalkBtn.addEventListener('touchstart', (e) => {
      e.preventDefault()
      this.startRecording()
    })
    this.pushToTalkBtn.addEventListener('touchend', (e) => {
      e.preventDefault()
      this.stopRecording()
    })
  }

  async loadConfiguration() {
    try {
      const configStr = sessionStorage.getItem('pawsConfig')
      if (!configStr) {
        this.updateStatus('No configuration found - redirecting to setup', 'error')
        setTimeout(() => window.location.href = '/setup', 2000)
        return
      }
      
      this.config = JSON.parse(configStr)
      
      // Generate dynamic scenario
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
      
      // Update UI
      this.scenarioTitle.textContent = this.config.scenario.icon + ' ' + this.config.scenario.title
      this.scenarioInfo.innerHTML = `
        <div class="text-sm text-slate-300 space-y-2">
          <div class="bg-blue-500/20 border border-blue-400/30 rounded-lg p-3">
            <strong class="text-blue-300">🆓 Free Tier Mode</strong><br>
            <span class="text-xs text-slate-400">Turn-based conversation • Hold button to speak</span>
          </div>
          <div>
            <strong>Persona:</strong> ${this.config.persona.voice} (${this.config.persona.gender}, ${this.config.persona.age})<br>
            <strong>Starting Temper:</strong> ${this.currentTemperLevel}/10
          </div>
        </div>
      `
      
      this.createLiveTemperIndicator()
      
      console.log('Free tier configuration loaded')
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
      
      // Initialize messages with system prompt
      this.messages = [{
        role: 'system',
        content: this.dynamicScenario.systemPrompt
      }]
      
      // Setup microphone
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      
      this.mediaStream = stream
      
      this.updateStatus('Ready! Hold button to speak', 'success')
      
      // Update UI
      this.startBtn.classList.add('hidden')
      this.stopBtn.classList.remove('hidden')
      this.pushToTalkBtn.classList.remove('hidden')
      this.pushToTalkBtn.disabled = false
      
      // Send initial greeting
      await this.sendAIMessage()
      
    } catch (error) {
      console.error('Error starting conversation:', error)
      this.updateStatus('Failed to start: ' + error.message, 'error')
    }
  }

  async startRecording() {
    if (this.isProcessing || this.isRecording) return
    
    try {
      this.isRecording = true
      this.audioChunks = []
      
      this.mediaRecorder = new MediaRecorder(this.mediaStream)
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }
      
      this.mediaRecorder.onstop = async () => {
        await this.processRecording()
      }
      
      this.mediaRecorder.start()
      
      this.pushToTalkBtn.classList.add('recording')
      this.pushToTalkBtn.innerHTML = '<i class="fas fa-microphone text-red-400 text-3xl"></i><br><span class="text-red-400">Recording...</span>'
      this.updateStatus('Listening...', 'warning')
      
    } catch (error) {
      console.error('Error starting recording:', error)
      this.updateStatus('Failed to start recording', 'error')
      this.isRecording = false
    }
  }

  stopRecording() {
    if (!this.isRecording) return
    
    this.isRecording = false
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
    
    this.pushToTalkBtn.classList.remove('recording')
    this.pushToTalkBtn.innerHTML = '<i class="fas fa-microphone text-blue-400 text-3xl"></i><br><span class="text-blue-300">Hold to Speak</span>'
  }

  async processRecording() {
    if (this.audioChunks.length === 0) return
    
    try {
      this.isProcessing = true
      this.pushToTalkBtn.disabled = true
      this.updateStatus('Transcribing...', 'info')
      
      // Create audio blob
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })
      
      // Transcribe using Whisper API
      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.webm')
      formData.append('model', 'whisper-1')
      
      const transcriptResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await this.getOpenAIKey()}`
        },
        body: formData
      })
      
      if (!transcriptResponse.ok) {
        throw new Error('Transcription failed')
      }
      
      const transcriptData = await transcriptResponse.json()
      const userText = transcriptData.text
      
      if (!userText || userText.trim() === '') {
        throw new Error('No speech detected')
      }
      
      // Add to transcript
      this.addTranscript('You', userText)
      
      // Add to messages
      this.messages.push({
        role: 'user',
        content: userText
      })
      
      // Get AI response
      await this.sendAIMessage()
      
    } catch (error) {
      console.error('Error processing recording:', error)
      this.updateStatus('Error: ' + error.message, 'error')
    } finally {
      this.isProcessing = false
      this.pushToTalkBtn.disabled = false
      this.updateStatus('Ready! Hold button to speak', 'success')
    }
  }

  async sendAIMessage() {
    try {
      this.updateStatus('AI thinking...', 'info')
      
      // Call streaming endpoint
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: this.messages,
          voice: this.config.persona.voice,
          systemPrompt: this.dynamicScenario.systemPrompt
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to get AI response')
      }
      
      const data = await response.json()
      
      // Add to transcript
      this.addTranscript('Client', data.text)
      
      // Add to messages
      this.messages.push({
        role: 'assistant',
        content: data.text
      })
      
      // Play audio
      this.updateStatus('Playing response...', 'info')
      
      const audioData = atob(data.audio)
      const audioArray = new Uint8Array(audioData.length)
      for (let i = 0; i < audioData.length; i++) {
        audioArray[i] = audioData.charCodeAt(i)
      }
      const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(audioBlob)
      
      this.audioElement.src = audioUrl
      await this.audioElement.play()
      
      // Analyze for temper changes
      this.analyzeTemperChange(data.text)
      
      // Wait for audio to finish
      this.audioElement.onended = () => {
        this.updateStatus('Ready! Hold button to speak', 'success')
        URL.revokeObjectURL(audioUrl)
      }
      
    } catch (error) {
      console.error('Error sending AI message:', error)
      this.updateStatus('Error: ' + error.message, 'error')
    }
  }

  async getOpenAIKey() {
    // This is a security issue in real production - keys should never be exposed
    // For now, we'll use the backend endpoint which has the key
    // In production, all OpenAI calls should go through backend
    return 'placeholder'
  }

  analyzeTemperChange(transcript) {
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
    
    const entry = document.createElement('div')
    entry.className = `transcript-entry ${speaker === 'You' ? 'user' : 'ai'}`
    entry.innerHTML = `
      <div class="speaker">${speaker}</div>
      <div class="text">${text}</div>
      <div class="timestamp">${new Date().toLocaleTimeString()}</div>
    `
    
    this.transcriptDiv.appendChild(entry)
    this.transcriptDiv.scrollTop = this.transcriptDiv.scrollHeight
  }

  stopConversation() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
    
    this.audioElement.pause()
    
    this.startBtn.classList.remove('hidden')
    this.stopBtn.classList.add('hidden')
    this.pushToTalkBtn.classList.add('hidden')
    this.recordingIndicator.classList.add('hidden')
    
    this.updateStatus('Session ended', 'info')
    
    // TODO: Generate debrief
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.pawsPractice = new PAWSPracticeFree()
  })
} else {
  window.pawsPractice = new PAWSPracticeFree()
}
