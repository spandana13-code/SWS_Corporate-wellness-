// Builds a calendar file (.ics) from a plan: one repeating event per meal and workout,
// each with a reminder 15 minutes before. Times are "floating", so they follow the phone's local time.
import { DAY_KEYS, mealsFor, mealTime, workoutTime, trainingType, isVegDay, addDays, dayIndex, fromISO } from "./plan.js";

const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const esc = s => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line) {
  const out = []; let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) { out.push(cur); cur = " " + ch; } else cur += ch;
  }
  out.push(cur); return out.join("\r\n");
}
const stamp = (iso, min) => iso.replace(/-/g, "") + "T" + String(Math.floor(min / 60)).padStart(2, "0") + String(min % 60).padStart(2, "0") + "00";

export function buildICS(plan, { fromDate, untilDate, workdayStart, name }) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Strong With Sherni//Corporate Program//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + esc("Sherni plan" + (name ? " · " + name : ""))];
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const until = untilDate.replace(/-/g, "") + "T235959";
  let n = 0;
  const firstOn = (dis) => { for (let i = 0; i < 7; i++) { const d = addDays(fromDate, i); if (dis.includes(dayIndex(d))) return d; } return fromDate; };
  const addEvent = (title, desc, dis, min, durMin) => {
    if (!dis.length) return;
    const start = firstOn(dis);
    const end = Math.min(min + durMin, 1439);
    lines.push("BEGIN:VEVENT", `UID:sws-${Date.now()}-${n++}@strongwithsherni.com`, "DTSTAMP:" + now,
      "DTSTART:" + stamp(start, min), "DTEND:" + stamp(start, end),
      `RRULE:FREQ=WEEKLY;BYDAY=${dis.map(i => BYDAY[i]).join(",")};UNTIL=${until}`,
      fold("SUMMARY:" + esc(title)), fold("DESCRIPTION:" + esc(desc)),
      "BEGIN:VALARM", "ACTION:DISPLAY", fold("DESCRIPTION:" + esc(title)), "TRIGGER:-PT15M", "END:VALARM", "END:VEVENT");
  };
  // Group each meal by the text it shows, so a meal that differs on veg days becomes two events.
  const allMeals = new Map();
  for (let di = 0; di < 7; di++) {
    for (const m of mealsFor(plan, di)) {
      const opt = m.smart ? null : (isVegDay(plan, di) && m.veg ? m.veg : m.main);
      const text = m.smart ? "Open your Sherni dashboard: tonight's option adjusts to your lunch." : opt.text;
      const key = m.id + "|" + text;
      if (!allMeals.has(key)) allMeals.set(key, { m, text, dis: [] });
      allMeals.get(key).dis.push(di);
    }
  }
  for (const { m, text, dis } of allMeals.values()) {
    addEvent(`${m.name}: ${m.smart ? "check your dashboard" : text}`, text + "\n\nSwap or log it in your Sherni dashboard.", dis, mealTime(plan, m, workdayStart), 30);
  }
  const wt = workoutTime(plan, workdayStart);
  if (wt != null) {
    const byType = {};
    for (let di = 0; di < 7; di++) { const t = trainingType(plan, di); if (t) (byType[t] = byType[t] || []).push(di); }
    for (const [t, dis] of Object.entries(byType)) {
      const w = plan.workouts[t];
      addEvent(`Workout: ${w.title}`, (w.where || "") + "\n\nToday's sets and reps are in your Sherni dashboard.", dis, wt, 45);
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function downloadICS(text, filename) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
