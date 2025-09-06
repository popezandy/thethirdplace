// assets/calendar.js
// Minimal ICS parser + poster-first monthly calendar renderer for The 3rd Place Cinema Club.

const CAL_ENDPOINT = "/.netlify/functions/ics";

// Heuristics: extract poster URL from DESCRIPTION or URL fields.
// Use 'Poster:' prefix in your Google Calendar event description to set an explicit poster URL.
function extractPoster(desc, urlField) {
  if (!desc) desc = "";
  // Look for Poster: <url>
  const posterMatch = desc.match(/Poster\s*:\s*(https?:\/\/\S+)/i);
  if (posterMatch) return posterMatch[1].trim();
  // Otherwise, first http(s) link ending in jpg/png/webp
  const linkMatch = desc.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp)/i);
  if (linkMatch) return linkMatch[0];
  // Fallback to event URL field
  if (urlField && /^https?:\/\//.test(urlField)) return urlField;
  return null;
}
// Turn ICS date/time into a real JS Date
function parseICSTime(s) {
  if (!s) return null;
  // YYYYMMDDTHHMMSSZ  or  YYYYMMDD
  let m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (m) {
    const [_, y, mo, d, hh = "00", mm = "00", ss = "00", z = ""] = m;
    const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}${z ? "Z" : ""}`;
    return new Date(iso);
  }
  // Fallback: let Date try
  return new Date(s);
}
// Parse a minimal subset of ICS into an array of events.
function parseICS(icsText) {
  // Handle folded lines per RFC (lines starting with space are continuations)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") {
      cur = {};
    } else if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const keyRaw = line.slice(0, idx);
      const val = line.slice(idx + 1);
      const key = keyRaw.split(';')[0].toUpperCase();
      cur[key] = (cur[key] ? cur[key] + '\n' : '') + val;
    }
  }
  // Normalize
  return events.map(e => {
    const start = e['DTSTART'] || e['DTSTART;VALUE=DATE'];
    const end = e['DTEND'] || e['DTEND;VALUE=DATE'];
    const title = (e['SUMMARY'] || 'Untitled').trim();
    const desc = (e['DESCRIPTION'] || '').replace(/\\n/g, '\n');
    const url = (e['URL'] || '').trim();
    const loc = (e['LOCATION'] || '').trim();
    const poster = extractPoster(desc, url);
    // Convert to local Date (assumes DTSTART in UTC/Z or with TZID; for simplicity, rely on Date parsing)
    const startDate = parseICSTime(start);
    const endDate   = parseICSTime(end);
    return { title, desc, url, loc, poster, startRaw: start, endRaw: end, startDate, endDate };
  });
}

// Group by YYYY-MM-DD local date
function keyFor(d) {
  const z = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const y = z.getFullYear();
  const m = (z.getMonth()+1).toString().padStart(2,'0');
  const day = z.getDate().toString().padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function monthMatrix(year, monthIdx) { // monthIdx 0-11
  const first = new Date(year, monthIdx, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay()+6)%7)); // start Monday
  const weeks = [];
  let cur = new Date(start);
  for (let w=0; w<6; w++) {
    const row = [];
    for (let d=0; d<7; d++) {
      row.push(new Date(cur));
      cur.setDate(cur.getDate()+1);
    }
    weeks.push(row);
  }
  return weeks;
}

function renderCalendar(container, events) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // current month
  const weeks = monthMatrix(year, month);
  const byDay = new Map();
  for (const e of events) {
    if (!e.startDate) continue;
    const k = keyFor(e.startDate);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }

  container.innerHTML = `
    <div class="tpc-cal">
      <div class="tpc-cal-header">
        <h3>${now.toLocaleString(undefined,{month:'long'})} ${year}</h3>
        <div class="tpc-legend">
          <span class="tag fri">Fri 8p</span>
          <span class="tag sat">Sat 8p</span>
          <span class="tag wow">WOW Wed 6p</span>
        </div>
      </div>
      <div class="tpc-grid">
        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="tpc-dow">${d}</div>`).join('')}
        ${weeks.flat().map(d => {
          const k = keyFor(d);
          const inMonth = d.getMonth() === month;
          const dayEvents = (byDay.get(k) || []).sort((a,b)=>a.title.localeCompare(b.title));
          const items = dayEvents.map(ev => {
            const cls = /wednesday|wow/i.test(ev.title) ? 'wow' : (/friday/i.test(ev.title) ? 'fri' : (/saturday/i.test(ev.title) ? 'sat' : 'oth'));
            const thumb = ev.poster ? `<img src="${ev.poster}" alt="" class="thumb">` : `<div class="thumb placeholder">TPC</div>`;
            return `<a href="#" class="tpc-item ${cls}" data-key="${k}" data-title="${encodeURIComponent(ev.title)}">${thumb}<div class="label">${ev.title}</div></a>`;
          }).join('');
          return `<div class="tpc-cell ${inMonth?'':'muted'}"><div class="num">${d.getDate()}</div>${items}</div>`;
        }).join('')}
      </div>
      <div class="tpc-modal" hidden>
        <div class="tpc-modal-card">
          <button class="close" aria-label="Close">×</button>
          <div class="modal-content"></div>
        </div>
      </div>
    </div>
  `;

  // Modal behavior
  const modal = container.querySelector('.tpc-modal');
  const modalContent = container.querySelector('.modal-content');
  container.querySelectorAll('.tpc-item').forEach(a => {
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const k = a.getAttribute('data-key');
      const title = decodeURIComponent(a.getAttribute('data-title'));
      const evs = byDay.get(k) || [];
      const ev = evs.find(x => x.title === title) || evs[0];
      const poster = ev.poster ? `<img src="${ev.poster}" class="modal-poster" alt="">` : '';
      const descHtml = (ev.desc || '').replace(/\n/g,'<br>');
      modalContent.innerHTML = `
        <div class="modal-grid">
          <div>${poster}</div>
          <div>
            <h3>${ev.title}</h3>
            <p class="muted">${new Date(ev.startDate).toLocaleString(undefined,{weekday:'long', month:'short', day:'numeric'})}</p>
            <div class="desc">${descHtml || 'Details to be announced.'}</div>
            <div class="muted note">Private address — shared with approved invitees. Members free; $10 one-night; $25 monthly. Club approves memberships in person.</div>
          </div>
        </div>`;
      modal.hidden = false;
    });
  });
  modal.addEventListener('click', (e)=>{
    if (e.target.classList.contains('tpc-modal') || e.target.classList.contains('close')) modal.hidden = true;
  });
}

