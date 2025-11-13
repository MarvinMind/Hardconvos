# 🧪 Testing Checklist

## ✅ System Status

- [x] Server running with PM2
- [x] OpenAI API key loaded
- [x] Public URL accessible
- [x] All endpoints responding

---

## 🎯 **Your Application is LIVE!**

### 🌐 Access Your App

**Public URL:**  
👉 **https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai**

---

## 📋 Testing Steps

### **1. Initial Load Test** ⏱️ 30 seconds

- [ ] Open the URL above in your browser
- [ ] Verify page loads with "Artificial Client" title
- [ ] See the COO scenario info displayed
- [ ] "Start Conversation" button is visible and green

**Expected Result:**
- Dark themed UI with blue/purple colors
- Scenario shows: "COO of municipal services operator"
- Status shows: "Disconnected"

---

### **2. Microphone Permission Test** ⏱️ 30 seconds

- [ ] Click "Start Conversation" button
- [ ] Browser prompts for microphone access
- [ ] Click "Allow" on the permission popup
- [ ] Status changes to "Connecting to OpenAI..."

**Expected Result:**
- Permission popup appears
- After allowing, connection process starts
- Status bar shows blue color

**Troubleshooting:**
- If no popup: Check browser settings → Site permissions
- If denied: Click 🔒 icon in address bar → Reset permissions

---

### **3. WebRTC Connection Test** ⏱️ 5-10 seconds

- [ ] Status changes to "Connected - Speaking..."
- [ ] Status bar turns green
- [ ] Recording indicator appears (red circle with "LIVE")
- [ ] "Stop Conversation" button replaces "Start" button

**Expected Result:**
- Green status bar at 100%
- Animated red recording indicator
- UI shows "online" state

**Troubleshooting:**
- If stuck on "Connecting...": Check browser console (F12) for errors
- If "Failed to get session token": Your API key might not have Realtime API access
- If connection drops immediately: Network firewall might block WebRTC

---

### **4. AI Client Speech Test** ⏱️ 10-30 seconds

- [ ] Within 10-20 seconds, AI client starts speaking
- [ ] You hear a voice (check your speakers/headphones!)
- [ ] Client introduces themselves and states concern
- [ ] Transcript appears on the right side (purple box)

**Expected Opening:**
Something like:
> "Good morning. I'm the COO here. We're four months into this project and frankly, I'm not seeing the results we contracted for. Your SIC compliance is at 62% when we need 85%. What's your plan?"

**Expected Result:**
- Clear audio output from your speakers
- Transcript shows "Client: [their message]"
- Purple colored message box on right panel

**Troubleshooting:**
- No audio: Check system volume, try headphones
- No transcript: Wait 5-10 more seconds, transcription can lag slightly
- Strange audio: Check browser audio output device

---

### **5. Your Speech Test** ⏱️ 30-60 seconds

- [ ] Speak clearly into your microphone
- [ ] Audio level indicator (green bar) moves when you speak
- [ ] AI client responds to what you say
- [ ] Your speech appears in transcript (blue box)

**Try saying:**
> "I understand your concern. You're right that we've missed the milestone. Let me outline our recovery plan..."

**Expected Result:**
- Green audio level bar shows your voice activity
- After you stop speaking, AI responds within 2-5 seconds
- Your message appears in blue transcript box
- AI pushes back or asks follow-up questions

**Troubleshooting:**
- Audio level not moving: Check microphone is selected as input device
- AI not responding: Speak louder, check if mic is muted
- Transcript not showing your speech: Wait 5-10 seconds for processing

---

### **6. Natural Conversation Test** ⏱️ 2-3 minutes

Test the AI's behavior:

#### **Test A: Concrete Plan (Good Response)**
- [ ] Say: "I take ownership. Here's my 14-day plan with specific owners..."
- [ ] Provide made-up names and dates
- [ ] AI should soften tone or ask follow-up questions

#### **Test B: Vague Response (Bad Response)**
- [ ] Say: "Well, these things happen. We need more time..."
- [ ] AI should push back harder
- [ ] Client may escalate difficulty

