// Things on a map that are not creatures: doors and the like. Data only.
// These are Hextable's own definitions of ordinary objects, not text from the SRD. Difficulty
// Classes are defaults; the DM sets them per door on the map.
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
      { id: 'pick', name: 'Pick the lock', from: ['locked'], to: 'closed', time: 'action', check: { ability: 'dex', tool: 'thieves-tools', dc: 15 } },
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
];
