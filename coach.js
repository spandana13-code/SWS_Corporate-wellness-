import { CONFIG, DEMO } from "./config.js";
import { coachApi as api, prettyCode, resetDemo } from "./api.js";
import * as P from "./plan.js";
import { lion, IC, esc, notify, toast, sheet, closeSheet, waLink } from "./ui.js";

document.body.classList.add("c-sheet");
const $ = s => document.querySelector(s);
const S = { me: null, tab: "people", people: [], act: null, today: P.todayISO(), upload: { pid: "", text: "", parsed: null, check: null, starts: "" } };

/* ---------------- boot & login ---------------- */
async function boot() {
  try { S.me = await api.me(); } catch (e) { S.me = null; }
  if (!S.me) return renderLogin();
  await refresh();
}
async function refresh() {
  S.today = P.todayISO();
  S.people = await api.participants();
  const from = S.people.reduce((m, p) => p.start_date < m ? p.start_date : m, P.addDays(S.today, -21));
  S.act = await api.activity(P.addDays(from, -1));
  render();
}
function renderLogin(err) {
  $("#root").innerHTML = `
  ${DEMO ? `<div class="demo-strip"><b>Demo mode.</b> Any email, password <b>demo</b></div>` : ""}
  <main class="login coach">
    <div class="login-mark">${lion(56)}<div><div class="eyebrow">Strong With Sherni</div><div class="tagline">Coach panel</div></div></div>
    <form id="lf" class="stack">
      <label class="small muted" for="em">Email</label><input id="em" class="inp" type="email" autocomplete="username" required>
      <label class="small muted" for="pw">Password</label><input id="pw" class="inp" type="password" autocomplete="current-password" required>
      ${err ? `<p class="err" role="alert">${esc(err)}</p>` : ""}
      <button class="btn primary block" id="lbtn" type="submit">Log in</button>
    </form>
  </main>`;
  $("#lf").addEventListener("submit", async e => {
    e.preventDefault(); $("#lbtn").disabled = true;
    try { S.me = await api.login($("#em").value.trim(), $("#pw").value); await refresh(); }
    catch (er) { renderLogin(er.message || "Couldn't log in."); }
  });
}

