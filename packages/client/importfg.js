// Import a character from a Fantasy Grounds 5E export (.xml): pick a file, read it here in the browser, run
// the importer (rules import-fgxml.js; docs/import-characters.md), and SHOW what it did before anything changes.
// On confirm the sheet goes through the ordinary action, { type: 'setSheet', sheet } (a new character) or
// { type: 'setSheet', actor, sheet } (the selected one made again), and the engine may refuse it; its words are shown.
// Nothing is decided here: the sheet and the report are the importer's, the file never leaves this tab.
//
// A sheet has no field for notes, so the report cannot live in the character. On confirm it is written to the DM's
// chronicle by itself, titled with the character's name and not public (a chronicle entry reaches a player only when
// `public` is set: view.js), and the character's sheet says so for the DM (tablecontrols.js). A text file can be saved too.
// Only the DM can import: setSheet is a DM action.
import { importEntry } from './tablecontrols.js';
import { importFgxml, XML_LIMITS } from './shared/import-fgxml.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MAX_BYTES = 6_000_000;               // the importer reads 4,000,000 characters at most; this only stops a huge file being read at all
const CHRONICLE_MAX = 8000;
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());

// The lists of what was not mapped, in the order they are shown: [key, heading, what it holds].
const LISTS = [
  ['multiclass', 'Other classes', 'Only one class is built; these levels are not on the sheet.'],
  ['subclass', 'Subclass', 'Not an SRD 5.2 subclass.'],
  ['feats', 'Feats not entered', 'The pack holds no feats yet.'],
  ['features', 'Features not entered', 'Class features that are not in the pack, or not automatic.'],
  ['spells', 'Spells not entered', 'Not in the pack, not on the class list, or over the limit.'],
  ['magicItems', 'Magic items', 'The engine has no magic items; they do nothing on the sheet.'],
  ['species', 'Species', 'Species are not in the pack.'],
  ['background', 'Background', 'Backgrounds are not in the pack.'],
  ['gear', 'Gear not entered', 'Weapons, armour and other entries that were not imported.'],
  ['proficiencies', 'Proficiencies not entered', 'Tool entries that are choices or not tools.'],
  ['ruleDifferences', 'Differences between the 2014 and 5.2 rules', 'Things that will play differently.'],
];

// The whole report as plain text, for the file and the chronicle.
export function reportText(rep, sheet) {
  const L = [`Import from Fantasy Grounds: ${rep.name || 'a character'}`];
  if (sheet) L.push(`Built as: level ${sheet.level} ${sheet.class}${sheet.subclass ? ` (${sheet.subclass})` : ''}.`);
  const im = rep.imported ?? {};
  if (im.class) L.push(`Imported: ${[`${im.skills ?? 0} skills`, im.armour && `armour ${im.armour}`, im.shield && 'shield', im.weapons?.length && `weapons ${im.weapons.join(', ')}`, im.cantrips && `${im.cantrips} cantrips`, im.prepared && `${im.prepared} prepared spells`].filter(Boolean).join('; ')}.`);
  if (rep.adjustments?.length) { L.push('', 'ADJUSTMENTS (set so the sheet loads; the DM should check these):'); for (const a of rep.adjustments) L.push(`- ${a.what}${a.from !== undefined ? `: ${a.from} to ${a.to}` : `: ${a.to}`}. ${a.why}`); }
  for (const [k, head] of LISTS) if (rep[k]?.length) { L.push('', `${head.toUpperCase()} (${rep[k].length}):`); for (const x of rep[k]) L.push(`- ${x.name}${x.level !== undefined ? ` (level ${x.level})` : ''}: ${x.why}${x.items?.length ? ` [${x.items.join(', ')}]` : ''}`); }
  if (rep.numbers?.length) { L.push('', 'NUMBERS THAT DIFFER (the sheet\'s against what the engine works out):'); for (const n of rep.numbers) L.push(`- ${n.what}: file ${n.sheet}, engine ${n.engine}${n.why ? `. ${n.why}` : ''}`); }
  const st = rep.state ?? {};
  if (Object.keys(st).length) L.push('', `NOT APPLIED (a sheet has no field for them): Hit Points ${st.hpCurrent ?? '?'} of ${st.hp ?? '?'}${st.tempHp ? `, ${st.tempHp} temporary` : ''}${Object.keys(st.slotsUsed ?? {}).length ? `; spent slots ${Object.entries(st.slotsUsed).map(([l, n]) => `level ${l}: ${n}`).join(', ')}` : ''}${rep.languages?.length ? `; languages ${rep.languages.join(', ')}` : ''}.`);
  return L.join('\n');
}

