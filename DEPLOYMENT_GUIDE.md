# 🚀 Deployment Guide - Hardconvos

## ✅ GitHub Deployment Complete

**Repository**: https://github.com/Alfredlechat/Hardconvos  
**Branch**: main  
**Commits**: 11 commits pushed  
**Status**: ✅ Live on GitHub

---

## 🔄 Cloudflare Pages Deployment (Next Step)

### Prerequisites

1. **Cloudflare Account**: alfredlechat4@gmail.com
2. **API Token**: Configure in Deploy tab
3. **OpenAI API Key**: For production use

---

### Step 1: Configure Cloudflare API Token

1. Go to **Deploy** tab in sidebar
2. Follow instructions to create Cloudflare API token
3. Required permissions:
   - Account: Cloudflare Pages (Edit)
   - Zone: DNS (Edit) - optional for custom domains
4. Save the token in Deploy tab

---

### Step 2: Create Cloudflare Pages Project

Once API token is configured, run:

```bash
# Create the project
npx wrangler pages project create hardconvos \
  --production-branch main \
  --compatibility-date 2024-01-01

# This will give you:
# - Project name: hardconvos
# - URL: https://hardconvos.pages.dev
```

---

### Step 3: Set Production Secrets

```bash
# Set OpenAI API Key
npx wrangler pages secret put OPENAI_API_KEY --project-name hardconvos
# Paste your OpenAI API key when prompted
```

---

### Step 4: Deploy Application

```bash
# Build the application
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name hardconvos
```

**Expected Output:**
```
✨ Success! Uploaded 15 files
✨ Deployment complete!
🌎 https://hardconvos.pages.dev
🌎 https://main.hardconvos.pages.dev
```

---

### Step 5: Verify Deployment

1. Visit: https://hardconvos.pages.dev
2. Click "Start Conversation"
3. Allow microphone access
4. Test the voice conversation

---

## 🔧 Project Configuration

### wrangler.jsonc
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "hardconvos",
  "compatibility_date": "2024-01-01",
  "pages_build_output_dir": "./dist",
  "compatibility_flags": ["nodejs_compat"]
}
```

### package.json Scripts
```json
{
  "deploy:prod": "npm run build && wrangler pages deploy dist --project-name hardconvos"
}
```

---

## 📊 What's Deployed

### Current Features
- ✅ Real-time voice conversation with OpenAI Realtime API
- ✅ Ephemeral token generation
- ✅ Live transcript display
- ✅ Post-call coaching debrief
- ✅ Basic COO scenario

### Enhanced Features (Coming Next)
- 🔄 4 scenario templates (Salary, HR, Sales, Client)
- 🔄 Concern configuration system
- 🔄 Persona customization (voice, age, gender)
- 🔄 Temper-meter escalation system
- 🔄 Multi-step setup wizard UI

---

## 🌐 URLs After Deployment

### Production
- **Main**: https://hardconvos.pages.dev
- **Branch**: https://main.hardconvos.pages.dev

### Sandbox (Current)
- **Testing**: https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai

---

## 🔒 Security Configuration

### Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Cloudflare Secret | OpenAI Realtime API access |
| `CLOUDFLARE_API_TOKEN` | Local `.env` | Deployment authentication |

### Never Commit
- `.dev.vars` (local API keys)
- `.env` files
- API tokens

### Always Use
- Cloudflare Secrets for production
- Environment variable injection
- Git-ignored sensitive files

---

## 🐛 Troubleshooting

### Issue: "Failed to get session token"
**Solution**: Verify `OPENAI_API_KEY` is set as Cloudflare Secret

### Issue: "WebRTC connection failed"
**Solution**: Check browser console for specific error, ensure HTTPS

### Issue: "Deployment failed"
**Solution**: 
```bash
# Check wrangler auth
npx wrangler whoami

# Re-authenticate if needed
npx wrangler login
```

---

## 📈 Monitoring & Analytics

### Cloudflare Dashboard
- View deployment history
- Check function invocations
- Monitor bandwidth usage
- Review error logs

### Access Logs
```bash
# View deployment logs
npx wrangler pages deployment list --project-name hardconvos

# View specific deployment
npx wrangler pages deployment tail --project-name hardconvos
```

---

## 🔄 Continuous Deployment

### Update Workflow

1. **Make changes locally**
2. **Test in sandbox**
3. **Commit to git**
   ```bash
   git add .
   git commit -m "Description of changes"
   ```
4. **Push to GitHub**
   ```bash
   git push origin main
   ```
5. **Deploy to Cloudflare**
   ```bash
   npm run deploy:prod
   ```

---

## 🎯 Next Deployment (Enhanced UI)

After we build the enhanced UI:

1. Test locally with PM2
2. Commit changes to git
3. Push to GitHub
4. Deploy to Cloudflare
5. Verify all 4 scenarios work
6. Test temper-meter escalation
7. Validate debrief enhancements

---

## 📞 Support Resources

- **Cloudflare Docs**: https://developers.cloudflare.com/pages/
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler/
- **OpenAI Realtime API**: https://platform.openai.com/docs/guides/realtime

---

**Status**: ✅ GitHub deployed, ⏳ Awaiting Cloudflare API key setup
**Next**: Configure Cloudflare API token → Deploy → Build enhanced UI
