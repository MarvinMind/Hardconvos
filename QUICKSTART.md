# 🚀 Quick Start Guide

## Getting Started in 5 Minutes

### Step 1: Add Your OpenAI API Key

1. **Edit the `.dev.vars` file**
   ```bash
   nano .dev.vars
   ```
   
2. **Replace the placeholder with your actual key**
   ```
   OPENAI_API_KEY=sk-your-actual-openai-api-key-here
   ```
   
3. **Save and exit** (Ctrl+X, then Y, then Enter)

### Step 2: Restart the Server

```bash
pm2 restart artificial-client
```

Wait 3 seconds for the server to reload, then verify it's running:

```bash
pm2 logs artificial-client --nostream --lines 5
```

You should see: `Ready on http://0.0.0.0:3000`

### Step 3: Test the Application

**Access the app:**
- **Sandbox URL**: https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai

**Test the flow:**
1. Click **"Start Conversation"**
2. Allow microphone access when prompted
3. Wait for the AI client to speak first
4. Respond naturally to the client's concerns
5. Click **"End Conversation"** to get your debrief

---

## Important Notes

### OpenAI API Requirements

- ✅ Your API key must have access to **Realtime API** (gpt-4o-realtime-preview-2024-12-17)
- ✅ If you get 401/403 errors, check your API key has Realtime enabled
- ✅ Free tier may not include Realtime API - you may need a paid account

### Expected Behavior

**When conversation starts:**
1. Status changes to "Connecting to OpenAI..."
2. Browser prompts for microphone access
3. Status changes to "Connected - Speaking..."
4. AI client introduces themselves and states concern
5. Live transcript appears on the right panel

**During conversation:**
- Your audio level indicator should move when you speak
- Client responses appear in purple boxes
- Your responses appear in blue boxes
- Client will interrupt if you ramble or avoid specifics

**When conversation ends:**
- Debrief section appears with loading spinner
- After ~5 seconds, you'll see your score and feedback
- Click "Try Another Conversation" to reset

---

## Troubleshooting

### "Failed to get session token" Error

**Cause**: OpenAI API key is invalid or doesn't have Realtime API access

**Fix**:
1. Verify your API key at: https://platform.openai.com/api-keys
2. Check your key has Realtime API permissions
3. Update `.dev.vars` with correct key
4. Restart: `pm2 restart artificial-client`

### No Microphone Access

**Cause**: Browser didn't get permission or mic is blocked

**Fix**:
1. Click the 🔒 icon in browser address bar
2. Set Microphone permission to "Allow"
3. Reload the page and try again

### Can't Hear the AI Client

**Cause**: Audio output might be muted or wrong device

**Fix**:
1. Check your system volume is not muted
2. Check browser isn't muted (look for 🔇 icon on tab)
3. Open browser DevTools (F12) → Console
4. Look for "Received remote audio track" message
5. If missing, the WebRTC connection failed

### Connection Drops After 60 Seconds

**Expected**: Ephemeral tokens last 60 seconds

**Fix**: 
- For MVP, reload the page to get a new token
- Future version will auto-reconnect

---

## Next Steps

### Test Different Responses

Try these approaches to see how the AI reacts:

**❌ Poor responses** (will escalate difficulty):
- "It's not our fault, the client's staff resisted"
- "We just need more time"
- "These things happen in implementation projects"

**✅ Good responses** (will satisfy the client):
- "You're right, we missed the milestone. Here's our 14-day recovery plan..."
- "I take ownership of this. Let me outline specific actions with owners and dates..."
- "I understand the contract ties payment to SIC > 75%. Here are leading indicators..."

### Customize the Scenario

Edit `public/scenario.json` to change:
- Client persona (role, style, voice)
- Project facts (metrics, targets, timeline)
- Hot buttons and objection bank
- Escalation triggers

After editing, rebuild:
```bash
npm run build
pm2 restart artificial-client
```

### Deploy to Production

When ready to share with others:

```bash
# Build for production
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name artificial-client
```

Your app will be live at: `https://artificial-client.pages.dev`

**Remember to set the production secret:**
```bash
npx wrangler pages secret put OPENAI_API_KEY --project-name artificial-client
```

---

## Support

- **OpenAI Realtime API Docs**: https://platform.openai.com/docs/guides/realtime
- **Cloudflare Pages Docs**: https://developers.cloudflare.com/pages/
- **WebRTC Troubleshooting**: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API

---

**Ready to practice?** Add your API key and start the conversation! 🎤
