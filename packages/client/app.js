// The table UI: selection, action bar, character sheet, log, DM tools, lobby.
// It asks the engine what is legal (to grey things out and explain why) and sends
// intents through the transport. It never changes game state itself.
import { key as cellKey, col as cellCol, gridOf } from './shared/grid.js';
import { reactionsHtml, bindReactions } from './reactionsheet.js';
import { featuresHtml, initShortRest } from './features.js';
import { moveOptions, acShown, current, inFight, up, hostile, targetsFor, areaHexes, areaTargets, spellStats, clockText, mod, recall, passive, aloft, FT, fromPool, attacksLeft, actionSpent, ownerOf, BOND_KINDS, apply } from './shared/engine.js';
import { actionProfile, rangeAt, targetCount } from './shared/effects.js';
import { SKILLS, CHOICES } from './shared/content/schema.js';
import { gap, under } from './shared/space.js';
import { tapAttack, rearm, hintOf as flurryHint, spentWords } from './flurry.js';
import { coverOf } from './shared/sight.js';
import { autoPlays } from './shared/ai.js';
import { aiAction } from './standin.js';
import { conditionName, conditionPhrase } from './shared/modifiers.js';
import { holdWords, heldEndText, noteText, previewState, targetRefusals } from './grapple.js';
import { slotMenu, slotFor } from './upcast.js';
import { inReach, aimFeet, reachEdge, farWords } from './aimrange.js';
import { offerOf, offers, waitingFor, reachOf, moveLabel, forgoLabel, offerWords, waitWords, giveUpLabel } from './allowance.js';
import { CONTENT, SPELLS, MONSTERS } from './shared/content/index.js';
import { hpFraction } from './three-build.js';
import { createRenderer, rendererKind } from './renderer.js';
import { createTracker, shownName } from './tracker.js';
import { mountDot } from './linkdot.js';
import { seenState } from './linkquality.js';
import { initActionPanel } from './actionpanel.js';
import { initCompanions, isSummon, orderText, pocketHtml } from './companions.js';
import { initFormation, formationWhy, leads, whyNoFormation, followersOf } from './formation.js';
import { initDrawer } from './drawer.js';
import { initSettings } from './settings.js';
import { aboutHTML } from './about.js';
import { VERSION } from './shared/migrate.js';
import { THEMES, setLook } from './themes.js';
import { localTransport, serverTransport, savedSession, lastSession, hasSoloGame, forgetSession, forgetLastSession, forgetSolo, windowSoloKey, setWindowSoloKey, newCopyKey, SOLO_KEY, prefs, downloadTable } from './transport.js';
import { claimWriter } from './solowriter.js';
import { Editor } from './editor.js';
import { initQuickEntry } from './quickentry.js';
import { initHandouts } from './handouts.js';
import { initTodo } from './todo.js';
import { initPacks } from './packmanager.js';
import { initScenes } from './scenes.js';
import { initReactionPrompt } from './reactionprompt.js';
import { initClasses, formOf, formName, skillBonus, isLent, lentList, nice as niceId } from './classes.js';
import { createDice, MAX_DICE, titleOf, nextSource } from './dice.js';
import { createTimeline, paceFor } from './timeline.js';
import { initLogView, kindOf } from './logview.js';
import { objectDef } from './shared/walls.js';
import { refreshReport, refreshNote } from './refresh.js';
import { classTitle, missingText } from './buildsheet.js';
import { dmLine, tableRule } from './shared/scores.js';
import { initTableControls, importLine, gridWords, aimedWords } from './tablecontrols.js';
import { initMyCharacters, ROOT as SOLO_ROOT, PARTY_KEY } from './mycharacters.js';
import { titleOf as trailTitle, loadDraft, saveDraft, keepFront, hasDraft } from './startflow.js';
import { initDefeat } from './defeat.js';
import { initConclusion, logLine, xpFact } from './conclusion.js';
import { ACTIONS, actionOf, presetOf, leaveAlone, createWalker, yawFacing } from './keys.js';
import { initFeedback } from './feedback.js';
import { mountNewVersion } from './newversion.js';
import { wire as wireUndo, nameOf } from './undobar.js';
import { createHold, HOLD_MS } from './hold.js';
import { createPings, cellAtPoint, pingColor } from './ping.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const MOVE = { kind: 'move' };
const OWED = { kind: 'owed' };     // the Move button of an Opportunity Attack's movement was pressed (allowance.js): the next tap on a shaded place is the move
// How high above the floor each flyer's next move will end, in feet. Chosen with the Higher and Lower buttons.
const flyAlt = {};
const heightOf = (pos) => { const sf = under(S.map, pos); return sf ? Math.floor((pos.z - sf.z) / FT) * FT : 0; };
const altOf = (e) => flyAlt[e.id] ?? heightOf(e.pos);

const SCORE_EVENTS = ['scoresRolled', 'scoreRerolled'];
let T = null, S = null, selId = null, mode = MOVE, aiTimer = null, toastTimer = null, aiSent = null;
let themeId = THEMES[prefs.get('hextable.theme')] ? prefs.get('hextable.theme') : 'classic';
let seeded = false;      // whether the log has been given the table's recent history yet
let chron = [];          // the DM's chronicle when playing online; solo reads it from the local state

function applyTheme() {
  for (const [k, v] of Object.entries(THEMES[themeId].ui)) document.documentElement.style.setProperty(k, v);
}
applyTheme();
const R = createRenderer(rendererKind(location.search, prefs.get('hextable.renderer')), $('gl'), $('labels'), THEMES[themeId]);      // 'three' (the 3D view; the only one that draws) or 'none' (?renderer=none): renderer.js

// The timeline (docs/specs/renderer.md, decisions 2 and 3): the events of an update play as beats, one after another. The log
// line and the floating text of an event come on its beat, the picture is brought to what the beats have shown, and in `wait`
// the player's controls skip instead of acting until the beats are done. The pace is this device's own preference
// (`hextable.pace`: 'wait', 'flow' or 'instant'; unset follows the table, then reduced motion), read only through pace().
// The table setting `pace` (state.settings.pace) is read too once the engine has it; a player may only make it quicker.
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const pace = () => paceFor({ table: S?.settings?.pace, mine: prefs.get('hextable.pace'), reduced: reducedMotion() });
const AI_PAUSE = 350;       // ms after the picture is still before a monster's next step, in `wait`
let tookBack = false, snapping = false, floatRun = { id: 0, n: 0 };      // snapping: the update being pushed is shown at once (R4: the renderer then animates nothing)
const played = [];          // the last beats played on this device with their times, for tests: window.hextable.played
const TL = createTimeline({
  clock: () => performance.now() / 1000,
  pace: pace(),
  gridOf: (st) => gridOf(st?.map),
  onBeat: (ev, ctx) => beat(ev, ctx),
  onShow: (state, events) => { if (S) R.setState(shownState(state), events, { instant: TL.pace === 'instant' || snapping }); },
  onDone: (u) => { if (S && u.meta.first && selId) R.focus(selId, true); },
  onIdle: () => { R.settle(); idled(); },        // whatever the renderer is still easing (a door, a fall) is brought to its end state
});
setInterval(() => TL.tick(), 33);
// A player who goes quiet becomes lost in the DM's tracker with no message to say so (linkquality.js, seenState): look now and then.
let linkKey = '';
setInterval(() => {
  if (!S || !T || T.solo || !isDM()) return;
  const key = Object.values(S.entities).map((e) => linkOf(e)?.state ?? '').join();
  if (key !== linkKey) { linkKey = key; tracker.render(); }
}, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) TL.skip(); });      // a tab that was hidden shows everything at once on its return
// A tap on a control or the map, while beats play in `wait`, skips them instead of acting.
const skipping = () => TL.pace === 'wait' && TL.busy() && TL.skip();
const syncPlaying = () => { const on = TL.pace === 'wait' && TL.busy(); $('pace-wait').hidden = !on; document.body.classList.toggle('playing', on); };
$('pace-wait').onclick = () => TL.skip();

const isDM = () => T?.you?.role === 'dm';
// Whose creature it is: its own player's, or for a companion its master's player (the rules' own ownerOf, companions.md Decision 1).
const mine = (e) => !!e && (isDM() || ownerOf(S, e) === T.you.userId);
// A creature's name in the log. One that has left the state (a companion that vanished) is still called what it was, by the name seen last.
const known = new Map();
// The state as the screen draws it: a companion's name reads as its master's ("Brenna's wolf", tracker.js shownName). The renderer's pawn
// labels and the reaction question take the name from the creature, so they are given a copy with those names put in. Only a bonded creature
// whose shown name differs is copied; the rest of the state is the same object.
function shownState(st) {
  if (!st) return st;
  let ents = null;
  for (const e of Object.values(st.entities ?? {})) {
    if (!e.bond) continue;
    const nm = shownName(st, e);
    if (nm !== e.name) (ents ??= { ...st.entities })[e.id] = { ...e, name: nm };
  }
  return ents ? { ...st, entities: ents } : st;
}
// What a summoned creature is: its name without its master's ("Giant Wasp"), else its template's.
const summonedName = (st, e) => {
  const m = st.entities[e?.bond?.to];
  const base = (m && e.name.startsWith(`${m.name}'s `) ? e.name.slice(m.name.length + 3) : e?.name ?? '').replace(/ \d+$/, '');
  const t = MONSTERS[e?.tpl]?.name ?? (typeof CONTENT.summons[e?.tpl]?.name === 'string' ? CONTENT.summons[e.tpl].name : null);
  return base || t || 'creature';
};
const name = (id) => (S.entities[id] ? shownName(S, S.entities[id]) : known.get(id) ?? S.away?.[id]?.record?.name ?? 'Someone');

function toast(msg, info = false, ms = info ? 1600 : 3200) {
  const el = $('toast');
  el.textContent = msg; el.classList.toggle('info', info); el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), ms);
}
function setMode(m) { mode = m; refresh(); }
R.assetUrl = (id) => (T?.assets ? T.assets.url(id) : Promise.reject(new Error('Not at a table.')));      // level pictures come through the table's file store
R.onPicture = () => { if (ED.on) refresh(); };
const DICE = createDice($('dice'), prefs, () => R.cameraAngles());

// ---------- dice: who throws, and what is thrown (docs/specs/dice.md) ----------
// Under the table rule diceThrow 'throw' an action that rolls is armed, a tray shows its dice,
// and it is sent at the throw: nothing is decided before it. Cancel sends nothing.
const ROLLING = new Set(['attack', 'cast', 'act', 'check', 'search', 'hide', 'secondWind']);
const autoMonsters = () => prefs.get('hextable.diceMonsters') !== false;       // per device, on unless turned off
const autoMine = () => prefs.get('hextable.diceAutoMine') === true;
function rollsDice(a) {
  if (ROLLING.has(a.type)) return true;
  if (a.type === 'feature') return /\d+d\d+/.test(JSON.stringify(S.entities[a.actor]?.feats?.find((f) => f.id === a.feature)?.action?.effects ?? ''));
  if (a.type !== 'use') return false;
  const o = S.map.objects.find((x) => x.id === a.object);
  return !!(o && objectDef(o)?.uses?.find((u) => u.id === a.verb)?.check);
}
// `byAI`: the DM's auto-play sent it. A character it plays (a stand-in) is nobody's own roll to throw: it is thrown or not as a monster's is, by this device's
// monster setting (the player's own dice are the player's; a stand-in is played by the DM's screen).
function toThrow(a, byAI = false) {
  if (S?.settings?.diceThrow !== 'throw' || !rollsDice(a)) return false;
  const e = S.entities[a.actor];
  if (!e) return false;
  return e.side === 'party' && !(byAI && e.kind === 'pc') ? !autoMine() : !autoMonsters();
}
const colorOf = (state, id) => { const e = state?.entities[id]; return !e ? '#8a8a8a' : e.side === 'party' ? e.look?.color || '#e6dcc0' : '#a8322b'; };
// The dice an action will roll, as far as the action says: the tray's promise of when, not what.
function preview(e, a) {
  const dice = [], from = (text) => { for (const m of String(text ?? '').matchAll(/(\d+)d(\d+)/g)) for (let i = 0; i < Math.min(+m[1], 6); i++) dice.push(+m[2]); };
  let what = 'Roll', sub = '';
  if (a.type === 'attack') { const x = e.attacks?.find((y) => y.id === a.attack); dice.push(20); what = x?.name ?? 'Attack'; if (x) sub = `${signed(x.bonus)} to hit, ${x.damage} ${x.dtype} on a hit`; }
  else if (a.type === 'act') { const def = e.actions?.find((d) => d.id === a.action), p = def ? actionProfile(def) : null; what = p?.name ?? 'Action'; if (p?.roll === 'melee' || p?.roll === 'ranged') dice.push(20); from(p?.short); sub = p?.short ?? ''; }
  else if (a.type === 'cast') { const sp = SPELLS[a.spell]; what = sp?.name ?? 'Spell'; if (/spell attack/.test(sp?.long ?? '')) dice.push(20); from(sp?.heal ? sp.heal.dice : sp?.short); sub = sp?.long ?? ''; }
  else if (a.type === 'feature') { const f = e.feats?.find((y) => y.id === a.feature); what = f?.name ?? 'Feature'; from(JSON.stringify(f?.action?.effects ?? '')); sub = f?.text ?? ''; }
  else if (a.type === 'secondWind') { what = 'Second Wind'; dice.push(10); sub = `heal 1d10+${e.level}`; }
  else { dice.push(20); what = a.type === 'check' ? `${(a.skill ?? a.ability ?? '').replace(/-/g, ' ')} check` : a.type === 'search' ? 'Search' : a.type === 'hide' ? 'Hide' : 'Check'; }
  if (!dice.length) dice.push(20);
  return { dice: dice.slice(0, MAX_DICE), what, sub };
}
const SHAPE_WORDS = { column: 'in single file', pairs: 'two abreast', line: 'four across', wedge: 'in a wedge', held: 'as they stand' };
let flick = null, closeTray = null, armed = null;
let owedUi = null, owedWho = [];      // what the hint bar is saying about an Opportunity Attack's movement: 'offer' (to its holder) or 'wait' (to the DM, whose auto-play waits for owedWho)
let refreshAsk = null;   // set when the DM taps Refresh from sheet or Refresh the party: the next update says what was remade (refresh.js)
let acted = 0;           // actions sent or armed, so a key's step can tell whether its tap sent one
function act(action, byAI = false) {
  if (skipping()) return;
  acted++;
  action = CLS.decorate(action);
  if (!toThrow(action, byAI)) return T.send(action);
  closeTray?.();
  const e = S.entities[action.actor], p = preview(e, action);
  armed = action;
  closeTray = DICE.tray({ dice: p.dice, label: `${e.name}: ${p.what}`, sub: [p.sub, 'flick, tap or click the dice to throw'].filter(Boolean).join(' · '), color: colorOf(S, e.id),
    onThrow: (f) => { closeTray = null; armed = null; flick = f ?? { x: 0, y: -1 }; T.send(action); },
    onCancel: () => { closeTray = null; armed = null; if (aiSent === action.actor) aiSent = null; } });
}
// What a viewer's events throw: one group a roll, in order. The dice are the faces the events
// carry, so nothing is shown that this viewer was not sent. Rolls made inside someone else's
// action (a save, an opportunity attack) are thrown on the roller's behalf and say whose they are.
function throwsOf(state, events) {
  const nm = (id) => state.entities[id]?.name ?? 'Someone', groups = [];
  let actor = null, src = null;                 // src: the attack, spell or action under way, for titles (dice.js)
  const behalf = (who) => (state.settings?.diceThrow === 'throw' && who && who !== actor && state.entities[who]?.side === 'party' ? ' (thrown for them)' : '');
  for (const ev of events) {
    const was = src; src = nextSource(src, ev);
    if (ev.type === 'attack' && !ev.opportunity || ev.type === 'cast' || ev.type === 'act') actor = ev.actor ?? actor;
    if (ev.type === 'encounterStart') {
      const ds = ev.order.filter((o) => o.dice).flatMap((o) => o.dice.map((d) => ({ ...d, color: colorOf(state, o.id) })));
      if (ds.length) groups.push({ type: 'initiative', ids: ev.order.filter((o) => o.dice).map((o) => o.id), dice: ds, label: 'Initiative', sub: ev.order.filter((o) => o.init !== undefined).map((o) => `${nm(o.id)} ${o.init}`).join(', '), from: 'bottom' });
      continue;
    }
    if (!ev.dice?.length) continue;
    const who = ev.type === 'attack' ? ev.actor : ['damage', 'heal', 'tempHp'].includes(ev.type) ? (ev.by !== undefined ? ev.by : actor) : ev.id;
    const g = { type: ev.type, side: state.entities[who]?.side ?? null, dice: ev.dice, color: colorOf(state, who), from: state.entities[who]?.side === 'party' ? 'bottom' : 'top', label: titleOf(ev, state, was, isDM()) || 'The dice' };
    switch (ev.type) {
      case 'attack': g.label += behalf(ev.opportunity ? who : null); g.sub = `${ev.total}${ev.ac !== undefined ? ` vs AC ${ev.ac}` : ''} · ${ev.crit ? 'Critical hit!' : ev.hit ? 'Hit' : 'Miss'}`; g.mark = ev.crit ? 'crit' : ev.nat === 1 ? 'fumble' : null; break;
      case 'damage': g.sub = `${ev.rolled ?? ev.amount} ${ev.dtype}`; g.key = JSON.stringify([ev.dice, ev.bonus, ev.dtype]); g.to = nm(ev.target); break;
      case 'heal': g.sub = `${ev.rolled ?? ev.amount} Hit Points`; g.key = JSON.stringify([ev.dice, ev.bonus, 'heal']); g.to = nm(ev.target); break;
      case 'tempHp': g.sub = `${ev.rolled ?? ev.amount}`; break;
      case 'save': g.label += behalf(who); g.sub = `${ev.total}${ev.dc !== undefined ? ` vs DC ${ev.dc}` : ''} · ${ev.success ? 'Saved' : 'Failed'}`; break;
      case 'concentration': g.label += behalf(who); g.sub = `${ev.total} vs DC ${ev.dc} · ${ev.success ? 'Held' : 'Lost'}`; break;
      case 'check': g.sub = `${ev.total}`; break;
      case 'deathSave': g.label += behalf(who); g.sub = `${ev.roll}`; g.mark = ev.roll === 20 ? 'crit' : ev.roll === 1 ? 'fumble' : null; break;
      case 'recharge': g.sub = ev.ready ? 'recharged' : 'not yet'; break;
      case 'joined': g.sub = `${ev.init}`; break;
      default: g.sub = '';
    }
    const last = groups.at(-1);
    if (g.key && last?.key === g.key) { last.n = (last.n ?? 1) + 1; last.sub = `${g.sub} · ${last.n} targets`; continue; }      // one area roll shared by many
    if (g.to) g.sub += ` to ${g.to}`;
    groups.push(g);
  }
  if (groups.length > 4) {                                    // a long update is summed up: the first three, then the rest together
    const rest = groups.splice(3);
    groups.push({ dice: rest.flatMap((g) => g.dice.map((d) => ({ ...d, color: d.color ?? g.color }))), label: `${rest.length} more rolls`, sub: '', from: 'top' });
  }
  return groups;
}
// Updates wait while dice are in the air on this client, so the log, hit points and floaters do
// not give the roll away early. The server never waits; with dice off nothing does.
let waiting = 0, chain = Promise.resolve();
const thrown = [];          // the last rolls thrown on this device, for tests: window.hextable.thrown
function received(state, events, fresh) {
  if (!fresh) for (const ev of events) if (ev.type === 'ping') PG.ping({ at: ev.at, name: ev.name, color: pingColor(state, ev.from) });      // at once, not on a beat: nobody waits to be shown where to look
  const groups = !S || fresh || DICE.show === 'off' ? [] : throwsOf(state, events);
  thrown.push(...groups); thrown.splice(0, Math.max(0, thrown.length - 60));
  if (groups[0] && flick) groups[0].flick = flick;
  flick = null;
  if (!groups.length && !waiting) return onUpdate(state, events, fresh);
  waiting++;
  chain = chain.then(() => (groups.length ? TL.whenIdle().then(() => DICE.play(groups)) : null)).then(() => {      // the dice of an update are thrown once the beats before it are done
    waiting--;
    try { onUpdate(state, events, fresh); } catch (e) { setTimeout(() => { throw e; }); }
  });
}

