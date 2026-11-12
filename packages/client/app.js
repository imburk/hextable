// The table UI: selection, action bar, character sheet, log, DM tools, lobby.
// It asks the engine what is legal (to grey things out and explain why) and sends
// intents through the transport. It never changes game state itself.
import * as H from './shared/hex.js';
import { moveOptions, current, inFight, up, hostile, blocked, targetsFor, areaHexes, spellStats, clockText, mod, recall, usesFor, checkBonus, passive, aloft, FT } from './shared/engine.js';
import { SKILLS } from './shared/content/schema.js';
import { gap, under } from './shared/space.js';
import { aiStep } from './shared/ai.js';
import { conditionName, conditionPhrase } from './shared/modifiers.js';
import { CONTENT, SPELLS, MONSTERS } from './shared/content/index.js';
import { Renderer, hpFraction } from './render.js';
import { createTracker } from './tracker.js';
import { THEMES } from './themes.js';
import { localTransport, serverTransport, savedSession, prefs, downloadTable } from './transport.js';
import { Editor } from './editor.js';
import { initQuickEntry } from './quickentry.js';
import { localTransport, serverTransport, savedSession, prefs } from './transport.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const MOVE = { kind: 'move' };
// How high above the floor each flyer's next move will end, in feet. Chosen with the Higher and Lower buttons.
const flyAlt = {};
const heightOf = (pos) => { const sf = under(S.map, pos); return sf ? Math.floor((pos.z - sf.z) / FT) * FT : 0; };
const altOf = (e) => flyAlt[e.id] ?? heightOf(e.pos);

let T = null, S = null, selId = null, mode = MOVE, aiTimer = null, toastTimer = null;
let themeId = THEMES[prefs.get('hextable.theme')] ? prefs.get('hextable.theme') : 'classic';
const log = [];
let seeded = false;      // whether the log has been given the table's recent history yet
let chron = [];          // the DM's chronicle when playing online; solo reads it from the local state

function applyTheme() {
  for (const [k, v] of Object.entries(THEMES[themeId].ui)) document.documentElement.style.setProperty(k, v);
}
applyTheme();
const R = new Renderer($('gl'), $('labels'), THEMES[themeId]);

const isDM = () => T?.you?.role === 'dm';
const mine = (e) => !!e && (isDM() || e.owner === T.you.userId);
const name = (id) => S.entities[id]?.name ?? 'Someone';
const act = (action) => T.send(action);

function toast(msg, info = false) {
  const el = $('toast');
  el.textContent = msg; el.classList.toggle('info', info); el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), info ? 1600 : 3200);
}
function setMode(m) { mode = m; refresh(); }
const ED = new Editor({ R, act, toast, state: () => S, isDM, refresh: () => refresh() });     // the DM's map editor
function select(id) { selId = id; mode = MOVE; }

