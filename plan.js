// Plan engine: reads a Strong With Sherni plan (sws-plan/1) and works out each day.
// Pure functions only, so the employee site and the coach panel share the same logic.

export const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/* ---------- dates (all local, as YYYY-MM-DD strings) ---------- */
export function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function fromISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
export function addDays(iso, n) { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
export function todayISO() { return toISO(new Date()); }
export function dayIndex(iso) { return (fromISO(iso).getDay() + 6) % 7; } // Mon = 0
export function mondayOf(iso) { return addDays(iso, -dayIndex(iso)); }
export function daysBetween(a, b) { return Math.round((fromISO(b) - fromISO(a)) / 86400000); }
export function programWeek(startDate, iso) { return Math.floor(daysBetween(startDate, iso) / 7) + 1; }

/* ---------- times ---------- */
export function hm(str) { const [h, m] = String(str || "0:0").split(":").map(Number); return h * 60 + (m || 0); }
export function fmtTime(min) {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  let h = Math.floor(min / 60); const m = min % 60, ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
export function nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

/* ---------- picking the plan ---------- */
// Plans: [{starts_on, phase, data}]. The newest one that has started is active.
export function activePlan(plans, iso) {
  const started = (plans || []).filter(p => p.starts_on <= iso).sort((a, b) => b.starts_on.localeCompare(a.starts_on) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return started[0] || null;
}
export function nextPlan(plans, iso) {
  return (plans || []).filter(p => p.starts_on > iso).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] || null;
}

/* ---------- day rules ---------- */
export function isVegDay(plan, di) { return (plan.vegDays || []).includes(DAY_KEYS[di]); }
export function trainingType(plan, di) { return (plan.trainingDays || {})[DAY_KEYS[di]] || null; }
export function activeNote(plan, di) { return (plan.activeDays || {})[DAY_KEYS[di]] || null; }

export function mealsFor(plan, di) {
  const train = !!trainingType(plan, di);
  return (plan.meals || []).filter(m => !m.trainingOnly || train);
}

// Minutes from midnight, shifted by the employee's own workday start.
export function mealTime(plan, meal, workdayStart) {
  const shift = hm(workdayStart || plan.baseStart || "09:00") - hm(plan.baseStart || "09:00");
  return hm(meal.time) + shift;
}
export function workoutTime(plan, workdayStart) {
  if (!plan.workoutTime) return null;
  return hm(plan.workoutTime) + hm(workdayStart || plan.baseStart || "09:00") - hm(plan.baseStart || "09:00");
}

/* ---------- meal options ---------- */
// ctx: { di, lunchProtein (number|null) }
export function mealOptions(plan, meal, ctx) {
  const veg = isVegDay(plan, ctx.di);
  if (meal.smart) {
    const s = meal.smart;
    const prot = veg && s.proteinVeg ? s.proteinVeg : s.protein;
    const lp = ctx.basedOnProtein;
    const light = s.light;
    const first = (lp != null && lp >= (s.proteinThreshold || 30)) ? [light, prot] : [prot, light];
    return first.concat(meal.alts || []);
  }
  const base = veg && meal.veg ? meal.veg : meal.main;
  return [base].concat(meal.alts || []);
}

// log: {option_index, quick} or undefined. crazy: whether crazy-day mode is on.
export function itemFor(plan, meal, ctx, choice, crazy) {
  if (crazy && meal.quick) return { ...meal.quick, quick: true, index: 0 };
  const opts = mealOptions(plan, meal, ctx);
  const i = ((choice || 0) % opts.length + opts.length) % opts.length;
  return { ...opts[i], quick: false, index: i };
}

export function smartReason(plan, meal, ctx, crazy) {
  if (!meal.smart) return null;
  if (crazy) return "Crazy-day mode: a quick option that still hits your protein.";
  const lp = ctx.basedOnProtein;
  const basedName = (plan.meals.find(m => m.id === meal.smart.basedOn) || {}).name || "lunch";
  if (lp == null) return `Log your ${basedName.toLowerCase()} and I'll pick the right ${meal.name.toLowerCase()} for you.`;
  if (lp >= (meal.smart.proteinThreshold || 30)) return `Your ${basedName.toLowerCase()} had ${lp}g protein, so this can stay light.`;
  return `Your ${basedName.toLowerCase()} had only ${lp}g protein, so this is protein-forward.`;
}

/* ---------- workouts ---------- */
// rx can be a string, or {"1":"3 × 10","3":"3 × 12"} keyed by week within the phase.
export function rxFor(ex, weekInPhase) {
  if (typeof ex.rx === "string") return ex.rx;
  const keys = Object.keys(ex.rx || {}).map(Number).sort((a, b) => a - b);
  let pick = keys[0];
  for (const k of keys) if (k <= weekInPhase) pick = k;
  return pick != null ? ex.rx[pick] : "";
}
export function nextRx(ex, weekInPhase) {
  if (typeof ex.rx === "string") return null;
  const now = rxFor(ex, weekInPhase), nxt = rxFor(ex, weekInPhase + 1);
  return nxt && nxt !== now ? nxt : null;
}
// Week number inside the phase (1-based), from the program week and the plan's week range.
export function weekInPhase(plan, progWeek) {
  const start = (plan.weeks && plan.weeks[0]) || 1;
  return Math.max(1, progWeek - start + 1);
}

/* ---------- food checker ---------- */
export const DEFAULT_FOODS = [
  [["samosa", "kachori", "pakora", "bajji", "bonda"], "swap", "Deep-fried, and very little protein.", "Roasted chana or 2 boiled eggs."],
  [["vada pav", "vada"], "swap", "Fried and mostly refined carbs.", "Idli with sambar, or a sprouts chaat."],
  [["bhatura", "bhature", "puri", "poori"], "swap", "Deep-fried bread.", "Have the chole with 1 phulka instead."],
  [["fries", "french fries", "chips"], "swap", "Fried, and easy to overeat.", "Roasted makhana or air-fried veg."],
  [["maggi", "instant noodles", "noodles"], "swap", "Low protein, high sodium.", "If you must, add 2 eggs and a cup of veg."],
  [["pizza"], "tweak", "Fine occasionally: 2 slices of thin crust plus a salad.", "Paneer tikka wrap or a grilled chicken sandwich."],
  [["biryani"], "tweak", "1 cup with raita at lunch is fine. Skip the second helping.", "Chicken or paneer pulao with extra raita."],
  [["burger"], "tweak", "Pick grilled, and skip the fries and soft drink.", "Grilled chicken burger plus a side salad."],
  [["cold coffee", "frappe", "latte"], "tweak", "Ask for no syrup and less sugar.", "Protein cold coffee, or a cappuccino."],
  [["momos", "momo", "dumpling"], "tweak", "Steamed, not fried. About 6 pieces plus soup.", "Chicken or paneer steamed momos."],
  [["pani puri", "golgappa", "chaat"], "tweak", "An occasional treat. One plate, not two.", "Sprouts chaat."],
  [["gulab jamun", "jalebi", "sweet", "mithai", "ladoo", "laddu", "barfi", "halwa"], "tweak", "1 piece, after a meal, not as a snack.", "2 dates or a square of dark chocolate."],
  [["cake", "pastry", "brownie", "ice cream", "dessert", "cookie"], "tweak", "A small portion at celebrations. Enjoy it, no guilt.", "Greek yogurt with honey and fruit."],
  [["beer", "wine", "whisky", "vodka", "rum", "alcohol", "cocktail"], "tweak", "1–2 drinks at most, and eat protein first.", "Alternate each drink with a glass of water."],
  [["chole", "chana masala"], "tweak", "Good protein, but pair it with phulka, not bhature.", "Chole + 1 phulka + salad."],
  [["mango"], "tweak", "1 small cup, ideally after a meal.", "Any seasonal fruit."],
  [["sandwich"], "tweak", "Grilled, on brown bread, with a protein filling.", "Paneer or chicken grilled sandwich."],
  [["protein bar"], "tweak", "Check the label: 15g+ protein and under 10g sugar.", "Greek yogurt or boiled eggs."],
  [["chai", "tea"], "go", "Up to 2 cups a day, with less sugar.", ""],
  [["coffee", "black coffee", "americano", "cappuccino"], "go", "Fine. Avoid it after 4 PM so your sleep stays good.", ""],
  [["dosa"], "go", "Pair it with sambar and a protein side.", ""],
  [["idli"], "go", "A great base. Add sambar and a protein side.", ""],
  [["poha", "upma"], "go", "Add peanuts and a side of curd for protein.", ""],
  [["paneer"], "go", "Great protein. Watch the portion if it's in gravy.", ""],
  [["chicken", "fish", "egg", "eggs", "tofu", "soya"], "go", "Your protein anchors. Grilled, curry or bhurji all work.", ""],
  [["dal", "rajma", "sambar", "curd", "yogurt", "dahi", "buttermilk", "chaas"], "go", "On plan. These are everyday staples.", ""],
  [["rice", "roti", "phulka", "chapati"], "go", "On plan, portioned: 1 cup cooked rice or 2 phulkas.", ""],
  [["salad", "sprouts", "fruit", "banana", "apple", "orange", "papaya", "guava", "makhana", "almonds", "nuts", "dark chocolate"], "go", "On plan. Good choice.", ""]
];

export function checkFood(plan, query) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return null;
  const custom = ((plan && plan.foodChecker) || []).map(f => [f.keywords || [], f.verdict, f.note || "", f.swap || ""]);
  let hit = null, best = 0;
  for (const f of custom.concat(DEFAULT_FOODS)) {
    for (const k of f[0]) { const kk = String(k).toLowerCase(); if (kk && q.includes(kk) && kk.length > best) { hit = f; best = kk.length; } }
  }
  if (!hit) return { verdict: "unknown" };
  return { verdict: hit[1], note: hit[2], swap: hit[3] };
}

/* ---------- validation (used by the coach panel before saving) ---------- */
export function validatePlan(p) {
  const errors = [], warnings = [];
  const isMacros = m => Array.isArray(m) && m.length === 5 && m.every(n => typeof n === "number" && n >= 0);
  const checkOpt = (o, where) => {
    if (!o || typeof o.text !== "string" || !o.text.trim()) errors.push(`${where}: missing text`);
    else if (!isMacros(o.macros)) errors.push(`${where}: macros must be 5 numbers [kcal, protein, carbs, fat, fibre]`);
  };
  if (!p || typeof p !== "object") return { errors: ["This isn't a plan file."], warnings };
  if (p.format !== "sws-plan/1") warnings.push('Format should be "sws-plan/1".');
  if (!Number.isInteger(p.phase)) errors.push("phase must be a whole number.");
  if (!Array.isArray(p.weeks) || p.weeks.length !== 2) errors.push("weeks must look like [1, 4].");
  const t = p.targets || {};
  ["kcal", "protein", "carbs", "fat", "fibre"].forEach(k => { if (typeof t[k] !== "number") errors.push(`targets.${k} is missing.`); });
  const dayOk = d => DAY_KEYS.includes(d);
  (p.vegDays || []).forEach(d => { if (!dayOk(d)) errors.push(`vegDays: "${d}" should be one of ${DAY_KEYS.join(", ")}.`); });
  Object.entries(p.trainingDays || {}).forEach(([d, w]) => {
    if (!dayOk(d)) errors.push(`trainingDays: "${d}" should be one of ${DAY_KEYS.join(", ")}.`);
    if (!(p.workouts || {})[w]) errors.push(`trainingDays.${d} points to workout "${w}", which isn't in workouts.`);
  });
  if (!Array.isArray(p.meals) || !p.meals.length) errors.push("meals is empty.");
  const ids = new Set();
  (p.meals || []).forEach((m, i) => {
    const w = `Meal ${i + 1} (${m.name || m.id || "?"})`;
    if (!m.id) errors.push(`${w}: missing id.`); else if (ids.has(m.id)) errors.push(`${w}: id "${m.id}" is used twice.`); else ids.add(m.id);
    if (!/^\d{1,2}:\d{2}$/.test(m.time || "")) errors.push(`${w}: time should look like "13:15".`);
    if (m.smart) {
      checkOpt(m.smart.light, `${w} smart.light`); checkOpt(m.smart.protein, `${w} smart.protein`);
      if (m.smart.proteinVeg) checkOpt(m.smart.proteinVeg, `${w} smart.proteinVeg`);
      if (!(p.meals || []).some(x => x.id === m.smart.basedOn)) errors.push(`${w}: smart.basedOn "${m.smart.basedOn}" isn't a meal id.`);
    } else checkOpt(m.main, `${w} main`);
    if (m.veg) checkOpt(m.veg, `${w} veg`);
    (m.alts || []).forEach((a, j) => checkOpt(a, `${w} alternative ${j + 1}`));
    if (m.quick) checkOpt(m.quick, `${w} quick`); else warnings.push(`${w} has no quick backup for crazy days.`);
  });
  Object.entries(p.workouts || {}).forEach(([k, wk]) => {
    if (!wk.title) errors.push(`workouts.${k}: missing title.`);
    if (!Array.isArray(wk.main) || !wk.main.length) errors.push(`workouts.${k}: main is empty.`);
    (wk.main || []).forEach((e, i) => { if (!e.name || !e.rx) errors.push(`workouts.${k} exercise ${i + 1}: needs name and rx.`); });
  });
  // Totals sanity check against targets (regular day, main options)
  if (!errors.length) {
    const di = DAY_KEYS.indexOf(Object.keys(p.trainingDays || {})[0] || "Mon");
    const sum = [0, 0, 0, 0, 0];
    mealsFor(p, di < 0 ? 0 : di).filter(m => !m.optional).forEach(m => itemFor(p, m, { di: di < 0 ? 0 : di, basedOnProtein: 99 }, 0, false).macros.forEach((v, i) => sum[i] += v));
    const off = Math.abs(sum[0] - t.kcal) / t.kcal;
    if (off > 0.15) warnings.push(`A training day's main options add up to ${sum[0]} kcal, vs a target of ${t.kcal}.`);
  }
  return { errors, warnings };
}

export function planSummary(p) {
  return {
    phase: p.phase, phaseName: p.phaseName || "", weeks: p.weeks,
    meals: (p.meals || []).length, workouts: Object.keys(p.workouts || {}).length,
    kcal: (p.targets || {}).kcal, protein: (p.targets || {}).protein,
    vegDays: (p.vegDays || []).join(", ") || "none",
    trainingDays: Object.keys(p.trainingDays || {}).join(", ") || "none"
  };
}
