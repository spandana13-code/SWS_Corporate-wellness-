import { CONFIG, DEMO } from "./config.js";
import { employeeApi as api } from "./api.js";
import * as P from "./plan.js";
import { buildICS, downloadICS } from "./ics.js";
import { lion, IC, esc, notify, toast, sheet, closeSheet, waLink, lineChart } from "./ui.js";

/* ---------------- state ---------------- */
const S = {
  me: null, plans: [], today: P.todayISO(), view: P.todayISO(), tab: "today",
  logs: { meals: {}, water: 0, workout: null, checkin: null }, hist: null, board: null, food: "",
  lastTick: P.nowMinutes()
};
const local = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem("sws-emp-" + k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("sws-emp-" + k, JSON.stringify(v)); } catch (e) {} }
};
S.tab = local.get("tab", "today");
const $ = s => document.querySelector(s);

/* ---------------- derived ---------------- */
function ctxFor(iso) {
  const ap = P.activePlan(S.plans, iso);
  if (!ap) return null;
  const plan = ap.data, di = P.dayIndex(iso);
  const progWeek = P.programWeek(S.me.start_date, iso);
  return { plan, phase: ap, di, progWeek, wip: P.weekInPhase(plan, progWeek), train: P.trainingType(plan, di), veg: P.isVegDay(plan, di) };
}
const editable = () => S.view <= S.today && S.view >= P.addDays(S.today, -2);
const isToday = () => S.view === S.today;
const crazyOn = () => !!local.get("crazy-" + S.view, false);
const swaps = () => local.get("swaps-" + S.view, {});
const workStart = () => (S.me.workday_start || "09:00").slice(0, 5);

function basedOnProtein(c, meal) {
  if (!meal.smart) return null;
  const row = S.logs.meals[meal.smart.basedOn];
  return row ? row.protein : null;
}
function itemOf(c, meal) {
  const ctx = { di: c.di, basedOnProtein: basedOnProtein(c, meal) };
  const row = S.logs.meals[meal.id];
  if (row) return P.itemFor(c.plan, meal, ctx, row.option_index, row.quick);
  return P.itemFor(c.plan, meal, ctx, swaps()[meal.id] || 0, crazyOn());
}
function consumed() {
  const s = [0, 0, 0, 0, 0];
  Object.values(S.logs.meals).forEach(r => { [r.kcal, r.protein, r.carbs, r.fat, r.fibre].forEach((v, i) => s[i] += v || 0); });
  return s;
}

/* ---------------- boot ---------------- */
async function boot() {
  try {
    S.me = await api.me();
    if (!S.me) return renderLogin();
    await loadAll();
  } catch (e) { renderError(e); }
}
async function loadAll() {
  S.today = P.todayISO();
  if (S.view > S.today || S.view < P.mondayOf(S.today)) S.view = S.today;
  S.plans = await api.plans(S.me.id);
  await loadDay();
  render();
  loadExtras();
}
async function loadDay() {
  const d = await api.day(S.me.id, S.view);
  const meals = {}; (d.meals || []).forEach(r => meals[r.meal_id] = r);
  S.logs = { meals, water: d.water || 0, workout: d.workout, checkin: d.checkin };
}
async function loadExtras() {
  try {
    const [hist, board] = await Promise.all([api.history(S.me.id, S.me.start_date), api.leaderboard()]);
    S.hist = hist; S.board = board;
    if (S.tab === "checkin" || S.tab === "today") rerender();
  } catch (e) { /* non-essential */ }
}

/* ---------------- login ---------------- */
function renderLogin(err) {
  $("#root").innerHTML = `
  ${DEMO ? `<div class="demo-strip"><b>Demo mode.</b> Try the code <b>DEMO-RAHU-L001</b></div>` : ""}
  <main class="login">
    <div class="login-mark">${lion(56)}<div><div class="eyebrow">Strong With Sherni</div><div class="tagline">Small habits. Big life.</div></div></div>
    <div><div class="eyebrow" style="margin-bottom:8px">${esc(CONFIG.PROGRAM_NAME)}</div>
      <h1>Your personal plan, one day at a time.</h1></div>
    <form id="lf" class="stack" autocomplete="off">
      <label for="code" class="small muted">Your personal code (sent to you by ${esc(CONFIG.COACH_NAME)} on WhatsApp)</label>
      <input id="code" class="inp num" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" spellcheck="false" aria-label="Personal code">
      ${err ? `<p class="err" role="alert">${esc(err)}</p>` : ""}
      <button class="btn primary block" type="submit" id="lbtn">Open my dashboard</button>
      <p class="small muted" style="margin:0">Your plan, meals and check-ins are visible only to you and your coach. Your employer sees anonymised group totals only.</p>
    </form>
    <a class="link" href="${waLink("Hi Vanshika, I need help logging in to my Sherni dashboard.")}" target="_blank" rel="noopener">Lost your code? Message ${esc(CONFIG.COACH_NAME)}</a>
  </main>`;
  $("#lf").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#lbtn"); btn.disabled = true; btn.textContent = "Checking…";
    try { S.me = await api.login($("#code").value); await loadAll(); notify(`Welcome, ${firstName()}!`, "Your plan for today is ready."); }
    catch (er) { renderLogin(er.message || "Something went wrong. Try again."); }
  });
}
function renderError(e) {
  $("#root").innerHTML = `<main class="login"><h1>We couldn't load your dashboard.</h1><p class="muted">${esc(e.message || e)}</p><button class="btn primary" onclick="location.reload()">Try again</button></main>`;
}
const firstName = () => (S.me.full_name || "").split(" ")[0];

