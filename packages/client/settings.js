// The Settings tab (docs/specs/table-ui.md, Decisions 2 and 7). Two kinds of thing live here and they are kept apart:
//   client preferences, which change this device's screen and are kept in localStorage (`hextable.*`, through `prefs`);
//   the table's rules, which the DM alone changes with the `setting` action, shown here in plain words and read only.
// Nothing here sends an action.
import { THEMES, LOOK, lookLocked } from './themes.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SIGHT = { rooms: 'players are sent everything in a room they have revealed', los: 'players are sent only what the party can see', light: 'players are sent what the party can see, given light and senses' };
const VERTICAL = { max: 'the longer of across and up counts (a diagonal counts once)', sum: 'across plus up', true: 'a straight line' };
const PASSIVE = { off: 'only a Search finds hidden things', traps: 'passive Perception finds traps', all: 'passive Perception finds everything hidden' };
const REWARDS = { dm: 'the DM settles them before the players see them', auto: 'shown to the players at once', off: 'none are given' };
const SHARE = { split: 'divided equally among those who took part and are alive', full: 'each gets the whole amount' };
const on = (v) => v !== 'off' && v !== false;

// The table's rules as plain lines, from `settings` (what the engine sends everyone). Absent means the default. The pace is
// said above them, by tablecontrols.js (#pace-table).
export function rulesLines(settings = {}) {
  return [
    `Dice: ${(settings.diceThrow ?? 'auto') === 'throw' ? 'thrown by whoever acts' : 'rolled as soon as someone acts'}.`,
    `Sight: ${SIGHT[settings.sight ?? 'rooms'] ?? settings.sight}.`,
    `An unseen creature's turn: ${(settings.unseenTurns ?? 'say') === 'quiet' ? 'nothing is said' : 'the table says something moves unseen'}.`,
    `A fight starts when the party comes within ${settings.engageRange ?? 10} ft of enemies: ${on(settings.autoEngage ?? true) ? 'yes' : 'no, the DM calls it'}.`,
    `Noticing hidden things in passing: ${PASSIVE[settings.passiveFind ?? 'off'] ?? settings.passiveFind}.`,
    `Distance when one creature is higher than another: ${VERTICAL[settings.vertical ?? 'max'] ?? settings.vertical}.`,
    `Cover from walls and objects: ${on(settings.cover ?? 'on') ? 'on' : 'off'}. Creatures give cover: ${on(settings.creatureCover ?? 'on') ? 'yes' : 'no'}.`,
    `Rewards after a won fight: ${REWARDS[settings.conclusion ?? 'dm'] ?? settings.conclusion}. XP: ${SHARE[settings.xpShare ?? 'split'] ?? settings.xpShare}.`,
    `Climbing faces too high to step up: ${on(settings.climbing ?? 'on') ? 'allowed' : 'not allowed'}.`,
  ];
}