/* ---------------- metrics ---------------- */
function plansOf(pid) { return (S.act.plans || []).filter(p => p.participant_id === pid); }
function ctx(p, iso) {
  const ap = P.activePlan(plansOf(p.id), iso); if (!ap) return null;
  return { plan: ap.data, di: P.dayIndex(iso), ap };
}
function rows(table, pid) { return (S.act[table] || []).filter(r => r.participant_id === pid); }
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function metrics(p) {
  const meals = rows("meals", p.id), cis = rows("checkins", p.id), wos = rows("workouts", p.id), water = rows("water", p.id).filter(r => r.glasses > 0);
  const days = [...meals, ...cis, ...wos, ...water].map(r => r.day).sort();
  const lastActive = days.length ? days[days.length - 1] : null;
  let expected = 0, logged = 0, trainExp = 0, trainDone = 0;
  for (let i = 1; i <= 7; i++) {
    const d = P.addDays(S.today, -i); if (d < p.start_date) break;
    const c = ctx(p, d); if (!c) continue;
    const ms = P.mealsFor(c.plan, c.di).filter(m => !m.optional);
    expected += ms.length; logged += meals.filter(r => r.day === d && ms.some(m => m.id === r.meal_id)).length;
    if (P.trainingType(c.plan, c.di)) { trainExp++; if (wos.some(w => w.day === d && w.completed)) trainDone++; }
  }
  const last7 = cis.filter(r => r.day >= P.addDays(S.today, -7));
  const e7 = avg(last7.filter(r => r.energy).map(r => +r.energy));
  const s7 = avg(last7.filter(r => r.sleep_hours).map(r => +r.sleep_hours));
  const notes = cis.filter(r => r.note && r.day >= P.addDays(S.today, -3)).sort((a, b) => b.day.localeCompare(a.day));
  const c = ctx(p, S.today);
  const flags = [];
  if (!p.active) flags.push(["mute", "Inactive"]);
  else {
    if (!c) flags.push(["bad", P.nextPlan(plansOf(p.id), S.today) ? "Plan starts later" : "No plan"]);
    if (!lastActive) flags.push(["mute", "Not started"]);
    else if (P.daysBetween(lastActive, S.today) >= 3) flags.push(["warn", `Quiet ${P.daysBetween(lastActive, S.today)} days`]);
    if (expected >= 7 && logged / expected < 0.5) flags.push(["warn", "Meals under 50%"]);
    if (e7 != null && e7 <= 2.5) flags.push(["warn", "Low energy"]);
    if (notes.length) flags.push(["ok", "New note"]);
  }
  return {
    week: P.programWeek(p.start_date, S.today), phase: c ? c.plan.phase : null, lastActive,
    mealsPct: expected ? Math.round(logged / expected * 100) : null, train: `${trainDone}/${trainExp}`,
    e7: e7 != null ? e7.toFixed(1) : null, s7: s7 != null ? s7.toFixed(1) : null, notes, flags
  };
}
const rel = d => { if (!d) return "Never"; const n = P.daysBetween(d, S.today); return n === 0 ? "Today" : n === 1 ? "Yesterday" : `${n} days ago`; };
const fmtDate = iso => P.fromISO(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/* ---------------- shell ---------------- */
function render() {
  const views = { people: viewPeople, upload: viewUpload, report: viewReport };
  $("#root").innerHTML = `
  ${DEMO ? `<div class="demo-strip"><b>Demo mode</b> · sample people saved in this browser only · <button class="link" id="resetDemo" style="background:none;border:none;padding:0;text-decoration:underline">Reset demo</button></div>` : ""}
  <header class="c-top"><div class="c-top-in">${lion(38)}<div><h1>Coach panel</h1><div class="sub">${esc(CONFIG.COMPANY)} · ${esc(CONFIG.PROGRAM_NAME)}</div></div>
    <nav class="c-tabs" aria-label="Sections">${[["people", "Participants", IC.people], ["upload", "Upload plan", IC.upload], ["report", "Group report", IC.report]].map(([k, l, ic]) => `<button data-tab="${k}" class="${S.tab === k ? "on" : ""}">${ic}${l}</button>`).join("")}
      <button id="logout">Log out</button></nav></div></header>
  <div class="c-app"><div class="c-body">${views[S.tab]()}</div></div>`;
  bind();
}

/* ---------------- participants ---------------- */
function viewPeople() {
  const ms = S.people.map(p => [p, metrics(p)]);
  const act = ms.filter(([p]) => p.active);
  const activeWeek = act.filter(([, m]) => m.lastActive && P.daysBetween(m.lastActive, S.today) <= 6).length;
  const needs = act.filter(([, m]) => m.flags.some(f => f[0] === "warn" || f[0] === "bad")).length;
  const pcts = act.map(([, m]) => m.mealsPct).filter(v => v != null);
  return `
  <div class="kpis">
    <div class="kpi"><b class="num">${act.length}</b><span>participants</span></div>
    <div class="kpi"><b class="num">${activeWeek}</b><span>active in the last 7 days</span></div>
    <div class="kpi"><b class="num">${pcts.length ? Math.round(avg(pcts)) + "%" : "–"}</b><span>average meals logged, last 7 days</span></div>
    <div class="kpi"><b class="num">${needs}</b><span>need attention</span></div>
  </div>
  <div class="row between" style="flex-wrap:wrap;gap:10px"><h2 style="font-size:20px">Participants</h2>
    <div class="btns"><button class="btn" id="reload">Refresh</button><button class="btn primary" id="addP">+ Add participant</button></div></div>
  ${S.people.length ? `<div class="tbl-wrap"><table class="ptbl">
    <thead><tr><th>Name</th><th>Week</th><th>Plan</th><th>Last active</th><th>Meals (7d)</th><th>Workouts (7d)</th><th>Energy</th><th>Sleep</th><th>Flags</th></tr></thead>
    <tbody>${ms.sort((a, b) => (b[0].active - a[0].active) || (b[1].flags.length - a[1].flags.length) || a[0].full_name.localeCompare(b[0].full_name)).map(([p, m]) => `
      <tr class="click" data-pid="${p.id}" tabindex="0">
        <td class="nm">${esc(p.full_name)}<small>${esc(p.team || "No team")}</small></td>
        <td class="num">${m.week > 0 ? m.week : "Starts " + fmtDate(p.start_date)}</td>
        <td>${m.phase ? "Phase " + m.phase : "–"}</td>
        <td>${rel(m.lastActive)}</td>
        <td class="num">${m.mealsPct != null ? m.mealsPct + "%" : "–"}</td>
        <td class="num">${m.train}</td>
        <td class="num">${m.e7 || "–"}</td>
        <td class="num">${m.s7 ? m.s7 + "h" : "–"}</td>
        <td>${m.flags.map(f => `<span class="flag ${f[0]}">${esc(f[1])}</span>`).join("") || '<span class="flag ok">On track</span>'}</td>
      </tr>`).join("")}</tbody></table></div>` : `<div class="card empty">No participants yet. Add the first one to get their login code.</div>`}`;
}

function welcomeText(p) {
  return `Hi ${p.full_name.split(" ")[0]}, welcome to the Strong With Sherni program at ${CONFIG.COMPANY}!\n\nYour personal dashboard: ${CONFIG.SITE_URL}\nYour login code: ${prettyCode(p.access_code)}\n\nOpen the link on your phone, enter the code, and add it to your home screen. Your plan, reminders and check-ins are all there. Message me here any time with questions.\n\n${CONFIG.COACH_NAME}`;
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); }
  catch (e) { toast("Couldn't copy automatically. Select the text and copy it."); }
}