#### **Test C: Blame Shifting (Trigger Escalation)**
- [ ] Say: "It's not our fault. Your staff resisted the change..."
- [ ] AI should trigger escalation
- [ ] May mention "CFO joins" or payment withholding

#### **Test D: Rambling (Interruption)**
- [ ] Speak for 20+ seconds continuously without pausing
- [ ] AI should interrupt you politely
- [ ] This tests the barge-in feature

**Expected Behavior:**
- AI stays in character as COO
- Asks for specifics: owners, dates, checkpoints
- Difficulty increases with poor responses
- Natural interruptions when you ramble

---

### **7. End Conversation Test** ⏱️ 30 seconds

- [ ] Click "End Conversation" button (red)
- [ ] Recording indicator disappears
- [ ] Status changes to "Ending conversation..."
- [ ] Debrief section appears at bottom
- [ ] See "Analyzing your performance..." spinner

**Expected Result:**
- Audio stops
- Connection closes cleanly
- Debrief section shows loading state
- Status bar turns yellow/orange

---

### **8. Coaching Debrief Test** ⏱️ 3-5 seconds

- [ ] Wait for debrief to generate
- [ ] See your score (0-10) in large circle
- [ ] "What You Did Well" section with green checkmarks
- [ ] "Areas for Improvement" section with yellow lightbulbs
- [ ] "Key Takeaway" in highlighted box
- [ ] "Try Another Conversation" button appears

**Expected Result:**
- Score between 0-10 (realistic based on your responses)
- 2-3 specific strengths identified
- 3-5 concrete improvement suggestions
- Actionable one-sentence takeaway

**Example Debrief:**
```
Score: 6/10
Summary: Good ownership but lacked concrete recovery plan

Strengths:
✓ Acknowledged the missed milestone without deflecting
✓ Maintained a calm and professional tone

Improvements:
⚡ Provide specific names of owners for each action
⚡ Include exact dates and checkpoints, not just "14-day plan"
⚡ Mention leading indicators that show progress before results
⚡ Offer a measured payment holdback tied to milestones

Key Takeaway:
"Always come to difficult conversations with a written plan that includes who, what, and when."
```

**Troubleshooting:**
- Debrief doesn't appear: Check browser console for errors
- Error message shows: GPT-4o API might have failed
- Generic feedback: Conversation might have been too short

---

### **9. Second Attempt Test** ⏱️ 3-5 minutes

- [ ] Click "Try Another Conversation"
- [ ] Page reloads
- [ ] Start a new conversation
- [ ] Apply feedback from first debrief
- [ ] Try to improve your score

**Goal:** Beat your previous score!

**Expected Result:**
- Fresh start with cleared transcript
- Same scenario (COO persona)
- Your improved responses yield better score
- Different AI responses based on your approach

---

## 🎯 Success Criteria

### ✅ Minimum Viable Test (MVP validated)

You should be able to:
- [x] Load the page
- [ ] Start a conversation
- [ ] Hear the AI client speak
- [ ] Respond and be heard
- [ ] See live transcript
- [ ] End the conversation
- [ ] Receive coaching feedback

### 🏆 Full Feature Test (All features working)

Additionally:
- [ ] AI interrupts when you ramble
- [ ] Difficulty escalates with poor responses
- [ ] Audio quality is clear and natural
- [ ] Latency is acceptable (2-5s response time)
- [ ] Debrief is specific and actionable
- [ ] Score reflects actual performance

---

## 🐛 Common Issues & Solutions

### Issue: "Failed to get session token"

**Possible Causes:**
1. API key doesn't have Realtime API access
2. API key is invalid or expired
3. Network error

**Solution:**
- Verify key at: https://platform.openai.com/api-keys
- Check key has "Realtime API" permission
- Try regenerating the key
- Check browser console for exact error message

### Issue: No audio from AI client

**Possible Causes:**
1. Speakers muted or wrong output device
2. Browser audio blocked
3. WebRTC connection failed

**Solution:**
- Check system volume
- Try headphones
- Look for 🔇 icon on browser tab (unmute)
- Check browser console: "Received remote audio track" should appear
- Try different browser (Chrome/Edge recommended)