// ctx: { prefs, themeId(), setTheme(id), look(key, value), dice, repace(), drawer, state(), isDM() }
export function initSettings(ctx) {
  const { prefs, drawer } = ctx;
  $('set-theme').innerHTML = Object.entries(THEMES).map(([id, t]) => `<option value="${esc(id)}">${esc(t.name)}</option>`).join('');
  $('set-theme').value = ctx.themeId();
  $('set-theme').onchange = (ev) => ctx.setTheme(ev.target.value);

  // Floors, cut-away and caves: stored, and an address parameter for one visit still wins (then the control says so and is off).
  const locked = lookLocked();
  $('set-floors').value = LOOK.floors; $('set-cutaway').checked = LOOK.cutaway; $('set-caves').checked = LOOK.caves;
  $('set-floors').disabled = locked.floors; $('set-cutaway').disabled = locked.cutaway; $('set-caves').disabled = locked.caves;
  const held = Object.entries({ floors: '?hex', cutaway: '?nocut', caves: '?nocave' }).filter(([k]) => locked[k]).map(([, a]) => a);
  $('set-look-note').hidden = !held.length;
  if (held.length) $('set-look-note').textContent = `The address of this page sets ${held.join(' and ')} for this visit, so that control is off.`;
  $('set-floors').onchange = (ev) => { prefs.set('hextable.floors', ev.target.value); ctx.look('floors', ev.target.value); };
  $('set-cutaway').onchange = (ev) => { prefs.set('hextable.cutaway', ev.target.checked); ctx.look('cutaway', ev.target.checked); };
  $('set-caves').onchange = (ev) => { prefs.set('hextable.caves', ev.target.checked); ctx.look('caves', ev.target.checked); };

  // Shadows (docs/specs/renderer.md, R15), for the Three.js renderer: it has no place in index.html, so the control is made here. The
  // renderer hears of a change by the page event `hextable-shadows`; it reads the stored preference itself when it starts.
  const shadowSet = (() => { try { return new URLSearchParams(location.search).get('shadows'); } catch { return null; } })();
  const sw = document.createElement('div');
  sw.innerHTML = '<label class="assign">Shadows <select id="set-shadows"><option value="auto">Automatic</option><option value="on">On</option><option value="off">Off</option></select></label>'
    + '<p class="note" id="set-shadows-note"></p>';
  $('set-look-note').before(...sw.children);
  const shadows = $('set-shadows'), saved = prefs.get('hextable.shadows');
  shadows.value = ['auto', 'on', 'off'].includes(saved) ? saved : 'auto';
  shadows.disabled = ['auto', 'on', 'off'].includes(shadowSet);
  $('set-shadows-note').textContent = shadows.disabled
    ? 'The address of this page sets the shadows for this visit, so that control is off.'
    : 'Real shadows are drawn by the Three.js renderer only (?renderer=three). Automatic draws them on a computer or tablet and, on a phone, only once the screen shows it has room; it drops them first if the screen falls behind. On keeps them whatever happens.';
  shadows.onchange = (ev) => { prefs.set('hextable.shadows', ev.target.value); window.dispatchEvent(new CustomEvent('hextable-shadows', { detail: ev.target.value })); };

  // The edge of a fight (docs/specs/renderer.md, arena-edge notes): both renderers, hexes and squares. 'dim' is the lighting change alone.
  const ae = document.createElement('div');
  ae.innerHTML = '<label class="assign">Edge of a fight <select id="set-arena-edge"><option value="dim">Dimmed surroundings only</option><option value="edge">Dimmed, with a glowing edge</option></select></label>'
    + '<p class="note">While a fight runs, everything outside its arena is dimmed. The edge can also glow. Either way the arena flashes where a move out of it was refused.</p>';
  $('set-look-note').before(...ae.children);
  $('set-arena-edge').value = LOOK.arenaEdge;
  $('set-arena-edge').onchange = (ev) => { prefs.set('hextable.arenaEdge', ev.target.value); ctx.look('arenaEdge', ev.target.value); };

  // The drawer: which side, and (wide screens) pinned.
  $('set-side').value = drawer.side; $('set-side').onchange = (ev) => drawer.setSide(ev.target.value);
  $('set-pin').checked = drawer.pinned; $('set-pin').onchange = (ev) => drawer.setPin(ev.target.checked);

  // This device's dice and animation.
  $('dice-show').value = ctx.dice.show; $('dice-show').onchange = (ev) => { ctx.dice.show = ev.target.value; };
  $('dice-auto-mine').checked = prefs.get('hextable.diceAutoMine') === true;
  $('dice-auto-mine').onchange = (ev) => prefs.set('hextable.diceAutoMine', ev.target.checked);
  $('pace-pick').value = prefs.get('hextable.pace') ?? '';
  $('pace-pick').onchange = (ev) => { prefs.set('hextable.pace', ev.target.value || null); ctx.repace(); };
  $('dm-dice-monsters').checked = prefs.get('hextable.diceMonsters') !== false;
  $('dm-dice-monsters').onchange = (ev) => prefs.set('hextable.diceMonsters', ev.target.checked);

  // The table's rules: the DM gets a link to where each is changed.
  $('set-rules').addEventListener('click', (ev) => { if (ev.target.closest('[data-dm]')) drawer.open('dm'); });
  let last = '';
  return {
    sync(S) {
      const dm = ctx.isDM();
      $('set-dm-box').hidden = !dm;
      $('set-table-box').hidden = !S;
      $('set-side').value = drawer.side; $('set-pin').checked = drawer.pinned; $('set-theme').value = ctx.themeId();
      if (!S) return;
      const lines = rulesLines(S.settings), sig = JSON.stringify([lines, dm]);
      if (sig === last) return;
      last = sig;
      $('set-rules').innerHTML = lines.map((l) => `<li>${esc(l)}${dm ? '<button type="button" class="link" data-dm>Change</button>' : ''}</li>`).join('');
    },
  };
}