// ---------- events -> log lines and floating numbers ----------
function describe(ev) {
  const n = name;
  switch (ev.type) {
    case 'encounterStart': return ['Roll initiative! ' + ev.order.map((o) => (o.init === undefined ? n(o.id) : `${n(o.id)} ${o.init}`)).join(', '), 'head'];
    case 'encounterEnd': return [{ victory: 'The fight is won.', defeat: 'The party has fallen.', ended: 'The DM ends the fight.', stalemate: 'The fight ends.' }[ev.result] + ` (${ev.rounds} round${ev.rounds > 1 ? 's' : ''})`, 'head'];
    case 'turn': return [`Round ${ev.round}: ${n(ev.id)}'s turn`, 'head'];
    case 'joined': return [`${n(ev.id)} joins the fight${ev.init === undefined ? '' : ` (initiative ${ev.init})`}.`];
    case 'attack': {
      const how = `${ev.actor === null ? `The ${ev.name.toLowerCase()}` : n(ev.actor)} ${ev.opportunity ? 'makes an Opportunity Attack on' : 'attacks'} ${n(ev.target)}${ev.actor === null ? '' : ` with ${ev.name}`}`;
      const result = ev.crit ? 'Critical hit!' : ev.hit ? 'Hit.' : 'Miss.';
      // A monster's roll stays behind the DM's screen: players get the outcome only.
      if (!ev.rolls) return [`${how}${ev.mode === 'adv' ? ' with Advantage' : ev.mode === 'dis' ? ' with Disadvantage' : ''}. ${result}`];
      const dice = ev.rolls.length > 1 ? `${ev.rolls.join(' / ')} with ${ev.mode === 'adv' ? 'Advantage' : 'Disadvantage'} (${ev.why.join(', ')})` : `${ev.nat}`;
      return [`${how}: ${dice} → ${ev.total}${ev.ac === undefined ? '' : ` vs AC ${ev.ac}`}. ${result}`];
    }
    case 'damage': return [`${n(ev.target)} takes ${ev.amount} ${ev.dtype} damage${ev.note ? ` (${ev.note})` : ''}.`, 'bad'];
    case 'heal': return [`${n(ev.target)} regains ${ev.amount} Hit Points.`, 'good'];
    case 'cast': return [`${n(ev.actor)} casts ${ev.name}.`];
    case 'save':
      if (!('roll' in ev)) return [`${n(ev.id)} makes a ${ev.abil.toUpperCase()} save${ev.dc === undefined ? '' : ` against DC ${ev.dc}`}. ${ev.success ? 'Saved.' : 'Failed.'}`];
      return [`${n(ev.id)} ${ev.roll ? `rolls a ${ev.abil.toUpperCase()} save: ${ev.total} vs DC ${ev.dc}.` : `automatically fails the ${ev.abil.toUpperCase()} save.`} ${ev.success ? 'Saved.' : 'Failed.'}`];
    case 'down': return [`${n(ev.id)} drops to 0 Hit Points and is dying.`, 'bad'];
    case 'died': return [`${n(ev.id)} dies.`, 'bad'];
    case 'deathSave': return [`${n(ev.id)} rolls a Death Save: ${ev.roll}. ${ev.hp > 0 ? 'Back on their feet with 1 Hit Point!' : ev.dead ? 'Dead.' : ev.stable ? 'Stable.' : `${ev.s} successes, ${ev.f} failures.`}`, ev.dead ? 'bad' : ''];
    case 'std': return [`${n(ev.id)} uses ${ev.action}.`];
    case 'note': return [`${n(ev.id)}: ${ev.text}.`];
    case 'cond': return [ev.cond === 'prone' ? `${n(ev.id)} is knocked Prone.` : `${n(ev.id)} ${conditionPhrase(ev.cond)}${ev.level ? ` (level ${ev.level})` : ''}.`];
    case 'condEnd': return [`${n(ev.id)} no longer ${conditionPhrase(ev.cond)}.`];
    case 'manual': return [`${ev.name}: ${ev.text}`, 'head'];
    case 'effectStart': return [`${ev.name} takes hold${ev.conc ? ` (${n(ev.source)} is concentrating)` : ''}: ${ev.lasts}.`];
    case 'effectEnd': return [`${ev.name} ends: ${ev.why}.`];
    case 'concentration': return [`${n(ev.id)} rolls to keep Concentration on ${ev.name}: ${ev.total} vs DC ${ev.dc}. ${ev.success ? 'Held.' : 'Lost.'}`];
    case 'stood': return [`${n(ev.id)} stands up (half their Speed).`];
    case 'chronicle': return [`Chronicle: ${ev.title}`, 'head'];
    case 'time': return [`Time passes. It is now ${clockText(ev.t ?? S.clock)}.`];
    case 'rest': return ['The party finishes a Long Rest.', 'good'];
    case 'claimed': return [`${ev.userName || 'The DM'} now plays ${n(ev.id)}.`];
    case 'released': return [`${n(ev.id)} is free for someone to play.`];
    case 'spawned': return [`${n(ev.id)} appears.`];
    case 'map': return [`The scene changes: ${ev.name}.`];
    case 'region': return [`The party sees ${ev.name}.`];
    case 'check': {
      const what = ev.search ? 'searches' : ev.what ? `tries: ${ev.what}` : `rolls ${ev.skill ? `${SKILLS[ev.skill].toUpperCase()} (${ev.skill.replace(/-/g, ' ')})` : ev.ability.toUpperCase()}`;
      const how = ev.mode === 'adv' ? ' with Advantage' : ev.mode === 'dis' ? ' with Disadvantage' : '';
      const end = ev.search ? (ev.found ? ` and finds ${ev.found === 1 ? 'something' : `${ev.found} things`}.` : ' and finds nothing.') : ev.success === true ? ' Success.' : ev.success === false ? ' Failed.' : '';
      return [`${n(ev.id)} ${what}${how}: ${ev.total}${ev.dc !== undefined ? ` vs DC ${ev.dc}` : ''}${ev.search ? '' : '.'}${end}`];
    }
    case 'noticed': return [`${n(ev.id)} notices a ${ev.name.toLowerCase()}.`];
    case 'triggered': return [`${n(ev.id)} sets off a ${ev.name.toLowerCase()}!`];
    case 'fell': return [`${n(ev.id)} falls ${ev.feet} ft.`];
    case 'size': return [`${n(ev.id)} is now ${ev.size[0].toUpperCase()}${ev.size.slice(1)}.`];
    case 'speed': return [ev.feet ? `${n(ev.id)} now has a ${ev.mode === 'walk' ? '' : `${ev.mode[0].toUpperCase()}${ev.mode.slice(1)} `}Speed of ${ev.feet} ft.` : `${n(ev.id)} no longer has a ${ev.mode} speed.`];
    case 'object': return [ev.actor ? `${n(ev.actor)}: the ${ev.name.toLowerCase()} is now ${ev.stateName}.` : `The ${ev.name.toLowerCase()} is now ${ev.stateName}.`];
    case 'gear': return [ev.taken ? `${n(ev.id)} no longer has ${ev.item}.` : `${n(ev.id)} receives ${ev.item}.`];
    case 'revealed': return [`${n(ev.id)} comes into view!`, 'head'];
    case 'concealed': return [`${n(ev.id)} is now hidden from the players.`];
    default: return null;
  }
}
function floaters(events) {
  let i = 0;
  const f = (id, text, cls) => R.floater(id, text, cls, i++ * 0.28);
  for (const ev of events) {
    if (ev.type === 'attack') { if (!ev.hit) f(ev.target, 'Miss', 'miss'); else if (ev.crit) f(ev.target, 'Critical!', 'crit'); }
    else if (ev.type === 'damage') f(ev.target, ev.amount ? `−${ev.amount}` : 'Immune', 'dmg');
    else if (ev.type === 'heal') f(ev.target, `+${ev.amount}`, 'heal');
    else if (ev.type === 'save' && ev.success) f(ev.id, 'Saved', 'miss');
    else if (ev.type === 'note') f(ev.id, ev.text, 'crit');
    else if (ev.type === 'std') f(ev.id, ev.action, '');
    else if (ev.type === 'cond') f(ev.id, conditionName(ev.cond), '');
    else if (ev.type === 'down') f(ev.id, 'Down!', 'dmg');
    else if (ev.type === 'revealed') f(ev.id, 'Spotted!', 'crit');
    else if (ev.type === 'cast') f(ev.actor, ev.name, '');
    else if (ev.type === 'deathSave') f(ev.id, `Death Save ${ev.roll}`, ev.roll >= 10 ? 'heal' : 'dmg');
  }
}