### Issue: AI can't hear me

**Possible Causes:**
1. Microphone not selected
2. Browser permission denied
3. Microphone muted in system

**Solution:**
- Check browser mic permission (🔒 icon → Site settings)
- Select correct input device in system settings
- Check if green audio level bar moves when you speak
- Try different microphone

### Issue: Long delays (>10s) between responses

**Possible Causes:**
1. Network latency
2. OpenAI service overload
3. Complex prompts

**Solution:**
- Check your internet speed
- Try during off-peak hours
- Expected latency: 2-5 seconds is normal
- >10 seconds: Check browser console for errors

### Issue: Connection drops after 60 seconds

**Expected Behavior:**
- Ephemeral tokens expire after 60 seconds
- This is a security feature

**Solution:**
- Reload page to get new token
- Future version will auto-reconnect
- For now, plan conversations under 5-10 minutes

### Issue: Transcript not updating

**Possible Causes:**
1. Speech not loud enough
2. Background noise
3. Whisper API error

**Solution:**
- Speak clearly and louder
- Reduce background noise
- Check browser console for transcription errors
- Audio will still work even if transcript lags

---

## 📊 Performance Expectations

### Normal Latency

| Action | Expected Time |
|--------|---------------|
| Page load | 1-2 seconds |
| Token generation | 100-200ms |
| WebRTC connection | 1-3 seconds |
| AI first response | 5-10 seconds |
| Your speech → AI response | 2-5 seconds |
| End call → Debrief | 3-5 seconds |

### Audio Quality

- **Expected**: Clear, natural-sounding voice
- **Acceptable**: Occasional minor glitches (< 1 per minute)
- **Problem**: Constant stuttering or robotic sound

### Transcript Accuracy

- **Expected**: 90-95% accurate
- **Acceptable**: Minor errors on technical terms
- **Problem**: Missing entire sentences

---

## 🎓 Testing Tips

### For Best Experience

✅ **Use Chrome or Edge** (best WebRTC support)
✅ **Wired headphones** (reduces echo/feedback)
✅ **Quiet environment** (better speech recognition)
✅ **Strong WiFi** (reduces latency)
✅ **Speak clearly** (better transcription)

### What to Test

1. **Good responses** → See if AI softens
2. **Bad responses** → See if AI escalates
3. **Rambling** → See if AI interrupts
4. **Concrete plans** → See if AI accepts
5. **Blame shifting** → See if CFO "joins"

### Score Expectations

- **0-3**: Very poor (blamed others, no plan)
- **4-6**: Below average (vague plan, avoided specifics)
- **7-8**: Good (owned issue, concrete plan)
- **9-10**: Excellent (detailed plan with owners, dates, metrics)

---

## 📸 Screenshots to Capture (Optional)

If you want to document:

1. **Initial state** - "Start Conversation" button
2. **Connected state** - Recording indicator
3. **Live transcript** - Multiple messages
4. **Debrief score** - Your performance badge
5. **Debrief feedback** - Coaching points

---

## ✅ Test Complete Checklist

After testing, verify:

- [ ] Voice conversation works end-to-end
- [ ] AI client behavior matches scenario
- [ ] Coaching feedback is useful
- [ ] Performance is acceptable
- [ ] Ready to show stakeholders

---

## 🎉 Next Actions After Testing

### If Everything Works

1. **Document your experience**
   - Note what worked well
   - Capture any issues
   - Record your scores

2. **Share with colleagues**
   - Send them the sandbox URL
   - Get feedback on value
   - Identify needed scenarios

3. **Plan deployment**
   - Deploy to Cloudflare Pages
   - Set up production API key
   - Configure custom domain (optional)

### If Issues Found

1. **Check this document** for solutions
2. **Review browser console** (F12) for errors
3. **Check PM2 logs**: `pm2 logs artificial-client --nostream`
4. **Verify API key** has Realtime API access

---

## 🚀 Ready to Test!

**Your live application:**
👉 **https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai**

**Go ahead and:**
1. Open the URL
2. Click "Start Conversation"
3. Allow microphone access
4. Speak with the AI client
5. Review your debrief

**Good luck! 🎤**
