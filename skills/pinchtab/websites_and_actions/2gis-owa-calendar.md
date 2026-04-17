# 2GIS self-hosted OWA — Extract calendar events

**Auth:** Corporate ADFS via `fs.2gis.com/adfs/oauth2`. `outlook.office.com` is blocked (MSIS7007 — relying-party trust not configured for external clients). Use the internal domain directly.

**URL (work-week view):** `https://uk-mail.2gis.ru/owa/#path=/calendar/view/WorkWeek`

**What this is:** classic Outlook Web App (Exchange ~2016/2019), not modern `outlook.office.com`. Selectors and layout below are specific to that generation.

## Layout model

Events are absolutely positioned `<div>`s inside per-day columns. No `aria-label` with time — times must be computed from pixel coordinates vs the hour-label grid.

### Selectors

| What | Selector | Notes |
|---|---|---|
| Event container | `div._wx_m1` | One per event. `style.top/left/height/width` in px, relative to day column |
| Event title | `span._cb_M1` (child of event) | Semi-bold |
| Event URL or organizer | `span._cb_T1` (children of event) | Usually 2 of them. Classify by `startsWith("http")` |
| Hour label (left gutter) | `div._wx_v1` with text = `^\d{1,2}$` | Text is the hour number (`"14"`, `"15"`, …) |
| Day column header | element with text `^\d{1,2}\s+(Понедельник\|Вторник\|…)$` | Gives day number + weekday |

### Time calibration

- **Pixels per hour:** 54 (derived from diff of consecutive hour-label tops — stable)
- **Y-offset quirk:** the hour-label `getBoundingClientRect().top` is baseline-ish, sitting ~10 px **below** the actual hour-row top. Event rect.top is relative to the row top, so events appear ~11 min late if you don't correct it. **Subtract 10 px from event `rect.top`** before mapping to time, OR shift the hour-anchor up by 10 px. Either works.
- **Formula:** `y0 = hour_y - 10 - hour * 54` (pick the earliest hour label to anchor); then `hour_fractional = (event_top - y0) / 54`.

### Day mapping

Match event's horizontal center to the nearest day-header center. Day headers give the day-of-month number, but **not the full date** — compute the week's Monday from system date (or a `--week-offset` param) and add the index.

## JS extractor (drop in `/evaluate`)

```js
(() => {
  const TIME_OFFSET_PX = 10;

  const hourEls = [...document.querySelectorAll('*')]
    .filter(e => {
      const own = [...e.childNodes].filter(c => c.nodeType === 3)
        .map(c => c.textContent.trim()).join('');
      return /^\d{1,2}$/.test(own)
        && e.className && String(e.className).includes('_wx_')
        && e.offsetParent;
    })
    .map(e => ({
      hour: parseInt([...e.childNodes].filter(c => c.nodeType === 3)
        .map(c => c.textContent.trim()).join('')),
      y: e.getBoundingClientRect().top,
    }))
    .sort((a, b) => a.y - b.y);

  if (hourEls.length < 2) return JSON.stringify({error: 'no_hour_grid'});

  const first = hourEls[0], last = hourEls[hourEls.length - 1];
  const pxPerHour = (last.y - first.y) / (last.hour - first.hour);
  const y0 = first.y - TIME_OFFSET_PX - first.hour * pxPerHour;
  const yToHour = y => (y - y0) / pxPerHour;

  const dayHeaders = [...document.querySelectorAll('*')]
    .filter(e => {
      const t = [...e.childNodes].filter(c => c.nodeType === 3)
        .map(c => c.textContent.trim()).join('');
      return /^\d{1,2}\s+(Понедельник|Вторник|Среда|Четверг|Пятница|Суббота|Воскресенье)$/.test(t)
        && e.offsetParent;
    })
    .map(e => {
      const t = [...e.childNodes].filter(c => c.nodeType === 3)
        .map(c => c.textContent.trim()).join('');
      const m = t.match(/^(\d{1,2})\s+(\S+)$/);
      const r = e.getBoundingClientRect();
      return {day: parseInt(m[1]), weekday: m[2], center: r.left + r.width / 2};
    });

  const xToDay = x => dayHeaders.reduce(
    (best, d) => Math.abs(x - d.center) < Math.abs(x - best.center) ? d : best,
    dayHeaders[0]);

  const fmt = h => {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  };

  const events = [...document.querySelectorAll('div._wx_m1')].map(e => {
    const r = e.getBoundingClientRect();
    const title = e.querySelector('span._cb_M1')?.textContent.trim() || '';
    const extras = [...e.querySelectorAll('span._cb_T1')]
      .map(s => s.textContent.trim()).filter(Boolean);
    const url = extras.find(x => x.startsWith('http')) || '';
    const organizer = extras.find(x => !x.startsWith('http')) || '';
    const day = xToDay(r.left + r.width / 2);
    return {
      day_num: day.day,
      weekday: day.weekday,
      start: fmt(yToHour(r.top)),
      end: fmt(yToHour(r.bottom)),
      title, url, organizer,
    };
  });

  events.sort((a, b) =>
    a.day_num - b.day_num || a.start.localeCompare(b.start));

  return JSON.stringify({px_per_hour: pxPerHour, days: dayHeaders.length, events});
})()
```

## Caveats

- **View must be WorkWeek or Week** — daily view has a different DOM. Check `location.hash`.
- **Extraction only covers visible hours.** Events scheduled before the first visible hour row (e.g. 7 AM when chart starts at 8) get negative times. Scroll to early morning first if needed, or filter.
- **Cancelled events** have title prefix `"Отменено: "` (Russian locale). Detect and optionally skip.
- **Recurring event indicator** is a small refresh icon (`span.ms-Icon--refresh`) with empty text — ignore when picking up spans.
- **Concurrent events** in one slot render as narrower side-by-side columns — `rect.left + width/2` still maps cleanly to the correct day column since they stay within the day's X range.
- **Dates are day-of-month only** from the UI — compute full date (year, month) from the week's Monday. The "13–19 Апрель, 2026" label in the toolbar carries month+year but parsing it is locale-fragile; safer to derive from system clock + `--week-offset`.
