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
];
