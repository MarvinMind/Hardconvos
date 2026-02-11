# Production Database Setup Guide

## Issue: Authentication Errors in Production

The app is working locally but failing in production because the D1 database hasn't been created and migrated yet.

## Steps to Fix

### 1. Create Production D1 Database

Due to API token permissions, you'll need to create the database through the Cloudflare Dashboard:

1. Go to https://dash.cloudflare.com/
2. Navigate to **Workers & Pages** > **D1**
3. Click **Create database**
4. Name it: `paws-users`
5. Click **Create**
6. Copy the **Database ID** (looks like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### 2. Update wrangler.jsonc

Edit `/home/user/webapp/wrangler.jsonc` and replace `YOUR_DATABASE_ID_HERE` with the actual database ID:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "paws-users",
    "database_id": "paste-your-database-id-here"
  }
]
```

### 3. Apply Migrations to Production

After updating the database ID, run:

```bash
cd /home/user/webapp
npx wrangler d1 migrations apply paws-users --remote
```

This will create all the necessary tables in production.

### 4. Redeploy to Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy dist --project-name hardconvos
```

## Alternative: Quick Fix via Cloudflare Dashboard

If you want to test the database quickly:

1. After creating the D1 database in the dashboard
2. Go to the database details page
3. Click **Console** tab
4. Copy and paste the contents of these files one at a time:
   - `/home/user/webapp/migrations/0001_initial_schema.sql`
   - `/home/user/webapp/migrations/0002_update_pricing.sql`
5. Click **Execute** for each

Then update wrangler.jsonc and redeploy.

## Verify It's Working

After deployment, test registration:

```bash
curl -X POST https://hardconvos.pages.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123","name":"Test User"}'
```

You should get a success response with user data.

## Current Status

✅ Local database working (migrations applied)
✅ Registration working locally on port 3000
❌ Production database needs to be created
❌ Migrations need to be applied to production

## Environment Variables Needed

Don't forget to set these secrets in Cloudflare Pages:

```bash
npx wrangler pages secret put OPENAI_API_KEY --project-name hardconvos
npx wrangler pages secret put JWT_SECRET --project-name hardconvos
npx wrangler pages secret put STRIPE_SECRET_KEY --project-name hardconvos
npx wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name hardconvos
```