// ---------- state updates ----------
function onUpdate(state, events, fresh) {
  const first = !S || fresh;
  S = state;
  if (first) {
    log.length = 0; selId = null; mode = MOVE; chron = []; seeded = false;
    if (!T.solo && isDM()) T.history({ types: ['chronicle'], limit: 200 });
  }
  QE.events(events);
  for (const ev of events) {
    const d = describe(ev); if (d) log.push(d);
    if (ev.type === 'chronicle') chron.push({ t: S.clock, ...ev });
  }
  if (log.length > 300) log.splice(0, log.length - 300);
  R.setState(S, events);
  floaters(events);
  const turn = events.findLast?.((e) => e.type === 'turn');
  if (turn) { if (mine(S.entities[turn.id]) && S.entities[turn.id].kind === 'pc') select(turn.id); R.focus(turn.id); }
  if (!S.entities[selId]) {
    const own = Object.values(S.entities).find((e) => e.kind === 'pc' && (isDM() ? true : e.owner === T.you.userId));
    selId = own?.id ?? null;
  }
  if (first && selId) R.focus(selId, true);
  else if (events.some((e) => e.type === 'moved' && e.id === selId)) R.focus(selId);
  if (events.some((e) => e.type === 'map')) R.focus(selId ?? Object.values(S.entities).find((e) => e.side === 'party')?.id, true);     // a new place: look at the party
  if (mode !== MOVE && (!S.entities[selId] || !up(S.entities[selId]))) mode = MOVE;
  if (mode.kind === 'attack' || (mode.kind === 'spell' && !mode.keep)) mode = MOVE;
  refresh();
  clearTimeout(aiTimer);
  const cur = S.entities[current(S)];
  if (cur && cur.kind === 'npc' && isDM() && $('dm-auto').checked)
    aiTimer = setTimeout(() => { const a = aiStep(S, cur.id); if (a) act(a); }, 800);
}

