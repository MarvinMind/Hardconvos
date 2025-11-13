# 🌐 PAWS Deployment URLs

## ⭐ **Primary Production URL (Fixed)**

**https://paws-cai.pages.dev**

- ✅ **This URL never changes**
- ✅ Always points to latest production deployment
- ✅ Use this for sharing with users
- ✅ Bookmark-friendly
- ✅ Professional and memorable

---

## 🔗 **All Active URLs**

| Type | URL | Purpose |
|------|-----|---------|
| **Production** | https://paws-cai.pages.dev | Main URL - share this one! |
| **Latest Deploy** | https://77ef69c1.paws-cai.pages.dev | Current specific deployment |
| **Sandbox Dev** | https://3000-i6fuzzpcp20oqdsz3wonr-c81df28e.sandbox.novita.ai | Development testing |
| **GitHub Repo** | https://github.com/Alfredlechat/Hardconvos.git | Source code |

---

## 📋 **How Cloudflare Pages URLs Work**

### **Main Project URL**: `paws-cai.pages.dev`
- **Format**: `[project-name].pages.dev`
- **Behavior**: Automatically points to production branch (main)
- **Updates**: Instantly when you deploy
- **SSL**: Free HTTPS certificate included
- **Status**: ✅ Always stable

### **Deployment URLs**: `[hash].paws-cai.pages.dev`
- **Format**: `[8-char-hash].[project-name].pages.dev`
- **Behavior**: Immutable snapshot of specific deployment
- **Updates**: Never changes (specific to one deploy)
- **Use Case**: Testing, rollback, comparison
- **Example**: `77ef69c1.paws-cai.pages.dev`

---

## 🎯 **Which URL to Use When?**

### **For Public Sharing:**
✅ `https://paws-cai.pages.dev`
- Marketing materials
- Social media
- User documentation
- Email signatures
- Business cards

### **For Testing/QA:**
✅ `https://[hash].paws-cai.pages.dev`
- Before promoting to production
- Bug reproduction
- Feature preview
- A/B testing
- Stakeholder review

### **For Development:**
✅ `http://localhost:3000` or Sandbox URL
- Local testing
- Rapid iteration
- Debugging
- Feature development

---

## 🔐 **Environment Variables**

Both production and preview environments have access to:

```bash
OPENAI_API_KEY=sk-proj-Fy6Ho_svsk... (configured via wrangler)
```

To update:
```bash
npx wrangler pages secret put OPENAI_API_KEY --project-name paws
```

---

## 🚀 **Deployment Commands**

### **Deploy to Production:**
```bash
cd /home/user/webapp
npm run build
npx wrangler pages deploy dist --project-name paws
```

### **View All Deployments:**
```bash
npx wrangler pages deployment list --project-name paws
```

### **Rollback to Previous Deployment:**
1. Go to: https://dash.cloudflare.com
2. Navigate to: Workers & Pages → paws
3. Click: Deployments tab
4. Find previous deployment
5. Click: "..." → "Rollback to this deployment"

---

## 📊 **Deployment History**

| Date | Hash | Status | Notes |
|------|------|--------|-------|
| 2025-11-13 | 77ef69c1 | ✅ Current | Fixed serveStatic + updated voices |
| 2025-11-13 | 6bc0105d | ⚠️ Previous | Scenario loading fixed |
| 2025-11-13 | 996348a2 | ⚠️ Previous | Phase 1 & 2 complete |

---

## 🌍 **Custom Domain Setup (Optional)**

If you want a branded domain like `paws.yourdomain.com`:

1. **Go to Cloudflare Dashboard**
2. **Navigate to**: Workers & Pages → paws → Custom domains
3. **Click**: "Set up a custom domain"
4. **Enter**: Your subdomain (e.g., `app.hardconvos.com`)
5. **Cloudflare will**:
   - Add DNS records
   - Issue SSL certificate
   - Configure routing

**Benefits:**
- Professional branding
- Custom URL
- Same performance
- Free SSL

---

## 📞 **Quick Reference**

**Main App**: https://paws-cai.pages.dev  
**Source Code**: https://github.com/Alfredlechat/Hardconvos.git  
**Cloudflare Dashboard**: https://dash.cloudflare.com  
**Wrangler Docs**: https://developers.cloudflare.com/workers/wrangler/  

---

## ✅ **Verification Checklist**

- ✅ Main URL accessible: `curl https://paws-cai.pages.dev`
- ✅ HTTPS certificate valid
- ✅ Redirects to `/setup` working
- ✅ API endpoints responding
- ✅ OpenAI token generation working
- ✅ GitHub repository synced
- ✅ Environment secrets configured

---

**Use `https://paws-cai.pages.dev` as your primary production URL!** 🐾
