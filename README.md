# Strong With Sherni · Corporate Program website

Two sites in one folder:

- **Employee dashboard**: `yoursite.vercel.app`. Employees log in with their personal code.
- **Coach panel**: `yoursite.vercel.app/coach`. Only you log in here.

Until you finish the setup below, both run in **demo mode** with six sample people, so you can click around first. Demo code: `DEMO-RAHU-L001`. Demo coach password: `demo`.

---

## Setup (about 30 minutes, one time)

### 1. Create the database (Supabase, free)
1. Go to supabase.com and sign up.
2. Click **New project**. Name it `sherni-corporate`, set a database password (save it somewhere safe), and choose the region **Mumbai (ap-south-1)** so data stays in India.
3. Wait about 2 minutes for it to finish.

### 2. Create the tables
1. In the left menu, open **SQL Editor** and click **New query**.
2. Open `supabase/schema.sql` from this folder, copy all of it, paste it in, and click **Run**.
3. You should see "Success. No rows returned".

### 3. Turn on code login for employees
1. Left menu: **Authentication** → **Sign In / Providers**.
2. Turn on **Allow anonymous sign-ins** and save.

Employees never see this. It lets their phone sign in quietly, and their personal code then decides whose dashboard opens. Without a valid code, nobody sees anything.

### 4. Create your coach login
1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter your email and a strong password, and tick **Auto Confirm User**.
3. Go back to **SQL Editor**, run this with your email in it:

```sql
insert into coaches (auth_uid, name)
select id, 'Vanshika' from auth.users where email = 'YOUR-EMAIL-HERE';
```

### 5. Connect the website to the database
1. **Project Settings** → **API** (or **Data API**).
2. Copy the **Project URL** and the **anon public** key.
3. Open `js/config.js` and paste them into `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
4. Check your WhatsApp number in `COACH_WHATSAPP` (country code + number, no spaces).

The anon key is meant to be public. The database rules in step 2 are what keep each person's data private.

### 6. Put it online (Vercel)
1. Create a new repository on GitHub (for example `sherni-corporate`) and upload everything in this folder.
2. In Vercel: **Add New** → **Project** → import that repository → Framework preset **Other** → **Deploy**.
3. Copy your new address (for example `sherni-corporate.vercel.app`) into `SITE_URL` in `js/config.js` and save the change on GitHub. Vercel updates the site by itself.

Optional: in Vercel → **Settings** → **Domains**, you can add something like `corporate.strongwithsherni.com`.

### 7. Test it with yourself first
1. Open `/coach`, log in, and **Add participant** with your own name and number.
2. **Upload plan**: choose yourself and pick `plans/sample-plan.json`.
3. Open the main address on your phone, enter your code, and click around.

---

## Running the program

**Adding someone.** Coach panel → **Add participant** → **Send on WhatsApp**. They get the link and their code in one message.

**Their plan.** Make it in your Claude Project as usual. If you've added the text from `docs/claude-project-instructions.md`, Claude also gives you a website plan file. Save it as a `.json` file and use **Upload plan**. The panel checks it and tells you exactly what to fix if something is off.

**The next phase.** Upload the Phase 2 file with the date it should start. Their dashboard switches over on that day by itself.

**Lost or shared code.** Open the person → **Reset code** → send the new welcome message. The old code stops working everywhere.

**Every evening.** Open the panel. Flags show who has gone quiet, has low energy, is logging under half their meals, or left you a note.

**For HR.** **Group report** → **Copy summary**. It contains group averages only, and trends only appear once at least 5 people have enough data.

---

## What's in the folder

| Path | What it is |
|---|---|
| `index.html`, `js/employee.js` | Employee dashboard |
| `coach.html`, `js/coach.js` | Coach panel |
| `js/config.js` | Your settings: the only file you need to edit |
| `js/plan.js` | Reads a plan and works out each day: times, veg days, smart dinner, workouts by week |
| `js/api.js` | Talks to the database (or the demo data) |
| `js/ics.js` | Makes the phone calendar file |
| `supabase/schema.sql` | Database tables and privacy rules |
| `plans/sample-plan.json` | A complete example plan |
| `docs/claude-project-instructions.md` | Text to add to your Claude Project |

## Good to know
- **Cost:** Supabase and Vercel free tiers comfortably cover a 20-person pilot.
- **Privacy:** each employee can only read and change their own rows. The database enforces this, not just the website. HR never gets individual data.
- **Plans contain no health details.** Keep medical notes in the Word document only.
- **Not built yet:** automatic daily WhatsApp messages (needs a WhatsApp Business provider) and step sync with Google Fit or Apple Health.
