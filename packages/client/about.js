// About: the legal statements and credits, as data. One file holds every word, so a legal change is one edit here,
// and nothing is fetched when the page opens. The test in test/about.test.js compares each statement with its source
// (the SRD's Legal Information page, LICENSE, vendor/three/LICENSE, package.json) so they cannot drift.
// The text is plain: aboutHTML() escapes it and turns the web addresses in it into links.

// The attribution statement that Wizards of the Coast asks to be included in any work that uses the SRD 5.2, as the SRD's
// own Legal Information page gives it (reference/srd52/srd52-flow.txt), including its typographic quotation marks.
export const SRD_ATTRIBUTION = 'This work includes material from the System Reference Document 5.2 (\u201cSRD 5.2\u201d) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

export const GAME_VERSION = '0.1.0';       // package.json "version"; the test keeps the two equal

export const HEXTABLE_LICENCE = {
  name: 'MIT License',
  text: `MIT License

Copyright (c) 2026 Hextable contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
};

export const THREE_LICENCE = {
  name: 'Three.js r187, MIT License',
  text: `The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`,
  where: './vendor/three/LICENSE',
  site: 'https://github.com/mrdoob/three.js',
};

// The five faces the page loads from Google Fonts (index.html). Each is under the SIL Open Font License, Version 1.1;
// the copyright lines are the ones in each family's own licence file, as the Fontsource packaging of Google Fonts shows them.
export const OFL = { name: 'SIL Open Font License, Version 1.1', url: 'https://openfontlicense.org' };
export const FONTS = [
  { name: 'Baloo 2', copyright: 'Copyright 2019 The Baloo 2 Project Authors (https://github.com/EkType/Baloo2)' },
  { name: 'Nunito', copyright: 'Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito)' },
  { name: 'Silkscreen', copyright: 'Copyright 2001 The Silkscreen Project Authors (https://github.com/googlefonts/silkscreen)' },
  { name: 'Source Sans 3', copyright: 'Copyright Adobe (http://www.adobe.com/), with Reserved Font Name \u2018Source\u2019' },
  { name: 'Vollkorn SC', copyright: 'Copyright 2017 The Vollkorn Project Authors (https://github.com/FAlthausen/Vollkorn-Typeface)' },
];

// Model packs (glTF creature models) will be listed here, each with its author and licence, when the first one is added.
// An entry is { name, author, licence, url }.
export const MODEL_PACKS = [];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Escaped text with each web address made a link that opens in a new tab.
export const linked = (s) => esc(s).replace(/https?:\/\/[^\s<>"]*[^\s<>".,;:)]/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);

// The About tab. `info` is { stateVersion, tableVersion? }: the version this game's rules keep tables in and, at a table, the one
// this table is in, so a bug report can say which.
export function aboutHTML(info = {}) {
  const packs = MODEL_PACKS.length
    ? `<ul class="ab-list">${MODEL_PACKS.map((p) => `<li><b>${esc(p.name)}</b>${p.author ? ` by ${esc(p.author)}` : ''}: ${esc(p.licence)}${p.url ? ` (${linked(p.url)})` : ''}</li>`).join('')}</ul>`
    : '<p class="note">None yet. Each model pack that is added is listed here with its author and licence.</p>';
  return `<section class="ab-sec"><h3>Hextable</h3>
      <p>A virtual tabletop compatible with fifth edition, in the browser. Version ${esc(GAME_VERSION)}. Tables are kept in state version ${esc(info.stateVersion ?? '')}${info.tableVersion !== undefined ? `; this table is in version ${esc(info.tableVersion)}` : ''}.</p>
      <p class="note">Say these numbers when you report a problem.</p></section>
    <section class="ab-sec" id="ab-srd"><h3>The rules</h3>
      <p id="ab-srd-text">${linked(SRD_ATTRIBUTION)}</p></section>
    <section class="ab-sec"><h3>Hextable&rsquo;s licence</h3>
      <details><summary>${esc(HEXTABLE_LICENCE.name)}</summary><pre class="ab-pre">${esc(HEXTABLE_LICENCE.text)}</pre></details></section>
    <section class="ab-sec"><h3>Three.js</h3>
      <p>The 3D view uses Three.js, ${linked(THREE_LICENCE.site)}, under the MIT License. The copy kept with the game is unchanged but for its import lines; its licence file is <a href="${esc(THREE_LICENCE.where)}" target="_blank" rel="noopener">${esc(THREE_LICENCE.where)}</a>.</p>
      <details><summary>${esc(THREE_LICENCE.name)}</summary><pre class="ab-pre">${esc(THREE_LICENCE.text)}</pre></details></section>
    <section class="ab-sec"><h3>Fonts</h3>
      <p>The page loads these from Google Fonts. Each is under the ${linked(OFL.name)} (${linked(OFL.url)}).</p>
      <ul class="ab-list">${FONTS.map((f) => `<li><b>${esc(f.name)}</b>: ${esc(f.copyright)}</li>`).join('')}</ul></section>
    <section class="ab-sec" id="ab-packs"><h3>Model packs</h3>${packs}</section>`;
}