/* ---------------- shell ---------------- */
function render() {
  const c = ctxFor(S.view);
  const tabs = { today: viewToday, workout: viewWorkout, checkin: viewCheckin, plan: viewPlan, me: viewMe };
  $("#root").innerHTML = `
    ${DEMO ? `<div class="demo-strip"><b>Demo mode</b> · sample data saved in this browser only</div>` : ""}
    <div class="app ${S.tab === "today" && !S.didAnim ? "anim" : ""}">
      ${S.tab === "today" && c ? "" : header(c)}
      <div class="wrap">${c ? tabs[S.tab](c) : noPlan()}</div>
    </div>
    <a class="fab" href="${waLink(waMessage())}" target="_blank" rel="noopener">${IC.wa}Ask ${esc(CONFIG.COACH_NAME)}</a>
    <nav class="nav" aria-label="Sections">
      ${[["today", "Today"], ["workout", "Workout"], ["checkin", "Check-in"], ["plan", "My plan"], ["me", "Reminders"]].map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? "on" : ""}" aria-current="${S.tab === k ? "page" : "false"}">${IC[k]}${l}</button>`).join("")}
    </nav>`;
  bind();
  if (S.tab === "today") S.didAnim = true;
  if (S.pop) setTimeout(() => { S.pop = null; }, 400);
}
function rerender() {
  const a = document.activeElement;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && a.id !== "code") return; // don't interrupt typing
  const y = window.scrollY; render(); window.scrollTo(0, y);
}
function noPlan() {
  const next = P.nextPlan(S.plans, S.view);
  return `<section class="card note"><div class="row">${lion(30)}<div class="eyebrow">Note from Sherni</div></div>
    <p>${next ? `Your plan starts on <b>${new Date(next.starts_on).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</b>. See you then!` : `${esc(CONFIG.COACH_NAME)} is preparing your personal plan. It will appear here as soon as it's ready.`}</p></section>
    <button class="btn block" id="logout">Log out</button>`;
}
function header(c) {
  const total = Math.max(12, ...S.plans.map(p => (p.data.weeks || [0, 0])[1] || 0));
  const streak = computeStreak();
  return `<header class="hdr">
    <div class="hdr-top">${lion(46)}
      <div style="min-width:0"><h1>Hi ${esc(firstName())}</h1><div class="sub">${isToday() ? "Today · " : ""}${P.DAY_NAMES[P.dayIndex(S.view)]}${c ? " · " + (c.train ? esc(c.plan.workouts[c.train].title.split(" · ")[0]) + " day" : "Active recovery day") : ""}</div></div>
    </div>
    ${c ? `<div class="hdr-meta">
      <span class="chip chip-gold">Phase ${c.plan.phase}${c.plan.phaseName ? " · " + esc(c.plan.phaseName) : ""}</span>
      <span class="chip chip-gold num">Week ${Math.max(1, c.progWeek)} of ${total}</span>
      ${streak ? `<span class="chip chip-gold num">${streak}-day streak</span>` : ""}
    </div>` : ""}
  </header>`;
}
function dayChips(c) {
  const mon = P.mondayOf(S.today);
  return `<div class="days" role="tablist" aria-label="Days this week">${P.DAY_KEYS.map((d, i) => {
    const iso = P.addDays(mon, i), cc = ctxFor(iso);
    const label = cc ? (cc.train ? "Train" : cc.veg ? "Veg" : "Active") : "";
    return `<button class="day ${S.view === iso ? "on" : ""}" data-day="${iso}" role="tab" aria-selected="${S.view === iso}">${iso === S.today ? '<span class="dot"></span>' : ""}${d}<small>${label}</small></button>`;
  }).join("")}</div>
  ${S.view > S.today ? `<div class="readonly">Preview of ${P.DAY_NAMES[P.dayIndex(S.view)]}. You can log it on the day.</div>` : (!editable() ? `<div class="readonly">This day can no longer be edited.</div>` : "")}`;
}

/* ---------------- Today ---------------- */
function rel(m) { if (m < 60) return m + " min"; const h = Math.floor(m / 60), r = m % 60; return h + " hr" + (r ? " " + r + " min" : ""); }
const TICK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';

function hero(c) {
  const sum = consumed(), T = c.plan.targets, meals = P.mealsFor(c.plan, c.di);
  const glasses = T.waterGlasses || 12, eaten = meals.filter(m => S.logs.meals[m.id]).length;
  const h = new Date().getHours(), greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const C = 289.03, kcalPct = Math.min(1, sum[0] / T.kcal);
  const pct = (v, max) => Math.min(100, Math.round(v / max * 100));
  const total = Math.max(12, ...S.plans.map(p => (p.data.weeks || [0, 0])[1] || 0));
  const streak = computeStreak();
  return `<section class="hero rise">
    <div class="hero-top">
      <div style="min-width:0"><small>${isToday() ? "Today" : P.DAY_NAMES[c.di]} · Week ${Math.max(1, c.progWeek)} of ${total}</small><h1>${isToday() ? greet : P.DAY_NAMES[c.di]}, ${esc(firstName())}</h1></div>
      <img class="logo" src="logo.png" alt="Strong With Sherni">
    </div>
    <div class="stats">
      <div class="ring" role="img" aria-label="${sum[0]} of ${T.kcal} calories">
        <svg viewBox="0 0 112 112"><circle class="trk" cx="56" cy="56" r="46" fill="none" stroke-width="11"/><circle class="val" cx="56" cy="56" r="46" fill="none" stroke-width="11" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - kcalPct)).toFixed(1)}"/></svg>
        <div class="mid"><b class="num">${sum[0].toLocaleString("en-IN")}</b><span>of ${T.kcal.toLocaleString("en-IN")} kcal</span></div>
      </div>
      <div class="hbars">
        <div><div class="hbl"><span>Protein</span><b class="num">${sum[1]}/${T.protein}g</b></div><div class="hbar p"><i style="width:${pct(sum[1], T.protein)}%"></i></div></div>
        <div><div class="hbl"><span>Water</span><b class="num">${S.logs.water}/${glasses}</b></div><div class="hbar w"><i style="width:${pct(S.logs.water, glasses)}%"></i></div></div>
        <div><div class="hbl"><span>Meals</span><b class="num">${eaten}/${meals.length}</b></div><div class="hbar m"><i style="width:${pct(eaten, meals.length)}%"></i></div></div>
      </div>
    </div>
    <div class="hero-tags"><span>Phase ${c.plan.phase}${c.plan.phaseName ? " · " + esc(c.plan.phaseName) : ""}</span><span>${c.train ? esc(c.plan.workouts[c.train].title.split(" · ")[0]) + " day" : "Active recovery day"}</span>${c.veg ? "<span>Vegetarian day</span>" : ""}${streak ? `<span class="num">${streak}-day streak</span>` : ""}</div>
  </section>`;
}

function nextCard(c) {
  if (!isToday()) return "";
  const now = P.nowMinutes(), meals = P.mealsFor(c.plan, c.di);
  const t = m => P.mealTime(c.plan, m, workStart());
  const missed = meals.filter(m => !m.optional && !S.logs.meals[m.id] && t(m) + 75 < now).pop();
  const up = meals.find(m => !S.logs.meals[m.id] && t(m) >= now - 30);
  const ed = editable();
  let html = "";
  if (missed && missed.quick) {
    html += `<section class="card2 next2 warn rise d1"><div class="eb" style="color:var(--warn)">Missed ${esc(missed.name.toLowerCase())}?</div>
      <div class="meal-t">Busy day happens. Here's a 2-minute backup.</div>
      <div class="meta">${esc(missed.quick.text)}</div>
      <div class="btns2"><button class="b2 primary" data-backup="${esc(missed.id)}" ${ed ? "" : "disabled"}>I had the backup</button></div></section>`;
  }
  if (up) {
    const diff = t(up) - now, it = itemOf(c, up);
    const opts = P.mealOptions(c.plan, up, { di: c.di, basedOnProtein: basedOnProtein(c, up) });
    const when = diff <= 0 ? "Now" : diff <= 60 ? "In " + rel(diff) : "At " + P.fmtTime(t(up));
    const reason = P.smartReason(c.plan, up, { di: c.di, basedOnProtein: basedOnProtein(c, up) }, it.quick);
    html += `<section class="card2 next2 rise d1">
      <div class="row between"><div class="eb">${esc(up.name)} · ${P.fmtTime(t(up))}</div><div class="pill2">${when}</div></div>
      <div class="meal-t">${esc(it.text)}</div>
      <div class="meta num">${it.macros[0]} kcal · ${it.macros[1]} g protein${it.quick ? " · quick backup" : ""}</div>
      ${reason ? `<div class="meta" style="font-style:italic">${esc(reason)}</div>` : ""}
      <div class="btns2"><button class="b2 primary" data-tick="${esc(up.id)}" ${ed ? "" : "disabled"}>Mark as eaten</button><button class="b2 ghost" data-swap="${esc(up.id)}" ${it.quick || opts.length < 2 ? "disabled" : ""}>Swap</button></div>
    </section>`;
  } else if (!missed) {
    html += `<section class="card2 next2 done rise d1"><div class="eb" style="color:var(--good)">Day complete</div><div class="meal-t">Every meal logged. That's what consistency looks like.</div></section>`;
  }
  const target = c.plan.targets.waterGlasses || 12;
  const expected = Math.max(0, Math.min(target, Math.round(target * (now - (P.hm(workStart()) - 90)) / 840)));
  if (expected - S.logs.water >= 3) html += `<section class="card" style="padding:10px 14px"><div class="row between"><span class="small"><b>Water check:</b> you're at ${S.logs.water} of about ${expected} glasses for this time of day.</span><button class="btn" data-water-add ${ed ? "" : "disabled"}>+1 glass</button></div></section>`;
  return html;
}