// Decode the file the way its XML declaration says (Fantasy Grounds writes iso-8859-1), else as UTF-8.
export function decodeXml(buf) {
  const head = new TextDecoder('latin1').decode(buf.slice(0, 200));
  const label = /<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/.exec(head)?.[1] ?? 'utf-8';
  try { return new TextDecoder(label).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

// What the picker gives back for a file: { error } or { character, report }. Never throws.
export async function readImport(file) {
  if (!file) return { error: 'No file was chosen.' };
  if (file.size === 0) return { error: 'That file is empty.' };
  if (file.size > MAX_BYTES) return { error: `That file is too large (${(file.size / 1e6).toFixed(1)} MB). A character export is a few hundred kilobytes at most; the limit here is ${MAX_BYTES / 1e6} MB.` };
  let text;
  try { text = decodeXml(await file.arrayBuffer()); } catch { return { error: 'That file could not be read.' }; }
  if (text.length > XML_LIMITS.chars) return { error: `That file is too large to read (over ${XML_LIMITS.chars.toLocaleString('en-US')} characters).` };
  if (!/^\s*(<\?xml|<!--|<)/.test(text.replace(/^﻿/, ''))) return { error: 'That does not look like an XML file. Fantasy Grounds characters are exported as .xml with "Save" in the character window.' };
  let out;
  try { out = importFgxml(text); } catch { return { error: 'The importer could not read that file.' }; }
  if (!out.report?.ok || !out.character) return { error: out.report?.error ?? 'That file could not be imported.' };
  return out;
}

export function initImport({ act, toast, getState, getSelected }) {
  const file = Object.assign(document.createElement('input'), { type: 'file', id: 'fgi-file', accept: '.xml,text/xml,application/xml', hidden: true });
  const panel = Object.assign(document.createElement('aside'), { id: 'fgi', className: 'panel qe fgi', hidden: true });
  panel.setAttribute('aria-label', 'Import a Fantasy Grounds character');
  document.body.append(file, panel);
  let cur = null, pending = null, busy = false;

  function pick() { file.value = ''; file.click(); }
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    cur = { name: f.name, size: f.size, ...(await readImport(f)) };
    pending = null; busy = false;
    draw(); panel.hidden = false; panel.scrollTop = 0;
  };

  const li = (x) => `<li><b>${esc(x.name)}${x.level !== undefined ? ` <small>level ${esc(x.level)}</small>` : ''}</b> ${esc(x.why ?? '')}${x.items?.length ? `<br><small>${x.items.map(esc).join(', ')}</small>` : ''}</li>`;
  const section = (id, head, sub, count, body, open) => `<details class="fgi-sec" id="fgi-${id}" data-count="${count}"${open ? ' open' : ''}><summary>${esc(head)} <span class="fgi-n">${count}</span></summary>${sub ? `<p class="note">${esc(sub)}</p>` : ''}${body}</details>`;

  function draw() {
    const keepScroll = panel.scrollTop;
    const head = `<div class="qe-head"><h2>Import from Fantasy Grounds</h2><button type="button" class="close" id="fgi-close">Close</button></div>`;
    if (cur.error) {
      panel.innerHTML = `${head}<p class="note">${esc(cur.name)}</p><p class="fgi-error" id="fgi-error" role="alert">${esc(cur.error)}</p><div class="row"><button type="button" id="fgi-again">Choose another file</button></div>`;
      return bind();
    }
    const rep = cur.report, sh = cur.character, im = rep.imported ?? {};
    const sel = getState()?.entities[getSelected()], canReplace = sel?.kind === 'pc' && sel.abil;
    cur.target = canReplace ? sel.id : null;      // the one the button names, even if the selection moves while this is open
    const adj = rep.adjustments ?? [];
    const lists = LISTS.filter(([k]) => rep[k]?.length);
    const imported = [`${im.skills ?? 0} skill${im.skills === 1 ? '' : 's'}`, im.expertise && `${im.expertise} with expertise`, im.armour && `armour: ${im.armour}`, im.shield && 'a shield', im.weapons?.length && `weapons: ${im.weapons.join(', ')}`,
      im.cantrips && `${im.cantrips} cantrips`, im.prepared && `${im.prepared} prepared spells`, im.tools && `${im.tools} tool${im.tools === 1 ? '' : 's'}`, im.gear && `${im.gear} gear name${im.gear === 1 ? '' : 's'}`].filter(Boolean);
    const spellTiers = Object.entries(rep.spellTiers ?? {}).filter(([, v]) => v.length).map(([t, v]) => `${v.length} ${t}`).join(', ');
    const st = rep.state ?? {};
    const body = [
      `<p class="note">${esc(cur.name)} · ${Math.max(1, Math.round(cur.size / 1024))} KB. Nothing has been changed yet: read this, then choose.</p>
      <p class="note" id="fgi-dm-only">Only the DM can import a character: the table refuses a sheet from anyone else.</p>`,
      `<section class="fgi-sum" id="fgi-summary"><h3>What will be set up</h3>
        <p><b>${esc(sh.name)}</b>, level ${esc(sh.level)} ${esc(cap(String(sh.class)))}${sh.subclass ? ` (${esc(cap(String(sh.subclass).replace(/-/g, ' ')))})` : ''}</p>
        <p class="note">Mapped: ${esc(imported.join(' · ') || 'nothing besides class, level and ability scores')}.${spellTiers ? ` Spells by how far the engine plays them: ${esc(spellTiers)}.` : ''} The engine works out Hit Points, Armor Class and the rest from this sheet; they are not copied from the file.</p>
        ${rep.loadable ? '' : `<p class="fgi-error" role="alert">This sheet cannot be played yet: ${esc((rep.problems ?? []).join(' '))}</p>`}</section>`,
      adj.length ? `<section class="fgi-adj" id="fgi-adjustments"><h3>Adjustments and stand-ins (${adj.length})</h3><p class="note">The file could not give these, so the nearest value was set so the sheet loads. Check them.</p><ul class="fgi-list">${adj.map((a) => `<li><b>${esc(a.what)}</b>${a.from !== undefined ? ` ${esc(a.from)} &rarr; ${esc(a.to)}` : ` &rarr; ${esc(a.to)}`}<br>${esc(a.why)}</li>`).join('')}</ul></section>` : `<section id="fgi-adjustments"><h3>Adjustments and stand-ins</h3><p class="note">None.</p></section>`,
      `<section><h3>Not on the sheet</h3>${lists.length ? '' : '<p class="note">Nothing was left out.</p>'}${lists.map(([k, h, sub]) => section(k, h, sub, rep[k].length, `<ul class="fgi-list">${rep[k].map(li).join('')}</ul>`, rep[k].length <= 12)).join('')}
        ${rep.numbers?.length ? section('numbers', 'Numbers that differ from the file', 'What the file says against what the engine works out from the sheet.', rep.numbers.length, `<ul class="fgi-list">${rep.numbers.map((n) => `<li><b>${esc(n.what)}</b> file ${esc(n.sheet)}, engine ${esc(n.engine)}${n.why ? `<br><small>${esc(n.why)}</small>` : ''}</li>`).join('')}</ul>`, false) : ''}
        ${Object.keys(st).length ? `<details class="fgi-sec" id="fgi-state"><summary>Not applied: damage, spent slots, languages</summary><p class="note">A sheet has no field for these. Hit Points in the file: ${esc(st.hpCurrent ?? '?')} of ${esc(st.hp ?? '?')}${st.tempHp ? ` (+${esc(st.tempHp)} temporary)` : ''}.${Object.keys(st.slotsUsed ?? {}).length ? ` Spent slots: ${esc(Object.entries(st.slotsUsed).map(([l, n]) => `level ${l}: ${n}`).join(', '))}.` : ''}${rep.languages?.length ? ` Languages: ${esc(rep.languages.join(', '))}.` : ''} A new character starts rested; a replaced one keeps what it had.</p></details>` : ''}</section>`,
      `<section class="fgi-keep"><h3>Keeping this report</h3><p class="note" id="fgi-keep-note">The character sheet has no place for notes, so when you add or replace the character this report is written to your chronicle (DM panel) under &ldquo;${esc(sh.name)}&rdquo;. Only you can see it; players are never sent it. The sheet will tell you where it is.</p>
        <div class="row"><button type="button" id="fgi-save">Save the report as a text file</button></div></section>`,
    ].join('');
    const foot = `<div class="qe-foot"><p class="fgi-error" id="fgi-refused" role="alert" hidden></p><div class="row">
      <button type="button" id="fgi-add" class="qe-save"${rep.loadable && !busy ? '' : ' disabled'}>Add ${esc(sh.name)} to the table</button>
      ${canReplace ? `<button type="button" id="fgi-replace"${rep.loadable && !busy ? '' : ' disabled'}>Replace ${esc(sel.name)}</button>` : ''}
      <button type="button" id="fgi-cancel">Cancel</button></div></div>`;
    panel.innerHTML = head + body + foot;
    panel.scrollTop = keepScroll;
    bind();
  }

  function bind() {
    const q = (id) => panel.querySelector(`#${id}`);
    q('fgi-close').onclick = close;
    if (q('fgi-again')) q('fgi-again').onclick = pick;
    if (!q('fgi-add')) return;
    q('fgi-cancel').onclick = close;
    q('fgi-save').onclick = () => {
      const url = URL.createObjectURL(new Blob([reportText(cur.report, cur.character)], { type: 'text/plain' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `${(cur.character.name || 'character').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') || 'character'}-import-report.txt` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    };
    const go = (actor) => {
      if (busy) return;
      busy = true; pending = actor ? 'edited' : 'spawned';
      q('fgi-refused').hidden = true; q('fgi-add').disabled = true; if (q('fgi-replace')) q('fgi-replace').disabled = true;
      act({ type: 'setSheet', ...(actor ? { actor } : {}), sheet: structuredClone(cur.character) });
    };
    q('fgi-add').onclick = () => go(null);
    if (q('fgi-replace')) q('fgi-replace').onclick = () => go(cur.target);
  }
  function close() { panel.hidden = true; pending = null; busy = false; cur = null; }

  return {
    // A button that opens the file picker. Each place that offers the import makes its own.
    button(text = 'Import from Fantasy Grounds (.xml)') {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'fgi-open', textContent: text });
      b.onclick = pick;
      return b;
    },
    // The table refused the sheet: say so in the panel, in the engine's words, and let the DM choose again.
    refused(msg) {
      if (!pending || panel.hidden) return;
      pending = null; busy = false;
      draw();
      const r = panel.querySelector('#fgi-refused');
      if (r) { r.textContent = msg; r.hidden = false; r.scrollIntoView({ block: 'nearest' }); }
    },
    events(events) {
      if (!pending || panel.hidden) return;
      const done = events.find((ev) => ev.type === pending);
      if (!done) return;
      const name = getState()?.entities[done.id]?.name ?? cur?.character?.name ?? 'The character', was = pending;
      if (cur) {
        const text = reportText(cur.report, cur.character);
        act(importEntry(name, text.length > CHRONICLE_MAX ? `${text.slice(0, CHRONICLE_MAX)}\n[cut here: save the report as a file for the rest]` : text));
      }
      close();
      toast(`${name} ${was === 'edited' ? 'was made again from the import' : 'joins the party'}.`, true);
    },
    close,
  };
}
