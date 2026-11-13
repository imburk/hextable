// The Character Advancement table (SRD 5.2.1, "Creating a Character", Level Advancement): the Experience
// Points a character needs to reach each level, and the Proficiency Bonus at that level. Row n is level n + 1.
// Data only.
export const advancement = {
  "id": "character-advancement",
  "name": "Character Advancement",
  "source": "SRD 5.2.1",
  "checked": true,
  "text": "The XP total at which a character reaches each level, and its Proficiency Bonus there.",
  "levels": [
    { "level": 1, "xp": 0, "prof": 2 },
    { "level": 2, "xp": 300, "prof": 2 },
    { "level": 3, "xp": 900, "prof": 2 },
    { "level": 4, "xp": 2700, "prof": 2 },
    { "level": 5, "xp": 6500, "prof": 3 },
    { "level": 6, "xp": 14000, "prof": 3 },
    { "level": 7, "xp": 23000, "prof": 3 },
    { "level": 8, "xp": 34000, "prof": 3 },
    { "level": 9, "xp": 48000, "prof": 4 },
    { "level": 10, "xp": 64000, "prof": 4 },
    { "level": 11, "xp": 85000, "prof": 4 },
    { "level": 12, "xp": 100000, "prof": 4 },
    { "level": 13, "xp": 120000, "prof": 5 },
    { "level": 14, "xp": 140000, "prof": 5 },
    { "level": 15, "xp": 165000, "prof": 5 },
    { "level": 16, "xp": 195000, "prof": 5 },
    { "level": 17, "xp": 225000, "prof": 6 },
    { "level": 18, "xp": 265000, "prof": 6 },
    { "level": 19, "xp": 305000, "prof": 6 },
    { "level": 20, "xp": 355000, "prof": 6 }
  ]
};