// ---------- rendering the UI ----------
function button(label, sub, cls, why, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = `${cls} ${why ? 'off' : ''}`;
  b.innerHTML = `<span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
  b.onclick = () => (why ? toast(why) : onClick());
  return b;
}

function refresh() {
  if (!S) return;
  const enc = S.encounter, cur = current(S), e = S.entities[selId];
  document.body.classList.toggle('fight', !!enc);
  $('mode').textContent = enc ? `Round ${enc.round}` : 'Exploring';
  $('clock').textContent = clockText(S.clock);
  $('btn-dm').hidden = !isDM();
  $('btn-leave').hidden = isDM() || !!T.solo;

  // turn order
  $('order').innerHTML = enc ? enc.order.map((o) => {
    const x = S.entities[o.id]; if (!x) return '';
    return `<li data-side="${x.side}" class="${o.id === cur ? 'now' : ''} ${up(x) ? '' : 'out'}">${esc(x.name)}</li>`;
  }).join('') : '';
  $('order').querySelector('.now')?.scrollIntoView({ block: 'nearest', inline: 'center' });

  // character chips
  const party = $('party'); party.textContent = '';
  const hasChar = Object.values(S.entities).some((x) => x.owner === T.you.userId);
  for (const x of Object.values(S.entities).filter((x) => x.kind === 'pc')) {
    const claimable = !isDM() && !hasChar && !x.owner;
    if (!mine(x) && !claimable) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = `${x.id === selId ? 'sel' : ''} ${x.id === cur ? 'now' : ''}`;
    b.innerHTML = `<i style="background:${esc(x.look?.color || '#888')}"></i>${claimable ? 'Play as ' : ''}${esc(x.name)}`;
    b.onclick = () => { if (claimable) act({ type: 'claim', entity: x.id, user: T.you.userId, userName: T.you.name }); select(x.id); R.focus(x.id); refresh(); };
    party.append(b);
  }

  // selected creature card
  $('card').hidden = !e;
  const hl = { selected: selId, turn: enc ? cur : null };
  let hint = '', go = false;
  if (e) {
    // full: we were sent this creature's whole record (a party member, or anything if we are the DM).
    const my = mine(e), full = !!e.abil, showNumbers = full && (my || e.side === 'party');
    $('c-name').textContent = e.name;
    $('c-sub').textContent = e.kind === 'pc' ? `Level ${e.level} ${e.cls}${e.ownerName ? ` · ${e.ownerName}` : ''}` : MONSTERS[e.tpl]?.name ?? 'Creature';
    $('c-hp').querySelector('i').style.width = `${hpFraction(e) * 100}%`;
    const looks = e.health ?? (e.dead ? 'dead' : e.hp <= 0 ? 'down' : e.hp <= e.maxHp / 2 ? 'bloodied' : 'healthy');
    $('c-hp-text').textContent = showNumbers ? `${e.hp} / ${e.maxHp} HP` : { dead: 'Dead', down: 'Down', bloodied: 'Bloodied', healthy: 'Healthy' }[looks];
    $('c-ac').textContent = showNumbers ? `AC ${e.ac}` : '';
    $('btn-sheet').hidden = !showNumbers;
    $('btn-end').hidden = !(my && enc && cur === e.id);
    const myTurn = enc && cur === e.id && up(e), b = enc?.budget;
    const pip = (label, have) => `<span class="${have ? 'have' : 'spent'}">${label}</span>`;
    const dying = !e.dead && e.hp <= 0 && full && (e.cond.stable ? 'Stable' : `Dying ${e.death.s}✓ ${e.death.f}✗`);
    const named = Object.keys(e.cond).filter((c) => e.cond[c] && c !== 'stable').map((c) => conditionName(c) + (e.cond[c].level ? ` ${e.cond[c].level}` : ''));
    const conds = [e.dead && 'Dead', dying, e.hidden && 'Hidden from players', ...named].filter(Boolean);
    // Lasting effects this creature is under or is keeping up. Whoever controls the source can end one.
    const lasting = (S.effects || []).filter((fx) => fx.source === e.id || fx.parts.some((p) => p.target === e.id && !p.ended)).map((fx) => {
      const left = !fx.until ? '' : fx.until.clock !== undefined ? ` · until ${clockText(fx.until.clock)}` : enc ? ` · ${Math.max(0, fx.until.round - enc.round)} rounds` : '';
      const label = `${esc(fx.name)}${fx.conc ? ' (C)' : ''}${left}`;
      return mine(S.entities[fx.source]) ? `<button type="button" class="fx" data-fx="${esc(fx.id)}" title="End ${esc(fx.name)}">${label} ✕</button>` : `<span class="fx">${label}</span>`;
    }).join('');
    $('c-res').innerHTML =
      (myTurn && full ? pip('Action', b.action > 0) + pip('Bonus Action', b.bonus > 0) + pip(`Move ${b.move} ft`, b.move >= FT) : '') +
      (full && enc && inFight(S, e.id) ? pip('Reaction', !e.reactionUsed) : '') +
      Object.keys(e.slotsMax || {}).map((l) => pip(`Level ${l} slots ${e.slots[l]}/${e.slotsMax[l]}`, e.slots[l] > 0)).join('') +
      conds.map((c) => `<span>${c}</span>`).join('') + lasting;

    const bar = $('actions'); bar.textContent = '';
    if (my && up(e)) {
      if (enc && inFight(S, e.id) && cur !== e.id) bar.innerHTML = `<span class="wait">Waiting for ${esc(name(cur))}…</span>`;
      else {
        for (const a of e.attacks) {
          const armed = mode.kind === 'attack' && mode.id === a.id;
          bar.append(button(a.name, `${signed(a.bonus)} · ${a.damage} ${a.dtype}`, armed ? 'armed' : '', blocked(S, e, 'action'),
            () => setMode(armed ? MOVE : { kind: 'attack', id: a.id })));
        }
        for (const id of e.spells) {
          const sp = SPELLS[id], armed = mode.kind === 'spell' && mode.id === id;
          const why = blocked(S, e, sp.time) || (sp.level > 0 && !(e.slots[sp.level] > 0) && `${e.name} has no level ${sp.level} spell slots left.`) ||
            (sp.level > 0 && enc?.flags.slot && 'Only one spell slot can be spent per turn.') || '';
          const what = sp.heal ? `heal ${sp.heal.dice}${sp.heal.addMod ? signed(mod(e.abil[e.castAbil])) : ''}` : sp.short;
          // A spell with nothing to aim (it affects the caster, or the DM applies it) is cast on the spot.
          const pick = () => (sp.aim === 'self' || sp.aim === 'none' ? act({ type: 'cast', actor: e.id, spell: id }) : setMode(armed ? MOVE : { kind: 'spell', id, aim: null, keep: !!sp.area }));
          bar.append(button(sp.name, `${sp.level ? 'Slot' : 'Cantrip'}${sp.time === 'bonus' ? ' · Bonus' : ''} · ${what}`, `${armed ? 'armed' : ''} ${sp.time === 'bonus' ? 'bonus' : ''}`, why,
            pick));
        }
        if (e.features.secondWind && (enc || e.hp < e.maxHp))
          bar.append(button('Second Wind', `Bonus · heal 1d10+${e.level} · ${e.uses.secondWind} left`, 'bonus',
            blocked(S, e, 'bonus') || (!e.uses.secondWind && 'No uses of Second Wind left.') || (e.hp >= e.maxHp && `${e.name} is at full Hit Points.`) || '',
            () => act({ type: 'secondWind', actor: e.id })));
        if (aloft(S, e)) {
          const alt = altOf(e);
          bar.append(button('Higher', `Fly at ${alt + FT} ft`, '', '', () => { flyAlt[e.id] = alt + FT; refresh(); }));
          bar.append(button(alt ? 'Lower' : 'On the ground', alt ? `Fly at ${alt - FT} ft${alt === FT ? ' (land)' : ''}` : 'Tap Higher to take off', '', alt ? '' : 'Already as low as it goes.', () => { flyAlt[e.id] = alt - FT; refresh(); }));
        }
        bar.append(button('Search', `${enc ? 'Action · ' : ''}Perception ${signed(checkBonus(e, { skill: 'perception' }))} · 15 ft`, '', blocked(S, e, 'action'), () => act({ type: 'search', actor: e.id })));
        // Doors and other things within reach.
        for (const u of usesFor(S, e)) bar.append(button(`${u.label}`, `${u.name}${enc ? (u.time === 'free' ? ' · free once a turn' : ' · Action') : ''}`, '', u.why, () => act({ type: 'use', actor: e.id, object: u.object, verb: u.verb })));
        if (myTurn) {
          bar.append(button('Dash', 'Action · double move', '', blocked(S, e, 'action'), () => act({ type: 'dash', actor: e.id })));
          const nimble = e.features.nimbleEscape;
          bar.append(button('Disengage', `${nimble ? 'Bonus' : 'Action'} · no Opportunity Attacks`, nimble ? 'bonus' : '', blocked(S, e, nimble ? 'bonus' : 'action'), () => act({ type: 'disengage', actor: e.id })));
          bar.append(button('Dodge', 'Action · attackers roll with Disadvantage', '', blocked(S, e, 'action'), () => act({ type: 'dodge', actor: e.id })));
        }
      }
      // highlights and hint for the armed action
      // A flyer's highlights are the places at the height it has chosen; everyone else's are on the ground.
      if (mode.kind === 'move' && myTurn) hl.move = [...moveOptions(S, e)].filter(([, v]) => v.canStop && (!aloft(S, e) || heightOf(v.h) === altOf(e))).map(([k]) => k);
      if (mode.kind === 'attack') {
        const a = e.attacks.find((x) => x.id === mode.id);
        hl.targets = targetsFor(S, e, { attack: mode.id }).filter((id) => hostile(S.entities[id], e));
        hint = hl.targets.length ? `${a.name}: tap a target` : `${a.name}: nobody in reach (${a.type === 'melee' ? a.reach : a.range[1]} ft)`;
      }
      if (mode.kind === 'spell') {
        const sp = SPELLS[mode.id];
        if (sp.area) {
          const aimed = !!mode.aim || sp.area.shape === 'emanation';       // an emanation surrounds the caster: nothing to aim
          const hexes = aimed ? areaHexes(S, e, sp, mode.aim) : [];
          hl.area = hexes.map(H.key);
          const caught = Object.values(S.entities).filter((x) => !x.dead && hl.area.includes(H.col(x.pos)));
          const how = sp.area.shape === 'cone' ? `tap a hex to aim the ${sp.area.size} ft cone` : `tap where the ${sp.area.size} ft ${sp.area.shape} goes (within ${sp.range} ft)`;
          hint = aimed ? `${sp.name} catches ${caught.length ? caught.map((x) => x.name).join(', ') : 'nobody'}` : `${sp.name}: ${how}`;
          go = aimed && hexes.length > 0;
        } else {
          const ids = targetsFor(S, e, { spell: mode.id });
          if (!sp.harmful) hl.allies = ids.filter((id) => !hostile(S.entities[id], e));
          else hl.targets = ids.filter((id) => hostile(S.entities[id], e));
          hint = (hl.allies || hl.targets).length ? `${sp.name}: tap a target` : `${sp.name}: nobody within ${sp.range} ft`;
        }
      }
    }
  }
  if (mode.kind === 'spawn') hint = `Tap a hex to add a ${MONSTERS[mode.monster].name}`;
  if (mode.kind === 'place') hint = `Tap a hex to place ${name(selId)}`;
  if (mode.kind === 'encounter') hint = 'Tap the hex where the fight breaks out';
  $('hint').hidden = !hint; $('hint-text').textContent = hint; $('hint-go').hidden = !go;
  R.setCeiling(ED.on ? ED.ceiling() : S.entities[selId] ? S.entities[selId].pos.z + 9 : Infinity);     // floors above whoever is selected are lifted out of the way
  R.setHighlights(ED.on ? ED.marks() : hl);
  R.inset = $('dock').offsetHeight * 0.85;
  ED.sync();

  if (!$('log').hidden) renderLog();
  if (!$('sheet').hidden) { if (S.entities[selId]?.abil) renderSheet(); else $('sheet').hidden = true; }
  tracker.render();
  if (isDM()) renderDM();
}

function renderLog() {
  $('log-list').innerHTML = log.slice(-120).map(([t, c]) => `<li class="${c || ''}">${esc(t)}</li>`).join('');
  $('log-list').lastElementChild?.scrollIntoView({ block: 'end' });
}

function renderSheet() {
  const e = S.entities[selId]; if (!e) return;
  const st = e.castAbil ? spellStats(e) : null;
  const abil = Object.entries(e.abil).map(([k, v]) => `<div><small>${k}</small><b>${signed(mod(v))}</b><small>${v}</small></div>`).join('');
  const saves = Object.keys(e.abil).map((k) => `${k.toUpperCase()} ${signed(mod(e.abil[k]) + (e.saveProf.includes(k) ? e.prof : 0))}`).join(' · ');
  $('sheet-body').innerHTML = `
    <h2>${esc(e.name)}</h2>
    <p class="note">${e.kind === 'pc' ? `Level ${e.level} ${esc(e.cls)}` : esc(MONSTERS[e.tpl]?.name ?? 'Creature')}</p>
    <div class="facts"><span>HP ${e.hp} / ${e.maxHp}</span><span>AC ${e.ac}</span><span>Speed ${e.speed} ft</span><span>Initiative ${signed(mod(e.abil.dex))}</span><span>Proficiency ${signed(e.prof)}</span></div>
    <div class="stats">${abil}</div>
    <p class="note">Saving throws: ${saves}</p>
    <section><h3>Attacks</h3><table><tr><th>Name</th><th>To hit</th><th>Damage</th><th>Range</th></tr>
      ${e.attacks.map((a) => `<tr><td>${esc(a.name)}</td><td>${signed(a.bonus)}</td><td>${a.damage} ${a.dtype}</td><td>${a.type === 'melee' ? `${a.reach} ft` : `${a.range[0]}/${a.range[1]} ft`}</td></tr>`).join('')}</table></section>
    ${st ? `<section><h3>Spells · save DC ${st.dc} · attack ${signed(st.attack)} · ${Object.keys(e.slotsMax).map((l) => `level ${l} slots ${e.slots[l]}/${e.slotsMax[l]}`).join(', ')}</h3>
      <table><tr><th>Spell</th><th>Level</th><th>Casting</th><th>Range</th><th>Effect</th></tr>
      ${e.spells.map((id) => { const sp = SPELLS[id]; return `<tr><td>${sp.name}</td><td>${sp.level || 'Cantrip'}</td><td>${sp.time === 'bonus' ? 'Bonus Action' : sp.time === 'action' ? 'Action' : esc(sp.time)}</td><td>${sp.area ? `${sp.area.size} ft ${sp.area.shape}` : sp.range === 5 ? 'Touch' : sp.range === 0 ? 'Self' : `${sp.range} ft`}</td><td>${sp.heal ? `Heal ${sp.heal.dice}${sp.heal.addMod ? signed(mod(e.abil[e.castAbil])) : ''}` : esc(sp.long)}</td></tr>`; }).join('')}</table></section>` : ''}
    ${Object.keys(e.features).length ? `<section><h3>Features</h3><div class="facts">${[e.features.sneak && `Sneak Attack ${e.features.sneak}`, e.features.secondWind && `Second Wind (${e.uses.secondWind} left)`, e.features.packTactics && 'Pack Tactics', e.features.nimbleEscape && 'Nimble Escape'].filter(Boolean).map((f) => `<span>${f}</span>`).join('')}</div></section>` : ''}
    ${e.vuln.length || e.immune.length || e.resist.length ? `<section><h3>Defenses</h3><div class="facts">${e.vuln.map((v) => `<span>Vulnerable: ${v}</span>`).join('')}${e.resist.map((v) => `<span>Resistant: ${v}</span>`).join('')}${e.immune.map((v) => `<span>Immune: ${v}</span>`).join('')}</div></section>` : ''}
    <section><h3>Skills · passive Perception ${passive(S, e, 'perception')}</h3><div class="facts">${Object.keys(SKILLS).map((k) => `<button type="button" class="skill${e.skills?.includes(k) ? ' prof' : ''}" data-skill="${k}">${k.replace(/-/g, ' ')} ${signed(checkBonus(e, { skill: k }))}</button>`).join('')}</div><p class="note">Tap a skill to roll it. The DM says what comes of it.</p></section>
    ${e.gear.length ? `<section><h3>Gear</h3><div class="facts">${e.gear.map((g) => `<span>${esc(g)}</span>`).join('')}</div></section>` : ''}`;
  for (const b of $('sheet-body').querySelectorAll('[data-skill]')) b.onclick = () => act({ type: 'check', actor: e.id, skill: b.dataset.skill });
}

function renderDM() {
  $('dm-end').disabled = !S.encounter; $('dm-start').disabled = !!S.encounter;
  $('dm-engage').checked = S.settings.autoEngage; $('dm-passive').value = S.settings.passiveFind ?? 'off';
  $('dm-vertical').value = S.settings.vertical ?? 'max'; $('dm-climb').checked = S.settings.climbing !== 'off';
  const picked = S.entities[selId], hideable = picked && picked.side !== 'party' && !picked.dead;
  $('dm-hide').disabled = !hideable || (!picked.hidden && inFight(S, picked.id));
  $('dm-hide').textContent = picked?.hidden ? 'Reveal selected' : 'Hide selected';
  $('dm-size').disabled = !picked; if (picked) $('dm-size').value = picked.size ?? 'medium';
  $('dm-fly').disabled = !picked; $('dm-fly').textContent = picked?.speeds?.fly ? 'Take flight from selected' : 'Give selected flight';
  QE.sync(S, selId);
  $('dm-solo').hidden = !T.solo;
  const lb = T.lobby || { members: [], pending: [] }, table = $('dm-table');
  $('dm-badge').hidden = !lb.pending.length; $('dm-badge').textContent = lb.pending.length;
  table.textContent = '';
  if (!T.solo) {
    table.innerHTML = `<p class="note">Table code</p><code>${esc(T.you.code)}</code><p class="note">At the table: ${lb.members.map((m) => `${esc(m.name)}${m.online ? '' : ' (away)'}`).join(', ')}</p>`;
    for (const p of lb.pending) {
      const row = document.createElement('div'); row.className = 'req';
      row.innerHTML = `<span><b>${esc(p.name)}</b> wants to join</span><span class="row"></span>`;
      const yes = document.createElement('button'), no = document.createElement('button');
      yes.type = no.type = 'button'; yes.textContent = 'Let in'; no.textContent = 'Decline';
      yes.onclick = () => T.approve(p.id, true); no.onclick = () => T.approve(p.id, false);
      row.lastChild.append(yes, no); table.append(row);
    }
  }
  // Places: the map's regions, and whether the players have been shown each.
  const places = $('dm-places'); places.textContent = '';
  $('dm-places-box').hidden = !S.map.regions.length;
  for (const r of S.map.regions) {
    const row = document.createElement('div'); row.className = 'req';
    row.innerHTML = `<span><b>${esc(r.name)}</b> ${r.revealed ? 'revealed' : 'unseen'}</span><span class="row"></span>`;
    const b = document.createElement('button'); b.type = 'button'; b.textContent = r.revealed ? 'Hide' : 'Reveal';
    b.onclick = () => act({ type: 'revealRegion', region: r.id, revealed: !r.revealed });
    row.lastChild.append(b); places.append(row);
  }
  // Who plays whom: the DM can hand any character to any player, or take it back.
  const players = lb.members.filter((m) => m.role === 'player');
  $('dm-chars-box').hidden = T.solo; $('dm-leave-box').hidden = T.solo;
  const chars = $('dm-chars'); chars.textContent = '';
  if (!T.solo) for (const x of Object.values(S.entities).filter((x) => x.kind === 'pc')) {
    const row = document.createElement('label'); row.className = 'assign';
    const sel = document.createElement('select');
    const known = players.some((m) => m.id === x.owner);
    sel.innerHTML = `<option value="">Nobody (DM)</option>${players.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}${x.owner && !known ? `<option value="${esc(x.owner)}">${esc(x.ownerName || 'Someone')} (left)</option>` : ''}`;
    sel.value = x.owner || '';
    sel.onchange = () => {
      const m = players.find((p) => p.id === sel.value);
      act(m ? { type: 'claim', entity: x.id, user: m.id, userName: m.name } : { type: 'release', entity: x.id });
    };
    row.append(document.createTextNode(x.name), sel); chars.append(row);
  }
  $('chron-list').innerHTML = (T.solo ? recall(S, { types: ['chronicle'] }) : chron).slice().reverse().map((c) => `<li><time>${clockText(c.t)}</time>${esc(c.title)}</li>`).join('');
}

// ---------- taps ----------
R.onTap = ({ hex, id }) => {
  if (!S || !T) return;
  const e = S.entities[selId], tapped = id ? S.entities[id] : null;
  if (mode.kind === 'spawn') return act({ type: 'spawn', monster: mode.monster, at: hex, hidden: $('dm-hidden').checked });
  if (mode.kind === 'place') { act({ type: 'place', actor: selId, to: hex }); return setMode(MOVE); }
  if (mode.kind === 'encounter') { act({ type: 'startEncounter', center: hex }); return setMode(MOVE); }
  if (mode.kind === 'attack') return tapped && tapped.id !== selId ? act({ type: 'attack', actor: selId, target: id, attack: mode.id }) : setMode(MOVE);
  if (mode.kind === 'spell') {
    if (SPELLS[mode.id].area) { mode.aim = hex; return refresh(); }
    return tapped ? act({ type: 'cast', actor: selId, spell: mode.id, target: id }) : setMode(MOVE);
  }
  if (tapped) {
    const myTurn = e && mine(e) && S.encounter && current(S) === e.id;
    if (myTurn && tapped.id !== e.id && hostile(tapped, e) && !tapped.dead) {         // tap an enemy on your turn: attack with whatever reaches
      const d = gap(S, e.pos, tapped.pos) * FT;
      const a = e.attacks.find((x) => (x.type === 'melee' ? d <= x.reach : d <= x.range[1] && d > 5)) || e.attacks.find((x) => x.type === 'ranged' && d <= x.range[1]);
      if (a) return act({ type: 'attack', actor: e.id, target: tapped.id, attack: a.id });
      return toast(`${tapped.name} is ${d} ft away. Move closer, or pick a spell.`);
    }
    select(tapped.id); return refresh();
  }
  if (e && mine(e) && hex) {
    // A flyer goes to the tapped hex at its chosen height; if it cannot stop there, say so.
    if (aloft(S, e) && altOf(e) > 0) {
      const spot = [...moveOptions(S, e).values()].find((v) => v.canStop && v.h.q === hex.q && v.h.r === hex.r && heightOf(v.h) === altOf(e));
      return spot ? act({ type: 'move', actor: e.id, to: spot.h }) : toast(`${e.name} can't reach that at ${altOf(e)} ft up.`);
    }
    act({ type: 'move', actor: e.id, to: hex });
  }
};
R.onHover = (hex) => { if (mode.kind === 'spell' && SPELLS[mode.id].area && hex && !mode.pinned && H.key(hex) !== (mode.aim && H.key(mode.aim))) { mode.aim = hex; refresh(); } };

