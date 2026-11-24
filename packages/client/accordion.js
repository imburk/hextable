// One accordion for every page with sections (docs/specs/one-token-menu.md, Decision 4d, R21 and R27; stage M10). The sums and the page's
// structure are here; drawer.js opens and shuts the sections of Setup, Log and chat and DM tools, and actionpanel.js those of a character's page.
//
// A page with sections is a panel whose children are sections, each a bar (a button: its title, a line about it, a chevron) and a body.
// One section is open at a time. While one is open the panel is pinned: it fills the screen's height, the bars before the open one stay
// at its top and the bars after it at its bottom, and only the open section's body scrolls. With none open every bar shows its tip.
//
//   mountAccordion(panel, leaf)   makes the bars from the page as written (index.html), once; returns the section ids in order
//   barRows(n, per)               how n closed bars are set in rows of at most `per` (a character's page: titles side by side)
//   gridPlan(ids, open, per)      where each bar of a pinned page goes on a grid of 6 columns

// How `n` bars are shared out over rows of at most `per`: as few rows as hold them, as even as they go ([3, 2] for five, never [3, 1, 1]).
export function barRows(n, per = 3) {
  if (n <= 0) return [];
  const rows = Math.ceil(n / per), out = [];
  for (let i = 0, left = n; i < rows; i++) { const k = Math.ceil(left / (rows - i)); out.push(k); left -= k; }
  return out;
}

// A pinned page as a grid of `cols` columns (6: a row holds one, two or three bars, each as wide as its share). `ids`: the shown sections in
// order; `open`: the open one. Returns { rows: the grid's rows as 'bar' | 'open', span: { id: columns }, before, after } - the closed bars
// before the open section fill the rows above it, those after it the rows below, and the open section has the row between to itself.
// With none open (or an id that is not shown) every bar has a row of its own and nothing is pinned.
export function gridPlan(ids, open, per = 3, cols = 6) {
  const at = ids.indexOf(open), span = {};
  if (at < 0) { for (const id of ids) span[id] = cols; return { rows: ids.map(() => 'bar'), span, before: ids.length, after: 0, pinned: false }; }
  const part = (list) => { const rows = barRows(list.length, per); let i = 0; for (const k of rows) for (let j = 0; j < k; j++) span[list[i++]] = cols / k; return rows.length; };
  const before = part(ids.slice(0, at)), after = part(ids.slice(at + 1));
  span[open] = cols;
  return { rows: [...Array(before).fill('bar'), 'open', ...Array(after).fill('bar')], span, before, after, pinned: true };
}

// Makes a panel's sections an accordion, from the page as it is written. Two shapes are read:
//   <section data-sec="dice" data-tip="..."><h3>Dice</h3> ... </section>            a section with its heading (Setup, Log and chat)
//   <ul class="sec-index"> rows [data-sec] </ul> <div class="sec-screen" data-sec>  a list of rows and a screen for each (DM tools, M5)
// Either way each becomes  .acc-sec[data-sec] > h3.acc-h > button.acc-bar  +  .acc-body  with the ids `acc-bar-<leaf>-<sec>` and
// `acc-<leaf>-<sec>`; every id inside is kept. A row `[data-sec="all"]` of a list stays a row under the bars (every section on one page).
export function mountAccordion(panel, leaf, doc = panel.ownerDocument) {
  if (panel.classList.contains('acc')) return [...panel.querySelectorAll(':scope > .acc-sec')].map((s) => s.dataset.sec);
  const mk = (tag, cls, props = {}) => { const x = doc.createElement(tag); if (cls) x.className = cls; for (const [k, v] of Object.entries(props)) x.setAttribute(k, v); return x; };
  const bar = (sec, title, tip) => {
    const b = mk('button', 'acc-bar', { type: 'button', id: `acc-bar-${leaf}-${sec}`, 'data-sec': sec, 'aria-expanded': 'false', 'aria-controls': `acc-${leaf}-${sec}` });
    const t = mk('span', 'acc-t'), s = mk('small', 'acc-tip'), c = mk('span', 'acc-chev', { 'aria-hidden': 'true' });
    t.textContent = title; s.textContent = tip ?? ''; c.textContent = '›';
    b.append(t, s, c);
    return b;
  };
  const body = (sec) => { const d = mk('div', 'acc-body', { id: `acc-${leaf}-${sec}`, role: 'region', 'aria-labelledby': `acc-bar-${leaf}-${sec}` }); d.hidden = true; return d; };
  const ids = [];
  for (const s of [...panel.querySelectorAll(':scope > section[data-sec]')]) {
    const h = s.querySelector(':scope > h3'), sec = s.dataset.sec, b = body(sec);
    const title = h?.textContent ?? sec;
    b.append(...[...s.childNodes].filter((n) => n !== h));
    const head = h ?? mk('h3');
    head.className = 'acc-h'; head.textContent = ''; head.append(bar(sec, title, s.dataset.tip));
    s.classList.add('acc-sec'); s.append(head, b);
    ids.push(sec);
  }
  const index = panel.querySelector(':scope > .sec-index');
  if (index) {
    for (const scr of [...panel.querySelectorAll(':scope > .sec-screen[data-sec]')]) {
      const sec = scr.dataset.sec, row = index.querySelector(`[data-sec="${sec}"]`);
      const wrap = mk('div', 'acc-sec', { 'data-sec': sec }), head = mk('h3', 'acc-h'), b = body(sec);
      head.append(bar(sec, scr.dataset.title || row?.querySelector('.mr-name')?.textContent || sec, row?.querySelector('.mr-sum')?.textContent ?? ''));
      scr.before(wrap); b.append(scr); scr.hidden = false; wrap.append(head, b);
      row?.closest('li')?.remove();
      ids.push(sec);
    }
    panel.append(index);                          // what is left of the list (the row "All ... on one page") sits under the bars
    index.classList.add('acc-all');
  }
  panel.classList.add('acc');
  return ids;
}
