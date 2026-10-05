// Shared bits of interface: mascot, icons, notifications, sheets, charts.
import { CONFIG } from "./config.js";

export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const lion = (s = 44) => `<svg class="lion" width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true">
  <g fill="#C9A84C">${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<circle cx="${(24 + 15 * Math.cos(a)).toFixed(1)}" cy="${(24 + 15 * Math.sin(a)).toFixed(1)}" r="6.4"/>`; }).join("")}</g>
  <circle cx="24" cy="24" r="13" fill="#E9CF85"/><circle cx="24" cy="25" r="10.5" fill="#F4E3B0"/>
  <circle cx="19.8" cy="22.5" r="1.6" fill="#1A3C2E"/><circle cx="28.2" cy="22.5" r="1.6" fill="#1A3C2E"/>
  <path d="M21.6 27.2h4.8l-2.4 2.6z" fill="#1A3C2E"/><path d="M24 29.8v1.6M21.5 32c1.4 1 3.6 1 5 0" stroke="#1A3C2E" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>`;

export const IC = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  workout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 7v10M18 7v10M3 9.5v5M21 9.5v5M6 12h12"/></svg>',
  checkin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h5v5"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.4.2 4.2 1.9 4.9 4.9"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>'
};

export function waLink(text, phone) {
  const num = phone != null ? String(phone).replace(/[^\d]/g, "") : CONFIG.COACH_WHATSAPP;
  return `https://wa.me/${num}?text=${encodeURIComponent(text || "")}`;
}

let nTimer;
export function notify(title, body) {
  const n = document.getElementById("notif"); if (!n) return;
  n.innerHTML = `${lion(34)}<div style="min-width:0"><div class="nt">Strong With Sherni · now</div><div class="nb">${esc(title)}</div><div class="small">${esc(body || "")}</div></div>`;
  n.classList.add("show"); clearTimeout(nTimer); nTimer = setTimeout(() => n.classList.remove("show"), 4200);
}
let tTimer;
export function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(tTimer); tTimer = setTimeout(() => t.hidden = true, 3200);
}
export function sheet(html, { closeLabel = "Close" } = {}) {
  const root = document.getElementById("sheet");
  root.innerHTML = `<div class="sheet-bg" id="sbg"><div class="sheet" role="dialog" aria-modal="true">${html}<button class="btn block" id="sclose" style="margin-top:14px">${esc(closeLabel)}</button></div></div>`;
  document.getElementById("sbg").addEventListener("click", e => { if (e.target.id === "sbg" || e.target.id === "sclose") closeSheet(); });
  return root.querySelector(".sheet");
}
export function closeSheet() { const r = document.getElementById("sheet"); if (r) r.innerHTML = ""; }

// points: [{label, v}]
export function lineChart(title, points, lo, hi, ticks) {
  const W = 320, H = 150, L = 30, R = 28, Tp = 16, B = 26, iw = W - L - R, ih = H - Tp - B;
  const n = points.length;
  const x = i => L + (n === 1 ? iw / 2 : i * iw / (n - 1)), y = v => Tp + ih - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * ih;
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `M${x(0)},${Tp + ih} L${pts.replace(/ /g, " L")} L${x(n - 1)},${Tp + ih} Z`;
  return `<div class="chart" style="margin-top:16px"><div class="small" style="font-weight:600;margin-bottom:4px">${esc(title)}</div>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: ${points.map(p => esc(p.label) + " " + p.v).join(", ")}">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${t}</text>`).join("")}
    <path d="${area}" fill="var(--teal)" opacity=".12"/>
    <polyline points="${pts}" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="${i === n - 1 ? 5 : 3.5}" fill="${i === n - 1 ? "var(--gold)" : "var(--teal)"}"/><text x="${x(i)}" y="${y(p.v) - 10}" text-anchor="middle" font-size="11.5" font-weight="700" fill="var(--ink)">${p.v}</text><text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(p.label)}</text>`).join("")}
  </svg></div>`;
}
