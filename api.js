// Data layer. Two versions with the same functions:
//  - Supabase (live): used when config.js has SUPABASE_URL
//  - Demo: stores everything in this browser, with sample people and data
import { CONFIG, DEMO } from "./config.js";
import { todayISO, addDays, dayIndex } from "./plan.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newAccessCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
export function prettyCode(c) { return String(c || "").replace(/(.{4})(?=.)/g, "$1-"); }

/* =====================================================================
   SUPABASE
   ===================================================================== */
let _sb = {};
async function sb(kind) {
  if (_sb[kind]) return _sb[kind];
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm");
  _sb[kind] = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "sws-corp-" + kind }
  });
  return _sb[kind];
}
function must({ data, error }) { if (error) throw new Error(error.message || String(error)); return data; }

const liveEmployee = {
  async me() {
    const c = await sb("emp");
    const { data: { session } } = await c.auth.getSession();
    if (!session) return null;
    const { data } = await c.from("participants").select("*").maybeSingle();
    return data || null;
  },
  async login(code) {
    const c = await sb("emp");
    const { data: { session } } = await c.auth.getSession();
    if (!session) must(await c.auth.signInAnonymously());
    must(await c.rpc("claim_code", { p_code: code }));
    return this.me();
  },
  async logout() { const c = await sb("emp"); await c.auth.signOut(); },
  async plans(pid) {
    const c = await sb("emp");
    return must(await c.from("plans").select("id,phase,starts_on,data,created_at").eq("participant_id", pid).order("starts_on"));
  },
  async day(pid, day) {
    const c = await sb("emp");
    const [m, w, wo, ci] = await Promise.all([
      c.from("meal_logs").select("*").eq("participant_id", pid).eq("day", day),
      c.from("water_logs").select("*").eq("participant_id", pid).eq("day", day).maybeSingle(),
      c.from("workout_logs").select("*").eq("participant_id", pid).eq("day", day).maybeSingle(),
      c.from("checkins").select("*").eq("participant_id", pid).eq("day", day).maybeSingle()
    ]);
    return { meals: must(m) || [], water: (must(w) || {}).glasses || 0, workout: must(wo), checkin: must(ci) };
  },
  async setMeal(pid, day, mealId, entry) {
    const c = await sb("emp");
    if (!entry) return must(await c.from("meal_logs").delete().eq("participant_id", pid).eq("day", day).eq("meal_id", mealId));
    return must(await c.from("meal_logs").upsert({ participant_id: pid, day, meal_id: mealId, ...entry, logged_at: new Date().toISOString() }));
  },
  async setWater(pid, day, glasses) {
    const c = await sb("emp");
    return must(await c.from("water_logs").upsert({ participant_id: pid, day, glasses, updated_at: new Date().toISOString() }));
  },
  async saveWorkout(pid, day, w) {
    const c = await sb("emp");
    return must(await c.from("workout_logs").upsert({ participant_id: pid, day, ...w, updated_at: new Date().toISOString() }));
  },
  async saveCheckin(pid, day, ci) {
    const c = await sb("emp");
    return must(await c.from("checkins").upsert({ participant_id: pid, day, ...ci, updated_at: new Date().toISOString() }));
  },
  async history(pid, from) {
    const c = await sb("emp");
    const [ci, m, wo] = await Promise.all([
      c.from("checkins").select("day,energy,sleep_hours,slump,steps").eq("participant_id", pid).gte("day", from),
      c.from("meal_logs").select("day,meal_id").eq("participant_id", pid).gte("day", from),
      c.from("workout_logs").select("day,completed").eq("participant_id", pid).gte("day", from)
    ]);
    return { checkins: must(ci) || [], meals: must(m) || [], workouts: must(wo) || [] };
  },
  async leaderboard() { const c = await sb("emp"); return must(await c.rpc("team_leaderboard")) || []; },
  async setWorkdayStart(pid, t) { const c = await sb("emp"); return must(await c.rpc("set_workday_start", { p_time: t })); }
};