function addParticipantSheet() {
  const el = sheet(`<h3>Add participant</h3>
    <form id="pf" class="form" style="margin-top:12px">
      <label class="full">Full name<input class="inp" id="f-name" required></label>
      <label>WhatsApp number<input class="inp" id="f-phone" placeholder="+91 98765 43210" inputmode="tel"></label>
      <label>Email (optional)<input class="inp" id="f-email" type="email"></label>
      <label>Team<input class="inp" id="f-team" placeholder="e.g. Ledger Lions" list="teams"></label>
      <label>Program start date<input class="inp" id="f-start" type="date" value="${S.today}" required></label>
      <label>Workday starts at<input class="inp" id="f-work" type="time" value="09:00" required></label>
      <datalist id="teams">${[...new Set(S.people.map(p => p.team).filter(Boolean))].map(t => `<option value="${esc(t)}">`).join("")}</datalist>
      <p class="err full" id="f-err" hidden></p>
      <button class="btn primary block full" type="submit">Add and create login code</button>
    </form>`, { closeLabel: "Cancel" });
  el.querySelector("#pf").addEventListener("submit", async e => {
    e.preventDefault();
    const d = { full_name: $("#f-name").value.trim(), phone: $("#f-phone").value.trim() || null, email: $("#f-email").value.trim() || null, team: $("#f-team").value.trim() || null, start_date: $("#f-start").value, workday_start: $("#f-work").value };
    try { const p = await api.createParticipant(d); S.people.push(p); render(); closeSheet(); openPerson(p.id); notify("Participant added", `${p.full_name}'s code is ready to send.`); }
    catch (er) { const x = $("#f-err"); x.textContent = er.message; x.hidden = false; }
  });
}