// Press and hold on the map for a second to point out the cell to everyone (#599; docs/specs/table-ui.md, "Ping"). The hold is hold.js's, the marks ping.js's.
const PG = createPings({ screenOf: (h) => R.screenOf(h), host: (() => { const d = document.createElement('div'); d.id = 'pings'; document.body.append(d); return d; })() });
let pressed = null;          // the cell under the press when it began
const HOLD = createHold({
  onStart: (x, y) => { PG.start(x, y, HOLD_MS); pressed = S && cellAtPoint(S, (px, py, feet) => R.planeHex(px, py, feet), x, y); },
  onCancel: () => PG.stop(),
  onFire: (x, y) => {
    PG.stop();
    const cell = S && T && cellAtPoint(S, (px, py, feet) => R.planeHex(px, py, feet), x, y);
    if (!cell || !pressed || pressed.q !== cell.q || pressed.r !== cell.r) return;      // the camera moved under the press: not the cell it began on
    navigator.vibrate?.(20);
    T.send({ type: 'ping', at: cell });
  },
});
{
  const el = $('gl'), at = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // The map editor owns the pointer while it is open (it paints and traces), and no table is open in the lobby.
  el.addEventListener('pointerdown', (e) => HOLD.down(e.pointerId, ...at(e), { button: e.button, enabled: !!S && !!T && !R.onPoint && !R.onDrag }));
  el.addEventListener('pointermove', (e) => HOLD.move(e.pointerId, ...at(e)));
  el.addEventListener('pointerup', (e) => HOLD.up(e.pointerId));
  el.addEventListener('pointercancel', (e) => HOLD.up(e.pointerId));
  el.addEventListener('wheel', () => HOLD.cancel(), { passive: true });
}

const ED = new Editor({ R, act, toast, state: () => S, isDM, refresh: () => refresh(), assets: () => T?.assets });     // the DM's map editor
function select(id) { selId = id; mode = MOVE; }

// ---------- events -> log lines and floating numbers ----------
// For the hint line: which of these targets the attacker would find behind cover.
function coverHint(e, ids) {
  const all = Object.values(S.entities), tags = [];
  for (const id of ids) { const c = COVER_NAME[coverOf(S, e, S.entities[id], all)]; if (c) tags.push(`${name(id)}: ${c}`); }
  return tags.length ? ` (${tags.join(', ')})` : '';
}
const COVER_NAME = { half: 'half cover', threeQuarters: 'three-quarters cover' };
const behind = (c) => (COVER_NAME[c] ? ` behind ${COVER_NAME[c]}` : '');

