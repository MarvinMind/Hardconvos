// PAWS Setup Wizard - 5-Step Configuration
// Step 1: Scenario Selection
// Step 2: Concern Configuration
// Step 3: Persona Builder
// Step 4: Temper-Meter
// Step 5: Practice Session

class PAWSSetup {
  constructor() {
    this.currentStep = 1
    this.config = {
      scenario: null,
      concerns: [],
      persona: {
        voice: 'nova',
        gender: 'female',
        age: 'middle-aged',
        personality: {
          base_warmth: 5,
          formality: 6,
          directness: 7,
          patience: 4
        },
        relationship: {
          role: 'boss',
          history: 'established'
        }
      },
      temperMeter: {
        startLevel: 2,
        maxLevel: 9,
        selectedTriggers: [],
        selectedDeescalators: []
      }
    }
    this.scenarios = []
    this.voices = {}
  }

  async init() {
    // Load scenarios and voices
    const response = await fetch('/scenarios/index.json')
    const data = await response.json()
    this.scenarios = data.scenarios
    this.voices = data.voices
    
    this.renderStep()
  }

  renderStep() {
    const container = document.getElementById('setupContainer')
    
    switch(this.currentStep) {
      case 1:
        this.renderScenarioSelector(container)
        break
      case 2:
        this.renderConcernConfig(container)
        break
      case 3:
        this.renderPersonaBuilder(container)
        break
      case 4:
        this.renderTemperMeter(container)
        break
      case 5:
        this.renderSummary(container)
        break
    }
    
    this.updateProgress()
  }

  updateProgress() {
    const progressBar = document.getElementById('progressBar')
    const stepLabel = document.getElementById('stepLabel')
    
    const progress = (this.currentStep / 5) * 100
    progressBar.style.width = `${progress}%`
    
    const labels = [
      'Choose Scenario',
      'Select Concerns',
      'Build Persona',
      'Set Temper',
      'Review & Start'
    ]
    stepLabel.textContent = `Step ${this.currentStep}/5: ${labels[this.currentStep - 1]}`
  }

  async renderScenarioSelector(container) {
    const scenariosHTML = await Promise.all(
      this.scenarios.map(async (scenario) => {
        const response = await fetch(`/scenarios/${scenario.file}`)
        const data = await response.json()
        
        return `
          <div class="scenario-card ${this.config.scenario?.id === data.id ? 'selected' : ''}" 
               onclick="setup.selectScenario('${data.id}')">
            <div class="scenario-icon">${data.icon}</div>
            <h3 class="scenario-title">${data.title}</h3>
            <p class="scenario-description">${data.description}</p>
            <div class="scenario-meta">
              <span class="difficulty-badge ${data.difficulty}">${data.difficulty.toUpperCase()}</span>
              <span class="category-badge">${data.category}</span>
            </div>
          </div>
        `
      })
    )

    container.innerHTML = `
      <div class="step-content">
        <h2 class="step-heading">
          <i class="fas fa-list-alt mr-3 text-blue-400"></i>
          Choose Your Scenario
        </h2>
        <p class="step-description">What difficult conversation do you want to practice?</p>
        
        <div class="scenario-grid">
          ${scenariosHTML.join('')}
        </div>
        
        <div class="step-actions">
          <button class="btn-secondary" onclick="setup.goBack()" disabled>
            <i class="fas fa-arrow-left mr-2"></i> Back
          </button>
          <button class="btn-primary" onclick="setup.nextStep()" ${!this.config.scenario ? 'disabled' : ''}>
            Next <i class="fas fa-arrow-right ml-2"></i>
          </button>
        </div>
      </div>
    `
  }

  async selectScenario(scenarioId) {
    const response = await fetch(`/scenarios/${this.scenarios.find(s => s.id === scenarioId).file}`)
    this.config.scenario = await response.json()
    
    // Pre-populate persona with suggested demographics
    if (this.config.scenario.persona.suggested_demographics) {
      this.config.persona.gender = this.config.scenario.persona.suggested_demographics.gender
      this.config.persona.age = this.config.scenario.persona.suggested_demographics.age
    }
    this.config.persona.voice = this.config.scenario.persona.default_voice
    
    this.renderStep()
  }