function mealList(c) {
  const meals = P.mealsFor(c.plan, c.di), now = P.nowMinutes(), ed = editable();
  const nowMeal = isToday() ? meals.find(m => !S.logs.meals[m.id] && P.mealTime(c.plan, m, workStart()) >= now - 30) : null;
  return `<section class="card2 mlist rise d2" aria-label="Meals">
    <h2>${isToday() ? "Today's meals" : P.DAY_NAMES[c.di] + "'s meals"}</h2>
    ${meals.map(m => {
      const it = itemOf(c, m), done = !!S.logs.meals[m.id];
      const opts = P.mealOptions(c.plan, m, { di: c.di, basedOnProtein: basedOnProtein(c, m) });
      const tags = [];
      if (it.quick) tags.push('<span class="tag warn">Quick</span>');
      else if (c.veg && (m.veg || (m.smart && m.smart.proteinVeg))) tags.push('<span class="tag teal">Veg</span>');
      if (m.trainingOnly) tags.push('<span class="tag gold">Training</span>');
      if (m.optional) tags.push('<span class="tag">Optional</span>');
      if (!it.quick && it.index > 0) tags.push('<span class="tag">Swapped</span>');
      const reason = m === nowMeal ? null : P.smartReason(c.plan, m, { di: c.di, basedOnProtein: basedOnProtein(c, m) }, it.quick);
      return `<div class="mrow ${done ? "done" : ""} ${m === nowMeal ? "now" : ""} ${S.pop === m.id ? "pop" : ""}">
        <button class="tick2" data-tick="${esc(m.id)}" aria-label="${done ? "Undo " : "Mark "}${esc(m.name)}${done ? "" : " as eaten"}" aria-pressed="${done}" ${ed ? "" : "disabled"}>${TICK}</button>
        <div class="mb">
          <div class="mn">${esc(m.name)} ${tags.join("")}</div>
          <div class="mi">${esc(it.text)}</div>
          ${reason ? `<div class="mr">${esc(reason)}</div>` : ""}
          ${!done && !it.quick && opts.length > 1 && m !== nowMeal ? `<button class="swaplink" data-swap="${esc(m.id)}">Swap (${it.index + 1} of ${opts.length})</button>` : ""}
        </div>
        <div class="mt num"><b>${P.fmtTime(P.mealTime(c.plan, m, workStart()))}</b><span>${it.macros[0]} kcal</span></div>
      </div>`;
    }).join("")}
  </section>`;
}

