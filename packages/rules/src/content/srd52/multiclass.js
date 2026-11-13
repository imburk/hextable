// The Multiclass Spellcaster table (SRD 5.2.1, "Multiclassing", Spellcasting): spell slots by spell
// level for a character with the Spellcasting feature from more than one class, by the total of its
// levels in Bard, Cleric, Druid, Sorcerer and Wizard and half its levels (round up) in Paladin and
// Ranger. Which class counts how is each class's `multiclass.caster`. Data only.
export const multiclassSpellcaster = {
  "id": "multiclass-spellcaster",
  "name": "Multiclass Spellcaster",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "Spell slots for a character with Spellcasting from more than one class, by combined caster level.",
  "slots": [
    [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
    [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]
  ]
};