async function openPerson(pid) {
  const p = S.people.find(x => x.id === pid); if (!p) return;
  const m = metrics(p);
  const plans = plansOf(pid).slice().sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const days = Array.from({ length: 14 }, (_, i) => P.addDays(S.today, -i)).filter(d => d >= p.start_date);
  const meals = rows("meals", pid), cis = rows("checkins", pid), wos = rows("workouts", pid), water = rows("water", pid);
  const recentWeights = wos.filter(w => w.weights && Object.values(w.weights).some(Boolean)).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 4);
  const el = sheet(`
    <div class="row between" style="flex-wrap:wrap;gap:8px"><div><h3>${esc(p.full_name)}</h3><div class="small muted">${esc(p.team || "No team")} · started ${fmtDate(p.start_date)} · week ${Math.max(1, m.week)}</div></div>
      <div>${m.flags.map(f => `<span class="flag ${f[0]}">${esc(f[1])}</span>`).join("")}</div></div>

    <div class="card" style="margin-top:12px">
      <div class="eyebrow">Login code</div>
      <div class="row" style="flex-wrap:wrap;gap:10px;margin-top:6px"><span class="codebox num">${esc(prettyCode(p.access_code))}</span>
        <button class="btn" id="cpCode">Copy welcome message</button>
        ${p.phone ? `<a class="btn primary" href="${waLink(welcomeText(p), p.phone)}" target="_blank" rel="noopener">${IC.wa.replace("<svg", '<svg width="16" height="16"')} Send on WhatsApp</a>` : ""}
        <button class="btn" id="rsCode">Reset code</button></div>
      <p class="small muted" style="margin:8px 0 0">Resetting makes the old code stop working and logs them out everywhere. Use it if a code was shared.</p>
    </div>

    <div class="card" style="margin-top:12px">
      <div class="row between"><h2>Plans</h2><button class="btn primary" id="upHere">Upload plan</button></div>
      ${plans.length ? `<table class="tbl" style="margin-top:6px"><tbody>${plans.map(pl => `<tr><td>Phase ${pl.phase}${pl.data.phaseName ? " · " + esc(pl.data.phaseName) : ""}<div class="small muted">from ${fmtDate(pl.starts_on)} · ${pl.data.targets.kcal} kcal · ${pl.data.targets.protein}g protein</div></td><td style="text-align:right"><span class="tag ${P.activePlan(plans, S.today) === pl ? "teal" : ""}">${P.activePlan(plans, S.today) === pl ? "Active" : pl.starts_on > S.today ? "Upcoming" : "Past"}</span> <button class="btn" data-delplan="${pl.id}" style="padding:4px 8px;font-size:12px">Delete</button></td></tr>`).join("")}</tbody></table>` : `<p class="small muted">No plan yet. Their dashboard shows "plan coming soon" until you upload one.</p>`}
    </div>

    <div class="card" style="margin-top:12px"><h2>Last 14 days</h2>
      <div class="tbl-wrap" style="margin-top:8px;border:none"><table class="ptbl mini"><thead><tr><th>Day</th><th>Meals</th><th>Water</th><th>Workout</th><th>Energy</th><th>Sleep</th><th>Slump</th><th>Note</th></tr></thead><tbody>
      ${days.map(d => { const c = ctx(p, d); const ms = c ? P.mealsFor(c.plan, c.di) : []; const ci = cis.find(r => r.day === d); const wo = wos.find(r => r.day === d); const w = water.find(r => r.day === d);
        return `<tr><td>${P.DAY_KEYS[P.dayIndex(d)]} ${fmtDate(d)}</td><td class="num">${meals.filter(r => r.day === d).length}/${ms.length || "–"}${meals.some(r => r.day === d && r.quick) ? ' <span class="flag mute">backup</span>' : ""}</td><td class="num">${w ? w.glasses : 0}</td><td>${c && P.trainingType(c.plan, c.di) ? (wo && wo.completed ? '<span class="flag ok">Done</span>' : '<span class="flag mute">Not logged</span>') : "Rest"}</td><td class="num">${ci && ci.energy ? ci.energy : "–"}</td><td class="num">${ci && ci.sleep_hours ? ci.sleep_hours + "h" : "–"}</td><td>${ci && ci.slump != null ? (ci.slump ? "Yes" : "No") : "–"}</td><td>${ci && ci.note ? esc(ci.note) : ""}</td></tr>`; }).join("") || `<tr><td colspan="8" class="muted">Their program hasn't started yet.</td></tr>`}
      </tbody></table></div></div>

    ${recentWeights.length ? `<div class="card" style="margin-top:12px"><h2>Weights logged</h2>${recentWeights.map(w => `<div class="small" style="margin-top:6px"><b>${fmtDate(w.day)}</b> · ${Object.entries(w.weights).filter(([, v]) => v).map(([k, v]) => `${esc(k)}: ${esc(v)} kg`).join(" · ")}</div>`).join("")}</div>` : ""}

    <div class="card" style="margin-top:12px"><h2>Details</h2>
      <form id="ef" class="form" style="margin-top:8px">
        <label>Full name<input class="inp" id="e-name" value="${esc(p.full_name)}"></label>
        <label>WhatsApp number<input class="inp" id="e-phone" value="${esc(p.phone || "")}"></label>
        <label>Team<input class="inp" id="e-team" value="${esc(p.team || "")}"></label>
        <label>Program start date<input class="inp" id="e-start" type="date" value="${p.start_date}"></label>
        <label>Workday starts at<input class="inp" id="e-work" type="time" value="${String(p.workday_start).slice(0, 5)}"></label>
        <label>Status<select class="inp" id="e-active"><option value="1" ${p.active ? "selected" : ""}>Active</option><option value="0" ${!p.active ? "selected" : ""}>Inactive (can't log in)</option></select></label>
        <button class="btn primary full" type="submit">Save details</button>
      </form></div>`);
  el.querySelector("#cpCode").onclick = () => copy(welcomeText(p));
  el.querySelector("#rsCode").onclick = async () => {
    const b = el.querySelector("#rsCode");
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Tap again to confirm reset"; return; }
    try { const np = await api.resetCode(pid); Object.assign(p, np); closeSheet(); render(); openPerson(pid); notify("New code created", "Send them the new welcome message."); } catch (e) { toast(e.message); }
  };
  el.querySelector("#upHere").onclick = () => { closeSheet(); S.tab = "upload"; S.upload = { pid, text: "", parsed: null, check: null, starts: "" }; render(); };
  el.querySelectorAll("[data-delplan]").forEach(b => b.onclick = async () => {
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm delete"; return; }
    try { await api.deletePlan(b.dataset.delplan); S.act.plans = S.act.plans.filter(x => x.id !== b.dataset.delplan); closeSheet(); render(); openPerson(pid); toast("Plan deleted"); } catch (e) { toast(e.message); }
  });
  el.querySelector("#ef").addEventListener("submit", async e => {
    e.preventDefault();
    const patch = { full_name: $("#e-name").value.trim(), phone: $("#e-phone").value.trim() || null, team: $("#e-team").value.trim() || null, start_date: $("#e-start").value, workday_start: $("#e-work").value, active: $("#e-active").value === "1" };
    try { Object.assign(p, await api.updateParticipant(pid, patch)); render(); toast("Saved"); } catch (er) { toast(er.message); }
  });
}

/* ---------------- upload ---------------- */
function viewUpload() {
  const U = S.upload, p = S.people.find(x => x.id === U.pid);
  const ck = U.check;
  return `
  <div class="card">
    <h2>Upload a plan</h2>
    <p class="small muted" style="margin:4px 0 12px">Use the plan file (.json) your Claude Project creates alongside each Word plan. The site checks it before saving.</p>
    <div class="form">
      <label>Participant<select class="inp" id="u-pid"><option value="">Choose…</option>${S.people.filter(x => x.active).map(x => `<option value="${x.id}" ${x.id === U.pid ? "selected" : ""}>${esc(x.full_name)}${x.team ? " · " + esc(x.team) : ""}</option>`).join("")}</select></label>
      <label>Plan file<input class="inp" id="u-file" type="file" accept=".json,application/json"></label>
      <label class="full">…or paste the plan here<textarea class="inp" id="u-text" spellcheck="false" placeholder='{"format": "sws-plan/1", ...}'>${esc(U.text)}</textarea></label>
    </div>
    <div class="btns" style="margin-top:12px"><button class="btn" id="u-check">Check plan</button><a class="link" href="sample-plan.json" target="_blank" rel="noopener" style="align-self:center">See the sample plan file</a></div>
  </div>
  ${ck ? `<div class="card">
    ${ck.errors.length ? `<h2 style="color:var(--bad)">Fix these before saving</h2><ul class="list-errors">${ck.errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : `<h2>Plan looks good</h2>`}
    ${ck.warnings.length ? `<div class="small" style="margin-top:8px"><b>Worth a look:</b><ul class="list-errors">${ck.warnings.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
    ${U.parsed && !ck.errors.length ? (() => { const s = P.planSummary(U.parsed); return `
      <table class="tbl" style="margin-top:10px"><tbody>
        <tr><td>Phase</td><td>${s.phase}${s.phaseName ? " · " + esc(s.phaseName) : ""} (weeks ${s.weeks.join("–")})</td></tr>
        <tr><td>Targets</td><td>${s.kcal} kcal · ${s.protein}g protein</td></tr>
        <tr><td>Meals / workouts</td><td>${s.meals} meals · ${s.workouts} workouts</td></tr>
        <tr><td>Veg days</td><td>${esc(s.vegDays)}</td></tr><tr><td>Training days</td><td>${esc(s.trainingDays)}</td></tr>
      </tbody></table>
      <div class="form" style="margin-top:12px"><label>Plan starts on<input class="inp" type="date" id="u-start" value="${U.starts || (p ? P.addDays(p.start_date, ((s.weeks[0] || 1) - 1) * 7) : S.today)}"></label></div>
      <button class="btn primary block" id="u-save" style="margin-top:12px" ${p ? "" : "disabled"}>${p ? `Save as ${esc(p.full_name.split(" ")[0])}'s Phase ${s.phase} plan` : "Choose a participant first"}</button>`; })() : ""}
  </div>` : ""}`;
}
function checkUpload() {
  const U = S.upload;
  try { U.parsed = JSON.parse(U.text); U.check = P.validatePlan(U.parsed); }
  catch (e) { U.parsed = null; U.check = { errors: ["This isn't valid plan code. Copy the whole file, from the first { to the last }. (" + e.message + ")"], warnings: [] }; }
  render();
}

/* ---------------- report ---------------- */
function viewReport() {
  const people = S.people.filter(p => p.active && P.daysBetween(p.start_date, S.today) >= 0);
  const per = people.map(p => {
    const cis = rows("checkins", p.id);
    const wk1 = cis.filter(r => r.day < P.addDays(p.start_date, 7)), last = cis.filter(r => r.day >= P.addDays(S.today, -7));
    return { p, m: metrics(p), wk1, last };
  });
  const withBoth = per.filter(x => x.wk1.some(r => r.energy) && x.last.some(r => r.energy) && P.daysBetween(x.p.start_date, S.today) >= 14);
  const MIN = 5;
  const a = (list, f) => { const v = list.map(f).filter(x => x != null && !isNaN(x)); return v.length ? avg(v) : null; };
  const eStart = a(withBoth, x => avg(x.wk1.filter(r => r.energy).map(r => +r.energy)));
  const eNow = a(withBoth, x => avg(x.last.filter(r => r.energy).map(r => +r.energy)));
  const sStart = a(withBoth, x => avg(x.wk1.filter(r => r.sleep_hours).map(r => +r.sleep_hours)));
  const sNow = a(withBoth, x => avg(x.last.filter(r => r.sleep_hours).map(r => +r.sleep_hours)));
  const slump = list => { const v = list.filter(r => r.slump != null); return v.length ? v.filter(r => r.slump).length / v.length * 100 : null; };
  const slStart = a(withBoth, x => slump(x.wk1)), slNow = a(withBoth, x => slump(x.last));
  const active = per.filter(x => x.m.lastActive && P.daysBetween(x.m.lastActive, S.today) <= 6).length;
  const meals = a(per, x => x.m.mealsPct);
  const f1 = v => v == null ? "–" : v.toFixed(1), pc = v => v == null ? "–" : Math.round(v) + "%";
  const enough = withBoth.length >= MIN;
  const summary = `${CONFIG.COMPANY} × Strong With Sherni: pilot update (${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })})

Participants: ${people.length}
Active in the last 7 days: ${active} of ${people.length} (${people.length ? Math.round(active / people.length * 100) : 0}%)
Average meals logged, last 7 days: ${pc(meals)}
${enough ? `Average energy (1–5): ${f1(eStart)} in week 1 → ${f1(eNow)} now
Average sleep: ${f1(sStart)} h in week 1 → ${f1(sNow)} h now
Afternoon slump reported: ${pc(slStart)} of days in week 1 → ${pc(slNow)} now
(Based on ${withBoth.length} participants with check-ins in both periods.)` : "Energy and sleep trends will be shared once at least 5 participants have two weeks of check-ins."}

All figures are group averages. No individual data is shared.`;
  return `
  <div class="card"><h2>Group report for HR</h2>
    <p class="small muted" style="margin:4px 0 0">Anonymised group averages only. Trends appear once at least ${MIN} people have check-ins from week 1 and the last 7 days.</p></div>
  <div class="kpis">
    <div class="kpi"><b class="num">${people.length}</b><span>participants</span></div>
    <div class="kpi"><b class="num">${people.length ? Math.round(active / people.length * 100) : 0}%</b><span>active in the last 7 days</span></div>
    <div class="kpi"><b class="num">${pc(meals)}</b><span>average meals logged (7d)</span></div>
    <div class="kpi"><b class="num">${enough ? f1(eStart) + " → " + f1(eNow) : "–"}</b><span>energy, week 1 → now</span></div>
    <div class="kpi"><b class="num">${enough ? f1(sStart) + " → " + f1(sNow) + "h" : "–"}</b><span>sleep, week 1 → now</span></div>
    <div class="kpi"><b class="num">${enough ? pc(slStart) + " → " + pc(slNow) : "–"}</b><span>days with afternoon slump</span></div>
  </div>
  <div class="card"><div class="row between"><h2>Summary to send HR</h2><button class="btn primary" id="cpRep">Copy summary</button></div>
    <div class="msgbox" style="margin-top:10px" id="repText">${esc(summary)}</div></div>`;
}

/* ---------------- events ---------------- */
function bind() {
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; render(); });
  const lo = $("#logout"); if (lo) lo.onclick = async () => { await api.logout(); S.me = null; renderLogin(); };
  const rd = $("#resetDemo"); if (rd) rd.onclick = () => { resetDemo(); location.reload(); };
  const rl = $("#reload"); if (rl) rl.onclick = async () => { await refresh(); toast("Updated"); };
  const ad = $("#addP"); if (ad) ad.onclick = addParticipantSheet;
  document.querySelectorAll("[data-pid]").forEach(tr => { tr.onclick = () => openPerson(tr.dataset.pid); tr.onkeydown = e => { if (e.key === "Enter") openPerson(tr.dataset.pid); }; });
  // upload
  const up = $("#u-pid"); if (up) up.onchange = () => { S.upload.pid = up.value; S.upload.starts = ""; render(); };
  const ut = $("#u-text"); if (ut) ut.oninput = () => { S.upload.text = ut.value; };
  const uf = $("#u-file"); if (uf) uf.onchange = async () => { const f = uf.files[0]; if (!f) return; S.upload.text = await f.text(); checkUpload(); };
  const uc = $("#u-check"); if (uc) uc.onclick = checkUpload;
  const us = $("#u-start"); if (us) us.onchange = () => { S.upload.starts = us.value; };
  const sv = $("#u-save"); if (sv) sv.onclick = async () => {
    const U = S.upload; const p = S.people.find(x => x.id === U.pid); const starts = $("#u-start").value;
    sv.disabled = true;
    try {
      const row = await api.savePlan(U.pid, U.parsed.phase, starts, U.parsed);
      S.act.plans.push(row);
      S.upload = { pid: "", text: "", parsed: null, check: null, starts: "" };
      S.tab = "people"; render(); notify("Plan saved", `${p.full_name}'s Phase ${row.phase} plan starts ${fmtDate(starts)}.`);
    } catch (e) { sv.disabled = false; toast(e.message); }
  };
  const cr = $("#cpRep"); if (cr) cr.onclick = () => copy($("#repText").textContent);
}

boot();
