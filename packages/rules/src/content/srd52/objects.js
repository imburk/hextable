// Things on a map that are not creatures: doors and the like. Data only.
// Entries with source 'Hextable' are our own definitions of ordinary objects, not SRD text.
// Entries with source 'SRD 5.2.1' are the sample traps from the SRD's Gameplay Toolbox, at the
// tier the closed vocabulary allows. Difficulty Classes are defaults; the DM sets them per object
// on the map.
export const objects = [
  {
    id: 'door-wooden', name: 'Wooden door', kind: 'door', source: 'Hextable', tier: 'auto', checked: false,
    states: {
      closed: { name: 'closed', blocks: ['move', 'sight'] },
      open: { name: 'open', blocks: [] },
      locked: { name: 'locked', blocks: ['move', 'sight'] },
      broken: { name: 'broken open', blocks: [] },
    },
    initial: 'closed',
    use: [
      { id: 'open', name: 'Open', from: ['closed'], to: 'open', time: 'free' },
      { id: 'close', name: 'Close', from: ['open'], to: 'closed', time: 'free' },
      { id: 'lock', name: 'Lock', from: ['closed'], to: 'locked', time: 'action', key: true },
      { id: 'unlock', name: 'Unlock', from: ['locked'], to: 'closed', time: 'action', key: true },
      { id: 'pick', name: 'Pick the lock', from: ['locked'], to: 'closed', time: 'action', check: { ability: 'dex', skill: 'sleight-of-hand', tool: 'thieves-tools', dc: 15 } },
      { id: 'force', name: 'Force open', from: ['locked'], to: 'broken', time: 'action', check: { ability: 'str', skill: 'athletics', dc: 15 } },
    ],
    text: 'An ordinary door. Closed or locked it blocks movement and sight.',
  },
  {
    id: 'portcullis', name: 'Portcullis', kind: 'door', source: 'Hextable', tier: 'auto', checked: false,
    states: {
      lowered: { name: 'lowered', blocks: ['move'] },
      raised: { name: 'raised', blocks: [] },
    },
    initial: 'lowered',
    use: [
      { id: 'lift', name: 'Lift', from: ['lowered'], to: 'raised', time: 'action', check: { ability: 'str', skill: 'athletics', dc: 20 } },
    ],
    text: 'An iron grille. Lowered it blocks movement but can be seen through. It is usually worked from a lever or winch elsewhere.',
  },
  {
    id: 'secret-door', name: 'Secret door', kind: 'door', source: 'Hextable', tier: 'auto', checked: false,
    states: {
      secret: { name: 'undiscovered', blocks: ['move', 'sight'], hidden: true },
      closed: { name: 'closed', blocks: ['move', 'sight'] },
      open: { name: 'open', blocks: [] },
    },
    initial: 'secret', find: { to: 'closed' }, dc: { find: 15 },
    use: [
      { id: 'open', name: 'Open', from: ['closed'], to: 'open', time: 'free' },
      { id: 'close', name: 'Close', from: ['open'], to: 'closed', time: 'free' },
    ],
    text: 'A door made to pass for wall. Until it is found, players are shown a wall.',
  },
  {
    id: 'lever', name: 'Lever', kind: 'thing', source: 'Hextable', tier: 'auto', checked: false,
    states: { up: { name: 'up', blocks: [] }, down: { name: 'down', blocks: [] } },
    initial: 'up',
    use: [
      { id: 'pull', name: 'Pull', from: ['up'], to: 'down', time: 'free' },
      { id: 'push', name: 'Push back', from: ['down'], to: 'up', time: 'free' },
    ],
    text: 'A lever. What it works is set where it is placed on the map.',
  },
  {
    id: 'pressure-plate', name: 'Pressure plate', kind: 'thing', source: 'Hextable', tier: 'auto', checked: false,
    states: {
      hidden: { name: 'unnoticed', blocks: [], hidden: true },
      found: { name: 'spotted', blocks: [] },
      pressed: { name: 'pressed', blocks: [] },
    },
    initial: 'hidden', find: { to: 'found' }, dc: { find: 15 },
    use: [],
    triggers: [{ on: 'enter', from: ['hidden', 'found'], to: 'pressed' }, { on: 'leave', from: ['pressed'], to: 'found' }],
    text: 'A plate in the floor that gives under a foot. What it works is set where it is placed on the map.',
  },
  {
    id: 'pit-trap', name: 'Pit trap', kind: 'thing', source: 'Hextable', tier: 'auto', checked: false,
    states: {
      hidden: { name: 'covered', blocks: [], hidden: true },
      found: { name: 'spotted', blocks: [] },
      open: { name: 'open', blocks: [] },
      safe: { name: 'wedged shut', blocks: [] },
    },
    initial: 'hidden', find: { to: 'found' }, dc: { find: 15, save: 15 },
    use: [{ id: 'disarm', name: 'Wedge it shut', from: ['found'], to: 'safe', time: 'action', check: { ability: 'dex', tool: 'thieves-tools', dc: 15 } }],
    triggers: [
      { on: 'enter', from: ['hidden', 'found'], to: 'open', effects: [{ save: 'dex', onFail: [{ fall: 10 }] }] },
      { on: 'enter', from: ['open'], effects: [{ fall: 10 }] },
    ],
    text: 'A covered pit, 10 feet deep. Whoever steps on the cover must leap clear or fall in. Once it is spotted it can be walked around.',
  },
  {
    id: 'arrow-trap', name: 'Arrow trap', kind: 'thing', source: 'Hextable', tier: 'auto', checked: false,
    states: {
      hidden: { name: 'unnoticed', blocks: [], hidden: true },
      found: { name: 'spotted', blocks: [] },
      sprung: { name: 'sprung', blocks: [] },
      safe: { name: 'disarmed', blocks: [] },
    },
    initial: 'hidden', find: { to: 'found' }, dc: { find: 15 },
    use: [{ id: 'disarm', name: 'Disarm', from: ['found'], to: 'safe', time: 'action', check: { ability: 'dex', tool: 'thieves-tools', dc: 15 } }],
    triggers: [{ on: 'enter', from: ['hidden', 'found'], to: 'sprung', effects: [{ attack: 'ranged', kind: 'weapon', bonus: 6, onHit: [{ damage: '1d8', type: 'piercing' }] }] }],
    text: 'A tripwire that looses an arrow at whoever crosses it.',
  },
  {
    id: 'ladder', name: 'Ladder', kind: 'thing', connects: true, source: 'Hextable', tier: 'auto', checked: false,
    states: { there: { name: 'in place', blocks: [] } },
    initial: 'there', use: [],
    text: 'A ladder, a rope or a climbable trunk: it joins the hex it stands in to another place, set where it is put on the map. Going up or down it is climbing.',
  },

  // ---- Sample traps from the SRD 5.2.1 (CC-BY-4.0), Gameplay Toolbox, "Traps". Level 1-4 numbers. ----
  // Where the vocabulary cannot say a part (a cone, a number of darts, an Intelligence search),
  // a manual step or the text hands it to the DM and the entry is 'assist' or 'manual'.
  {
    id: 'collapsing-roof', name: 'Collapsing Roof', kind: 'thing', source: 'SRD 5.2.1', tier: 'assist', checked: true,
    states: {
      hidden: { name: 'unnoticed', blocks: [], hidden: true },
      found: { name: 'spotted', blocks: [] },
      sprung: { name: 'collapsed', blocks: [] },
      safe: { name: 'cut', blocks: [] },
    },
    initial: 'hidden', find: { to: 'found' }, dc: { find: 11, save: 13 },
    use: [{ id: 'cut', name: 'Cut the trip wire', from: ['found'], to: 'safe', time: 'action' }],
    triggers: [{
      on: 'enter', from: ['hidden', 'found'], to: 'sprung',
      effects: [
        { save: 'dex', half: true, onFail: [{ damage: '2d10', type: 'bludgeoning' }] },
        { manual: 'Every other creature beneath the collapsing ceiling section makes the same save. The rubble is Difficult Terrain.' },
      ],
    }],
    text: 'A trip wire between weak supports brings down a section of ceiling. DC 13 Dexterity save or 2d10 Bludgeoning (half on a save). Deadly at levels 1-4.',
  },
  {
    id: 'falling-net', name: 'Falling Net', kind: 'thing', source: 'SRD 5.2.1', tier: 'assist', checked: true,
    states: {
      hidden: { name: 'unnoticed', blocks: [], hidden: true },
      found: { name: 'spotted', blocks: [] },
      sprung: { name: 'fallen', blocks: [] },
      safe: { name: 'cut', blocks: [] },
    },
    initial: 'hidden', find: { to: 'found' }, dc: { find: 11, save: 10 },
    use: [{ id: 'cut', name: 'Cut the trip wire', from: ['found'], to: 'safe', time: 'action' }],
    triggers: [{
      on: 'enter', from: ['hidden', 'found'], to: 'sprung',
      effects: [
        { save: 'dex', onFail: [{ condition: 'restrained' }] },
        { manual: 'A Huge or larger creature succeeds on the save without rolling. A Restrained creature frees itself or another within reach with an action and a DC 10 Strength (Athletics) check; the DM removes the condition.' },
      ],
    }],
    text: 'A trip wire drops a weighted 10-foot-square net on the first creature across. DC 10 Dexterity save or Restrained. A Nuisance at levels 1-4.',
  },
  {
    id: 'fire-casting-statue', name: 'Fire-Casting Statue', kind: 'thing', source: 'SRD 5.2.1', tier: 'assist', checked: true,
    states: {
      hidden: { name: 'unnoticed', blocks: [], hidden: true },
      found: { name: 'spotted', blocks: [] },
      pressed: { name: 'pressed', blocks: [] },
      safe: { name: 'wedged', blocks: [] },
    },
    initial: 'hidden', find: { to: 'found' }, dc: { find: 15, save: 15 },
    use: [{ id: 'wedge', name: 'Wedge an Iron Spike under the plate', from: ['found'], to: 'safe', time: 'action' }],
    triggers: [
      {
        on: 'enter', from: ['hidden', 'found'], to: 'pressed',
        effects: [
          { save: 'dex', half: true, onFail: [{ damage: '2d10', type: 'fire' }] },
          { manual: 'The statue breathes a 15-foot Cone of fire; every creature in the Cone makes the same save. The engine applied it to the one on the plate. It also fires when a creature starts its turn on the plate, and resets at the start of the next turn.' },
        ],
      },
      { on: 'leave', from: ['pressed'], to: 'found' },
    ],
    text: 'A pressure plate makes a nearby statue cast fire. DC 15 Dexterity save or 2d10 Fire (half on a save). The statue bears a glyph: DC 10 Perception finds it (within 5 feet), DC 15 Arcana reads it, and defacing it with a sharp tool as an action disarms the trap; the DM handles that. Deadly at levels 1-4.',
  },
  {
    id: 'hidden-pit', name: 'Hidden Pit', kind: 'thing', source: 'SRD 5.2.1', tier: 'assist', checked: true,
    states: {
      hidden: { name: 'covered', blocks: [], hidden: true },
      found: { name: 'spotted', blocks: [] },
      open: { name: 'open', blocks: [] },
      safe: { name: 'wedged shut', blocks: [] },
    },
    initial: 'hidden', find: { to: 'found' }, dc: { find: 15 },
    use: [{ id: 'wedge', name: 'Wedge an Iron Spike under the lid', from: ['found'], to: 'safe', time: 'action' }],
    triggers: [
      { on: 'enter', from: ['hidden', 'found'], to: 'open', effects: [{ fall: 10 }] },
      { on: 'enter', from: ['open'], effects: [{ fall: 10 }] },
    ],
    text: 'A lid over a 10-foot-deep pit swings open under a foot; the creature falls for 1d6 Bludgeoning and the lid stays open. The SRD finds it with a Study action and DC 15 Intelligence (Investigation), but the engine\'s Search rolls Perception against that DC. Nuisance at levels 1-4. The smooth walls need a Climb Speed, climbing gear or magic to scale.',
  },
  {
    id: 'spiked-pit', name: 'Spiked Pit', kind: 'thing', source: 'SRD 5.2.1', tier: 'assist', checked: true,
    states: {
      hidden: { name: 'covered', blocks: [], hidden: true },
      found: { name: 'spotted', blocks: [] },
      open: { name: 'open', blocks: [] },
      safe: { name: 'wedged shut', blocks: [] },
    },
    initial: 'hidden', find: { to: 'found' }, dc: { find: 15 },
    use: [{ id: 'wedge', name: 'Wedge an Iron Spike under the lid', from: ['found'], to: 'safe', time: 'action' }],
    triggers: [
      { on: 'enter', from: ['hidden', 'found'], to: 'open', effects: [{ fall: 10 }, { damage: '2d8', type: 'piercing' }] },
      { on: 'enter', from: ['open'], effects: [{ fall: 10 }, { damage: '2d8', type: 'piercing' }] },
    ],
    text: 'A lid over a 10-foot-deep pit lined with spikes: 1d6 Bludgeoning from the fall and 2d8 Piercing from the spikes. The SRD finds it with a Study action and DC 15 Intelligence (Investigation), but the engine\'s Search rolls Perception against that DC. Deadly at levels 1-4.',
  },
  {
    id: 'poisoned-darts', name: 'Poisoned Darts', kind: 'thing', source: 'SRD 5.2.1', tier: 'assist', checked: true,
    states: {
      hidden: { name: 'unnoticed', blocks: [], hidden: true },
      found: { name: 'spotted', blocks: [] },
      pressed: { name: 'pressed', blocks: [] },
      safe: { name: 'wedged', blocks: [] },
    },
    initial: 'hidden', find: { to: 'found' }, dc: { find: 15, save: 13 },
    use: [{ id: 'wedge', name: 'Wedge an Iron Spike under the plate', from: ['found'], to: 'safe', time: 'action' }],
    triggers: [
      {
        on: 'enter', from: ['hidden', 'found'], to: 'pressed',
        effects: [{
          save: 'dex',
          onFail: [
            { damage: '1d6', type: 'poison' },
            { manual: 'The creature is struck by 1d3 darts, each 1d6 Poison. The engine applied one dart; roll the rest. Other creatures in the darts\' path make the same save.' },
          ],
        }],
      },
      { on: 'leave', from: ['pressed'], to: 'found' },
    ],
    text: 'Darts fly from holes in the walls when a plate is stepped on. DC 13 Dexterity save or 1d3 darts of 1d6 Poison each. It resets at the start of the next turn if it has fired fewer than three times; the DM counts. DC 15 Perception finds the dart holes in the walls, and plugging them all disarms it; the DM handles that. Deadly at levels 1-4.',
  },
  {
    id: 'poisoned-needle', name: 'Poisoned Needle', kind: 'thing', source: 'SRD 5.2.1', tier: 'assist', checked: true,
    states: {
      hidden: { name: 'unnoticed', blocks: [], hidden: true },
      found: { name: 'spotted', blocks: [] },
      sprung: { name: 'sprung', blocks: [] },
      safe: { name: 'disarmed', blocks: [] },
    },
    initial: 'hidden', find: { to: 'found' }, dc: { find: 15, save: 11 },
    use: [
      { id: 'disarm', name: 'Disarm', from: ['found'], to: 'safe', time: 'action', check: { ability: 'dex', skill: 'sleight-of-hand', dc: 15 } },
      {
        id: 'open-lock', name: 'Open the lock without the key', from: ['hidden', 'found'], to: 'sprung', time: 'action',
        effects: [
          { save: 'con', half: true, onFail: [{ damage: '1d10', type: 'poison' }, { condition: 'poisoned' }] },
          { manual: 'On a failed save the creature is Poisoned for 1 hour; the DM ends it. Opening the lock by magic such as Knock does not set it off.' },
        ],
      },
    ],
    text: 'A needle in a lock. Opening it any way but the key, or failing to disarm it, sets it off: DC 11 Constitution save or 1d10 Poison and Poisoned for 1 hour (half damage on a save). A failed disarm check does not set it off by itself; the DM does that. A Nuisance at levels 1-4.',
  },
  {
    id: 'rolling-stone', name: 'Rolling Stone', kind: 'thing', source: 'SRD 5.2.1', tier: 'manual', checked: true,
    states: {
      hidden: { name: 'unnoticed', blocks: [], hidden: true },
      found: { name: 'spotted', blocks: [] },
      rolling: { name: 'rolling', blocks: [] },
      safe: { name: 'wedged', blocks: [] },
    },
    initial: 'hidden', find: { to: 'found' }, dc: { find: 15, save: 15 },
    use: [{ id: 'wedge', name: 'Wedge an Iron Spike under the plate', from: ['found'], to: 'safe', time: 'action' }],
    triggers: [{
      on: 'enter', from: ['hidden', 'found'], to: 'rolling',
      effects: [{ manual: 'A stone with a 5-foot radius rolls. It and nearby creatures roll Initiative; the stone has +8. On its turn it moves 60 feet in a line. A creature it enters the space of, or that enters its space, makes a DC 15 Dexterity save or takes 10d10 Bludgeoning and is Prone. The stone moves through other creatures\' spaces and they through its space, counting it as Difficult Terrain; it stops at a wall. It is a Large object, AC 17, 100 HP, Damage Threshold 10, Immune to Poison and Psychic. An action and a DC 20 Strength (Athletics) check slows it by 15 feet.' }],
    }],
    text: 'A hidden plate sets a great stone rolling down the corridor. The engine cannot run it, so the DM does; the rules are in the step. The SRD finds the plate with a Study action and DC 15 Intelligence (Investigation). Deadly at levels 11-16, or a Nuisance at levels 17-20.',
  },

  // ---- Hextable's own furniture ----
  {
    id: 'door-iron', name: 'Iron door', kind: 'door', source: 'Hextable', tier: 'auto', checked: false,
    states: {
      closed: { name: 'closed', blocks: ['move', 'sight'] },
      open: { name: 'open', blocks: [] },
      locked: { name: 'locked', blocks: ['move', 'sight'] },
      broken: { name: 'broken open', blocks: [] },
    },
    initial: 'closed',
    use: [
      { id: 'open', name: 'Open', from: ['closed'], to: 'open', time: 'free' },
      { id: 'close', name: 'Close', from: ['open'], to: 'closed', time: 'free' },
      { id: 'lock', name: 'Lock', from: ['closed'], to: 'locked', time: 'action', key: true },
      { id: 'unlock', name: 'Unlock', from: ['locked'], to: 'closed', time: 'action', key: true },
      { id: 'pick', name: 'Pick the lock', from: ['locked'], to: 'closed', time: 'action', check: { ability: 'dex', skill: 'sleight-of-hand', tool: 'thieves-tools', dc: 20 } },
      { id: 'force', name: 'Force open', from: ['locked'], to: 'broken', time: 'action', check: { ability: 'str', skill: 'athletics', dc: 25 } },
    ],
    text: 'A heavy iron door. Closed or locked it blocks movement and sight. Harder to pick or force than a wooden one.',
  },
  {
    id: 'trapdoor', name: 'Trapdoor', kind: 'thing', source: 'Hextable', tier: 'auto', checked: false,
    states: { closed: { name: 'closed', blocks: [] }, open: { name: 'open', blocks: [] } },
    initial: 'closed',
    use: [
      { id: 'open', name: 'Open', from: ['closed'], to: 'open', time: 'action' },
      { id: 'close', name: 'Close', from: ['open'], to: 'closed', time: 'action' },
    ],
    text: 'A hatch in the floor. What lies below is set by the map.',
  },
  {
    id: 'chest', name: 'Chest', kind: 'thing', source: 'Hextable', tier: 'auto', checked: false,
    states: {
      closed: { name: 'closed', blocks: ['move'] },
      open: { name: 'open', blocks: ['move'] },
      locked: { name: 'locked', blocks: ['move'] },
      broken: { name: 'broken open', blocks: ['move'] },
    },
    initial: 'closed',
    use: [
      { id: 'open', name: 'Open', from: ['closed'], to: 'open', time: 'action' },
      { id: 'close', name: 'Close', from: ['open'], to: 'closed', time: 'action' },
      { id: 'lock', name: 'Lock', from: ['closed'], to: 'locked', time: 'action', key: true },
      { id: 'unlock', name: 'Unlock', from: ['locked'], to: 'closed', time: 'action', key: true },
      { id: 'pick', name: 'Pick the lock', from: ['locked'], to: 'closed', time: 'action', check: { ability: 'dex', skill: 'sleight-of-hand', tool: 'thieves-tools', dc: 15 } },
      { id: 'force', name: 'Force open', from: ['locked'], to: 'broken', time: 'action', check: { ability: 'str', skill: 'athletics', dc: 15 } },
    ],
    text: 'A chest. Locked, it opens with its key, a pick or force. What is inside is for the DM to hand out.',
  },
  {
    id: 'statue', name: 'Statue', kind: 'thing', source: 'Hextable', tier: 'auto', checked: false,
    states: { standing: { name: 'standing', blocks: ['move'] } },
    initial: 'standing', use: [],
    text: 'A statue. It fills its hex and blocks movement.',
  },
  {
    id: 'crate', name: 'Barrel or crate', kind: 'thing', source: 'Hextable', tier: 'auto', checked: false,
    states: { standing: { name: 'standing', blocks: ['move'] } },
    initial: 'standing', use: [],
    text: 'A barrel or crate. It fills its hex and blocks movement.',
  },
  {
    id: 'campfire', name: 'Campfire', kind: 'thing', source: 'Hextable', tier: 'auto', checked: false,
    states: { lit: { name: 'burning', blocks: [], light: { bright: 20, dim: 20 } }, out: { name: 'out', blocks: [] } },
    initial: 'lit',
    use: [
      { id: 'douse', name: 'Put out', from: ['lit'], to: 'out', time: 'action' },
      { id: 'light', name: 'Light', from: ['out'], to: 'lit', time: 'action' },
    ],
    text: 'A campfire. It lights the camp as a torch does (Bright Light for 20 feet, Dim Light for 20 more) and warms it. The DM rules on standing in the flames.',
  },
  {
    id: 'brazier', name: 'Brazier', kind: 'thing', source: 'Hextable', tier: 'auto', checked: false,
    states: { lit: { name: 'burning', blocks: [], light: { bright: 20, dim: 20 } }, out: { name: 'out', blocks: [] } },
    initial: 'lit',
    use: [
      { id: 'douse', name: 'Put out', from: ['lit'], to: 'out', time: 'action' },
      { id: 'light', name: 'Light', from: ['out'], to: 'lit', time: 'action' },
    ],
    text: 'A bowl of coals on a stand. Burning, it sheds light as a torch does: Bright Light for 20 feet and Dim Light for 20 more. The DM rules on touching the flames.',
  },
  {
    id: 'winch', name: 'Winch', kind: 'thing', source: 'Hextable', tier: 'auto', checked: false,
    states: { slack: { name: 'slack', blocks: [] }, wound: { name: 'wound', blocks: [] } },
    initial: 'slack',
    use: [
      { id: 'wind', name: 'Wind', from: ['slack'], to: 'wound', time: 'action' },
      { id: 'release', name: 'Release', from: ['wound'], to: 'slack', time: 'free' },
    ],
    text: 'A crank and drum. What it works is set where it is placed on the map.',
  },
];