function viewToday(c) {
  const crazy = crazyOn(), ed = editable();
  const glasses = c.plan.targets.waterGlasses || 12;
  return `
  ${hero(c)}
  ${dayChips(c)}
  ${nextCard(c)}
  ${mealList(c)}
  <section class="card2 rise d3" style="padding:16px">
    <div class="row between"><h2 style="font-size:17px">Water</h2><span class="num small"><b>${(S.logs.water * 250).toLocaleString("en-IN")} ml</b> / ${(glasses * 250).toLocaleString("en-IN")} ml</span></div>
    <div class="glasses">${Array.from({ length: glasses }, (_, i) => `<button class="glass ${i < S.logs.water ? "full" : ""}" data-glass="${i}" aria-label="Glass ${i + 1}" ${ed ? "" : "disabled"}></button>`).join("")}</div>
    <p class="small muted" style="margin:10px 0 0">Tap a glass to log 250 ml.</p>
  </section>
  <section class="card2 toggle rise d3" style="padding:16px">
    <div><b>Crazy day?</b><div class="small muted">Back-to-back meetings or a deadline. Switches meals to quick backups that still hit your protein.</div></div>
    <button class="sw" role="switch" aria-checked="${crazy}" aria-label="Crazy day mode" id="crazy" ${S.view > S.today || !ed ? "disabled" : ""}></button>
  </section>
  ${c.plan.coachNote ? `<section class="card note rise d4"><div class="row">${lion(30)}<div class="eyebrow">Note from Sherni</div></div><p>${esc(c.plan.coachNote)}</p></section>` : ""}
  ${(c.plan.snacks || []).length ? `<section class="card2 rise d4" style="padding:16px"><div class="row between"><h2 style="font-size:17px">Hungry between meals?</h2><button class="btn" id="hungry">Show my snacks</button></div></section>` : ""}
  ${checkerCard(c)}`;
}
function checkerCard(c) {
  return `<section class="card" id="checker">
    <h2>Can I eat this?</h2>
    <p class="small muted" style="margin:4px 0 10px">Type what's in front of you: canteen, order-in, office party.</p>
    <input class="inp" id="food" placeholder="e.g. samosa, biryani, cold coffee" value="${esc(S.food)}" autocomplete="off">
    <div class="quick">${["Samosa", "Biryani", "Cold coffee", "Paneer tikka", "Beer", "Dosa"].map(f => `<button data-food="${f}">${f}</button>`).join("")}</div>
    <div id="verdict">${verdictHTML(c, S.food)}</div>
  </section>`;
}
function verdictHTML(c, q) {
  const r = P.checkFood(c.plan, q);
  if (!r) return "";
  if (r.verdict === "unknown") return `<div class="verdict a"><div class="vh">Not in my list yet</div>Tap <b>Ask ${esc(CONFIG.COACH_NAME)}</b> and she'll tell you how it fits your plan.</div>`;
  const cls = { go: "g", tweak: "a", swap: "r" }[r.verdict] || "a";
  const lab = { go: "Go for it", tweak: "Okay, with a tweak", swap: "Better to swap" }[r.verdict] || "Okay, with a tweak";
  return `<div class="verdict ${cls}"><div class="vh">${lab}</div>${esc(r.note)}${r.swap ? `<div style="margin-top:4px"><b>Try instead:</b> ${esc(r.swap)}</div>` : ""}</div>`;
}