// The log's line for an event: [text, class, kind], kind being what the log filters by (logview.js). null when the event says nothing.
function describe(ev) {
  const d = words(ev);
  return d ? [d[0], d[1] || '', kindOf(ev)] : null;
}
function words(ev) {
  const n = name;
  switch (ev.type) {
    case 'encounterStart': return ['Roll initiative! ' + ev.order.map((o) => (o.init === undefined ? n(o.id) : `${n(o.id)} ${o.init}`)).join(', '), 'head'];
    case 'encounterEnd': return [{ victory: 'The fight is won.', defeat: 'The party has fallen.', ended: 'The DM ends the fight.', stalemate: 'The fight ends.' }[ev.result] + ` (${ev.rounds} round${ev.rounds > 1 ? 's' : ''})`, 'head'];
    case 'turn': return [ev.someone ? `Round ${ev.round}: something moves where you cannot see` : `Round ${ev.round}: ${n(ev.id)}'s turn`, 'head'];
    // Stepping away (E20), as the table is told of it (the view sends these for a party creature only). Set aside under `standIn` on its own turn there is no
    // `awayTurn` until its next one, so this is the line that says the DM's screen plays from now.
    case 'away': return [ev.asked ? `${n(ev.id)} asks to step away.` : ev.how === 'standIn' ? `${n(ev.id)} steps away: the stand-in plays ${n(ev.id)}'s turns.` : `${n(ev.id)} steps away.`];
    case 'back': return [ev.asked ? `${n(ev.id)} takes back asking to step away.` : `${n(ev.id)} is back.`];
    // A character set aside under `standIn` (E20): its turn starts as any does and the DM's screen plays it with the AI (ai-casting.md, AC2). The other
    // ways to set a turn aside are the engine's alone, and say nothing here.
    case 'awayTurn': return ev.how === 'standIn' ? [`${n(ev.id)} is played by the stand-in.`] : null;
    case 'joined': return [`${n(ev.id)} joins the fight${ev.init === undefined ? '' : ` (initiative ${ev.init})`}.`];
    case 'attack': {
      const how = `${ev.actor === null ? `The ${ev.name.toLowerCase()}` : n(ev.actor)} ${ev.opportunity ? 'makes an Opportunity Attack on' : 'attacks'} ${n(ev.target)}${behind(ev.cover)}${ev.actor === null ? '' : ` with ${ev.name}`}`;
      const result = ev.crit ? 'Critical hit!' : ev.hit ? 'Hit.' : 'Miss.';
      // A monster's roll stays behind the DM's screen: players get the outcome only.
      if (!ev.rolls) return [`${how}${ev.mode === 'adv' ? ' with Advantage' : ev.mode === 'dis' ? ' with Disadvantage' : ''}. ${result}`];
      const dice = ev.rolls.length > 1 ? `${ev.rolls.join(' / ')} with ${ev.mode === 'adv' ? 'Advantage' : 'Disadvantage'} (${ev.why.join(', ')})` : `${ev.nat}`;
      return [`${how}: ${dice} → ${ev.total}${ev.ac === undefined ? '' : ` vs AC ${ev.ac}`}. ${result}`];
    }
    case 'damage': return [`${n(ev.target)} takes ${ev.amount} ${ev.dtype} damage${ev.note ? ` (${ev.note})` : ''}.`, 'bad'];
    case 'heal': return [`${n(ev.target)} regains ${ev.amount} Hit Points.`, 'good'];
    case 'cast': return [`${n(ev.actor)} casts ${ev.name}.`];
    case 'act': return [`${n(ev.actor)} uses ${ev.name}.`];
    case 'recharge': return [`${n(ev.id)} rolls ${ev.roll} for ${ev.name}: ${ev.ready ? 'ready again' : 'not yet'}.`];
    case 'save': {
      const cv = behind(ev.cover);       // half or three-quarters cover helps a Dexterity save
      // A failed save rolled again for a use of a feature (Indomitable, Disciplined Survivor): `reroll` is { name, was, add? } (`true` for a plain reroll, Countercharm).
      const again = ev.reroll && typeof ev.reroll === 'object' ? ` ${ev.reroll.name}: rolled again, the first roll was ${ev.reroll.was}${ev.reroll.add ? ` and ${signed(ev.reroll.add)} is added` : ''}.` : ev.reroll ? ' Rolled again.' : '';
      if (!('roll' in ev)) return [`${n(ev.id)} makes a ${ev.abil.toUpperCase()} save${ev.dc === undefined ? '' : ` against DC ${ev.dc}`}${cv}. ${ev.success ? 'Saved.' : 'Failed.'}${again}`];
      return [`${n(ev.id)} ${ev.roll ? `rolls a ${ev.abil.toUpperCase()} save: ${ev.total} vs DC ${ev.dc}${cv}.` : `automatically fails the ${ev.abil.toUpperCase()} save.`} ${ev.success ? 'Saved.' : 'Failed.'}${again}`];
    }
    case 'down': return [`${n(ev.id)} drops to 0 Hit Points and is dying.`, 'bad'];
    case 'died': return [`${n(ev.id)} dies.`, 'bad'];
    case 'deathSave': return [`${n(ev.id)} rolls a Death Save: ${ev.roll}. ${ev.hp > 0 ? 'Back on their feet with 1 Hit Point!' : ev.dead ? 'Dead.' : ev.stable ? 'Stable.' : `${ev.s} successes, ${ev.f} failures.`}`, ev.dead ? 'bad' : ''];
    case 'std': return [spentWords(S.entities[ev.id], ev) || `${n(ev.id)} uses ${ev.action}.`];
    case 'note': return [noteText(ev, n)];
    case 'cond': return [ev.cond === 'prone' ? `${n(ev.id)} is knocked Prone.` : `${n(ev.id)} ${conditionPhrase(ev.cond)}${ev.level ? ` (level ${ev.level})` : ''}.`];
    case 'condEnd': return [ev.cond === 'grappled' ? heldEndText(ev, n) : `${n(ev.id)} no longer ${conditionPhrase(ev.cond)}.`];
    case 'manual': return [`${ev.name}: ${ev.text}`, 'head'];
    case 'effectStart': return [`${ev.name} takes hold${ev.conc ? ` (${n(ev.source)} is concentrating)` : ''}: ${ev.lasts}.`];
    case 'effectEnd': return [`${ev.name} ends: ${ev.why}.`];
    case 'concentration': return [`${n(ev.id)} rolls to keep Concentration on ${ev.name}: ${ev.total} vs DC ${ev.dc}. ${ev.success ? 'Held.' : 'Lost.'}`];
    case 'stood': return [`${n(ev.id)} stands up (half their Speed).`];
    case 'chronicle': return [`Chronicle: ${ev.title}`, 'head'];
    case 'time': return [`Time passes. It is now ${clockText(ev.t ?? S.clock)}.`];
    case 'rest': return [`The party finishes a ${ev.short ? 'Short' : 'Long'} Rest.`, 'good'];
    case 'tempHp': return ev.kept ? [`${n(ev.id)} keeps ${ev.tempHp} Temporary Hit Points.`, ''] : ev.amount > 0 ? [`${n(ev.id)} gains ${ev.amount} Temporary Hit Points.`, 'good'] : [`${n(ev.id)} loses their Temporary Hit Points.`, ''];
    case 'claimed': return [`${ev.userName || 'The DM'} now plays ${n(ev.id)}.`];
    case 'released': return [`${n(ev.id)} is free for someone to play.`];
    case 'spawned': return ev.quiet ? null : [`${n(ev.id)} appears.`];
    case 'summoned': { const e = S.entities[ev.id], w = e ? summonedName(S, e) : 'creature'; return [`${n(ev.by)} summons ${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}.`]; }
    case 'bonded': return [`${n(ev.id)} is now ${n(ev.to)}'s ${ev.kind}${ev.side ? ` and fights on the ${ev.side}'s side` : ''}.`];
    case 'unbonded': if (ev.why === 'lapsed') return [`${n(ev.id)} no longer obeys ${ev.from !== undefined ? n(ev.from) : 'its master'}.`]; return [`${n(ev.id)} is no longer ${ev.from !== undefined ? `${n(ev.from)}'s` : 'anyone\'s'} companion.`];
    case 'commanded': return [`${n(ev.by)} commands ${ev.ids.length === 1 ? n(ev.ids[0]) : `${ev.ids.length} companions`}${typeof ev.order === 'string' && ev.order ? `: "${ev.order}"` : ''}.`];
    case 'commandedTurn': return [String(ev.text ?? `${n(ev.id)} is yours this turn.`)];
    case 'companionOrder': return [`${n(ev.id)} will act ${ev.order} ${n(ev.by)}${ev.next ? ' from the next round' : ''}.`];
    case 'pocketed': return [`${n(ev.by)} sends ${ev.name ?? n(ev.id)} to a pocket dimension.`];
    case 'recalled': return [`${n(ev.by)} calls ${n(ev.id)} back.`];
    case 'reformed': return [`${n(ev.id)} takes a new form: ${ev.name ?? ev.form}.`];
    case 'delivered': return [`${n(ev.id)} delivers ${n(ev.by)}'s ${SPELLS[ev.spell]?.name ?? 'spell'}.`];
    case 'reasserted': return [`${n(ev.by)} keeps ${n(ev.id)} under control again.`];
    case 'mounted': return [`${n(ev.id)} mounts ${n(ev.mount)}.`];
    case 'dismounted': return [`${n(ev.id)} ${ev.fell ? 'falls off' : 'dismounts from'} ${n(ev.mount)}${{ prone: ': knocked Prone', pushed: ': pushed', pulled: ': pulled', teleport: ': teleported', size: ': its size changed' }[ev.why] ?? ''}.`, ev.fell ? 'bad' : ''];
    case 'companion': return [`${n(ev.id)} ${ev.auto ? 'acts on its own now' : 'waits for its player\'s orders'}.`];
    case 'vanished': {
      const w = { hp0: 'drops to 0 Hit Points and vanishes', master: 'vanishes: its master is gone', leash: 'strays too far and vanishes', dismissed: 'is dismissed', replaced: 'is replaced by a new one', ended: 'ends with its spell' }[ev.why] ?? 'vanishes';
      return [`${ev.name && !known.has(ev.id) ? ev.name : n(ev.id)} ${w}.`, ev.why === 'hp0' ? 'bad' : ''];
    }
    case 'map': return [`The scene changes: ${ev.name}.`];
    case 'region': return [`The party sees ${ev.name}.`];
    // A group came to a place of the world (travel.md; the view sends it only for a place and a group the viewer may know of).
    case 'arrived': {
      const who = (Array.isArray(ev.ids) ? ev.ids : []).map(n);
      if (!who.length || typeof ev.name !== 'string') return null;
      return [`${who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}` : who[0]} ${who.length > 1 ? 'arrive' : 'arrives'} at ${ev.name}.`];
    }
    case 'check': {
      const what = ev.search ? 'searches' : ev.hide ? 'tries to hide' : ev.escape !== undefined ? `tries to break free of ${ev.escape === 'someone' ? 'someone' : n(ev.escape)} (${(ev.skill ?? ev.ability ?? 'a check').replace(/-/g, ' ')})` : ev.what ? `tries: ${ev.what}` : `rolls ${ev.skill ? `${SKILLS[ev.skill].toUpperCase()} (${ev.skill.replace(/-/g, ' ')})` : ev.ability.toUpperCase()}`;
      const how = ev.mode === 'adv' ? ' with Advantage' : ev.mode === 'dis' ? ' with Disadvantage' : '';
      const end = ev.search ? (ev.found ? ` and finds ${ev.found === 1 ? 'something' : `${ev.found} things`}.` : ' and finds nothing.') : ev.success === true ? ' Success.' : ev.success === false ? ' Failed.' : '';
      // Reliable Talent and the like: `floor` is { name, value, was }; the dice show the real face, the d20 counted as `value`.
      const floor = ev.floor ? ` ${ev.floor.name}: the d20 showed ${ev.floor.was} and counts as ${ev.floor.value}.` : '';
      return [`${n(ev.id)} ${what}${how}: ${ev.total}${ev.dc !== undefined ? ` vs DC ${ev.dc}` : ''}${ev.search ? '' : '.'}${end}${floor}`];
    }
    case 'noticed': return [`${n(ev.id)} notices a ${ev.name.toLowerCase()}.`];
    case 'triggered': return [`${n(ev.id)} sets off a ${ev.name.toLowerCase()}!`];
    case 'fell': return [`${n(ev.id)} falls ${ev.feet} ft.`];
    case 'size': return [`${n(ev.id)} is now ${ev.size[0].toUpperCase()}${ev.size.slice(1)}.`];
    case 'speed': return [ev.feet ? `${n(ev.id)} now has a ${ev.mode === 'walk' ? '' : `${ev.mode[0].toUpperCase()}${ev.mode.slice(1)} `}Speed of ${ev.feet} ft.` : `${n(ev.id)} no longer has a ${ev.mode} speed.`];
    case 'object':
      // A pile of dropped things (E17): never what is on it; the `gear` event names the thing for those who may know it.
      if (ev.verb === 'drop') return [`${n(ev.actor)} ${ev.placed ? 'leaves a pile on the ground' : 'adds to the pile on the ground'}.`];
      if (ev.verb === 'pickup') return [ev.gone ? 'The pile on the ground is gone.' : `${n(ev.actor)} takes something from the pile on the ground.`];
      return [ev.actor ? `${n(ev.actor)}: the ${ev.name.toLowerCase()} is now ${ev.stateName}.` : `The ${ev.name.toLowerCase()} is now ${ev.stateName}.`];
    case 'gear': {
      const other = ev.with !== undefined && S.entities[ev.with] ? n(ev.with) : null;      // who it went to or came from, if the viewer was told
      const off = ev.unattuned ? ' (no longer attuned)' : '';
      if (ev.why === 'pass' && other) return [ev.taken ? `${n(ev.id)} gave ${other} ${ev.item}${off}.` : `${n(ev.id)} received ${ev.item} from ${other}.`];
      if (ev.why === 'drop') return [`${n(ev.id)} dropped ${ev.item}${off}.`];
      if (ev.why === 'pickup') return [`${n(ev.id)} picked up ${ev.item}.`];
      return [ev.taken ? `${n(ev.id)} no longer has ${ev.item}${off}.` : `${n(ev.id)} receives ${ev.item}.`];
    }
    case 'revealed': return [`${n(ev.id)} comes into view!`, 'head'];
    case 'concealed': return [`${n(ev.id)} is now hidden from the players.`];
    case 'hid': return [`${n(ev.id)} is hidden.`];
    case 'unhidden': return [ev.why === 'found' ? `${n(ev.id)} has been found${ev.by ? ` by ${n(ev.by)}` : ''}!` : ev.why === 'attack' ? `${n(ev.id)} gives itself away by attacking!` : ev.why === 'spell' ? `${n(ev.id)} gives itself away by casting!` : `${n(ev.id)} is heard and no longer hidden.`, 'head'];
    // Magic items (E18): a use, putting on and taking off, Attunement. A creature the viewer does not control is told what was used, never its charges.
    case 'item': return [`${n(ev.id)} uses ${ev.item}: ${ev.use}${ev.target ? ` on ${n(ev.target)}` : ''}${ev.charges !== undefined ? ` (${ev.charges}/${ev.max} charges left)` : ''}${ev.consumed ? ', used up' : ''}.`];
    case 'shield': return [`${n(ev.id)} ${ev.on ? 'takes up' : 'puts away'} their ${ev.item ?? 'Shield'}.`];
    case 'equip': return [`${n(ev.id)} ${ev.on ? 'readies' : 'puts away'} ${ev.item}.`];
    case 'attuning': return [ev.cleared ? `${n(ev.id)} no longer means to attune to anything.` : ev.end ? `${n(ev.id)} will end their Attunement to ${ev.item} at the next Short Rest.` : `${n(ev.id)} will attune to ${ev.item} at the next Short Rest.`];
    case 'attuned': return [ev.failed ? `${n(ev.id)} couldn't ${ev.end ? 'end the Attunement to' : 'attune to'} ${ev.item}: ${ev.failed}` : `${n(ev.id)} ${ev.end ? 'is no longer attuned to' : 'is now attuned to'} ${ev.item}.`];
    case 'light': return [ev.bright || ev.dim ? `${n(ev.id)} carries ${ev.name ? `a ${ev.name.toLowerCase()}` : 'a light'}.` : `${n(ev.id)}'s light goes out.`];
    case 'follow': return [ev.leader ? `${n(ev.id)} follows ${n(ev.leader)}.` : ev.why ? `${n(ev.id)} couldn't keep up with ${n(ev.was)} and stops following.` : `${n(ev.id)} stops following ${n(ev.was)}.`];
    case 'formation': return [ev.shape === 'custom' ? `Places behind ${n(ev.id)} were changed.` : `The party walks behind ${n(ev.id)} ${SHAPE_WORDS[ev.shape] ?? 'in a formation'}.`];
    case 'marchingOrder': return [`Marching order: ${ev.order.map(n).join(', ')}.`];
    case 'rewound': return [`The DM took the table back to ${ev.to === 'rest' ? 'the last rest' : 'the start of the fight'}.`, 'head'];
    case 'conclusion': return [logLine(ev, name), 'head'];
    case 'levelReady': return [`${n(ev.id)} has enough experience to reach level ${ev.level}.`, 'good'];
    case 'conclusionSkipped': return ['The fight gives no rewards.'];
    case 'conclusionReady': return ['The fight is over. Its rewards are waiting for you.', 'head'];
    case 'xp': case 'conclusionEdited': return null;
    // Ability scores rolled at the table (scores.js): the numbers only for the DM and the roller; the rest are told that it happened.
    case 'scoresRolled': return [ev.sets ? `Ability scores rolled: ${ev.sets.map((x) => x.total).join(', ')}.` : 'Someone rolled their ability scores.'];
    case 'scoreRerolled': return [ev.from ? `Ability score ${ev.index + 1} rolled again: ${ev.from.total}, then ${ev.to.total}; ${ev.stands === 'old' ? 'the first stands' : 'the new roll stands'} (${ev.total}).` : 'Someone rolled one ability score again.'];
    // Hit Points rolled at a rolled table (hitpoints.js): told to everyone, each die shown.
    case 'hpRolled': return [`${ev.name} rolls Hit Points: ${(ev.levels ?? []).map((l) => `${l.className} ${l.level}: ${l.dice.map((d) => (d.drop ? `${d.value} (rolled again)` : d.low ? `${d.value} (fixed value instead)` : d.value)).join(' then ')} of d${l.die} = ${l.hp}`).join('; ')}. +${ev.total} in all.`];
    case 'hpRerolled': return [`${ev.name} rolls Hit Points again for ${ev.levels[0].className} ${ev.levels[0].level}: ${ev.from}, then ${ev.levels[0].value} (${ev.levels[0].hp} Hit Points).`];
    case 'undone': return [`Taken back: ${ev.label}.`, 'head'];
    case 'redone': return [`Done again: ${ev.label}.`, 'head'];
    // The transcript of a scene, one line each, until the scene screen is built.
    case 'say': return [ev.as === null ? `(${ev.name}, out of character) ${ev.text}` : `${ev.name}: “${ev.text}”`];
    default: return holdWords(ev, n) ?? HO.describe(ev) ?? SC.describe(ev);       // handouts and private notes; scenes
  }
}
// The floating text an event throws, as [id, text, class], or null.
function floatOf(ev) {
  if (ev.type === 'attack') return !ev.hit ? [ev.target, 'Miss', 'miss'] : ev.crit ? [ev.target, 'Critical!', 'crit'] : null;
  if (ev.type === 'damage') return [ev.target, ev.amount ? `−${ev.amount}` : 'Immune', 'dmg'];
  if (ev.type === 'heal') return [ev.target, `+${ev.amount}`, 'heal'];
  if (ev.type === 'save' && ev.success) return [ev.id, 'Saved', 'miss'];
  if (ev.type === 'note') return [ev.id, ev.text, 'crit'];
  if (ev.type === 'std') return [ev.id, ev.action, ''];
  if (ev.type === 'cond') return [ev.id, conditionName(ev.cond), ''];
  if (ev.type === 'down') return [ev.id, 'Down!', 'dmg'];
  if (ev.type === 'revealed') return [ev.id, 'Spotted!', 'crit'];
  if (ev.type === 'cast') return [ev.actor, ev.name, ''];
  if (ev.type === 'deathSave') return [ev.id, `Death Save ${ev.roll}`, ev.roll >= 10 ? 'heal' : 'dmg'];
  return null;
}
// An event plays: its log line, its floating text, and where the camera goes. With pace `instant` the floaters are
// staggered by 0.28 s as they always were; on a beat they come when the beat does.
function beat(ev, ctx) {
  if (!S) return;
  played.push({ type: ev.type, t: performance.now(), hp: TL.shown()?.entities[ev.target ?? ev.id]?.hp }); played.splice(0, Math.max(0, played.length - 80));
  const line = describe(ev);
  LV.add(ev, line, S.clock); FB.shown(line, ev.type);
  if (ev.type === 'std' && S.entities[ev.id] && mine(S.entities[ev.id]) && spentWords(S.entities[ev.id], ev)) toast(line[0], true);      // the cost of Flurry of Blows, and what is left
  const f = floatOf(ev);
  if (f) {
    if (floatRun.id !== ctx.update.id) floatRun = { id: ctx.update.id, n: 0 };
    R.floater(f[0], f[1], f[2], ctx.instant ? floatRun.n++ * 0.28 : 0);
  }
  // A commanded creature's turn is its player's (A2): say so, and hand the card to them. `commandedTurn` is sent to that player alone.
  if (ev.type === 'commandedTurn' && S.entities[ev.id] && mine(S.entities[ev.id])) { select(ev.id); R.focus(ev.id); toast(String(ev.text ?? 'Its turn is yours.'), true); }
  else if (['pocketed', 'recalled', 'mounted', 'dismounted'].includes(ev.type) && line && S.entities[ev.by ?? ev.id] && mine(S.entities[ev.by ?? ev.id])) toast(line[0], true);
  if (ev.type === 'turn' && ev.id) { if (mine(S.entities[ev.id]) && S.entities[ev.id].kind === 'pc') select(ev.id); R.focus(ev.id); }
  else if (ev.type === 'moved' && ev.id === selId) R.focus(selId);
  else if (ev.type === 'map') R.focus(selId ?? Object.values(S.entities).find((e) => e.side === 'party')?.id, true);     // a new place: look at the party
}

// ---------- state updates ----------
function onUpdate(state, events, fresh) {
  const first = !S || fresh;
  if (first) known.clear();
  const hadOffer = new Set(first ? [] : offers(S).map((o) => o.id));      // who held movement from an Opportunity Attack before this update
  for (const e of Object.values(S?.entities ?? {})) known.set(e.id, shownName(S, e));      // what a creature that vanishes in these events was called
  S = state; stamp++; dryCache.clear();
  if (refreshAsk && Date.now() - refreshAsk.at > 8000) refreshAsk = null;
  if (refreshAsk) { const say = refreshReport(events, (id) => known.get(id) ?? S.entities[id]?.name ?? 'Someone', refreshAsk); if (say) { refreshAsk = null; toast(say, !/Not refreshed/.test(say)); } }
  for (const e of Object.values(S.entities)) known.set(e.id, shownName(S, e));
  TL.setPace(pace());
  if (first) {
    LV.reset(); selId = null; mode = MOVE; chron = []; seeded = false; SC.fresh(); RP.fresh(); AP.fresh(); CP.fresh(); DF.fresh(); CC.fresh(); D.reset();
    if (D.pinned && D.wide) D.open('turns', null, true);       // pinned means open beside the map, from the start
    splashDone();
    QE.fresh();
    if (!T.solo && isDM()) T.history({ types: ['chronicle'], limit: 200 });
    if (!T.solo) T.history({ types: SCORE_EVENTS, limit: 200 });      // this member's own rolled scores, for the build sheet (the answer is in T.on.history)
    if (T.solo) { QE.events(recall(S, { types: SCORE_EVENTS, limit: Infinity })); QE.scoresChecked(); }
    if (T.solo) { seeded = true; LV.seed(recall(S, { limit: Infinity }).map((e) => [e, describe(e)])); }      // the whole timeline is here: a reload rebuilds the groups
  }
  if (first && pendingMap && isDM()) { act(pendingMap); pendingMap = null; }      // the lobby's chosen map, once the new table has its first state
  QE.events(events);
  SC.events(events);
  AP.updated(events);
  for (const ev of events) if (ev.type === 'chronicle') chron.push({ t: S.clock, ...ev });
  if (!S.entities[selId]) {
    const own = Object.values(S.entities).find((e) => e.kind === 'pc' && (isDM() ? true : e.owner === T.you.userId));
    selId = own?.id ?? null;
  }
  if (mode !== MOVE && (!S.entities[selId] || !up(S.entities[selId]))) mode = MOVE;
  if (mode.kind === 'owed' && !offerOf(S, S.entities[selId])) mode = MOVE;
  // A player is shown the movement an Opportunity Attack gave as soon as it comes: their creature is selected and looked at (the DM keeps their own choice; solo is both).
  if (!isDM() || T.solo) { const o = offers(S).find((x) => !hadOffer.has(x.id) && mine(S.entities[x.id])); if (o) { select(o.id); R.focus(o.id); } }
  if (mode.kind === 'attack' || mode.kind === 'famAttack' || mode.kind === 'feature' || (mode.kind === 'action' && !mode.area) || (mode.kind === 'spell' && !mode.keep)) mode = MOVE;
  // Attacks a feature granted (Flurry of Blows) are armed for the player at once, and again after each strike, so a tap on a foe makes them (flurry.js).
  { const me = S.entities[selId], fl = me && mine(me) && up(me) ? rearm(S, me, events) : null; if (fl && mode === MOVE) mode = fl; }
  clearTimeout(aiTimer);
  aiSent = null;
  tookBack = events.some((e) => e.type === 'undone' || e.type === 'redone');     // a monster would only do the same again
  // Undo and redo take the table back, and a question waiting for an answer must not sit behind queued beats: both show at once.
  const urgent = !!(S.prompt || S.pending);
  snapping = first || tookBack || urgent;
  // A companion that vanished fades like a creature removed: the renderer reads that event (the engine sends `vanished` for it).
  // A creature summoned appears as one spawned does: the renderer reads `spawned` (the `quiet` one has no log line of its own).
  const beats = events.flatMap((ev) => (ev.type === 'vanished' ? [ev, { type: 'removed', id: ev.id }] : ev.type === 'summoned' ? [ev, { type: 'spawned', id: ev.id, quiet: true }] : [ev]));
  TL.push(S, beats, { first, fresh: first, flush: tookBack || urgent, instant: tookBack || urgent });
  KB.update((id) => events.some((ev) => ev.id === id || ev.actor === id), urgent);      // the keys' step waits for this (keyboard.md)
  snapping = false;
  syncPlaying();
}
const offlineOf = (uid) => !!T && !T.solo && (T.lobby?.members ?? []).some((m) => m.id === uid && m.online === false);
// The party creatures the DM's auto-play is waiting for now (allowance.js): none unless this screen would play the current turn.
function autoWaits() {
  const cur = S?.encounter ? current(S) : null;
  if (!cur || !isDM() || !$('dm-auto').checked || !autoPlays(S, cur, { offline: offlineOf })) return [];
  return waitingFor(S, { offline: offlineOf });
}
// The beats of everything received have played: the screen is in line with the table.
function idled() {
  if (!S || !T) return;
  played.push({ type: 'idle', t: performance.now() });
  syncPlaying();
  refresh();
  syncCards();
  const cur = S.entities[current(S)];
  // The DM's auto-play (companions.md, Decision 9; the brain, C7; ai-casting.md, AC2): what plays is what `autoPlays` (ai.js) says: a monster, a companion
  // when the brain plays it (the DM's own, `bond.auto`, never commanded, its master's player offline or stepped away, its master Incapacitated), and a
  // character set aside under the table rule `standIn`; otherwise it waits for its player or the DM. This screen is the DM's alone (`isDM()`), so a
  // stand-in is never played from two screens; what it does is only an action sent to the table, which the engine answers as for anyone.
  const offline = offlineOf;
  const plays = cur && autoPlays(S, cur.id, { offline });
  // It also waits while a party creature holds movement from an Opportunity Attack (DEBT T93 4b): ending the mover's turn would lapse it before its player can act.
  // The DM's screen says who it waits for and can give the movement up for them (refresh, below).
  if (plays && isDM() && !T.readOnly && $('dm-auto').checked && !tookBack && !autoWaits().length) {
    clearTimeout(aiTimer);
    // `wait`: the next step comes a short pause after the picture is still, so monsters act at the pace the DM sees; the
    // server never waits. Otherwise as before, 800 ms after the update. The table's homebrew is installed around the call (standin.js).
    aiTimer = setTimeout(() => { const a = aiAction(S, cur.id, { offline }, PK.store.installed()); if (a) { aiSent = cur.id; act(a, true); } }, TL.pace === 'wait' ? AI_PAUSE : 800);
  }
}

// ---------- companions (companions.js): what the engine would answer ----------
// The engine's own answer to an action, on a copy of the state this screen holds: '' if it would be accepted, else its words. A copy that cannot be
// run (a player's view holds no dice) is no answer, and the button is left open for the engine to decide when it is pressed. One answer a state.
let stamp = 0; const dryCache = new Map();
function dry(action) {
  if (!S || !T) return '';
  const k = JSON.stringify(action), hit = dryCache.get(k);
  if (hit !== undefined) return hit;
  let why = '';
  try { const r = apply(structuredClone({ ...S, timeline: [] }), action, { role: T.you.role, userId: T.you.userId }); why = r.ok ? '' : r.error; } catch { why = ''; }
  dryCache.set(k, why);
  return why;
}
const CP = initCompanions({ state: () => S, act: (a) => act(a), toast: (m) => toast(m), dry, setMode: (m) => setMode(m), move: MOVE, mode: () => mode, render: () => refresh(), selected: () => selId });

// ---------- rendering the UI ----------
// Cast a spell that has nothing to aim on the spot, or arm it (or put it down again if it is armed).
// A spell cast from an item (the Items tab arms it with `mode.item = { key, which, base, level? }`) is sent as `use` with the same aim fields; a class's own casting as `cast`.
// An item casts at the lowest caster level, at `level` when extra charges raise it.
const castAct = (aim) => (mode.item
  ? { type: 'use', actor: selId, item: mode.item.key, which: mode.item.which, ...(mode.item.level > mode.item.base ? { level: mode.item.level } : {}), ...aim }
  : { type: 'cast', actor: selId, spell: mode.id, ...(mode.deliver ? { deliver: mode.deliver } : {}), ...slotArg(S.entities[selId], SPELLS[mode.id]), ...aim });
// The slot a levelled spell is cast with (issue #604): the one chosen in the hint bar while it is armed, else the lowest left at its level or above.
// Sent as `slot` only above the spell's own level (the engine's default); a spell from an item has its own level. The engine checks it.
const slotOf = (e, sp) => slotFor(e, sp, mode.kind === 'spell' && mode.id === sp.id && !mode.item ? mode.slot : null);
const slotArg = (e, sp) => { const l = e && sp.level > 0 ? slotOf(e, sp) : null; return l && l > sp.level ? { slot: l } : {}; };
const spellMost = (e, sp) => (mode.item ? targetCount(sp.def, 1, mode.item.level ?? mode.item.base) : CLS.most(e, sp, targetCount(sp.def, e.level, slotOf(e, sp) ?? sp.level)));
// A spell with nothing to aim is cast on the spot, unless there is a slot to choose first: then it is armed, and the hint bar asks (Cast / Cancel).
const selfCast = (e, id) => {
  const sp = SPELLS[id];
  if (slotMenu(e, sp)) return setMode({ kind: 'spell', id, aim: null, keep: false, picked: [] });
  act({ type: 'cast', actor: e.id, spell: id, ...slotArg(e, sp), ...chosen(sp) });
};
function startSpell(e, id, armed) {
  const sp = SPELLS[id];
  if (isSummon(id)) return armed ? setMode(MOVE) : CP.openChooser(e, id);       // a summon asks for its picks first (companions.js)
  if (sp.aim === 'self' || sp.aim === 'none') { if (armed) setMode(MOVE); else selfCast(e, id); }
  else setMode(armed ? MOVE : { kind: 'spell', id, aim: null, keep: !!sp.area, picked: [] });
}
// A choice made in casting (Guidance's skill, Resistance's damage type): a menu beside the hint.
const choiceLabel = (of, v) => (of === 'ability' ? v.toUpperCase() : v.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()));
const choicesOf = (sp) => (sp?.def.choice ? sp.def.choice.from ?? CHOICES[sp.def.choice.of] : null);
function chosen(sp) {
  const list = choicesOf(sp);
  if (!list) return {};
  if (!list.includes(mode.choice)) mode.choice = list[0];
  return { choice: mode.choice };
}
function showPick() {
  const sel = $('hint-pick'), sp = mode.kind === 'spell' ? SPELLS[mode.id] : null, list = choicesOf(sp);
  sel.hidden = !list || $('hint').hidden;
  if (sel.hidden) return;
  const key = `${sp.id}|${list.join()}`;
  if (sel.dataset.key !== key) { sel.dataset.key = key; sel.innerHTML = list.map((v) => `<option value="${v}">${esc(choiceLabel(sp.def.choice.of, v))}</option>`).join(''); }
  if (!list.includes(mode.choice)) mode.choice = list[0];
  sel.value = mode.choice;
}
$('hint-pick').onchange = (ev) => { mode.choice = ev.target.value; };
// The slot to cast a levelled spell with (issue #604): shown while it is armed when the caster has more than one level to pay with and a higher one adds something.
function showSlot() {
  const sel = $('hint-slot'), e = S.entities[selId], sp = mode.kind === 'spell' && !mode.item ? SPELLS[mode.id] : null, menu = sp && e ? slotMenu(e, sp) : null;
  sel.hidden = !menu || $('hint').hidden;
  if (sel.hidden) return;
  const key = `${sp.id}|${menu.levels.map((r) => r.label).join('|')}`;
  if (sel.dataset.key !== key) { sel.dataset.key = key; sel.innerHTML = menu.levels.map((r) => `<option value="${r.level}">${esc(r.label)}</option>`).join(''); }
  sel.value = String(slotOf(e, sp));
}
$('hint-slot').onchange = (ev) => { mode.slot = +ev.target.value; refresh(); };

// What to tap to aim an area. Cones, Lines and Self cubes are aimed by direction; the rest at a spot in range.
function aimHow(area, range) {
  const what = `${area.size} ft ${area.shape}${area.shape === 'line' && area.width > 5 ? ` (${area.width} ft wide)` : ''}`;
  if (area.shape === 'cone' || area.shape === 'line' || (area.shape === 'cube' && !(range > 0))) return gridWords(`tap a hex to aim the ${what}`, gridOf(S?.map));
  return area.shape === 'cube' ? `tap where the near side of the ${what} goes (within ${range} ft)` : `tap where the ${what} goes (within ${range} ft)`;
}
// An area aimed at a spot in range (issue #600): the edge of the caster's reach goes on the map, and a spot beyond it is drawn red and cannot be cast at.
// Returns the words for a spot out of reach, or null. Preview only: the engine's own check (aimArea) is the one that refuses.
const atSpot = (area, range) => area.shape !== 'emanation' && area.shape !== 'cone' && area.shape !== 'line' && !(area.shape === 'cube' && !(range > 0)) && range > 0;
function reachAim(e, hl, name, area, range) {
  if (!atSpot(area, range)) return null;
  hl.range = reachEdge(S, e, range);
  if (!mode.aim || inReach(S, e, mode.aim, range)) return null;
  hl.areaBad = true;
  return farWords(name, aimFeet(S, e, mode.aim), range);
}
// Highlights and the hint for an action being aimed.
function actionAim(e, hl) {
  const def = e.actions.find((x) => x.id === mode.id), p = actionProfile(def);
  if (!p.area) {
    hl.targets = targetsFor(S, e, { action: def.id }).filter((id) => hostile(S.entities[id], e));
    return { hint: hl.targets.length ? `${def.name}: tap a target${coverHint(e, hl.targets)}` : `${def.name}: nobody in reach (${p.far} ft)`, go: false };
  }
  const aimed = !!mode.aim || p.area.shape === 'emanation';
  hl.area = aimed ? areaHexes(S, e, { area: p.area }, mode.aim).map(cellKey) : [];
  const caught = aimed ? areaTargets(S, e, def, mode.aim) ?? [] : [];
  const how = aimHow(p.area, p.range), far = reachAim(e, hl, def.name, p.area, p.range);
  if (far) return { hint: far, go: false };
  return { hint: aimed ? `${def.name} catches ${caught.length ? caught.map((x) => x.name).join(', ') : 'nobody'}${mode.pinned ? `. ${aimedWords(gridOf(S.map))}` : ''}` : `${def.name}: ${how}`, go: aimed && hl.area.length > 0 };
}

// The hint bar's two buttons, put to the words of the movement an Opportunity Attack gave (and back to the aiming ones, 'Cast' and 'Cancel', when it is not that).
// 44 px high, the size of a thumb: the bar's own are smaller.
function hintWords(offer, waits) {
  const go = $('hint-go'), cancel = $('hint-cancel'), big = owedUi ? '44px' : '';
  go.style.minHeight = cancel.style.minHeight = big;
  cancel.hidden = owedUi === 'wait';
  cancel.textContent = owedUi === 'offer' ? forgoLabel : 'Cancel';
  go.textContent = owedUi === 'offer' ? moveLabel(offer) : owedUi === 'wait' ? giveUpLabel(waits) : 'Cast';
  if (owedUi === 'offer') go.hidden = mode.kind === 'owed';       // pressed: the next tap on a shaded place is the move
  else if (owedUi === 'wait') go.hidden = false;
}
function sizeDock() {
  R.inset = $('dock').offsetHeight * 0.85;
  document.documentElement.style.setProperty('--dock-h', `${$('dock').offsetHeight}px`);      // the dice tray and the drawer sit above the dock
}
function refresh() {
  if (!S) return;
  const enc = S.encounter, cur = current(S), e = S.entities[selId];
  document.body.classList.toggle('fight', !!enc);
  $('mode').textContent = enc ? `Round ${enc.round}` : 'Exploring';
  $('clock').textContent = clockText(S.clock);
  $('btn-leave').hidden = isDM() || !!T.solo;
  $('menu-session').hidden = false; $('menu-new').hidden = !T.solo; $('menu-leave').hidden = !!T.solo;
  showUndo();

  // turn order
  $('order').innerHTML = enc ? enc.order.map((o, i) => {
    if (o.someone) return `<li data-side="unseen" class="${i === enc.turn ? 'now' : ''}">Someone unseen</li>`;
    const x = S.entities[o.id]; if (!x) return '';
    return `<li data-side="${x.side}" class="${o.id === cur ? 'now' : ''} ${up(x) ? '' : 'out'}">${esc(shownName(S, x))}</li>`;
  }).join('') : '';
  $('order').querySelector('.now')?.scrollIntoView({ block: 'nearest', inline: 'center' });

  // character chips
  const party = $('party'); party.textContent = '';
  const hasChar = Object.values(S.entities).some((x) => x.owner === T.you.userId);
  // A player's chips are their character and its companions ("Brenna's wolf"); the DM picks a companion on the map or in the tracker.
  for (const x of Object.values(S.entities).filter((x) => x.kind === 'pc' || (x.bond && !isDM() && !x.dead))) {
    const claimable = x.kind === 'pc' && !isDM() && !hasChar && !x.owner;
    if (!mine(x) && !claimable) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = `${x.id === selId ? 'sel' : ''} ${x.id === cur ? 'now' : ''}`;
    b.innerHTML = `<i style="background:${esc(x.look?.color || '#888')}"></i>${claimable ? 'Play as ' : ''}${esc(shownName(S, x))}`;
    b.onclick = () => { if (claimable) act({ type: 'claim', entity: x.id, user: T.you.userId, userName: T.you.name }); select(x.id); R.focus(x.id); refresh(); };
    party.append(b);
  }

  // selected creature card
  const hl = { selected: selId, turn: enc ? cur : null };
  let hint = '', go = false;
  AP.render(e, mode, { my: !!e && mine(e), full: !!e?.abil });
  if (e) {
    // full: we were sent this creature's whole record (a party member, or anything if we are the DM).
    const my = mine(e), full = !!e.abil;
    const myTurn = enc && cur === e.id && up(e);
    // The spell buttons, Metamagic and everything else a creature can do are rows in the action panel's tabs (actionpanel.js).
    if (my && up(e)) {
      // highlights and hint for the armed action
      // A flyer's highlights are the places at the height it has chosen; everyone else's are on the ground.
      if (mode.kind === 'move' && myTurn) hl.move = [...moveOptions(previewState(S, e), e)].filter(([, v]) => v.canStop && (!aloft(S, e) || heightOf(v.h) === altOf(e))).map(([k]) => k);
      if (mode.kind === 'attack') {
        const a = e.attacks.find((x) => x.id === mode.id);
        hl.targets = targetsFor(S, e, { attack: mode.id }).filter((id) => hostile(S.entities[id], e));
        // Grapple, Shove and Punch and Grab: a target the engine would refuse (too big, no hand free) is not offered, and the hint says why (grapple.js).
        const bad = targetRefusals(S, e, mode.id, mode.extra, hl.targets, dry);
        if (bad.length) hl.targets = hl.targets.filter((id) => !bad.some((b) => b.id === id));
        hint = hl.targets.length ? `${a.name}${mode.label ? ` with ${mode.label}` : ''}: tap a target${coverHint(e, hl.targets)}${bad.length ? ` (${bad[0].why})` : ''}`
          : bad.length ? `${a.name} with ${mode.label}: ${bad[0].why}` : `${a.name}: nobody in reach (${a.type === 'melee' ? a.reach : a.range[1]} ft)`;
      }
      if (mode.kind === 'attack' && mode.flurry && hl.targets.length) hint = flurryHint(S, e, mode) || hint;
      if (mode.kind === 'feature') hint = `${mode.name}: tap a creature`;
      if (mode.kind === 'action') ({ hint, go } = actionAim(e, hl));
      if (mode.kind === 'spell') {
        const sp = SPELLS[mode.id];
        if (sp.aim === 'self' || sp.aim === 'none') { hint = `${sp.name}: choose the slot, then Cast`; go = true; }
        else if (sp.area) {
          const aimed = !!mode.aim || sp.area.shape === 'emanation';       // an emanation surrounds the caster: nothing to aim
          const hexes = aimed ? areaHexes(S, e, sp, mode.aim) : [];
          hl.area = hexes.map(cellKey);
          const caught = Object.values(S.entities).filter((x) => !x.dead && hl.area.includes(cellCol(x.pos)));
          const how = aimHow(sp.area, sp.range);
          // An area whose caster picks among those caught (Slow, Mass Cure Wounds): foes for a harmful one, friends for a kind one.
          if (sp.area.choose && aimed) mode.picked = caught.filter((x) => hostile(x, e) === sp.harmful).slice(0, spellMost(e, sp)).map((x) => x.id);
          const named = sp.area.choose ? (mode.picked ?? []).map(name) : caught.map((x) => x.name);
          hint = aimed ? `${sp.name} ${sp.area.choose ? 'affects' : 'catches'} ${named.length ? named.join(', ') : 'nobody'}${mode.pinned ? `. ${aimedWords(gridOf(S.map))}` : ''}` : `${sp.name}: ${how}`;
          go = aimed && hexes.length > 0;
          const far = reachAim(e, hl, sp.name, sp.area, sp.range);
          if (far) { hint = far; go = false; }
        } else {
          const ids = targetsFor(S, e, { spell: mode.id });
          if (!sp.harmful) hl.allies = ids.filter((id) => !hostile(S.entities[id], e));
          else hl.targets = ids.filter((id) => hostile(S.entities[id], e));
          // Several targets (Magic Missile's darts, Bless): each tap adds one until there are enough, or Cast.
          const most = spellMost(e, sp), picked = mode.picked ?? [];
          if (most > 1 && picked.length) {
            hint = `${sp.name}: ${picked.length} of ${most}${sp.repeat ? '' : ' creatures'} · ${picked.map(name).join(', ')}. Tap ${sp.repeat ? 'a target' : 'another'} or Cast`;
            go = true;
          } else hint = (hl.allies || hl.targets).length ? `${sp.name}: tap ${most > 1 ? `up to ${most} ${sp.repeat ? 'times' : 'targets'}` : 'a target'}${coverHint(e, hl.targets ?? [])}` : `${sp.name}: nobody within ${sp.range} ft`;
        }
      }
    }
  }
  // Movement an Opportunity Attack gave (allowance.js): to its holder, the reach shaded with Move and Don't move; to the DM whose auto-play waits for it, who is waiting
  // and a button to give it up. A line in the hint bar today; the one-token menu will show it as a prompt arriving while it is closed.
  const waits = autoWaits(), offer = !hint && e && mine(e) && (mode === MOVE || mode.kind === 'owed') ? offerOf(S, e) : null;
  owedUi = null;
  if (offer) {
    owedUi = 'offer'; hint = offerWords(offer, { armed: mode.kind === 'owed', waiting: waits.some((w) => w.id === offer.id) });
    hl.move = reachOf(S, e, (v) => !aloft(S, e) || heightOf(v.h) === altOf(e));
  } else if (!hint && mode === MOVE && waits.length) { owedUi = 'wait'; owedWho = waits.map((w) => w.id); hint = waitWords(waits); }
  if (hint && mode.kind === 'spell' && S.entities[selId]) hint += CLS.hint(S.entities[selId], mode.id);
  if (mode.kind === 'spawn') hint = gridWords(`Tap a hex to add a ${MONSTERS[mode.monster].name}`, gridOf(S.map));
  if (mode.kind === 'place') hint = gridWords(`Tap a hex to place ${name(selId)}`, gridOf(S.map));
  if (mode.kind === 'encounter') hint = gridWords('Tap the hex where the fight breaks out', gridOf(S.map));
  if (mode.kind === 'follow') hint = `Tap the party member ${name(selId)} should follow`;
  if (mode.kind === 'recall' || mode.kind === 'famAttack') hint = CP.hintFor(mode);
  { const h = CP.render(); if (h) { hl.area = h.area; hl.targets = h.targets; hl.allies = h.allies; } }
  $('hint').hidden = !hint; $('hint-text').textContent = hint; $('hint-go').hidden = !go;
  hintWords(offer, waits);
  showPick(); showSlot();
  R.setCeiling(ED.on ? ED.ceiling() : S.entities[selId] ? S.entities[selId].pos.z + 9 : Infinity);     // floors above whoever is selected are lifted out of the way
  if (FM.isOpen()) hl.move = [...(hl.move ?? []), ...FM.ghosts()];     // the places being chosen, as faint cells on the map
  R.setHighlights(ED.on ? ED.marks() : hl);
  sizeDock();
  ED.sync();
  FM.sync();
  if (pendingLead && S.entities[pendingLead] && followersOf(S, pendingLead).length) { const id = pendingLead; pendingLead = null; FM.open(id); }

  if (!$('log').hidden) renderLog();
  if (!$('sheet').hidden) { if (S.entities[selId]?.abil) renderSheet(); else $('sheet-body').innerHTML = '<p class="note">Select one of the characters to see its sheet.</p>'; }
  tracker.render();
  TC.sync(S);
  if (isDM()) renderDM();
  TD.sync(); TD.waiting();
  HO.refresh();
  SC.refresh();
  RP.refresh();
  CLS.sync(mode);
  D.sync(S);
  ST.sync(S);
  syncCards();
  if (!$('about').hidden) renderAbout();
}

// The log by combat (logview.js). A roll's line ends with small glyphs of the faces this viewer was sent.
const glyphs = (dice) => ` <span class="dgs">${dice.slice(0, MAX_DICE).map((d) => `<span class="dg${d.drop ? ' drop' : ''}${d.neg ? ' neg' : ''}" data-s="${d.sides}" title="d${d.sides}">${d.value}</span>`).join('')}</span>`;
const LV = initLogView({
  root: $('log'), list: $('log-list'), prefs, isDM: () => isDM(), nameOf: (id) => (S?.entities[id] ? shownName(S, S.entities[id]) : 'Someone'), clockText,
  line: (e, inFight) => `<li class="lg-line ${esc(e.cls)}" data-kind="${inFight && (e.kind === 'explore' || e.kind === 'combat') ? 'combat' : e.kind}">${esc(e.text)}${e.dice ? glyphs(e.dice) : ''}</li>`,
  ask: (fight) => T.history({ fight }),
});
function renderLog() { LV.render(); }

// What is lent to the creature for a time (a feature of a subclass: DEBT T96): the skills and tools, and what lent them. The sheet itself is not changed.
const lentLine = (e) => { const l = lentList(S, e); return l.length ? `<p class="note" id="sheet-lent">Proficiency lent for a time: ${l.map((x) => `${esc(niceId(x.skill ?? x.tool))} (${esc(x.name)}${x.lasts ? `, ${esc(x.lasts)}` : ''})`).join('; ')}.</p>` : ''; };

// The Armor Class that applies, and what changed it ("15 (Mage Armor)").
function acLine(e) { const a = acShown(S, e, isDM()); return a.why.length ? `${a.ac} (${a.why.join(', ')})` : `${a.ac}`; }
function renderSheet() {
  const e = S.entities[selId]; if (!e) return;
  const st = e.castAbil ? spellStats(e, S) : null;
  const abil = Object.entries(e.abil).map(([k, v]) => `<div><small>${k}</small><b>${signed(mod(v))}</b><small>${v}</small></div>`).join('');
  const saves = Object.keys(e.abil).map((k) => `${k.toUpperCase()} ${signed(e.saveBonus?.[k] ?? mod(e.abil[k]) + (e.saveProf.includes(k) ? e.prof : 0))}`).join(' · ');
  $('sheet-body').innerHTML = `
    <h2>${esc(e.name)}</h2>
    ${isDM() ? importLine(T.solo ? recall(S, { types: ['chronicle'] }) : chron, e) : ''}
    <p class="note">${e.kind === 'pc' ? `Level ${e.level} ${esc(classTitle(e))}` : esc(MONSTERS[e.tpl]?.name ?? (typeof CONTENT.summons[e.tpl]?.name === 'string' ? CONTENT.summons[e.tpl].name : e.name ?? 'Creature'))}${formOf(e) ? ` · in the form of a ${esc(formName(e))}` : ''}</p>
    ${isDM() && missingText(e) ? `<p class="note" id="sheet-subclass-missing">${esc(missingText(e))}</p>` : ''}
    ${CLS.sheetBanner(e)}
    <div class="facts"><span>HP ${e.hp} / ${e.maxHp}${e.tempHp > 0 ? ` (+${e.tempHp} temporary)` : ''}</span><span id="sheet-ac">AC ${acLine(e)}</span><span>Speed ${e.speed} ft</span><span>Initiative ${signed(e.initBonus ?? mod(e.abil.dex))}</span><span>Proficiency ${signed(e.prof)}</span>${xpFact(e)}</div>
    <div class="stats">${abil}</div>
    ${isDM() && e.sheet && dmLine(e.sheet, tableRule(S.settings)) ? `<p class="note" id="sheet-scores-line">${esc(dmLine(e.sheet, tableRule(S.settings)))}</p>` : ''}
    <p class="note">Saving throws: ${saves}</p>
    ${e.actions ? `<section><h3>Actions</h3><table><tr><th>Name</th><th>Roll</th><th>Effect</th><th>Reach</th></tr>
      ${e.actions.map(actionProfile).map((p) => `<tr><td>${esc(p.name)}</td><td>${p.bonus !== undefined ? signed(p.bonus) : p.dc ? `${p.save.toUpperCase()} DC ${p.dc}` : ''}</td><td>${esc(p.long)}${p.recharge ? ` · recharge ${p.recharge[0]}–6` : ''}${p.uses ? ` · ${p.uses.n}/day` : ''}</td><td>${p.far ? `${p.far} ft` : p.area ? `${p.area.size} ft ${p.area.shape}` : ''}</td></tr>`).join('')}</table></section>` : `<section><h3>Attacks</h3><table><tr><th>Name</th><th>To hit</th><th>Damage</th><th>Range</th></tr>
      ${e.attacks.map((a) => `<tr><td>${esc(a.name)}</td><td>${signed(a.bonus)}</td><td>${a.damage} ${a.dtype}</td><td>${a.type === 'melee' ? `${a.reach} ft` : `${a.range[0]}/${a.range[1]} ft`}</td></tr>`).join('')}</table></section>`}
    ${st ? `<section><h3>Spells · save DC ${st.dc} · attack ${signed(st.attack)} · ${Object.keys(e.slotsMax).map((l) => `level ${l} slots ${e.slots[l]}/${e.slotsMax[l]}`).join(', ')}</h3>
      <table><tr><th>Spell</th><th>Level</th><th>Casting</th><th>Range</th><th>Effect</th></tr>
      ${e.spells.map((id) => { const sp = SPELLS[id]; if (!sp) return `<tr class="hb-missing"><td colspan="5">${PK.isHomebrew(id) ? 'A homebrew spell this page does not have yet' : 'A spell this page does not know'}: <code>${esc(id)}</code>. It shows here when its pack arrives.</td></tr>`; return `<tr><td>${esc(sp.name)}${PK.isHomebrew(id) ? ` <small class="hb-tag">homebrew${PK.packOf(id) ? `: ${esc(PK.packOf(id).name)}` : ''}</small> <button type="button" class="hb-read" data-hb="${esc(id)}">Reading</button>` : ''}</td><td>${sp.level || 'Cantrip'}</td><td>${sp.time === 'bonus' ? 'Bonus Action' : sp.time === 'action' ? 'Action' : esc(sp.time)}</td><td>${sp.area ? `${sp.area.size} ft ${sp.area.shape}` : rangeAt(sp.def, e.level) === 5 ? 'Touch' : sp.range === 0 ? 'Self' : `${rangeAt(sp.def, e.level)} ft`}</td><td>${sp.heal ? `Heal ${sp.heal.dice}${sp.heal.addMod ? signed(mod(e.abil[e.castAbil])) : ''}` : esc(sp.long)}</td></tr>`; }).join('')}</table></section>` : ''}
    ${isDM() && e.kind === 'pc' && e.side === 'party' ? `<section id="sheet-refresh-box"><h3>Sheet</h3><div class="row"><button type="button" id="sheet-refresh">Refresh from sheet</button></div><p class="note" id="sheet-refresh-note">${esc(refreshNote(dry({ type: 'refresh', actor: e.id })))}</p></section>` : ''}
    ${featuresHtml(e, mine(e))}
    ${mine(e) ? pocketHtml(e) : ''}
    ${mine(e) ? reactionsHtml(S, e) : ''}
    ${Object.keys(e.features).length && !e.feats?.length ? `<section><h3>Features</h3><div class="facts">${[e.features.sneak && `Sneak Attack ${e.features.sneak}`, e.features.secondWind && `Second Wind (${e.uses.secondWind} left)`, e.features.extraAttack && `Extra Attack (${1 + e.features.extraAttack} attacks)`, e.features.packTactics && 'Pack Tactics', e.features.nimbleEscape && 'Nimble Escape'].filter(Boolean).map((f) => `<span>${f}</span>`).join('')}</div></section>` : ''}
    ${e.vuln.length || e.immune.length || e.resist.length ? `<section><h3>Defenses</h3><div class="facts">${e.vuln.map((v) => `<span>Vulnerable: ${v}</span>`).join('')}${e.resist.map((v) => `<span>Resistant: ${v}</span>`).join('')}${e.immune.map((v) => `<span>Immune: ${v}</span>`).join('')}</div></section>` : ''}
    <section><h3>Skills · passive Perception ${passive(S, e, 'perception')}</h3><div class="facts">${Object.keys(SKILLS).map((k) => `<button type="button" class="skill${e.skills?.includes(k) ? ' prof' : ''}${isLent(S, e, k) ? ' prof lent' : ''}" data-skill="${k}"${isLent(S, e, k) ? ' data-lent="1"' : ''}>${k.replace(/-/g, ' ')} ${signed(skillBonus(S, e, k))}${isLent(S, e, k) ? ' · lent' : ''}</button>`).join('')}</div>${lentLine(e)}<p class="note">Tap a skill to roll it. The DM says what comes of it.</p></section>
    ${e.gear.length ? `<section><h3>Gear</h3><div class="facts">${e.gear.map((g) => `<span>${esc(g)}</span>`).join('')}</div></section>` : ''}`;
  bindReactions($('sheet-body'), e, act); CLS.bindSheet($('sheet-body'), e);
  if ($('sheet-refresh')) $('sheet-refresh').onclick = () => { refreshAsk = { party: false, at: Date.now() }; act({ type: 'refresh', actor: e.id }); };
  for (const b of $('sheet-body').querySelectorAll('[data-hb]')) b.onclick = () => PK.reading(b.dataset.hb);
  for (const b of $('sheet-body').querySelectorAll('[data-skill]')) b.onclick = () => act({ type: 'check', actor: e.id, skill: b.dataset.skill });
}

function renderDM() {
  SR.sync(S);
  $('dm-end').disabled = !S.encounter; $('dm-start').disabled = !!S.encounter;
  $('dm-engage').checked = S.settings.autoEngage; $('dm-passive').value = S.settings.passiveFind ?? 'off'; $('dm-engage-range').value = String(S.settings.engageRange ?? 10);
  renderMarch();
  $('dm-sight').value = S.settings.sight ?? 'rooms';
  $('dm-unseen-turns').value = S.settings.unseenTurns ?? 'say';
  $('dm-dice-throw').value = S.settings.diceThrow ?? 'auto';
  const lvl = dmLevel(); $('dm-ambient').value = lvl?.light ?? 'bright'; $('dm-ambient-level').textContent = lvl ? lvl.name : '';
  const lit = S.entities[selId]?.light; $('dm-torch').disabled = !S.entities[selId]; $('dm-torch').textContent = lit ? 'Put out selected\'s light' : 'Give selected a torch';
  $('dm-vertical').value = S.settings.vertical ?? 'max'; $('dm-cover').value = S.settings.cover ?? 'on'; $('dm-creature-cover').checked = S.settings.creatureCover !== 'off'; $('dm-climb').checked = S.settings.climbing !== 'off';
  const picked = S.entities[selId], hideable = picked && picked.side !== 'party' && !picked.dead;
  $('dm-hide').disabled = !hideable || (!picked.hidden && inFight(S, picked.id));
  $('dm-hide').textContent = picked?.hidden ? 'Reveal selected' : 'Hide selected';
  $('dm-size').disabled = !picked; if (picked) $('dm-size').value = picked.size ?? 'medium';
  $('dm-fly').disabled = !picked; $('dm-fly').textContent = picked?.speeds?.fly ? 'Take flight from selected' : 'Give selected flight';
  syncBond(picked);
  QE.sync(S, selId);
  $('dm-solo').hidden = !T.solo;
  const lb = T.lobby || { members: [], pending: [] }, table = $('dm-table');
  const owed = lb.pending.length + (S.conclusion && S.conclusion.published === false ? 1 : 0) + TD.count();       // players waiting to be let in, and rewards waiting to be settled
  $('dm-badge').hidden = !owed; $('dm-badge').textContent = owed;
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

// The marching order as a list, first to last, with buttons to move someone up or down.
function renderMarch() {
  const party = Object.values(S.entities).filter((x) => x.side === 'party').sort((a, b) => (a.march ?? Infinity) - (b.march ?? Infinity));
  const list = $('dm-march'); list.textContent = '';
  party.forEach((x, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${i + 1}. ${esc(x.name)}${x.follow && S.entities[x.follow] ? ` <small>follows ${esc(S.entities[x.follow].name)}</small>` : ''}</span>`;
    for (const [label, d, aria] of [['▲', -1, 'up'], ['▼', 1, 'down']]) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.setAttribute('aria-label', `Move ${x.name} ${aria}`);
      b.disabled = !party[i + d];
      b.onclick = () => { const order = party.map((p) => p.id); [order[i], order[i + d]] = [order[i + d], order[i]]; act({ type: 'marchingOrder', order }); };
      li.append(b);
    }
    // The formation control: for the DM on anyone. "Lead..." gathers the party behind them first, "Formation..." arranges those following.
    if (isDM()) {
      const leading = leads(S, x), why = formationWhy(S, x, { dm: true, mine: true });
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fm-march'; b.textContent = leading ? 'Formation…' : 'Lead…';
      b.setAttribute('aria-label', `${leading ? 'Formation behind' : 'Lead the party with'} ${x.name}`);
      b.disabled = !!why; b.title = why;
      b.onclick = () => (leading ? formationFor(x) : lead(x));
      li.append(b);
    }
    list.append(li);
  });
}

// ---------- undo: the DM's Undo and Redo buttons say what they will take back ----------
const TOP_UNDO = new Set(['btn-undo', 'btn-redo']);
function showUndo() {
  const { undo = [], redo = [] } = T?.undoInfo ?? {}, dm = isDM();
  for (const [id, list, verb] of [['btn-undo', undo, 'Undo'], ['btn-redo', redo, 'Redo'], ['ed-undo', undo, 'Undo'], ['dm-undo', undo, 'Undo'], ['dm-redo', redo, 'Redo']]) {
    const b = $(id);
    b.disabled = !dm || !list.length;
    b.setAttribute('aria-label', nameOf(verb, list));
    if (!TOP_UNDO.has(id)) b.title = nameOf(verb, list);            // the top bar's two say it on a hold or a long hover (undobar.js), not in a browser tooltip
    const sub = b.querySelector('small'); if (sub) sub.textContent = list[0] ?? 'Nothing';
  }
  $('btn-undo').hidden = $('btn-redo').hidden = !dm;
}
wireUndo($('btn-undo'), 'Undo', () => T?.undoInfo?.undo); wireUndo($('btn-redo'), 'Redo', () => T?.undoInfo?.redo);
const undo = () => isDM() && T.undo?.(), redo = () => isDM() && T.redo?.();
$('btn-undo').onclick = undo; $('btn-redo').onclick = redo; $('ed-undo').onclick = undo; $('dm-undo').onclick = undo; $('dm-redo').onclick = redo;

// ---------- taps ----------
let lastMove = null;
// A tap while aiming an area: the first puts the area there (on touch there is no hover, so this is the preview); a second on the same spot casts, as the Cast button does.
// A spot out of reach is shown but never cast (the hint says how far it is, and Cast is hidden). A second tap straight after the first is a double tap and waits.
let pinnedAt = 0;
function aimTap(hex) {
  const same = mode.pinned && mode.aim && cellKey(mode.aim) === cellKey(hex);
  if (same && Date.now() - pinnedAt > 400 && !$('hint-go').hidden) return castAimed();
  if (!same) pinnedAt = Date.now();
  mode.aim = hex; mode.pinned = true;
  refresh();
}
R.onTap = ({ hex, id }) => {
  if (!S || !T || skipping()) return;
  const e = S.entities[selId], tapped = id ? S.entities[id] : null;
  const inZone = [...new Set(R.zonesAt(hex))];
  if (inZone.length && mode.kind === 'move') toast(inZone.join(', '), true);      // a lasting zone's name, for a tap (hover shows it on a mouse)
  if (CP.tap(mode, hex, id)) return;
  if (mode.kind === 'spawn') return act({ type: 'spawn', monster: mode.monster, at: hex, hidden: $('dm-hidden').checked });
  if (mode.kind === 'place') { act({ type: 'place', actor: selId, to: hex }); return setMode(MOVE); }
  if (mode.kind === 'encounter') { act({ type: 'startEncounter', center: hex }); return setMode(MOVE); }
  if (mode.kind === 'follow') {
    setMode(MOVE);
    if (tapped && tapped.id !== selId && tapped.side === 'party') return act({ type: 'follow', actor: selId, leader: tapped.id });
    return tapped ? toast('Only another member of the party can be followed.') : undefined;
  }
  if (mode.kind === 'attack') return tapped && tapped.id !== selId ? act({ type: 'attack', actor: selId, target: id, attack: mode.id, ...(mode.extra ?? {}) }) : setMode(MOVE);
  if (mode.kind === 'feature') { const f = mode.id, mode0 = mode; setMode(MOVE); return tapped ? act({ type: 'feature', actor: selId, feature: f, target: id, ...(mode0.extra ?? {}) }) : undefined; }
  if (mode.kind === 'action') {
    if (mode.area) return aimTap(hex);
    return tapped && tapped.id !== selId ? act({ type: 'act', actor: selId, action: mode.id, target: id }) : setMode(MOVE);
  }
  if (mode.kind === 'spell') {
    const sp = SPELLS[mode.id];
    if (sp.aim === 'self' || sp.aim === 'none') return;       // armed only to choose the slot: Cast or Cancel in the hint bar
    if (sp.area) return aimTap(hex);
    if (!tapped) return setMode(MOVE);
    if (!mode.deliver && !targetsFor(S, e, { spell: mode.id }).includes(id)) return toast(`${sp.name} can't reach ${tapped.name}.`);
    const most = spellMost(e, sp);
    if (most <= 1) return act(castAct({ target: id, ...chosen(sp) }));
    const picked = mode.picked ?? (mode.picked = []);
    if (!sp.repeat && picked.includes(id)) picked.splice(picked.indexOf(id), 1);       // tap again to take it back
    else picked.push(id);
    if (picked.length >= most) return act(castAct({ targets: picked, ...chosen(sp) }));
    return refresh();
  }
  if (tapped) {
    const myTurn = e && mine(e) && S.encounter && current(S) === e.id;
    if (myTurn && tapped.id !== e.id && hostile(tapped, e) && !tapped.dead && !e.bond?.noAttack) {         // tap an enemy on your turn: attack with whatever reaches
      const d = gap(S, e.pos, tapped.pos) * FT;
      if (e.actions) {             // a monster: the first of its attacks that reaches, from what a Multiattack left if it did
        const b = S.encounter.budget;
        const x = e.actions.map(actionProfile).filter((p) => p.roll && p.roll !== 'save' && p.aim === 'creature' && !actionSpent(e, p) && (!b.attacks || fromPool(b, p.id)) && targetsFor(S, e, { action: p.id }).includes(tapped.id))[0];
        if (x) return act({ type: 'act', actor: e.id, action: x.id, target: tapped.id });
        return toast(`${tapped.name} is ${d} ft away. Move closer, or pick an action.`);
      }
      const a = tapAttack(S, e, d);      // a granted attack (Flurry of Blows) first, then one the Attack action allows, then the first that reaches
      if (a) return act({ type: 'attack', actor: e.id, target: tapped.id, attack: a });
      return toast(`${tapped.name} is ${d} ft away. Move closer, or pick a spell.`);
    }
    select(tapped.id); return refresh();
  }
  if (e && mine(e) && hex) {
    // Movement an Opportunity Attack gave is spent only once the Move button was pressed (allowance.js), so that a tap that meant something else does not spend it.
    if (offerOf(S, e) && mode.kind !== 'owed') return toast(`Press Move up to ${offerOf(S, e).feet} ft first, or Don't move.`);
    // A flyer goes to the tapped hex at its chosen height; if it cannot stop there, say so.
    if (aloft(S, e) && altOf(e) > 0) {
      const spot = [...moveOptions(previewState(S, e), e).values()].find((v) => v.canStop && v.h.q === hex.q && v.h.r === hex.r && heightOf(v.h) === altOf(e));
      return spot ? act({ type: 'move', actor: e.id, to: spot.h }) : toast(`${e.name} can't reach that at ${altOf(e)} ft up.`);
    }
    lastMove = { hex, at: Date.now() };       // if the arena refuses it, the edge nearest this hex flashes (T.on.error)
    act({ type: 'move', actor: e.id, to: hex });
  }
};
R.onHover = (hex) => { if (((mode.kind === 'spell' && SPELLS[mode.id].area) || (mode.kind === 'action' && mode.area)) && hex && !mode.pinned && cellKey(hex) !== (mode.aim && cellKey(mode.aim))) { mode.aim = hex; refresh(); } };

// ---------- controls ----------
$('btn-end').onclick = () => { if (CLS.askCure(S.entities[selId])) return; act({ type: 'endTurn', actor: selId }); };       // Self-Restoration with a choice asks first
$('hint-cancel').onclick = () => (owedUi === 'offer' ? act({ type: 'forgoMove', actor: selId }) : setMode(MOVE));
$('hint-go').onclick = () => {
  if (owedUi === 'offer') return setMode(OWED);
  if (owedUi === 'wait') return owedWho.forEach((id) => act({ type: 'forgoMove', actor: id }));      // the DM gives it up for them; the engine lets the DM
  castAimed();
};
function castAimed() {
  if (mode.kind === 'action') act({ type: 'act', actor: selId, action: mode.id, hex: mode.aim ?? undefined });
  else if (SPELLS[mode.id].aim === 'self' || SPELLS[mode.id].aim === 'none') act(castAct({ ...chosen(SPELLS[mode.id]) }));
  else if (SPELLS[mode.id].area) {
    const sp = SPELLS[mode.id], me = S.entities[selId];
    // A zone that spares whom the caster names (Spirit Guardians) spares the caster's side.
    const spare = sp.def.zone?.spare ? Object.values(S.entities).filter((x) => !x.dead && x.id !== selId && !hostile(x, me)).map((x) => x.id) : null;
    act(castAct({ hex: mode.aim ?? undefined, ...(sp.area.choose ? { targets: mode.picked ?? [] } : {}), ...(spare ? { spare } : {}), ...chosen(sp) }));
  }
  else act(castAct({ targets: mode.picked ?? [], ...chosen(SPELLS[mode.id]) }));
  mode = MOVE;
}
$('cam-l').onclick = () => R.rotate(-Math.PI / 6); $('cam-r').onclick = () => R.rotate(Math.PI / 6);
$('cam-in').onclick = () => R.zoom(0.8); $('cam-out').onclick = () => R.zoom(1.25);
// The connection dot (linkdot.js, issue #246): the top bar's own at a table, and the DM's view of each player's in the tracker.
const DOT = mountDot({ transport: () => T, parent: $('tools'), before: $('btn-undo') });
const linkOf = (e) => {
  const who = ownerOf(S, e);      // a companion shows its master's player
  if (!who || T.solo) return null;
  const m = (T.lobby?.members ?? []).find((x) => x.id === who);
  return { ...seenState(T.links?.get(who), m?.online, Date.now(), T.linkCfg), who: m?.name };
};
const tracker = createTracker({ root: $('tracker'), state: () => S, isDM, mine, act, toast, link: linkOf,
  pick: (id) => { select(id); R.focus(id); refresh(); if (!D.wide) D.close(); },      // on a phone the map is what was asked for
  openSheet: (id) => { select(id); D.open('sheet'); refresh(); } });
// The drawer holds every panel (drawer.js); what it shows is rendered here once its tab is the one open.
// The feedback button (feedback.js): a report is built only from what was shown or sent here.
// A new build on the server (newversion.js, #646): checked on load, when a table's socket opens again, and (solo) when the tab is shown again.
const NV = mountNewVersion({ fetchBuild: () => fetch('./build.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('no build.json')))) });
NV.check(); NV.solo(() => !T || T.solo);
const FB = initFeedback({ onBuild: () => renderAbout(), look: () => ({ S, T, selId, themeId, mine, renderer: rendererKind(location.search, prefs.get('hextable.renderer')) }) });

const D = initDrawer({ prefs, state: () => S, isDM, change: () => { refresh(); if (!$('about').hidden) renderAbout(); } });
const openPanel = (id) => D.open(id);
$('btn-sheet').onclick = () => D.open('sheet');
$('order').onclick = () => D.open('turns');
$('lobby-about').onclick = (ev) => D.open('about', ev.currentTarget);
$('splash-about').onclick = (ev) => D.open('about', ev.currentTarget);
const renderAbout = () => { const html = aboutHTML({ stateVersion: VERSION, tableVersion: S?.version, buildLine: FB.buildLine() }); if ($('about').dataset.sig !== html) { $('about').dataset.sig = html; $('about').innerHTML = html; } };
const setTheme = (id) => { if (!THEMES[id]) return; themeId = id; prefs.set('hextable.theme', themeId); applyTheme(); R.setTheme(THEMES[themeId]); };
const ST = initSettings({ prefs, themeId: () => themeId, setTheme, look: (k, v) => { if (setLook(k, v)) R.setTheme(THEMES[themeId]); }, dice: DICE, repace: () => { TL.setPace(pace()); syncPlaying(); }, drawer: D, isDM });
// Where the drawer covers the map, a DM tool that asks for a tap on the map closes it first.
const closeDM = () => { if (!D.pinnedOpen()) D.close(); };
$('dm-edit').addEventListener('click', closeDM);
$('dm-start').onclick = () => { closeDM(); setMode({ kind: 'encounter' }); };
$('dm-end').onclick = () => act({ type: 'endEncounter' });
$('dm-place').onclick = () => { if (!selId) return toast('Select a creature first.'); closeDM(); setMode({ kind: 'place' }); };
const SR = initShortRest({ host: $('dm-rest-all'), act, getState: () => S });
$('dm-short-rest').addEventListener('click', () => CLS.restRows($('dm-short-box')));       // Arcane Recovery and Natural Recovery rows (classes.js), after the box is drawn
$('dm-rest').onclick = () => act({ type: 'rest' });
$('dm-refresh-party').onclick = () => { refreshAsk = { party: true, at: Date.now() }; act({ type: 'refresh' }); };
$('dm-rest-all').onclick = () => act({ type: 'rest', ids: Object.values(S.entities).filter((e) => !e.dead).map((e) => e.id) });
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
$('dm-cover').onchange = (ev) => act({ type: 'setting', key: 'cover', value: ev.target.value });
$('dm-creature-cover').onchange = (ev) => act({ type: 'setting', key: 'creatureCover', value: ev.target.checked ? 'on' : 'off' });
$('dm-climb').onchange = (ev) => act({ type: 'setting', key: 'climbing', value: ev.target.checked ? 'on' : 'off' });
$('dm-size').onchange = (ev) => { if (S.entities[selId]) act({ type: 'setSize', actor: selId, size: ev.target.value }); };
// The DM's Bond control (companions.md, Decision 1): bind the selected creature to a master as a familiar, steed, pet and so on, or free it.
// The engine says no in its own words (a player's character, a creature already bound, a master that is a companion), and those words reach the DM as a toast.
const bondRow = document.createElement('div');
bondRow.className = 'row'; bondRow.id = 'dm-bond-row';
bondRow.innerHTML = `<select id="dm-bond-to" aria-label="Master of the selected creature"></select>
  <select id="dm-bond-kind" aria-label="What the companion is">${BOND_KINDS.map((k) => `<option value="${k}">${k[0].toUpperCase()}${k.slice(1)}</option>`).join('')}</select>
  <label class="check"><input type="checkbox" id="dm-bond-noattack"> Can't attack</label>
  <button type="button" id="dm-bond" disabled>Bond selected</button><button type="button" id="dm-bond-free" disabled>Free selected</button>`;
$('dm-fly').parentElement.after(bondRow);
let bondSig = '';
function syncBond(picked) {
  const masters = Object.values(S.entities).filter((x) => x.id !== picked?.id && !x.dead && !x.bond && !x.hidden);
  const sig = masters.map((x) => `${x.id}:${x.name}`).join('|');
  const sel = $('dm-bond-to');
  if (sig !== bondSig) { const keep = sel.value; bondSig = sig; sel.innerHTML = masters.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join(''); if (masters.some((x) => x.id === keep)) sel.value = keep; }
  const bound = !!picked?.bond;
  $('dm-bond').disabled = !picked || bound || picked.kind === 'pc' || !masters.length;
  $('dm-bond-free').disabled = !bound;
  bondRow.title = bound ? `${picked.name} is ${S.entities[picked.bond.to]?.name ?? 'someone'}'s ${picked.bond.kind}.` : '';
  bondRow.dataset.bond = bound ? picked.bond.to : '';
}
$('dm-bond').onclick = () => {
  const e = S.entities[selId], to = $('dm-bond-to').value;
  if (e && to) act({ type: 'bond', actor: e.id, to, kind: $('dm-bond-kind').value, ...($('dm-bond-noattack').checked ? { noAttack: true } : {}) });
};
$('dm-bond-free').onclick = () => { const e = S.entities[selId]; if (e?.bond) act({ type: 'bond', actor: e.id, to: null }); };
$('dm-fly').onclick = () => { const e = S.entities[selId]; if (e) act({ type: 'setSpeed', actor: e.id, mode: 'fly', feet: e.speeds?.fly ? 0 : 60 }); };
$('dm-engage-range').onchange = (ev) => act({ type: 'setting', key: 'engageRange', value: +ev.target.value });
$('dm-passive').onchange = (ev) => act({ type: 'setting', key: 'passiveFind', value: ev.target.value });
// Sight and light (docs/specs/sight.md). Ambient light is set on the level the selected creature stands on, or the first level.
function dmLevel() { const e = S?.entities[selId]; return (e && under(S.map, e.pos)?.level) || S?.map.levels[0] || null; }
$('dm-sight').onchange = (ev) => act({ type: 'setting', key: 'sight', value: ev.target.value });
$('dm-unseen-turns').onchange = (ev) => act({ type: 'setting', key: 'unseenTurns', value: ev.target.value });
$('dm-dice-throw').onchange = (ev) => act({ type: 'setting', key: 'diceThrow', value: ev.target.value });
$('dm-ambient').onchange = (ev) => { const l = dmLevel(); if (l) act({ type: 'mapEdit', ops: [{ op: 'level', level: { id: l.id, light: ev.target.value === 'bright' ? null : ev.target.value } }] }); };
$('dm-torch').onclick = () => { const e = S.entities[selId]; if (e) act({ type: 'setLight', actor: e.id, item: e.light ? null : 'torch' }); };
$('dm-auto').onchange = () => S && onUpdate(S, []);
$('dm-export').onclick = () => T.export().then((table) => {
  downloadTable(table);
  const n = table.assetsSkipped?.length ?? 0;
  if (n) toast(`Saved. ${n} picture${n === 1 ? ' was' : 's were'} too much to include (the limit is ${Math.round(table.assetLimit / 1048576)} MB of pictures).`);
}, (e) => toast(e.message));
// Anything that discards a game takes two taps, so a stray one can't. The first arms the button for 3 seconds
// and shows what it will do; the second does it.
const armTimers = new Map();
function twoTap(btn, armed, note, go) {
  if (!btn.classList.contains('sure')) {
    btn.dataset.label = btn.textContent;
    btn.classList.add('sure'); btn.textContent = armed;
    const n = btn.id.startsWith('menu-') ? $('menu-note') : null;
    if (n) { n.textContent = note; n.hidden = false; }
    clearTimeout(armTimers.get(btn)); armTimers.set(btn, setTimeout(() => disarm(btn), 3000));
    return;
  }
  clearTimeout(armTimers.get(btn)); disarm(btn); go();
}
function disarm(btn) {
  if (!btn.classList.contains('sure')) return;
  btn.classList.remove('sure'); btn.textContent = btn.dataset.label;
  if (btn.id.startsWith('menu-')) $('menu-note').hidden = true;
}
const LEAVE_NOTE = 'Leaving forgets this table on this device.';
const leaveNote = () => (isDM() ? `${LEAVE_NOTE} Your players stay, but nobody can let new players in.` : LEAVE_NOTE);
function leaveTable(btn) { twoTap(btn, 'Tap again to leave', leaveNote(), reallyLeave); }
function reallyLeave() {
  TL.skip(); T.leave?.(); T = null; S = null; PK.clear(); SC.fresh(); RP.fresh(); DF.fresh(); CC.fresh(); $('scene').hidden = true; document.body.classList.remove('in-scene'); selId = null; clearTimeout(aiTimer);
  D.close(false); D.reset();
  for (const id of ['card', 'viewer']) $(id).hidden = true;
  $('btn-leave').hidden = $('btn-undo').hidden = $('btn-redo').hidden = true; $('menu-session').hidden = true;
  D.sync(null);
  lobbyBusy(false); showLobby('You left the table.');
}
$('btn-leave').onclick = (ev) => leaveTable(ev.currentTarget);
$('dm-leave').onclick = (ev) => leaveTable(ev.currentTarget);
$('menu-leave').onclick = (ev) => leaveTable(ev.currentTarget);
const newWorld = (ev) => twoTap(ev.currentTarget, 'Tap again to start over', 'This replaces the game saved on this device with a new one.', () => { D.close(); T.reset?.({ grid: TC.valleyGrid(), party: MC.party().party ?? undefined }); });
$('dm-new').onclick = newWorld;
$('menu-new').onclick = newWorld;
// The DM's "Add a monster" buttons: the monsters the page knows now. Built again when the table's packs change (DEBT T34), so a homebrew monster can be added.
// A player's page is never given one, and the DM's drawer is not theirs.
function buildSpawn() {
  $('dm-spawn').replaceChildren(...Object.entries(MONSTERS).map(([id, m]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = `Add ${m.name}`; b.dataset.monster = id;
    b.onclick = () => { closeDM(); setMode({ kind: 'spawn', monster: id }); };
    return b;
  }));
}
buildSpawn();
for (const b of document.querySelectorAll('[data-time]')) b.onclick = () => act({ type: 'advanceTime', minutes: +b.dataset.time });
$('dm-chron').onsubmit = (ev) => { ev.preventDefault(); const t = $('chron-title').value.trim(); if (t) { act({ type: 'chronicle', title: t }); $('chron-title').value = ''; } };
addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT') return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); return ev.shiftKey ? redo() : undo(); }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); return redo(); }
  if (ev.key === 'Escape' && skipping()) return;
  if (ev.key === 'Escape' && !armed) setMode(MOVE);
  if (!S || !$('lobby').hidden) return;
  if (ev.key === 'Shift') { KB.shift(true); return; }
  const a = actionOf(ev, keyMap());
  if (!a || leaveAlone(ev, document) || (a === 'recentre' && closeTray)) return;      // the dice tray keeps Space
  ev.preventDefault();
  KB.shift(ev.shiftKey);
  if (ACTIONS[a].kind === 'press') PRESS[a](); else KB.down(a, ev.repeat);
});

// ---------- keyboard movement, the follow camera and key maps (docs/specs/keyboard.md, keys.js) ----------
// A walk key sends the ordinary move for one space through the tap's own path; the walker sends the next only once this one is answered.
const keyMap = () => presetOf(prefs.get('hextable.keys'));
const lastDir = {};            // each creature's last direction of travel by the keys, as a camera yaw
const walkable = () => { const e = S?.entities[selId]; return e && mine(e) && mode.kind === 'move' && !S.prompt && !S.pending && $('lobby').hidden ? selId : null; };
const KB = createWalker({
  now: () => performance.now(),
  actor: walkable,
  start() {
    if (walkable() || !S || mode.kind !== 'move') return walkable();
    const own = Object.values(S.entities).find((e) => e.kind === 'pc' && !e.dead && mine(e) && (!isDM() || e.side === 'party'));
    if (own) { select(own.id); refresh(); }
    return walkable();
  },
  fight: () => !!S?.encounter,
  yaw: () => R.cameraAngles().yaw,
  turns: () => R.cameraAngles().turns ?? 0,
  turnKey: () => (S?.encounter ? `${S.encounter.id ?? 0}:${S.encounter.round}:${S.encounter.turn}` : 'none'),
  grid: () => gridOf(S.map),
  busy: () => (TL.pace === 'wait' && TL.busy()) || waiting > 0 || !!armed,
  send(id, d) { const e = S.entities[id], n = acted; R.onTap({ hex: { q: e.pos.q + d.dq, r: e.pos.r + d.dr }, id: null }); return acted > n; },
  look(dy, dp) { if (dy) R.rotate(dy); if (dp) R.tilt(dp); },
  stepped(id, d, follow, ahead) {
    if (ahead) lastDir[id] = yawFacing(gridOf(S.map), d.dq, d.dr);      // a step back or to the side leaves the view (and Space) where it was
    if (ahead && follow) R.face(lastDir[id], reducedMotion());
    const b = S.encounter?.budget;
    if (b && current(S) === id) toast(`${name(id)}: Move ${Math.floor(b.move)} ft left`, true);
  },
});
const PRESS = {
  rotateLeft: () => R.rotate(-Math.PI / 12), rotateRight: () => R.rotate(Math.PI / 12),
  zoomIn: () => R.zoom(0.9), zoomOut: () => R.zoom(1.1),
  sheet: () => D.open('sheet'),
  recentre() { if (!S?.entities[selId]) return; const rm = reducedMotion(); R.focus(selId, rm); if (lastDir[selId] !== undefined) R.face(lastDir[selId], rm); KB.resume(); },
};
addEventListener('keyup', (ev) => { if (ev.key === 'Shift') KB.shift(false); const a = actionOf({ code: ev.code }, keyMap()); if (a) KB.up(a); });
addEventListener('blur', () => KB.release());
document.addEventListener('visibilitychange', () => { if (document.hidden) KB.release(); });
setInterval(() => KB.tick(), 30);

const QE = initQuickEntry({ act, toast, getState: () => S, getSelected: () => selId, me: () => T?.you?.userId });
// Homebrew packs (packmanager.js): kept installed while a table is open. When they change, what names a pack's entry is dropped or drawn again.
const PK = initPacks({ transport: () => T, isDM, toast, changed: () => {
  buildSpawn();
  if (mode.kind === 'spawn' && !MONSTERS[mode.monster]) mode = MOVE;
  if (mode.kind === 'spell' && !SPELLS[mode.id]) mode = MOVE;
  if (S) refresh();
} });
const TD = initTodo({ mount: $('todo-mount'), state: () => S, isDM, act, toast, waitLine: $('todo-wait'), place: (id) => { select(id); closeDM(); setMode({ kind: 'place' }); toast('Tap where it goes.', true); } });      // the DM's to-do tray (todo.js)
const HO = initHandouts({ act, toast, transport: () => T, state: () => S, isDM, openPanel });
const SC = initScenes({ act, toast, transport: () => T, state: () => S, isDM, startFight: () => { if (S.encounter) return; setMode({ kind: 'encounter' }); toast('Tap where the fight is: an open scene ends when it starts.', true); } });
const TC = initTableControls({ act, getState: () => S, isDM, toast });
const RP = initReactionPrompt({ act, state: () => shownState(S), isDM });
// The cards that come after a fight: the party has fallen (defeat.js). Drawn from the state once the beats that led to it have played.
const DF = initDefeat({ state: () => S, isDM, solo: () => !!T?.solo, info: () => T?.undoInfo ?? {}, rewind: (to) => T.rewind?.(to) });
const CC = initConclusion({ act, state: () => S, isDM, solo: () => !!T?.solo, code: () => T?.you?.code ?? 'solo', prefs });
function syncCards() {
  const calm = !TL.busy();
  DF.sync(S, { calm }); CC.sync(S, { calm });
  $('log-rewards').hidden = !CC.reopenable(S);
}
// Class features that need a choice first (classes.js): Divine Spark's mode, a Wild Shape form, Metamagic...
const CLS = initClasses({ act, state: () => S, mine, isDM, toast,
  arm: (m) => setMode({ kind: 'feature', ...m }),
  armAttack: (m) => setMode({ kind: 'attack', ...m }),
  castSpell: (e, id) => { const sp = SPELLS[id]; if (isSummon(id)) CP.openChooser(e, id); else if (sp.aim === 'self' || sp.aim === 'none') selfCast(e, id); else setMode({ kind: 'spell', id, aim: null, keep: !!sp.area, picked: [] }); } });

// The action panel (actionpanel.js): the card's head and status, and the tabs with a row for everything a creature can do.
const AP = initActionPanel({ comp: CP, dry, prefs, state: () => S, isDM, mine, act, toast, skipping, setMode, move: MOVE, render: () => refresh(), selected: () => selId,
  castSpell: startSpell, openSheet: () => D.open('sheet'), lead: (e) => lead(e), formation: (e) => formationFor(e), shortRest: () => { D.open('dm'); $('dm-short-rest').click(); }, hpFraction, formLabel: (e) => (formOf(e) ? formName(e) : ''),
  budget: (e) => ({ ...S.encounter.budget, attacksLeft: attacksLeft(S.encounter.budget) }),
  openFeature: (e, id) => CLS.openFeature(e, id), openAttack: (e, id) => CLS.openAttack(e, id), metamagic: (e) => CLS.buttons(e).find((b) => b.feature === 'metamagic') ?? null, flyInfo: (e) => (aloft(S, e) ? { aloft: true, alt: altOf(e) } : null),
  armItem: (e, r, level, armed) => { const sp = SPELLS[r.spell]; setMode(armed ? MOVE : { kind: 'spell', id: r.spell, item: { key: r.send.item, which: r.send.which, base: r.level, ...(level ? { level } : {}) }, aim: null, keep: !!sp.area, picked: [] }); },
  fly: (e, delta) => { flyAlt[e.id] = altOf(e) + delta; refresh(); } });
// The formation popup (formation.js): Lead sends `partyFollow`, and the popup opens once the table says someone follows (`pendingLead`).
let pendingLead = null;
const FM = initFormation({ state: () => S, act, isDM, mine, refresh: () => refresh() });
const lead = (e) => { pendingLead = e.id; act({ type: 'partyFollow', leader: e.id }); };
const formationFor = (e) => { if (!FM.open(e.id)) toast(whyNoFormation(S, e, { dm: isDM(), mine: mine(e) }) || 'Nobody can be placed yet.'); };
new ResizeObserver(() => { if (S && $('dock').offsetHeight) sizeDock(); }).observe($('dock'));

// For the browser console, tests and future automation.
window.hextable = { R /* the smoke script's test surface: it may read the default renderer's insides; the app may not */, describe: (ev) => describe(ev)?.[0] ?? null /* the log's words for an event, for the smoke passes */, get packs() { return PK.peek(); }, get link() { return T?.link; }, get links() { return T?.links; }, dropSocket: () => T?.dropSocket?.(), drawer: D, ED, act, timeline: TL, pace, played, dice: DICE, thrown, get armed() { return armed; }, get waiting() { return waiting; }, get assets() { return T?.assets; }, select: (id) => { select(id); refresh(); }, get state() { return S; }, get mode() { return mode; }, get keys() { return KB; } /* the keyboard walker, for the smoke pass */ };

// ---------- the splash ----------
// The page shows its name and a line at once (index.html, drawer.css); it goes when there is a table to look at or a lobby to
// choose from, and in any case after a few seconds (drawer.css also takes it away by itself if this script never runs).
const splashDone = () => { const sp = $('splash'); if (sp.hidden || sp.classList.contains('done')) return; sp.classList.add('done'); setTimeout(() => { sp.hidden = true; }, 300); };
new MutationObserver(() => { if (!$('lobby').hidden) splashDone(); }).observe($('lobby'), { attributes: true, attributeFilter: ['hidden'] });
setTimeout(splashDone, 10000);

// ---------- joining a table ----------
// While a host or join request is in flight, the buttons are off so a second tap can't send a second request.
const lobbyBusy = (on) => { $('lobby-host').disabled = $('lobby-join').disabled = on; };
let pendingMap = null;
function start(transport, map = null) {
  pendingMap = map;
  TL.skip();                    // what is still playing belongs to the old table
  T?.close?.();                 // only ever one connection to a table
  ED.stop();
  T = transport; S = null;
  if (!T.solo) { soloClaim?.release(); soloClaim = null; }       // a table is not a solo save: let the claim go
  $('readonly-bar').hidden = $('readonly-frame').hidden = !T.readOnly; document.body.classList.toggle('readonly', !!T.readOnly);
  T.on.reconnected = () => NV.onReconnect();       // a table that comes back may have been redeployed meanwhile
  T.on.saveError = (msg) => toast(msg, false, 12000);          // the browser would not keep the game (review R17)
  PK.attach(T);                 // the table's homebrew packs: kept while this table is open (packmanager.js)
  $('splash-text').textContent = T.solo ? 'Opening your game\u2026' : 'Connecting to the table\u2026';
  lobbyBusy(!T.solo);
  T.on.update = received;
  closeTray?.(); armed = null; DICE.skip();
  T.on.error = (msg, expired) => {
    // The engine refused a step the monster AI chose: end its turn rather than ask again.
    flick = null; refreshAsk = null;
    if (aiSent && S && current(S) === aiSent && !expired) { const id = aiSent; aiSent = null; act({ type: 'endTurn', actor: id }); }
    KB.refused(); CLS.refused(msg); DF.refused(msg); CC.refused(msg); SC.refused(); RP.refused(msg); QE.refused(msg);
    if (expired) { if (rejoinedLast) forgetLastSession(); rejoinedLast = false; TL.skip(); S = null; PK.clear(); lobbyBusy(false); showLobby(msg); }
    else if (/arena is locked/i.test(msg)) {       // the fight's rule, said in words, and the edge nearest the tap lights up (three-build.js, arenaFlashCells)
      toast(`${msg} Nobody leaves the lit area of the fight before then.`);
      if (lastMove && Date.now() - lastMove.at < 4000) window.dispatchEvent(new CustomEvent('hextable-arena-flash', { detail: lastMove.hex }));
    } else toast(msg);
    pendingLead = null; lastMove = null; };
  T.on.lobby = () => S && refresh();
  T.on.link = () => DOT.render();
  T.on.links = () => { if (S) { tracker.render(); DOT.render(); } };
  DOT.render();
  T.on.undoable = () => { if (S) { showUndo(); syncCards(); } };
  T.on.history = (msg) => {
    if (!S) return;
    if (msg.types?.includes('scoresRolled')) { QE.events(msg.entries); QE.scoresChecked(); return; }      // the build sheet's own question: nothing else is in it
    if (msg.recent) QE.events(msg.entries.filter((e) => SCORE_EVENTS.includes(e.type)));
    if (msg.recent) {             // what happened before we sat down, so the log has some context
      if (seeded) return;         // a reconnect sends it again; the log already has it
      seeded = true;
      LV.seed(msg.entries.map((e) => [e, describe(e)]), true);
      T.history({ types: ['encounterStart', 'encounterEnd', 'conclusion'], limit: 200 });      // older fights, one collapsed entry each
    } else if (msg.fight !== undefined) {
      LV.record(msg.fight, msg.entries.map((e) => [e, describe(e)]), msg.cut);      // one fight's blow-by-blow, asked for when it was opened
      return;
    } else if (msg.types?.includes('encounterEnd')) {
      LV.merge(msg.entries.map((e) => [e, describe(e)]));
      return;
    } else {
      // An answer says which types it was asked for (older servers do not: those are chronicle requests).
      if (!msg.types || msg.types.includes('chronicle')) chron = msg.entries.filter((e) => e.type === 'chronicle');
      if (msg.types?.includes('say')) SC.history(msg.entries.filter((e) => e.type === 'say'));
    }
    refresh();
  };
  T.on.welcome = (you) => {
    SC.resync(); $('lobby').hidden = you.approved;
    $('lobby-code').value = ''; saveFront();                    // the code did its job
    if (!you.approved) { $('lobby-remember').hidden = true; lobbyAt(['Join a table', `Table ${you.code}`, 'Waiting for the DM'], leaveWaiting); $('lobby-msg').textContent = `Table ${you.code}: waiting for the DM to let you in…`; }
  };
  FB.attach(T);                 // feedback.js notes the actions sent and the answers (nothing else is read from the transport)
  T.start();
}
// The lobby says what this device holds: a remembered table (Rejoin or Forget) and a saved solo game (Continue or New game).
// A table belongs to the window that joined it (#625): this window's own seat, or, for a window with none, the one the device used last, offered as a suggestion.
function showLobby(msg = '') {
  const own = savedSession(), last = own ? null : lastSession(), sess = own ?? last, solo = hasSoloGame(windowSoloKey());
  $('lobby-remember').hidden = !sess;
  $('lobby-else').hidden = !last;
  if (own) { $('lobby-table').textContent = `This window remembers table ${own.code}.`; $('lobby-rejoin').textContent = 'Rejoin'; }
  else if (last) { $('lobby-table').textContent = `This window has no seat yet. This device last sat at table ${last.code}${last.name ? ` as ${last.name}` : ''}.`; $('lobby-rejoin').textContent = `Rejoin ${last.code}${last.name ? ` as ${last.name}` : ''}`; }
  $('lobby-solo').textContent = solo ? 'Continue solo game' : 'Play solo on this device';
  $('lobby-new').hidden = !solo;
  $('lobby-msg').textContent = msg;
  syncWhere(); syncStartOver();
  $('lobby').hidden = false;
  (sess ? $('lobby-rejoin') : $('lobby-solo')).focus?.({ preventScroll: true });
}
let rejoinedLast = false;         // the table being rejoined came from the device's suggestion, not this window's own seat
$('lobby-else').onclick = () => {
  const last = lastSession(); $('lobby-remember').hidden = true;
  if (last) $('lobby-code').value = last.code;
  $('lobby-msg').textContent = 'Enter your name and Join: the DM lets you in as a new seat.'; $('lobby-name').focus?.({ preventScroll: true });
};
$('lobby-rejoin').onclick = () => { const own = savedSession(), sess = own ?? lastSession(); if (!sess) return showLobby(); rejoinedLast = !own; $('lobby-msg').textContent = `Rejoining table ${sess.code}\u2026`; start(serverTransport({ t: 'resume', code: sess.code, token: sess.token })); };
$('lobby-forget').onclick = (ev) => twoTap(ev.currentTarget, 'Tap again to forget', '', () => { if (savedSession()) forgetSession(); else forgetLastSession(); showLobby('Table forgotten.'); });
// A new solo game starts with the party chosen in the lobby (mycharacters.js); one that cannot be played is said, and nothing starts.
const MC = initMyCharacters({ twoTap, toast });
function newSolo(key = windowSoloKey()) {
  const { party, problems } = MC.party();
  if (!party) { $('lobby-party').open = true; $('lobby-msg').textContent = `The party is not ready. ${problems[0]}`; return false; }
  $('lobby').hidden = true; start(localTransport({ grid: TC.lobbyGrid(), party, saveKey: key }), TC.lobbyChoice());
  return true;
}
// ---------- one writer to a solo save (#625; solowriter.js) ----------
// A window that plays a solo game holds it. A second window of this browser that asks for the same save is told, and may only look (read-only) or play on a copy.
let soloClaim = null;
async function soloGuard() {
  const key = windowSoloKey();
  if (soloClaim?.key === key) return key;
  soloClaim?.release(); soloClaim = null;
  const got = await claimWriter(key.slice('hextable.'.length));
  if (got.ok) { soloClaim = { ...got, key }; return key; }
  soloBusy(key); return null;
}
function soloBusy(key) {
  const box = $('solo-busy'); box.hidden = false;
  $('solo-busy-read').onclick = () => { box.hidden = true; $('lobby').hidden = true; start(localTransport({ saveKey: key, readOnly: true })); };
  $('solo-busy-copy').onclick = async () => {
    const copy = newCopyKey(), got = await claimWriter(copy.slice('hextable.'.length));
    if (!got.ok) { $('solo-busy-msg').textContent = 'That copy could not be made. Try again.'; return; }
    soloClaim?.release(); soloClaim = { ...got, key: copy }; setWindowSoloKey(copy); box.hidden = true; $('lobby').hidden = true;
    start(localTransport({ saveKey: copy, copyOf: key, grid: TC.lobbyGrid(), party: MC.party().party ?? undefined }), TC.lobbyChoice());
  };
  $('solo-busy-close').onclick = () => { box.hidden = true; };
  $('solo-busy-read').focus?.({ preventScroll: true });
}
$('readonly-copy').onclick = () => soloBusy(windowSoloKey());
$('lobby-new').onclick = (ev) => twoTap(ev.currentTarget, 'Tap again to erase the saved game', '', async () => { const key = await soloGuard(); if (!key) return; if (!MC.party().party) return newSolo(key); forgetSolo(key); newSolo(key); });
const lobbyName = () => $('lobby-name').value.trim() || 'Adventurer';
$('lobby-host').onclick = () => { lobbyAt(['Host a table', 'Connecting'], leaveWaiting); start(serverTransport({ t: 'host', name: lobbyName(), grid: TC.lobbyGrid() }), TC.lobbyChoice()); };
$('lobby-join').onclick = () => { const code = $('lobby-code').value.trim(); if (code) { lobbyAt(['Join a table', `Table ${code.toUpperCase()}`, 'Connecting'], leaveWaiting); start(serverTransport({ t: 'join', code, name: lobbyName() })); } else $('lobby-msg').textContent = 'Enter the table code your DM gave you.'; };
$('lobby-solo').onclick = async () => { const key = await soloGuard(); if (!key) return; if (hasSoloGame(key)) { $('lobby').hidden = true; start(localTransport({ grid: TC.lobbyGrid(), saveKey: key }), TC.lobbyChoice()); } else newSolo(key); };
$('lobby-card').onsubmit = (ev) => ev.preventDefault();

// ---------- the start flow says where you are, has a Back, and keeps what was filled in (issue #556; startflow.js) ----------
// The front page's title is "Start a game". Opening the solo party makes it "New solo game \u203a Party", with a Back to the front; a host or join
// that is connecting or waiting for the DM says so and its Back gives the request up. My characters and the build screen have their own bars.
let lobbyBack = null;
function lobbyAt(trail, back = null) {
  lobbyBack = back;
  $('lobby-where').textContent = trailTitle(trail);
  $('lobby-back').hidden = !back; $('lobby-intro').hidden = !!back;
}
const syncWhere = () => { const p = $('lobby-party'); if (p.open) lobbyAt([SOLO_ROOT, 'Party'], () => { p.open = false; $('lobby-party-sum').focus?.({ preventScroll: true }); }); else lobbyAt(['Start a game']); };
$('lobby-party').addEventListener('toggle', syncWhere);
$('lobby-back').onclick = () => lobbyBack?.();
// Backing out of a host or join that has not got in: the connection is closed, the lobby is back as it was, what was typed is still there.
function leaveWaiting() { T?.close?.(); S = null; lobbyBusy(false); showLobby('You went back. Nothing was started.'); }
// The draft: the name, code and map are saved as they are typed; the grid and the party already keep themselves (tablecontrols.js, mycharacters.js), so they are not copied here.
const frontNow = () => ({ name: $('lobby-name').value, code: $('lobby-code').value, map: $('lobby-map').value });
function saveFront() { saveDraft(keepFront(loadDraft(), frontNow())); syncStartOver(); }
function syncStartOver() {
  let party = false; try { party = localStorage.getItem(PARTY_KEY) != null; } catch { /* storage unavailable */ }
  $('lobby-draft').hidden = !(hasDraft(loadDraft()) || party);
}
{
  const d = loadDraft().front;
  if (d.name) $('lobby-name').value = d.name;
  if (d.code) $('lobby-code').value = d.code;
  if (d.map && [...$('lobby-map').options].some((o) => o.value === d.map)) { $('lobby-map').value = d.map; $('lobby-map').dispatchEvent(new Event('change')); }
}
$('lobby-card').addEventListener('input', saveFront);
$('lobby-card').addEventListener('change', saveFront);
$('lobby-startover').onclick = (ev) => twoTap(ev.currentTarget, 'Tap again to clear what you typed', '', () => {
  $('lobby-name').value = ''; $('lobby-code').value = ''; $('lobby-map').value = ''; $('lobby-map').dispatchEvent(new Event('change'));
  const sq = [...document.getElementsByName('lobby-grid')].find((x) => x.value === 'square'); if (sq) { sq.checked = true; sq.dispatchEvent(new Event('change')); }
  MC.resetParty(); saveDraft({ v: 1, front: {}, build: {} });
  $('lobby-msg').textContent = 'Cleared. Your saved characters are still in My characters.'; syncStartOver();
});

(async () => {
  let server = false;
  try { const r = await fetch('./api/ping', { cache: 'no-store' }); server = r.ok && (await r.json()).ok === true; } catch { /* no table server: solo */ }
  if (!server) { const key = await soloGuard(); if (key) start(localTransport({ saveKey: key })); return; }
  showLobby();
})();