  renderConcernConfig(container) {
    const concerns = this.config.scenario.concern_options || []
    const deescalators = this.config.scenario.deescalation_options || []

    container.innerHTML = `
      <div class="step-content">
        <h2 class="step-heading">
          <i class="fas fa-exclamation-triangle mr-3 text-yellow-400"></i>
          Configure Your Concerns
        </h2>
        <p class="step-description">Select what worries you most about this conversation</p>
        
        <div class="concern-section">
          <h3 class="section-title">
            <i class="fas fa-fire text-red-400 mr-2"></i>
            What might go wrong? (Escalation Triggers)
          </h3>
          <p class="section-hint">These will make the AI more difficult when triggered</p>
          
          <div class="concern-list">
            ${concerns.map(c => `
              <label class="concern-item">
                <input type="checkbox" 
                       onchange="setup.toggleConcern('${c.id}')"
                       ${this.config.temperMeter.selectedTriggers.includes(c.id) ? 'checked' : ''}>
                <div class="concern-content">
                  <div class="concern-label">${c.label}</div>
                  <div class="concern-meta">
                    <span class="escalation-badge">+${c.escalation_points} anger</span>
                    <span class="category-tag">${c.category}</span>
                  </div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="concern-section mt-6">
          <h3 class="section-title">
            <i class="fas fa-snowflake text-blue-400 mr-2"></i>
            How can you de-escalate? (Calming Tactics)
          </h3>
          <p class="section-hint">These will calm the AI down when you use them</p>
          
          <div class="concern-list">
            ${deescalators.map(d => `
              <label class="concern-item">
                <input type="checkbox" 
                       onchange="setup.toggleDeescalator('${d.id}')"
                       ${this.config.temperMeter.selectedDeescalators.includes(d.id) ? 'checked' : ''}>
                <div class="concern-content">
                  <div class="concern-label">${d.label}</div>
                  <div class="concern-meta">
                    <span class="deescalation-badge">-${d.deescalation_points} anger</span>
                    <span class="category-tag">${d.category}</span>
                  </div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="step-actions">
          <button class="btn-secondary" onclick="setup.goBack()">
            <i class="fas fa-arrow-left mr-2"></i> Back
          </button>
          <button class="btn-primary" onclick="setup.nextStep()">
            Next <i class="fas fa-arrow-right ml-2"></i>
          </button>
        </div>
      </div>
    `
  }

  toggleConcern(concernId) {
    const index = this.config.temperMeter.selectedTriggers.indexOf(concernId)
    if (index > -1) {
      this.config.temperMeter.selectedTriggers.splice(index, 1)
    } else {
      this.config.temperMeter.selectedTriggers.push(concernId)
    }
  }

  toggleDeescalator(deescalatorId) {
    const index = this.config.temperMeter.selectedDeescalators.indexOf(deescalatorId)
    if (index > -1) {
      this.config.temperMeter.selectedDeescalators.splice(index, 1)
    } else {
      this.config.temperMeter.selectedDeescalators.push(deescalatorId)
    }
  }

  renderPersonaBuilder(container) {
    const voiceOptions = Object.entries(this.voices).map(([key, voice]) => `
      <label class="voice-option ${this.config.persona.voice === key ? 'selected' : ''}">
        <input type="radio" 
               name="voice" 
               value="${key}"
               onchange="setup.selectVoice('${key}')"
               ${this.config.persona.voice === key ? 'checked' : ''}>
        <div class="voice-info">
          <div class="voice-name">${key.charAt(0).toUpperCase() + key.slice(1)}</div>
          <div class="voice-demographics">
            <i class="fas ${voice.gender === 'male' ? 'fa-mars' : voice.gender === 'female' ? 'fa-venus' : 'fa-genderless'} mr-1"></i>
            ${voice.gender} • ${voice.age}
          </div>
          <div class="voice-description">${voice.description}</div>
        </div>
      </label>
    `).join('')

    container.innerHTML = `
      <div class="step-content">
        <h2 class="step-heading">
          <i class="fas fa-user-tie mr-3 text-purple-400"></i>
          Build Your Persona
        </h2>
        <p class="step-description">Customize who you're facing in this conversation</p>
        
        <div class="persona-section">
          <h3 class="section-title">
            <i class="fas fa-microphone mr-2"></i>
            Voice Selection
          </h3>
          <div class="voice-grid">
            ${voiceOptions}
          </div>
        </div>

        <div class="persona-section mt-6">
          <h3 class="section-title">
            <i class="fas fa-sliders-h mr-2"></i>
            Personality Traits
          </h3>
          
          <div class="slider-group">
            <label class="slider-label">
              <span>Base Warmth</span>
              <span class="slider-value">${this.config.persona.personality.base_warmth}/10</span>
            </label>
            <input type="range" min="1" max="10" value="${this.config.persona.personality.base_warmth}" 
                   oninput="setup.updatePersonality('base_warmth', this.value)" class="slider">
            <div class="slider-hints">
              <span>😊 Friendly</span>
              <span>❄️ Cold</span>
            </div>
          </div>

          <div class="slider-group">
            <label class="slider-label">
              <span>Formality</span>
              <span class="slider-value">${this.config.persona.personality.formality}/10</span>
            </label>
            <input type="range" min="1" max="10" value="${this.config.persona.personality.formality}" 
                   oninput="setup.updatePersonality('formality', this.value)" class="slider">
            <div class="slider-hints">
              <span>👔 Casual</span>
              <span>🎩 Formal</span>
            </div>
          </div>

          <div class="slider-group">
            <label class="slider-label">
              <span>Directness</span>
              <span class="slider-value">${this.config.persona.personality.directness}/10</span>
            </label>
            <input type="range" min="1" max="10" value="${this.config.persona.personality.directness}" 
                   oninput="setup.updatePersonality('directness', this.value)" class="slider">
            <div class="slider-hints">
              <span>💭 Indirect</span>
              <span>💥 Blunt</span>
            </div>
          </div>

          <div class="slider-group">
            <label class="slider-label">
              <span>Patience</span>
              <span class="slider-value">${this.config.persona.personality.patience}/10</span>
            </label>
            <input type="range" min="1" max="10" value="${this.config.persona.personality.patience}" 
                   oninput="setup.updatePersonality('patience', this.value)" class="slider">
            <div class="slider-hints">
              <span>🧘 Patient</span>
              <span>⚡ Quick-Tempered</span>
            </div>
          </div>
        </div>

        <div class="step-actions">
          <button class="btn-secondary" onclick="setup.goBack()">
            <i class="fas fa-arrow-left mr-2"></i> Back
          </button>
          <button class="btn-primary" onclick="setup.nextStep()">
            Next <i class="fas fa-arrow-right ml-2"></i>
          </button>
        </div>
      </div>
    `
  }

  selectVoice(voice) {
    this.config.persona.voice = voice
    this.renderStep()
  }

  updatePersonality(trait, value) {
    this.config.persona.personality[trait] = parseInt(value)
    document.querySelector(`label[for=${trait}] .slider-value`).textContent = `${value}/10`
  }

  renderTemperMeter(container) {
    container.innerHTML = `
      <div class="step-content">
        <h2 class="step-heading">
          <i class="fas fa-temperature-high mr-3 text-red-400"></i>
          Configure Temper Meter
        </h2>
        <p class="step-description">Set how quickly emotions escalate in this conversation</p>
        
        <div class="temper-section">
          <h3 class="section-title">Starting Emotional Level</h3>
          <p class="section-hint">How calm or agitated are they when you start?</p>
          
          <div class="temper-visual">
            ${this.renderTemperScale(this.config.temperMeter.startLevel)}
          </div>
          
          <input type="range" min="1" max="10" value="${this.config.temperMeter.startLevel}" 
                 oninput="setup.updateTemper('startLevel', this.value)" class="temper-slider">
          
          <div class="temper-labels">
            <span>😊 Calm</span>
            <span>😐 Neutral</span>
            <span>😒 Annoyed</span>
            <span>😤 Angry</span>
            <span>😡 Furious</span>
          </div>
        </div>

        <div class="temper-section mt-6">
          <h3 class="section-title">Maximum Escalation Level</h3>
          <p class="section-hint">How angry can they get in worst case?</p>
          
          <div class="temper-visual">
            ${this.renderTemperScale(this.config.temperMeter.maxLevel)}
          </div>
          
          <input type="range" min="${this.config.temperMeter.startLevel}" max="10" 
                 value="${this.config.temperMeter.maxLevel}" 
                 oninput="setup.updateTemper('maxLevel', this.value)" class="temper-slider">
        </div>

        <div class="info-box mt-6">
          <i class="fas fa-info-circle mr-2"></i>
          <div>
            <strong>How it works:</strong> The AI starts at level ${this.config.temperMeter.startLevel}. 
            Your selected triggers will increase anger, and de-escalation tactics will decrease it. 
            The conversation can reach level ${this.config.temperMeter.maxLevel} at maximum.
          </div>
        </div>

        <div class="step-actions">
          <button class="btn-secondary" onclick="setup.goBack()">
            <i class="fas fa-arrow-left mr-2"></i> Back
          </button>
          <button class="btn-primary" onclick="setup.nextStep()">
            Next <i class="fas fa-arrow-right ml-2"></i>
          </button>
        </div>
      </div>
    `
  }

  renderTemperScale(level) {
    const emojis = ['', '😊', '😊', '😐', '😐', '😒', '😒', '😤', '😤', '😡', '😡']
    const colors = ['', '#22c55e', '#22c55e', '#facc15', '#facc15', '#fb923c', '#fb923c', '#ef4444', '#ef4444', '#dc2626', '#dc2626']
    
    return `
      <div class="temper-meter">
        ${Array.from({length: 10}, (_, i) => {
          const lvl = i + 1
          return `
            <div class="temper-block ${lvl <= level ? 'active' : ''}" 
                 style="${lvl <= level ? `background-color: ${colors[lvl]};` : ''}">
              ${lvl <= level && lvl === level ? `<span class="temper-emoji">${emojis[lvl]}</span>` : ''}
            </div>
          `
        }).join('')}
      </div>
      <div class="temper-level-label">Level ${level}/10</div>
    `
  }

  updateTemper(field, value) {
    this.config.temperMeter[field] = parseInt(value)
    
    // Ensure maxLevel >= startLevel
    if (field === 'startLevel' && this.config.temperMeter.maxLevel < value) {
      this.config.temperMeter.maxLevel = parseInt(value)
    }
    
    this.renderStep()
  }

  renderSummary(container) {
    const selectedConcerns = this.config.scenario.concern_options.filter(c => 
      this.config.temperMeter.selectedTriggers.includes(c.id)
    )
    const selectedDeescalators = this.config.scenario.deescalation_options.filter(d => 
      this.config.temperMeter.selectedDeescalators.includes(d.id)
    )

    container.innerHTML = `
      <div class="step-content">
        <h2 class="step-heading">
          <i class="fas fa-clipboard-check mr-3 text-green-400"></i>
          Review Your Configuration
        </h2>
        <p class="step-description">Ready to face your personalized scenario?</p>
        
        <div class="summary-grid">
          <div class="summary-card">
            <h3 class="summary-title">
              <i class="fas fa-file-alt mr-2"></i>
              Scenario
            </h3>
            <div class="summary-content">
              ${this.config.scenario.icon} ${this.config.scenario.title}
            </div>
          </div>

          <div class="summary-card">
            <h3 class="summary-title">
              <i class="fas fa-user mr-2"></i>
              Persona
            </h3>
            <div class="summary-content">
              ${this.voices[this.config.persona.voice].gender} • ${this.voices[this.config.persona.voice].age}<br>
              Voice: ${this.config.persona.voice.charAt(0).toUpperCase() + this.config.persona.voice.slice(1)}
            </div>
          </div>

          <div class="summary-card">
            <h3 class="summary-title">
              <i class="fas fa-fire mr-2"></i>
              Triggers (${selectedConcerns.length})
            </h3>
            <div class="summary-content">
              ${selectedConcerns.length === 0 ? 'None selected' : selectedConcerns.map(c => 
                `<div class="summary-item">• ${c.label}</div>`
              ).join('')}
            </div>
          </div>

          <div class="summary-card">
            <h3 class="summary-title">
              <i class="fas fa-snowflake mr-2"></i>
              De-escalators (${selectedDeescalators.length})
            </h3>
            <div class="summary-content">
              ${selectedDeescalators.length === 0 ? 'None selected' : selectedDeescalators.map(d => 
                `<div class="summary-item">• ${d.label}</div>`
              ).join('')}
            </div>
          </div>

          <div class="summary-card">
            <h3 class="summary-title">
              <i class="fas fa-temperature-high mr-2"></i>
              Temper Meter
            </h3>
            <div class="summary-content">
              Starts: Level ${this.config.temperMeter.startLevel}/10<br>
              Max: Level ${this.config.temperMeter.maxLevel}/10
            </div>
          </div>

          <div class="summary-card">
            <h3 class="summary-title">
              <i class="fas fa-sliders-h mr-2"></i>
              Personality
            </h3>
            <div class="summary-content">
              Warmth: ${this.config.persona.personality.base_warmth}/10<br>
              Directness: ${this.config.persona.personality.directness}/10<br>
              Patience: ${this.config.persona.personality.patience}/10
            </div>
          </div>
        </div>

        <div class="warning-box mt-6">
          <i class="fas fa-exclamation-triangle mr-2"></i>
          <div>
            <strong>Ready for your personalized fear rehearsal?</strong><br>
            This AI will challenge you based on your exact concerns. Remember: this is practice!
          </div>
        </div>

        <div class="step-actions">
          <button class="btn-secondary" onclick="setup.goBack()">
            <i class="fas fa-arrow-left mr-2"></i> Back
          </button>
          <button class="btn-primary btn-lg" onclick="setup.startPractice()">
            <i class="fas fa-play mr-2"></i> Start Practice Session
          </button>
        </div>
      </div>
    `
  }

  nextStep() {
    if (this.currentStep < 5) {
      this.currentStep++
      this.renderStep()
    }
  }

  goBack() {
    if (this.currentStep > 1) {
      this.currentStep--
      this.renderStep()
    }
  }

  async startPractice() {
    // Save configuration and navigate to practice
    sessionStorage.setItem('pawsConfig', JSON.stringify(this.config))
    window.location.href = '/practice'
  }
}

// Initialize setup wizard
const setup = new PAWSSetup()
window.addEventListener('DOMContentLoaded', () => setup.init())