// ---------- controls ----------
$('btn-end').onclick = () => act({ type: 'endTurn', actor: selId });
$('hint-cancel').onclick = () => setMode(MOVE);
$('hint-go').onclick = () => { act({ type: 'cast', actor: selId, spell: mode.id, hex: mode.aim }); mode = MOVE; };
$('cam-l').onclick = () => R.rotate(-Math.PI / 6); $('cam-r').onclick = () => R.rotate(Math.PI / 6);
$('cam-in').onclick = () => R.zoom(0.8); $('cam-out').onclick = () => R.zoom(1.25);
const tracker = createTracker({ root: $('tracker'), button: $('btn-tracker'), dock: $('dock'), state: () => S, isDM, mine, act, toast, pick: (id) => { select(id); R.focus(id); refresh(); } });
$('btn-tracker').onclick = tracker.toggle;
const panels = ['sheet', 'log', 'dm'];
const openPanel = (id) => { for (const p of panels) $(p).hidden = p !== id || !$(p).hidden; refresh(); };
$('btn-sheet').onclick = () => openPanel('sheet'); $('btn-log').onclick = () => openPanel('log'); $('btn-dm').onclick = () => openPanel('dm');
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => ($(b.dataset.close).hidden = true);
$('btn-look').onclick = () => {
  const ids = Object.keys(THEMES); themeId = ids[(ids.indexOf(themeId) + 1) % ids.length];
  prefs.set('hextable.theme', themeId); applyTheme(); R.setTheme(THEMES[themeId]); toast(THEMES[themeId].name, true);
};
const closeDM = () => { if (window.innerWidth < 900) $('dm').hidden = true; };
$('dm-start').onclick = () => { closeDM(); setMode({ kind: 'encounter' }); };
$('dm-end').onclick = () => act({ type: 'endEncounter' });
$('dm-place').onclick = () => { if (!selId) return toast('Select a creature first.'); closeDM(); setMode({ kind: 'place' }); };
$('dm-rest').onclick = () => act({ type: 'rest' });
$('c-res').onclick = (ev) => { const b = ev.target.closest('[data-fx]'); if (b) act({ type: 'endEffect', effect: b.dataset.fx }); };
// Conditions: pick one, then put it on the selected creature or take it off.
$('dm-cond').innerHTML = Object.values(CONTENT.conditions).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
$('dm-cond-set').onclick = () => {
  const e = S.entities[selId], id = $('dm-cond').value;
  if (!e) return toast('Select a creature first.');
  const def = CONTENT.conditions[id], level = e.cond[id]?.level ?? 0;
  if (!e.cond[id]) act({ type: 'condition', actor: e.id, condition: id, on: true });
  else if (def.levels && level < def.levels) act({ type: 'condition', actor: e.id, condition: id, on: true, level: level + 1 });   // tap again to stack a level
  else act({ type: 'condition', actor: e.id, condition: id, on: false });
};
$('dm-cond-clear').onclick = () => { const e = S.entities[selId], id = $('dm-cond').value; if (e?.cond[id]) act({ type: 'condition', actor: e.id, condition: id, on: false }); else toast(e ? `${e.name} doesn't have that condition.` : 'Select a creature first.'); };
$('dm-hide').onclick = () => { const e = S.entities[selId]; if (e) act({ type: 'reveal', actor: e.id, hidden: !e.hidden }); };
$('dm-engage').onchange = (ev) => act({ type: 'setting', key: 'autoEngage', value: ev.target.checked });
$('dm-vertical').onchange = (ev) => act({ type: 'setting', key: 'vertical', value: ev.target.value });
$('dm-climb').onchange = (ev) => act({ type: 'setting', key: 'climbing', value: ev.target.checked ? 'on' : 'off' });
$('dm-size').onchange = (ev) => { if (S.entities[selId]) act({ type: 'setSize', actor: selId, size: ev.target.value }); };
$('dm-fly').onclick = () => { const e = S.entities[selId]; if (e) act({ type: 'setSpeed', actor: e.id, mode: 'fly', feet: e.speeds?.fly ? 0 : 60 }); };
$('dm-passive').onchange = (ev) => act({ type: 'setting', key: 'passiveFind', value: ev.target.value });
$('dm-auto').onchange = () => S && onUpdate(S, []);
$('dm-new').onclick = () => T.reset?.();
$('dm-export').onclick = () => T.export().then(downloadTable, (e) => toast(e.message));
// Leaving takes two taps, so a stray one can't drop you from the table.
let leaveTimer = null;
function leaveTable(btn) {
  if (!btn.classList.contains('sure')) {
    const label = btn.textContent;
    btn.classList.add('sure'); btn.textContent = 'Tap again to leave';
    clearTimeout(leaveTimer); leaveTimer = setTimeout(() => { btn.classList.remove('sure'); btn.textContent = label; }, 3000);
    return;
  }
  clearTimeout(leaveTimer); btn.classList.remove('sure'); btn.textContent = btn.id === 'dm-leave' ? 'Leave table' : 'Leave';
  T.leave?.(); T = null; S = null; selId = null; clearTimeout(aiTimer);
  for (const id of ['dm', 'sheet', 'log', 'card']) $(id).hidden = true;
  $('btn-dm').hidden = $('btn-leave').hidden = true;
  lobbyBusy(false); $('lobby-msg').textContent = 'You left the table.'; $('lobby').hidden = false;
}
$('btn-leave').onclick = (ev) => leaveTable(ev.currentTarget);
$('dm-leave').onclick = (ev) => leaveTable(ev.currentTarget);
for (const [id, m] of Object.entries(MONSTERS)) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = `Add ${m.name}`;
  b.onclick = () => { closeDM(); setMode({ kind: 'spawn', monster: id }); };
  $('dm-spawn').append(b);
}
for (const b of document.querySelectorAll('[data-time]')) b.onclick = () => act({ type: 'advanceTime', minutes: +b.dataset.time });
$('dm-chron').onsubmit = (ev) => { ev.preventDefault(); const t = $('chron-title').value.trim(); if (t) { act({ type: 'chronicle', title: t }); $('chron-title').value = ''; } };
addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT') return;
  if (ev.key === 'Escape') setMode(MOVE);
  if (ev.key === 'q') R.rotate(-Math.PI / 12); if (ev.key === 'e') R.rotate(Math.PI / 12);
});