/* ---------------- Workout ---------------- */
function viewWorkout(c) {
  if (!c.train) {
    return `${dayChips(c)}
    <section class="card"><div class="eyebrow">${P.DAY_NAMES[c.di]}</div><h2 style="margin-top:4px">${P.activeNote(c.plan, c.di) && /rest/i.test(P.activeNote(c.plan, c.di)) ? "Rest day" : "Active recovery"}</h2>
      <p style="margin:8px 0 0">${esc(P.activeNote(c.plan, c.di) || "Keep moving: a 30-minute walk is perfect today.")}</p>
      <p class="small muted" style="margin:8px 0 0">Your strength days: ${Object.keys(c.plan.trainingDays || {}).map(k => P.DAY_NAMES[P.DAY_KEYS.indexOf(k)]).join(", ") || "none"}.</p></section>
    <section class="card"><h2>Desk mobility (5 min)</h2><ul class="list"><li>Neck side stretch: 20 sec each side</li><li>Seated thoracic twist: 10 each side</li><li>Standing hip flexor stretch: 30 sec each side</li><li>Wrist circles + prayer stretch: 30 sec</li></ul></section>`;
  }
  const w = c.plan.workouts[c.train];
  const wl = S.logs.workout || { done_sets: {}, weights: {}, completed: false };
  const sets = wl.done_sets || {}, weights = wl.weights || {};
  const setsOf = e => { const m = /^(\d+)\s*[×x]/.exec(P.rxFor(e, c.wip)); return m ? Math.min(6, +m[1]) : 3; };
  const total = w.main.reduce((a, e) => a + setsOf(e), 0), doneN = Object.values(sets).filter(Boolean).length;
  const video = e => e.video || ("https://www.youtube.com/results?search_query=" + encodeURIComponent(e.name + " proper form"));
  const ed = editable();
  return `${dayChips(c)}
  <section class="card">
    <div class="eyebrow">Week ${c.progWeek} · ${P.DAY_NAMES[c.di]}</div>
    <h2 style="margin-top:4px;font-size:21px">${esc(w.title)}</h2>
    <p class="small muted" style="margin:4px 0 10px">${esc(w.where || "")}</p>
    <div class="bar"><i style="width:${Math.round(doneN / total * 100)}%"></i></div>
    <div class="small muted num" style="margin-top:6px">${doneN} of ${total} sets done</div>
  </section>
  ${(w.warmup || []).length ? `<section class="card"><h2>Warm-up</h2><ul class="list">${w.warmup.map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
  <section class="card"><h2>Main workout</h2>
    ${w.main.map((e, i) => {
      const nx = P.nextRx(e, c.wip);
      return `<div class="ex">
      <div class="ex-h"><div style="min-width:0"><div class="ex-n">${esc(e.name)}</div><a class="link" href="${esc(video(e))}" target="_blank" rel="noopener">Watch form video</a></div><div class="ex-rx num">${esc(P.rxFor(e, c.wip))}</div></div>
      <div class="sets">${Array.from({ length: setsOf(e) }, (_, s) => `<button class="set ${sets[i + "-" + s] ? "on" : ""}" data-set="${i}-${s}" aria-label="${esc(e.name)} set ${s + 1}" ${ed ? "" : "disabled"}>${sets[i + "-" + s] ? "✓" : s + 1}</button>`).join("")}
        ${e.weighted ? `<input class="kg num" id="kg-${i}" data-kg="${esc(e.name)}" inputmode="decimal" placeholder="kg used" value="${esc(weights[e.name] || "")}" aria-label="Weight used for ${esc(e.name)}" ${ed ? "" : "disabled"}>` : ""}</div>
      ${nx ? `<div class="nextwk">Next week: ${esc(nx)}</div>` : ""}</div>`;
    }).join("")}
  </section>
  ${(w.cooldown || []).length ? `<section class="card"><h2>Cool-down</h2><ul class="list">${w.cooldown.map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
  <button class="btn gold block" id="finishWo" ${ed ? "" : "disabled"}>${wl.completed ? "✓ Workout logged" : "Finish & log workout"}</button>
  <p class="small muted" style="margin:0">Breathe through every rep. If something hurts in a joint or your back, stop that exercise and tell ${esc(CONFIG.COACH_NAME)}.</p>`;
}

/* ---------------- Check-in ---------------- */
function computeStreak() {
  if (!S.hist) return 0;
  const days = new Set([...S.hist.meals.map(r => r.day), ...S.hist.checkins.map(r => r.day)]);
  Object.keys(S.logs.meals).length && S.view === S.today && days.add(S.today);
  let d = days.has(S.today) ? S.today : P.addDays(S.today, -1), n = 0;
  while (days.has(d)) { n++; d = P.addDays(d, -1); }
  return n;
}
function stats() {
  const h = S.hist; if (!h) return null;
  let expected = 0, logged = 0;
  for (let i = 1; i <= 7; i++) {
    const d = P.addDays(S.today, -i); if (d < S.me.start_date) break;
    const cc = ctxFor(d); if (!cc) continue;
    const ms = P.mealsFor(cc.plan, cc.di).filter(m => !m.optional);
    expected += ms.length; logged += h.meals.filter(r => r.day === d && ms.some(m => m.id === r.meal_id)).length;
  }
  let trainDays = 0;
  for (let d = S.me.start_date; d < S.today; d = P.addDays(d, 1)) { const cc = ctxFor(d); if (cc && cc.train) trainDays++; }
  const done = h.workouts.filter(r => r.completed && r.day < S.today).length;
  // weekly averages by program week
  const weeks = {};
  h.checkins.forEach(r => { const w = P.programWeek(S.me.start_date, r.day); if (w < 1) return; (weeks[w] = weeks[w] || { e: [], s: [] }); if (r.energy) weeks[w].e.push(+r.energy); if (r.sleep_hours) weeks[w].s.push(+r.sleep_hours); });
  const ks = Object.keys(weeks).map(Number).sort((a, b) => a - b).slice(-6);
  const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
  return {
    streak: computeStreak(), mealsPct: expected ? Math.round(logged / expected * 100) : null, workouts: `${done}/${trainDays}`,
    energy: ks.map(k => ({ label: "Wk " + k, v: avg(weeks[k].e) })).filter(x => x.v != null),
    sleep: ks.map(k => ({ label: "Wk " + k, v: avg(weeks[k].s) })).filter(x => x.v != null)
  };
}
function viewCheckin(c) {
  const ci = S.logs.checkin || {}, ed = editable() && S.view <= S.today;
  const st = stats();
  const myTeam = S.me.team;
  return `${dayChips(c)}
  <section class="card stack">
    <div><h2>30-second check-in</h2><p class="small muted" style="margin:4px 0 0">Do it any time before bed. ${esc(CONFIG.COACH_NAME)} reads these every evening.</p></div>
    <div class="field"><label>Energy ${isToday() ? "today" : "that day"}</label><div class="scale">${[1, 2, 3, 4, 5].map(n => `<button data-ci="energy" data-v="${n}" class="${ci.energy == n ? "on" : ""}" ${ed ? "" : "disabled"}>${n}</button>`).join("")}</div>
      <div class="row between small muted" style="margin-top:4px"><span>Drained</span><span>Full of energy</span></div></div>
    <div class="field"><label>Afternoon slump?</label><div class="seg"><button data-ci="slump" data-v="true" class="${ci.slump === true ? "on" : ""}" ${ed ? "" : "disabled"}>Yes, hit hard</button><button data-ci="slump" data-v="false" class="${ci.slump === false ? "on" : ""}" ${ed ? "" : "disabled"}>No, felt steady</button></div></div>
    <div class="field"><label for="sleep">Sleep last night: <b class="num" id="sleepv">${ci.sleep_hours != null ? +ci.sleep_hours : 7} hrs</b></label><input type="range" id="sleep" min="3" max="10" step="0.5" value="${ci.sleep_hours != null ? +ci.sleep_hours : 7}" style="width:100%;accent-color:var(--teal)" ${ed ? "" : "disabled"}></div>
    <div class="field"><label for="steps">Steps</label><input class="inp num" id="steps" inputmode="numeric" placeholder="e.g. 7500" value="${ci.steps != null ? ci.steps : ""}" style="margin-top:6px" ${ed ? "" : "disabled"}></div>
    <div class="field"><label for="note">Anything ${esc(CONFIG.COACH_NAME)} should know? <span class="muted">(optional)</span></label><input class="inp" id="note" maxlength="300" placeholder="e.g. travelling Thursday, knee felt sore" value="${esc(ci.note || "")}" style="margin-top:6px" ${ed ? "" : "disabled"}></div>
    <button class="btn primary block" id="saveCi" ${ed ? "" : "disabled"}>${S.logs.checkin && !S.logs.checkin._draft ? "✓ Saved. Update check-in" : "Save check-in"}</button>
  </section>
  <section class="card">
    <h2>Your progress</h2>
    ${st ? `<div class="stats" style="margin-top:10px">
      <div class="stat"><b class="num">${st.streak}</b><span>day streak</span></div>
      <div class="stat"><b class="num">${st.mealsPct != null ? st.mealsPct + "%" : "–"}</b><span>meals logged, last 7 days</span></div>
      <div class="stat"><b class="num">${st.workouts}</b><span>workouts done</span></div>
    </div>
    ${st.energy.length >= 2 ? lineChart("Average energy (1–5)", st.energy, 1, 5, [1, 2, 3, 4, 5]) : `<p class="small muted" style="margin:12px 0 0">Your energy and sleep charts appear after two weeks of check-ins.</p>`}
    ${st.sleep.length >= 2 ? lineChart("Average sleep (hrs)", st.sleep, 4, 9, [4, 5, 6, 7, 8, 9]) : ""}` : `<div class="empty">Loading…</div>`}
  </section>
  ${myTeam && S.board && S.board.length ? `<section class="card">
    <div class="row between"><h2>Team challenge</h2><span class="tag gold">This week</span></div>
    <p class="small muted" style="margin:4px 0 0">Habit points only: meals logged (1), check-ins (2), water goal (2), workouts (3). No weights, ever.</p>
    <div class="lb">${S.board.map((r, i) => `<div class="lb-r ${r.team === myTeam ? "me" : ""}"><span class="num">${i + 1}</span><span>${esc(r.team)}${r.team === myTeam ? " (your team)" : ""}</span><span class="num">${r.points} pts</span></div>`).join("")}</div>
  </section>` : ""}`;
}

/* ---------------- My plan ---------------- */
function viewPlan(c) {
  const T = c.plan.targets, next = P.nextPlan(S.plans, S.today);
  return `
  <section class="card note"><div class="row">${lion(30)}<div><div class="eyebrow">Phase ${c.plan.phase} · Weeks ${(c.plan.weeks || []).join("–")}</div><h2>${esc(c.plan.phaseName || "Your plan")}</h2></div></div>${c.plan.coachNote ? `<p>${esc(c.plan.coachNote)}</p>` : ""}
    ${next ? `<p class="small muted" style="margin-top:8px">Phase ${next.phase} starts on ${new Date(next.starts_on).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}. Your dashboard switches over on its own.</p>` : ""}</section>
  <section class="card"><h2>Daily targets</h2>
    <table class="tbl num" style="margin-top:6px"><tbody>
      <tr><td>Calories</td><td>${T.kcal.toLocaleString("en-IN")} kcal</td></tr><tr><td>Protein</td><td>${T.protein} g</td></tr>
      <tr><td>Carbs</td><td>${T.carbs} g</td></tr><tr><td>Fat</td><td>${T.fat} g</td></tr><tr><td>Fibre</td><td>${T.fibre}+ g</td></tr><tr><td>Water</td><td>${((T.waterGlasses || 12) * 0.25).toFixed(1).replace(".0", "")} L</td></tr>
    </tbody></table></section>
  <section class="card"><h2>Your week</h2>
    <table class="tbl" style="margin-top:6px"><tbody>${P.DAY_NAMES.map((d, i) => { const t = P.trainingType(c.plan, i); return `<tr><td>${d}${P.isVegDay(c.plan, i) ? ' <span class="tag teal">Veg</span>' : ""}</td><td style="font-weight:600">${t ? esc(c.plan.workouts[t].title.split(" · ")[0]) : esc((P.activeNote(c.plan, i) || "Active day").split(/[,.]/)[0])}</td></tr>`; }).join("")}</tbody></table></section>
  ${(c.plan.enjoy || []).length || (c.plan.limit || []).length ? `<section class="card">${(c.plan.enjoy || []).length ? `<h2>Enjoy freely</h2><div class="foods">${c.plan.enjoy.map(f => `<span class="tag teal">${esc(f)}</span>`).join("")}</div>` : ""}
    ${(c.plan.limit || []).length ? `<h2 style="margin-top:14px">Keep occasional</h2><div class="foods">${c.plan.limit.map(f => `<span class="tag warn">${esc(f)}</span>`).join("")}</div>` : ""}</section>` : ""}
  ${checkerCard(c)}`;
}

/* ---------------- Reminders ---------------- */
function planEnd(c) { return P.addDays(S.me.start_date, ((c.plan.weeks || [1, 4])[1]) * 7 - 1); }
function viewMe(c) {
  const meals = P.mealsFor(c.plan, P.dayIndex(S.today));
  const wt = P.workoutTime(c.plan, workStart());
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return `
  <section class="card stack">
    <h2>When does your workday start?</h2>
    <p class="small muted" style="margin:0">Every meal time and reminder moves with this, so the plan fits your real day.</p>
    <div class="row"><input type="time" id="start" class="inp num" value="${workStart()}" style="max-width:160px"><span class="small muted">Breakfast lands at ${P.fmtTime(P.mealTime(c.plan, meals[0], workStart()))}</span></div>
  </section>
  <section class="card">
    <h2>Phone calendar reminders</h2>
    <p class="small muted" style="margin:4px 0 8px">Adds your plan to your phone's calendar until the end of this phase. Your phone then reminds you 15 minutes before each meal${wt != null ? " and workout" : ""}. Use your personal calendar, not your work one.</p>
    <div>${meals.map(m => `<div class="ev"><b>${P.fmtTime(P.mealTime(c.plan, m, workStart()) - 15)}</b><span>${esc(m.name)} in 15 min</span></div>`).join("")}
      ${wt != null && P.trainingType(c.plan, P.dayIndex(S.today)) ? `<div class="ev"><b>${P.fmtTime(wt - 15)}</b><span>Workout in 15 min</span></div>` : ""}</div>
    <button class="btn primary block" id="cal" style="margin-top:12px">Add my plan to my calendar</button>
    <p class="small muted" style="margin:8px 0 0">${ios ? "On iPhone: tap the button, then “Add All”." : "On Android: tap the button, open the downloaded file and choose your calendar."} If your workday time or plan changes, add it again.</p>
  </section>
  <section class="card">
    <h2>Make it feel like an app</h2>
    <p class="small muted" style="margin:4px 0 4px">Add this site to your home screen for an app icon and one-tap access.</p>
    <div class="small"><b>iPhone (Safari):</b><ol class="steps"><li>Tap the Share button</li><li>Choose “Add to Home Screen”</li></ol>
    <b>Android (Chrome):</b><ol class="steps"><li>Tap the ⋮ menu</li><li>Choose “Add to Home screen” or “Install app”</li></ol></div>
  </section>
  <div class="lock"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex:none;color:var(--teal)" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
    <span>Only you and your coach can see your plan, meals and check-ins. Your employer receives group totals from at least 5 people, never anything about you individually.</span></div>
  <button class="btn block" id="logout">Log out</button>`;
}

function waMessage() {
  const ctx = { today: "today's meals", workout: "today's workout", checkin: "my progress", plan: "my plan", me: "my reminders" }[S.tab];
  return `Hi ${CONFIG.COACH_NAME}, it's ${S.me ? S.me.full_name : ""} from the ${CONFIG.COMPANY} program. I have a question about ${ctx}: `;
}

/* ---------------- actions ---------------- */
async function guarded(fn, undo) {
  try { await fn(); }
  catch (e) { if (undo) undo(); rerender(); toast("Couldn't save. Check your connection and try again."); console.error(e); }
}
function bind() {
  const c = ctxFor(S.view);
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { if (b.dataset.tab === "today" && S.tab !== "today") S.didAnim = false; S.tab = b.dataset.tab; local.set("tab", S.tab); render(); window.scrollTo(0, 0); if (S.tab === "checkin") loadExtras(); });
  document.querySelectorAll("[data-day]").forEach(b => b.onclick = async () => { S.view = b.dataset.day; await loadDay(); rerender(); });
  const lo = $("#logout"); if (lo) lo.onclick = async () => { await api.logout(); S.me = null; renderLogin(); };
  if (!c) return;

  document.querySelectorAll("[data-tick]").forEach(b => b.onclick = () => {
    const m = c.plan.meals.find(x => x.id === b.dataset.tick); if (!m) return;
    const prev = S.logs.meals[m.id];
    if (prev) {
      delete S.logs.meals[m.id]; rerender();
      guarded(() => api.setMeal(S.me.id, S.view, m.id, null), () => S.logs.meals[m.id] = prev);
    } else {
      const it = itemOf(c, m);
      S.pop = m.id;
      const entry = { option_index: it.index, quick: it.quick, item: it.text, kcal: it.macros[0], protein: it.macros[1], carbs: it.macros[2], fat: it.macros[3], fibre: it.macros[4] };
      S.logs.meals[m.id] = { meal_id: m.id, ...entry }; rerender();
      guarded(() => api.setMeal(S.me.id, S.view, m.id, entry), () => delete S.logs.meals[m.id]);
      const dependent = c.plan.meals.find(x => x.smart && x.smart.basedOn === m.id);
      if (dependent && !it.quick) notify(`${dependent.name} updated`, P.smartReason(c.plan, dependent, { di: c.di, basedOnProtein: it.macros[1] }, false));
    }
  });
  document.querySelectorAll("[data-swap]").forEach(b => b.onclick = () => { const sw = swaps(); sw[b.dataset.swap] = (sw[b.dataset.swap] || 0) + 1; local.set("swaps-" + S.view, sw); rerender(); });
  document.querySelectorAll("[data-backup]").forEach(b => b.onclick = () => {
    const m = c.plan.meals.find(x => x.id === b.dataset.backup); const q = m.quick;
    const entry = { option_index: 0, quick: true, item: q.text, kcal: q.macros[0], protein: q.macros[1], carbs: q.macros[2], fat: q.macros[3], fibre: q.macros[4] };
    S.logs.meals[m.id] = { meal_id: m.id, ...entry }; rerender(); notify("Logged", "Backup counts. The streak lives on.");
    guarded(() => api.setMeal(S.me.id, S.view, m.id, entry), () => delete S.logs.meals[m.id]);
  });
  const setWater = n => { const prev = S.logs.water; S.logs.water = n; rerender(); guarded(() => api.setWater(S.me.id, S.view, n), () => S.logs.water = prev); if (n === (c.plan.targets.waterGlasses || 12)) notify("Water goal done!", "Hydration target hit for today."); };
  document.querySelectorAll("[data-glass]").forEach(b => b.onclick = () => { const i = +b.dataset.glass; setWater(i < S.logs.water ? i : i + 1); });
  const wa = $("[data-water-add]"); if (wa) wa.onclick = () => setWater(Math.min(c.plan.targets.waterGlasses || 12, S.logs.water + 1));
  const cz = $("#crazy"); if (cz) cz.onclick = () => { const on = !crazyOn(); local.set("crazy-" + S.view, on); rerender(); if (on) notify("Crazy-day mode on", "Every meal you haven't logged is now a 2-minute backup. You've got this."); };
  const h = $("#hungry"); if (h) h.onclick = () => sheet(`<h3>Your approved snacks</h3><p class="small muted" style="margin:4px 0 6px">Pick one. Have a glass of water first: sometimes it's thirst.</p>${c.plan.snacks.map(s => `<div class="opt"><span>${esc(s.text)}</span><span class="small muted num" style="white-space:nowrap">${esc(s.info || "")}</span></div>`).join("")}`);
  const f = $("#food"); if (f) f.oninput = () => { S.food = f.value; $("#verdict").innerHTML = verdictHTML(c, f.value); };
  document.querySelectorAll("[data-food]").forEach(b => b.onclick = () => { S.food = b.dataset.food; $("#food").value = S.food; $("#verdict").innerHTML = verdictHTML(c, S.food); });

  // workout
  const saveWo = (patch) => {
    const cur = S.logs.workout || { done_sets: {}, weights: {}, completed: false };
    const next = { workout: c.train, done_sets: cur.done_sets || {}, weights: cur.weights || {}, completed: !!cur.completed, ...patch };
    const prev = S.logs.workout; S.logs.workout = next;
    return guarded(() => api.saveWorkout(S.me.id, S.view, next), () => S.logs.workout = prev);
  };
  document.querySelectorAll("[data-set]").forEach(b => b.onclick = () => { const ds = { ...((S.logs.workout || {}).done_sets || {}) }; ds[b.dataset.set] = !ds[b.dataset.set]; saveWo({ done_sets: ds }); rerender(); });
  document.querySelectorAll("[data-kg]").forEach(i => i.onchange = () => { const ws = { ...((S.logs.workout || {}).weights || {}) }; ws[i.dataset.kg] = i.value.trim(); saveWo({ weights: ws }); });
  const fw = $("#finishWo"); if (fw) fw.onclick = () => { saveWo({ completed: true }); rerender(); notify("Workout logged", `${CONFIG.COACH_NAME} will see your weights in her review. Strong work.`); };

  // check-in
  const ciDraft = () => ({ ...(S.logs.checkin || {}) });
  document.querySelectorAll("[data-ci]").forEach(b => b.onclick = () => { const d = ciDraft(); d[b.dataset.ci] = b.dataset.ci === "energy" ? +b.dataset.v : b.dataset.v === "true"; S.logs.checkin = { ...d, _draft: true }; rerender(); });
  const draftSet = (k, v) => { S.logs.checkin = { ...(S.logs.checkin || {}), [k]: v, _draft: true }; };
  const sl = $("#sleep"); if (sl) sl.oninput = () => { $("#sleepv").textContent = sl.value + " hrs"; draftSet("sleep_hours", parseFloat(sl.value)); };
  const stp = $("#steps"); if (stp) stp.oninput = () => draftSet("steps", stp.value);
  const nt = $("#note"); if (nt) nt.oninput = () => draftSet("note", nt.value);
  const sc = $("#saveCi"); if (sc) sc.onclick = () => {
    const d = ciDraft();
    const steps = parseInt(($("#steps").value || "").replace(/[^\d]/g, ""), 10);
    const row = { energy: d.energy || null, slump: d.slump == null ? null : d.slump, sleep_hours: parseFloat($("#sleep").value), steps: isNaN(steps) ? null : Math.min(steps, 100000), note: $("#note").value.trim() || null };
    if (!row.energy) { toast("Pick your energy level first."); return; }
    const prev = S.logs.checkin; S.logs.checkin = row;
    guarded(async () => { await api.saveCheckin(S.me.id, S.view, row); notify("Check-in saved", S.me.team ? `+2 habit points for ${S.me.team}.` : "Thanks! Your coach will see it tonight."); await loadExtras(); rerender(); }, () => S.logs.checkin = prev);
  };

  // reminders
  const stt = $("#start"); if (stt) stt.onchange = () => { if (!stt.value) return; const prev = S.me.workday_start; S.me.workday_start = stt.value; rerender(); guarded(() => api.setWorkdayStart(S.me.id, stt.value), () => S.me.workday_start = prev); notify("Schedule updated", "Your meal times moved with your new start time. Re-add the calendar if you use it."); };
  const cal = $("#cal"); if (cal) cal.onclick = () => {
    const ics = buildICS(c.plan, { fromDate: S.today, untilDate: planEnd(c), workdayStart: workStart(), name: firstName() });
    downloadICS(ics, `sherni-plan-phase-${c.plan.phase}.ics`);
  };
}

/* ---------------- live clock: reminders while the site is open ---------------- */
setInterval(() => {
  if (!S.me) return;
  if (P.todayISO() !== S.today) { loadAll(); return; } // new day
  const now = P.nowMinutes(), c = ctxFor(S.today);
  if (c && isToday()) {
    const fired = P.mealsFor(c.plan, c.di).find(m => { const r = P.mealTime(c.plan, m, workStart()) - 15; return r > S.lastTick && r <= now && !S.logs.meals[m.id]; });
    if (fired) notify(`${fired.name} in 15 min`, itemOf(c, fired).text);
  }
  S.lastTick = now;
  if (S.tab === "today" && isToday()) rerender();
}, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.me) loadAll().catch(() => {}); });

boot();