// Basic styles for the calendar; keep neutral and inherit site colors.
const style = document.createElement('style');
style.textContent = `
  .tpc-cal-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
  .tpc-legend .tag { font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #333; margin-left:8px; }
  .tpc-legend .fri { color:#e5c; } .tpc-legend .sat { color:#6cd; } .tpc-legend .wow { color:#f96; }
  .tpc-grid { display:grid; gap:10px; grid-template-columns: repeat(7, 1fr); }
  .tpc-dow { font-weight:700; text-align:center; padding:6px 0; opacity:.8; }
  .tpc-cell { min-height:120px; border:1px solid #1e1e1e; border-radius:10px; padding:8px; background:#121214; position:relative; }
  .tpc-cell.muted { opacity:.5; }
  .tpc-cell .num { position:absolute; top:6px; right:8px; font-size:12px; color:#aaa; }
  .tpc-item { display:block; margin-top:26px; border-radius:8px; overflow:hidden; border:1px solid #2a2a2a; background:#0f0f10; }
  .tpc-item .thumb { width:100%; height:90px; object-fit:cover; display:block; }
  .tpc-item .thumb.placeholder { display:flex; align-items:center; justify-content:center; font-weight:700; color:#aaa; letter-spacing:.2em; }
  .tpc-item .label { padding:6px 8px; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tpc-item.fri .label { border-left:3px solid #e5c; }
  .tpc-item.sat .label { border-left:3px solid #6cd; }
  .tpc-item.wow .label { border-left:3px solid #f96; }
  .tpc-modal { position:fixed; inset:0; background:rgba(0,0,0,.6); display:grid; place-items:center; z-index:1000; }
  .tpc-modal-card { width:min(900px, 92vw); background:#121214; border:1px solid #2a2a2a; border-radius:14px; padding:16px; }
  .tpc-modal-card .close { float:right; background:transparent; border:none; color:#ccc; font-size:24px; cursor:pointer; }
  .modal-grid { display:grid; gap:16px; grid-template-columns: 1fr; }
  .modal-poster { width:100%; max-height:420px; object-fit:cover; border-radius:10px; border:1px solid #2a2a2a; }
  @media(min-width:820px){ .modal-grid { grid-template-columns: 1fr 1.2fr; } }
  .desc { margin:8px 0; }
  .note { font-size:12px; opacity:.8; }
`;
document.head.appendChild(style);

// Boot
async function bootCalendar() {
  try {
    const res = await fetch(CAL_ENDPOINT, { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const ics = await res.text();
    const events = parseICS(ics);
    const mount = document.querySelector("#themed-calendar");
    if (!mount) return;
    renderCalendar(mount, events);
  } catch (e) {
    const mount = document.querySelector("#themed-calendar");
    if (mount) mount.innerHTML = `<div class="tpc-error">Calendar temporarily unavailable. ${e.message}</div>`;
    console.error("Calendar error:", e);
  }
}
document.addEventListener("DOMContentLoaded", bootCalendar);
