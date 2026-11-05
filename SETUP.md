# Care.ai — Setup & Deployment Guide

## Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Supabase CLI (`npm install -g supabase`)

---

## Step 1 — Install dependencies

```bash
cd care-ai
pnpm install
```

---

## Step 2 — Run the Supabase migrations

### Option A: Supabase Dashboard (easiest)

1. Go to https://supabase.com/dashboard/project/hkbgkiikfjsbhiokfsfo
2. Click **SQL Editor** → **New query**
3. Paste the contents of `supabase/migrations/001_initial.sql` → **Run**
4. Paste the contents of `supabase/seed.sql` → **Run**

### Option B: Supabase CLI

```bash
cd care-ai
supabase login
supabase link --project-ref hkbgkiikfjsbhiokfsfo
supabase db push
```

---

## Step 3 — Create Supabase Storage bucket

In the Supabase Dashboard → **Storage** → **New bucket**:
- Name: `checkin-photos`
- Public: ✓ (so photo URLs work in the app)

---

## Step 4 — Add the Anthropic API key as a Supabase secret

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Then deploy the Edge Function:
```bash
supabase functions deploy analyze-checkin
```

---

## Step 5 — Create demo doctor account

In Supabase Dashboard → **Authentication** → **Users** → **Add user**:
- Email: `dr.martinez@careai.demo`
- Password: (choose one)

---

## Step 6 — Create demo patient accounts

Create an auth user for each demo patient with the matching email and a password of your choice:

| Patient | Email | Condition | Day | Status |
|---------|-------|-----------|-----|--------|
| Priya Sharma | `priya@careai.demo` | Acne | 32 | yellow |
| Marcus Johnson | `marcus@careai.demo` | Acne | 8 | green |
| Sarah Chen | `sarah@careai.demo` | Laser/CO2 | 5 | red |
| Ritika Sharma | `ritika@careai.demo` | Laser/CO2 (acne scars) | 14 | green |
| Arjun Patel | `arjun@careai.demo` | Laser/Q-switch | 7 | yellow |
| Meera Kapoor | `meera@careai.demo` | Laser/CO2 (melasma) | 3 | red |

Then in the SQL Editor, link all accounts in one query:
```sql
UPDATE org_care_demo.patients 
SET auth_user_id = (SELECT id FROM auth.users WHERE email = patients.email)
WHERE email IN (
  'priya@careai.demo', 'marcus@careai.demo', 'sarah@careai.demo',
  'ritika@careai.demo', 'arjun@careai.demo', 'meera@careai.demo'
);
```

---

## Step 7 — Run locally

```bash
# Patient PWA (http://localhost:5174)
pnpm dev:patient

# Doctor Dashboard (http://localhost:3001)
pnpm dev:dashboard
```

---

## Step 8 — Deploy to Vercel

### Patient PWA
```bash
cd apps/patient
vercel --prod
# Set env vars in Vercel dashboard:
#   VITE_SUPABASE_URL
#   VITE_SUPABASE_ANON_KEY
#   VITE_APP_MODE=demo
#   VITE_ORG_SLUG=care_demo
```

### Doctor Dashboard
```bash
cd apps/dashboard
vercel --prod
# Set env vars in Vercel dashboard:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   NEXT_PUBLIC_ORG_SLUG=care_demo
```

---

## Onboarding a new pilot org

```sql
-- In SQL Editor — creates a fully isolated org_newclinic schema
SELECT provision_org('New Clinic Name', 'newclinic');
```

Then:
1. Add a doctor record in `org_newclinic.doctors`
2. Add patients in `org_newclinic.patients`
3. Create a new Vercel deployment with `VITE_ORG_SLUG=newclinic`

Each org gets its own schema — data is fully isolated. One Supabase project supports unlimited orgs.

---

## Upgrading demo → pilot (real AI)

1. Set `VITE_APP_MODE=pilot` in patient app env
2. Ensure `ANTHROPIC_API_KEY` secret is set in Supabase
3. The Edge Function (`analyze-checkin`) automatically uses real Claude Vision when the key is present

---

## Architecture overview

```
care-ai/
├── apps/
│   ├── patient/          React + Vite + TS + PWA (mobile installable)
│   └── dashboard/        Next.js 14 doctor dashboard
├── packages/
│   └── shared/           TypeScript types shared between apps
└── supabase/
    ├── migrations/       001_initial.sql — schema + RPC helpers
    ├── seed.sql          Demo org + 3 patients (Acne x2, Laser x1)
    └── functions/
        └── analyze-checkin/  Deno Edge Function: image → Claude Vision → result
```

### Multi-tenancy
- Each pilot org gets its own Postgres schema (`org_{slug}`)
- Public schema holds org registry + RPC functions only
- `provision_org('Name', 'slug')` creates a complete new tenant in one call
- Scale to enterprise: same pattern, just provision → configure → deploy env var

### AI pipeline
- Patient submits photo from mobile PWA
- Edge Function receives image + patient context
- Loads disease protocol (day-range-specific rules) from `disease_protocols` table
- Calls Claude Vision with: photo + protocol + patient history
- Returns: zone analysis (6 zones × 3 metrics) + headline + recommendations
- Stores result in DB, creates alert if severity ≥ 2, adds to patient chat

### Existing CareCompanion demo
The original demo at `carecompanion-ai/` remains fully untouched and independently runnable.
It uses SQLite + Python Flask — completely separate from this Supabase stack.