const liveCoach = {
  async me() {
    const c = await sb("coach");
    const { data: { session } } = await c.auth.getSession();
    if (!session) return null;
    const ok = must(await c.rpc("is_coach"));
    return ok ? { email: session.user.email } : null;
  },
  async login(email, password) {
    const c = await sb("coach");
    must(await c.auth.signInWithPassword({ email, password }));
    const ok = must(await c.rpc("is_coach"));
    if (!ok) { await c.auth.signOut(); throw new Error("This account isn't set up as a coach yet. See step 4 in the setup guide."); }
    return this.me();
  },
  async logout() { const c = await sb("coach"); await c.auth.signOut(); },
  async participants() { const c = await sb("coach"); return must(await c.from("participants").select("*").order("created_at")); },
  async createParticipant(d) {
    const c = await sb("coach");
    return must(await c.from("participants").insert({ ...d, access_code: newAccessCode() }).select().single());
  },
  async updateParticipant(id, patch) { const c = await sb("coach"); return must(await c.from("participants").update(patch).eq("id", id).select().single()); },
  async resetCode(id) {
    const c = await sb("coach");
    const row = must(await c.from("participants").update({ access_code: newAccessCode() }).eq("id", id).select().single());
    must(await c.from("participant_devices").delete().eq("participant_id", id));
    return row;
  },
  async plans(pid) { const c = await sb("coach"); return must(await c.from("plans").select("*").eq("participant_id", pid).order("starts_on")); },
  async savePlan(pid, phase, starts_on, data) { const c = await sb("coach"); return must(await c.from("plans").insert({ participant_id: pid, phase, starts_on, data }).select().single()); },
  async deletePlan(id) { const c = await sb("coach"); return must(await c.from("plans").delete().eq("id", id)); },
  async activity(from) {
    const c = await sb("coach");
    const [m, w, wo, ci, pl] = await Promise.all([
      c.from("meal_logs").select("participant_id,day,meal_id,quick,protein").gte("day", from),
      c.from("water_logs").select("participant_id,day,glasses").gte("day", from),
      c.from("workout_logs").select("participant_id,day,workout,weights,completed").gte("day", from),
      c.from("checkins").select("*").gte("day", from),
      c.from("plans").select("id,participant_id,phase,starts_on,data,created_at")
    ]);
    return { meals: must(m), water: must(w), workouts: must(wo), checkins: must(ci), plans: must(pl) };
  }
};

/* =====================================================================
   DEMO (this browser only)
   ===================================================================== */
const DEMO_KEY = "sws-corp-demo-v1";
let demoDb = null;
function demoSave() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(demoDb)); } catch (e) {} }
function uid() { return "id-" + Math.random().toString(36).slice(2, 10); }