const QE = initQuickEntry({ act, toast, getState: () => S, getSelected: () => selId });

// For the browser console, tests and future automation.
window.hextable = { R, act, get state() { return S; }, get mode() { return mode; } };

// ---------- joining a table ----------
// While a host or join request is in flight, the buttons are off so a second tap can't send a second request.
const lobbyBusy = (on) => { $('lobby-host').disabled = $('lobby-join').disabled = on; };
function start(transport) {
  T?.close?.();                 // only ever one connection to a table
  ED.stop();
  T = transport; S = null;
  lobbyBusy(!T.solo);
  T.on.update = onUpdate;
  T.on.error = (msg, expired) => { if (expired) { S = null; lobbyBusy(false); $('lobby').hidden = false; $('lobby-msg').textContent = msg; } else toast(msg); };
  T.on.lobby = () => S && refresh();
  T.on.history = (msg) => {
    if (!S) return;
    if (msg.recent) {             // what happened before we sat down, so the log has some context
      if (seeded) return;         // a reconnect sends it again; the log already has it
      seeded = true;
      const lines = msg.entries.map(describe).filter(Boolean);
      log.unshift(...lines);
    } else chron = msg.entries.filter((e) => e.type === 'chronicle');
    refresh();
  };
  T.on.welcome = (you) => { $('lobby').hidden = you.approved; if (!you.approved) $('lobby-msg').textContent = `Table ${you.code}: waiting for the DM to let you in…`; };
  T.start();
}
const lobbyName = () => $('lobby-name').value.trim() || 'Adventurer';
$('lobby-host').onclick = () => start(serverTransport({ t: 'host', name: lobbyName() }));
$('lobby-join').onclick = () => { const code = $('lobby-code').value.trim(); if (code) start(serverTransport({ t: 'join', code, name: lobbyName() })); else $('lobby-msg').textContent = 'Enter the table code your DM gave you.'; };
$('lobby-solo').onclick = () => { $('lobby').hidden = true; start(localTransport()); };
$('lobby-card').onsubmit = (ev) => ev.preventDefault();

(async () => {
  let server = false;
  try { const r = await fetch('./api/ping', { cache: 'no-store' }); server = r.ok && (await r.json()).ok === true; } catch { /* no table server: solo */ }
  if (!server) return start(localTransport());
  const sess = savedSession();
  if (sess) start(serverTransport({ t: 'resume', ...sess })); else $('lobby').hidden = false;
})();