async function demoLoad() {
  if (demoDb) return demoDb;
  try { demoDb = JSON.parse(localStorage.getItem(DEMO_KEY) || "null"); } catch (e) { demoDb = null; }
  if (demoDb) return demoDb;
  const plan = await (await fetch(new URL("../plans/sample-plan.json", import.meta.url))).json();
  const today = todayISO();
  const start = addDays(today, -16); // three weeks in
  const people = [
    ["Rahul Iyer", "Ledger Lions", "DEMORAHUL001"], ["Ananya Rao", "Ledger Lions", "DEMOANANYA02"],
    ["Karthik Menon", "Bull Run", "DEMOKARTHIK3"], ["Sneha Kulkarni", "Bull Run", "DEMOSNEHA004"],
    ["Arjun Shah", "Ledger Lions", "DEMOARJUN005"], ["Meera Nair", "Bull Run", "DEMOMEERA006"]
  ];
  demoDb = { participants: [], plans: [], meal_logs: [], water_logs: [], workout_logs: [], checkins: [], session: null, coach: null };
  // Deterministic pseudo-random so the demo looks the same each time
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  people.forEach(([name, team, code], idx) => {
    const id = uid();
    demoDb.participants.push({ id, full_name: name, team, phone: "", email: "", company: CONFIG.COMPANY, start_date: start, workday_start: "09:00", access_code: code, active: true, created_at: new Date().toISOString() });
    demoDb.plans.push({ id: uid(), participant_id: id, phase: 1, starts_on: start, data: plan, created_at: new Date().toISOString() });
    const keen = idx === 5 ? 0.25 : 0.9 - idx * 0.08; // last person drops off
    for (let d = start; d < today; d = addDays(d, 1)) {
      const late = idx === 5 && d > addDays(start, 5);
      if (late) continue;
      const di = dayIndex(d);
      plan.meals.forEach(m => { if ((!m.trainingOnly || plan.trainingDays[["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][di]]) && rnd() < keen) demoDb.meal_logs.push({ participant_id: id, day: d, meal_id: m.id, option_index: 0, quick: false, protein: (m.main || m.smart.light).macros[1] }); });
      demoDb.water_logs.push({ participant_id: id, day: d, glasses: Math.round(6 + rnd() * 6 * keen) });
      if (plan.trainingDays[["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][di]] && rnd() < keen) demoDb.workout_logs.push({ participant_id: id, day: d, workout: plan.trainingDays[["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][di]], done_sets: {}, weights: {}, completed: true });
      if (rnd() < keen) {
        const progress = Math.min(1, (new Date(d) - new Date(start)) / (16 * 86400000));
        demoDb.checkins.push({ participant_id: id, day: d, energy: Math.max(1, Math.min(5, Math.round(2.4 + progress * 1.4 + (rnd() - 0.5)))), slump: rnd() > 0.35 + progress * 0.4, sleep_hours: Math.round((6 + progress * 0.9 + (rnd() - 0.5) * 0.8) * 2) / 2, steps: Math.round(4500 + progress * 3000 + rnd() * 1500) });
      }
    }
  });
  demoSave();
  return demoDb;
}
const byPD = (pid, day) => r => r.participant_id === pid && r.day === day;
function upsert(table, keyFn, row) { const i = table.findIndex(keyFn); if (i >= 0) table[i] = { ...table[i], ...row }; else table.push(row); demoSave(); }

const demoEmployee = {
  async me() { const db = await demoLoad(); return db.session ? db.participants.find(p => p.id === db.session && p.active) || null : null; },
  async login(code) {
    const db = await demoLoad();
    const clean = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const p = db.participants.find(x => x.access_code === clean && x.active);
    if (!p) throw new Error("That code was not recognised. Check it, or ask Vanshika for a new one.");
    db.session = p.id; demoSave(); return p;
  },
  async logout() { const db = await demoLoad(); db.session = null; demoSave(); },
  async plans(pid) { const db = await demoLoad(); return db.plans.filter(p => p.participant_id === pid).sort((a, b) => a.starts_on.localeCompare(b.starts_on)); },
  async day(pid, day) {
    const db = await demoLoad();
    return { meals: db.meal_logs.filter(byPD(pid, day)), water: (db.water_logs.find(byPD(pid, day)) || {}).glasses || 0, workout: db.workout_logs.find(byPD(pid, day)) || null, checkin: db.checkins.find(byPD(pid, day)) || null };
  },
  async setMeal(pid, day, mealId, entry) {
    const db = await demoLoad();
    const k = r => r.participant_id === pid && r.day === day && r.meal_id === mealId;
    if (!entry) { db.meal_logs = db.meal_logs.filter(r => !k(r)); demoSave(); return; }
    upsert(db.meal_logs, k, { participant_id: pid, day, meal_id: mealId, ...entry });
  },
  async setWater(pid, day, glasses) { const db = await demoLoad(); upsert(db.water_logs, byPD(pid, day), { participant_id: pid, day, glasses }); },
  async saveWorkout(pid, day, w) { const db = await demoLoad(); upsert(db.workout_logs, byPD(pid, day), { participant_id: pid, day, ...w }); },
  async saveCheckin(pid, day, ci) { const db = await demoLoad(); upsert(db.checkins, byPD(pid, day), { participant_id: pid, day, ...ci }); },
  async history(pid, from) {
    const db = await demoLoad(); const f = r => r.participant_id === pid && r.day >= from;
    return { checkins: db.checkins.filter(f), meals: db.meal_logs.filter(f), workouts: db.workout_logs.filter(f) };
  },
  async leaderboard() {
    const db = await demoLoad(); const mon = addDays(todayISO(), -dayIndex(todayISO()));
    const teams = {};
    db.participants.filter(p => p.active && p.team).forEach(p => {
      const t = teams[p.team] || (teams[p.team] = { team: p.team, points: 0, members: 0 }); t.members++;
      const f = r => r.participant_id === p.id && r.day >= mon;
      t.points += db.meal_logs.filter(f).length + 2 * db.checkins.filter(f).length + 3 * db.workout_logs.filter(r => f(r) && r.completed).length + 2 * db.water_logs.filter(r => f(r) && r.glasses >= 12).length;
    });
    return Object.values(teams).sort((a, b) => b.points - a.points);
  },
  async setWorkdayStart(pid, t) { const db = await demoLoad(); const p = db.participants.find(x => x.id === pid); if (p) { p.workday_start = t; demoSave(); } }
};

const demoCoach = {
  async me() { const db = await demoLoad(); return db.coach; },
  async login(email, password) {
    const db = await demoLoad();
    if (password !== "demo") throw new Error('In demo mode, the password is "demo".');
    db.coach = { email: email || "coach@demo" }; demoSave(); return db.coach;
  },
  async logout() { const db = await demoLoad(); db.coach = null; demoSave(); },
  async participants() { const db = await demoLoad(); return db.participants.slice(); },
  async createParticipant(d) { const db = await demoLoad(); const row = { id: uid(), active: true, company: CONFIG.COMPANY, created_at: new Date().toISOString(), ...d, access_code: newAccessCode() }; db.participants.push(row); demoSave(); return row; },
  async updateParticipant(id, patch) { const db = await demoLoad(); const p = db.participants.find(x => x.id === id); Object.assign(p, patch); demoSave(); return p; },
  async resetCode(id) { return this.updateParticipant(id, { access_code: newAccessCode() }); },
  async plans(pid) { return demoEmployee.plans(pid); },
  async savePlan(pid, phase, starts_on, data) { const db = await demoLoad(); const row = { id: uid(), participant_id: pid, phase, starts_on, data, created_at: new Date().toISOString() }; db.plans.push(row); demoSave(); return row; },
  async deletePlan(id) { const db = await demoLoad(); db.plans = db.plans.filter(p => p.id !== id); demoSave(); },
  async activity(from) {
    const db = await demoLoad(); const f = r => r.day >= from;
    return { meals: db.meal_logs.filter(f), water: db.water_logs.filter(f), workouts: db.workout_logs.filter(f), checkins: db.checkins.filter(f), plans: db.plans.slice() };
  }
};

export function resetDemo() { try { localStorage.removeItem(DEMO_KEY); } catch (e) {} demoDb = null; }
export const employeeApi = DEMO ? demoEmployee : liveEmployee;
export const coachApi = DEMO ? demoCoach : liveCoach;
