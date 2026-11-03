const pptxgen = require('pptxgenjs');
const { applyTheme } = require('/root/.claude/skills/synced/46e7f742-a33d-4940-8753-61048851fa82_93c5a9e4-83ff-4021-aa31-6ba7e325b85e/pptx/scripts/apply_theme.js');
const R = require('./results.json');
const DIR = '/home/user/Fsr-reviewer/deliverables/priority-areas-2031';
const OUT = DIR + '/Priority_Areas_2031_Population_Analysis.pptx';
const THEME = { name: 'Priority Areas', headFontFace: 'Cambria', bodyFontFace: 'Calibri',
  colors: { dk1: '1F1F1F', lt1: 'FFFFFF', dk2: '5A0000', lt2: 'F6EEEE', accent1: '7A0000', accent2: '36454F', accent3: 'C98A8A', accent4: '3182BD', accent5: '31A354', accent6: 'E6550D', hlink: '0563C1', folHlink: '7A0000' } };
const pres = new pptxgen(); pres.layout = 'LAYOUT_WIDE'; pres.theme = { headFontFace: 'Cambria', bodyFontFace: 'Calibri' };
pres.title = 'Scenario 1 2031 Priority Areas: population analysis';
const C = pres.SchemeColor;
const f0 = n => Math.round(n).toLocaleString('en-US');
const slug = n => n.replace(/\//g, '-').replace(/ /g, '_');
const SLIDE0 = 7;
const date = R.generatedAt.slice(0, 10);
pres.defineSlideMaster({ title: 'DARK', background: { color: '5A0000' },
  objects: [{ placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 2.2, w: 11.9, h: 1.6, fontSize: 40, bold: true, color: 'FFFFFF', fontFace: 'Cambria', valign: 'bottom' }, text: '' } },
            { placeholder: { options: { name: 'body', type: 'body', x: 0.7, y: 3.95, w: 11.9, h: 2.2, fontSize: 18, color: 'F6EEEE', fontFace: 'Calibri', valign: 'top' }, text: '' } }] });
pres.defineSlideMaster({ title: 'CONTENT', background: { color: 'FFFFFF' }, margin: [0.5, 0.5, 0.6, 0.5],
  objects: [{ placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.25, w: 12.3, h: 0.7, fontSize: 28, bold: true, color: '5A0000', fontFace: 'Cambria', valign: 'middle' }, text: '' } },
            { text: { text: `Peel Growth Pipeline app · snapshot ${date} · unofficial screening estimate`, options: { x: 0.5, y: 7.08, w: 8, h: 0.3, fontSize: 9, color: '7F7F7F', fontFace: 'Calibri' } } }],
  slideNumber: { x: 12.3, y: 7.08, w: 0.6, h: 0.3, fontSize: 9, color: '7F7F7F', fontFace: 'Calibri' } });
const add = (m, sec) => pres.addSlide({ masterName: m, sectionTitle: sec });
const T = R.areas.reduce((t, a) => { for (const k in a.total) t[k] = (t[k] || 0) + a.total[k]; return t; }, {});
const mapPop = R.areas.reduce((s, a) => s + a.mapPop, 0);
const nDev = R.areas.reduce((s, a) => s + a.nDevs, 0), nApp = R.areas.reduce((s, a) => s + a.nApps, 0);
const nDots = R.areas.reduce((s, a) => s + a.dots.length, 0), nMatch = R.areas.reduce((s, a) => s + a.dots.filter(d => d.match).length, 0);

// 1 Title
pres.addSection({ title: 'Overview' });
let s = add('DARK', 'Overview');
s.addText('Scenario 1 2031 Priority Areas: population analysis', { placeholder: 'title' });
s.addText([{ text: '19 areas from the Region map "4507-WW Development Application Modelling Update" (2026-05-20), crossed with the Peel Growth Pipeline app', options: { breakLine: true } },
  { text: `Growth on top of the 2021 Census: units · residential population · jobs, existing 2021–2026, anticipated 2031, build-out · app snapshot ${date}`, options: { breakLine: true } },
  { text: 'Companion files: Priority_Areas_2031_Population_Analysis.xlsx · maps/A00–A19 PNG', options: { fontSize: 14 } }], { placeholder: 'body' });

// 2 Key numbers
s = add('CONTENT', 'Overview');
s.addText(`${f0(Math.round(T.u_bo/100)*100)} units of growth since 2021; a third by 2031`, { placeholder: 'title' });
const stat = (x, big, small, sub) => {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.25, w: 3.85, h: 2.1, fill: { color: 'F6EEEE' }, line: { color: 'F6EEEE' }, rectRadius: 0.12, objectName: 'stat card' });
  s.addText(big, { x: x + 0.25, y: 1.35, w: 3.4, h: 0.95, fontSize: 40, bold: true, color: '7A0000', fontFace: 'Cambria', isTextBox: true, margin: 0 });
  s.addText(small, { x: x + 0.25, y: 2.3, w: 3.4, h: 0.4, fontSize: 16, bold: true, color: '36454F', isTextBox: true, margin: 0 });
  s.addText(sub, { x: x + 0.25, y: 2.7, w: 3.4, h: 0.55, fontSize: 12, color: '36454F', isTextBox: true, margin: 0 });
};
stat(0.5, f0(T.u_bo), 'units at build-out', `${f0(T.u_ex)} built 2021–26 · ${f0(T.u_31)} by 2031`);
stat(4.73, f0(T.p_bo), 'residents at build-out', `${f0(T.p_ex)} added 2021–26 · ${f0(T.p_31)} by 2031`);
stat(8.96, f0(T.j_bo), 'jobs at build-out', `${f0(T.j_ex)} added 2021–26 · ${f0(T.j_31)} by 2031`);
s.addText([
  { text: `Every figure is growth on top of the 2021 Census (census day 2021-05-11). "Existing" is what was built from census day to October 2026. The ${f0(T.u_pre)} units these developments finished before census day are already in the census and are left out.`, options: { bullet: true, breakLine: true } },
  { text: `${f0(nDev)} app developments fall inside the 19 boxes: ${nApp} planning applications and ${f0(nDev - nApp)} building-permit-only sites (mostly infill and lots in older registered subdivisions).`, options: { bullet: true, breakLine: true } },
  { text: `The app's build-out population is ${Math.round(100 * T.p_bo / mapPop)}% of the ${f0(mapPop)} people printed on the Region map. The gaps are lands with no application yet: Lakeshore, SP47, McLaughlin Road and Steeles MTSA.`, options: { bullet: true, breakLine: true } },
  { text: `${nMatch} of ${nDots} Region map points sit within 400 m of an app planning application (slide 7). The unmatched points show where the Region models growth that has no application on file.`, options: { bullet: true, breakLine: true } },
  { text: 'How the files connect: area A08 = Excel sheet "A08" = slide 15 (slide 7 + area no.) = app-screens/A08_SP47_app.png. Development A08-012 is label 12 in that app screenshot. Region map reference: maps/A08_SP47.png.', options: { bullet: true } },
], { x: 0.5, y: 3.6, w: 12.3, h: 3.4, fontSize: 13.5, color: '1F1F1F', paraSpaceAfter: 8, valign: 'top', isTextBox: true });

// 3 Overview map
s = add('CONTENT', 'Overview');
s.addText('Reference: the Region map, with the app\'s applications plotted on it', { placeholder: 'title' });
s.addImage({ path: DIR + '/maps/A00_overview.png', x: 0.5, y: 1.0, w: 6.15, h: 6.09, altText: 'Overview map of the 19 priority areas' });
s.addText([
  { text: 'Red boxes are the Region map boxes, georeferenced to the ground (the map is rotated about 45°, so north points up-left).', options: { bullet: true, breakLine: true } },
  { text: 'Dots are the app\'s planning applications, coloured by stage. Slide 4 shows the same areas in the app. Area slides 8–26 are app screenshots, with every application numbered.', options: { bullet: true, breakLine: true } },
  { text: 'A box\'s area in hectares is larger than the Region\'s stated area, because the boxes frame the sites rather than trace planning boundaries.', options: { bullet: true, breakLine: true } },
  { text: 'Names follow the map\'s labels and leader lines, checked against the app\'s plan names. Where the leader lines cross (Macville, Dixie Road, Humber Station, Airport Road), areas were named by geography.', options: { bullet: true, breakLine: true } },
  { text: 'Excel: sheet "Summary" · map file: maps/A00_overview.png', options: { bold: true } },
], { x: 6.95, y: 1.15, w: 5.9, h: 5.8, fontSize: 15, color: '1F1F1F', paraSpaceAfter: 10, valign: 'top', isTextBox: true });

// 4 The 19 areas in the app
s = add('CONTENT', 'Overview');
s.addText('The 19 areas drawn in the app', { placeholder: 'title' });
s.addImage({ path: DIR + '/app-screens/A00_all_areas_app.png', x: 0.5, y: 1.0, w: 8.8, h: 5.5, altText: 'Peel Growth Pipeline app with the 19 priority areas drawn as a selection' });
s.addText([
  { text: 'This is the Peel Growth Pipeline\'s full map. Each Region box is drawn as the app\'s own selected area (dashed), and every development inside is selected.', options: { bullet: true, breakLine: true } },
  { text: 'The app\'s panel (right) shows the developments\' full size, including homes built before 2021.', options: { bullet: true, breakLine: true } },
  { text: 'The figures in this deck are growth on top of the 2021 Census, worked out from the same developments.', options: { bullet: true, breakLine: true } },
  { text: 'Basemap tiles were unavailable when these were captured, so only the app\'s own layers show.', options: { bullet: true, breakLine: true } },
  { text: 'File: app-screens/A00_all_areas_app.png', options: { bold: true } },
], { x: 9.55, y: 1.1, w: 3.3, h: 5.8, fontSize: 13, color: '1F1F1F', paraSpaceAfter: 8, valign: 'top', isTextBox: true });

// 5 Summary table
pres.addSection({ title: 'Summary' });
s = add('CONTENT', 'Summary');
s.addText('Summary: growth since the 2021 Census, by area', { placeholder: 'title' });
const hc = t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: '7A0000' }, align: 'center', valign: 'middle' } });
const sub = t => ({ text: t, options: { bold: true, color: '5A0000', fill: { color: 'F6EEEE' }, align: 'center' } });
const rows = [
  [hc('Area'), { text: 'Units', options: { colspan: 3, bold: true, color: 'FFFFFF', fill: { color: '7A0000' }, align: 'center' } }, { text: 'Residential population', options: { colspan: 3, bold: true, color: 'FFFFFF', fill: { color: '7A0000' }, align: 'center' } }, { text: 'Jobs', options: { colspan: 3, bold: true, color: 'FFFFFF', fill: { color: '7A0000' }, align: 'center' } }, hc('Region map pop.'), hc('Slide')],
  [sub(''), sub('2021–26'), sub('2021–31'), sub('Build-out'), sub('2021–26'), sub('2021–31'), sub('Build-out'), sub('2021–26'), sub('2021–31'), sub('Build-out'), sub(''), sub('')],
];
const num = (v, o = {}) => ({ text: f0(v), options: { align: 'right', ...o } });
for (const a of R.areas) { const t = a.total; rows.push([{ text: `${a.code} ${a.name}`, options: {} }, num(t.u_ex), num(t.u_31), num(t.u_bo, { bold: true }), num(t.p_ex), num(t.p_31), num(t.p_bo, { bold: true }), num(t.j_ex), num(t.j_31), num(t.j_bo, { bold: true }), num(a.mapPop, { color: '0000FF' }), { text: String(SLIDE0 + a.id), options: { align: 'center' } }]); }
const B = { bold: true, fill: { color: 'F6EEEE' } };
rows.push([{ text: 'Total, 19 areas', options: B }, num(T.u_ex, B), num(T.u_31, B), num(T.u_bo, B), num(T.p_ex, B), num(T.p_31, B), num(T.p_bo, B), num(T.j_ex, B), num(T.j_31, B), num(T.j_bo, B), num(mapPop, { ...B, color: '0000FF' }), { text: '', options: B }]);
s.addTable(rows, { x: 0.5, y: 0.98, w: 12.3, colW: [2.5, 0.9, 0.9, 0.95, 0.95, 0.95, 1.0, 0.85, 0.85, 0.9, 1.05, 0.5], fontSize: 10, fontFace: 'Calibri', rowH: 0.25, border: { type: 'solid', pt: 0.5, color: 'D9D9D9' }, valign: 'middle', margin: [0, 0.05, 0, 0.05] });
s.addText('Growth on top of the 2021 Census. 2021–26 = built from census day (2021-05-11) to Oct 2026. 2021–31 = that plus the app Forecast\'s 2026–2031 share of what is left to build. Build-out = 2021–26 plus everything left to build. Units finished before census day are excluded (Excel "Summary", grey columns). Blue = as printed on the Region map.', { x: 0.5, y: 6.55, w: 12.3, h: 0.45, fontSize: 10, italic: true, color: '595959', isTextBox: true });

// 5 Chart
s = add('CONTENT', 'Summary');
s.addText('Most areas: the app counts fewer people than the Region map', { placeholder: 'title' });
const labels = R.areas.map(a => `${a.code} ${a.name}`);
s.addChart(pres.charts.BAR, [
  { name: 'Existing 2021–26', labels, values: R.areas.map(a => Math.round(a.total.p_ex)) },
  { name: 'Growth 2021–31', labels, values: R.areas.map(a => Math.round(a.total.p_31)) },
  { name: 'Build-out since 2021 (app)', labels, values: R.areas.map(a => Math.round(a.total.p_bo)) },
  { name: 'Region map population', labels, values: R.areas.map(a => a.mapPop) },
], { x: 0.5, y: 1.0, w: 8.6, h: 6.0, barDir: 'bar', barGrouping: 'clustered', barGapWidthPct: 40, chartColors: ['36454F', 'C98A8A', '7A0000', '3182BD'],
  catAxisOrientation: 'maxMin', catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt', catAxisLabelColor: '404040', valAxisLabelColor: '404040',
  valAxisLabelFormatCode: '#,##0', valGridLine: { color: 'E6E6E6', size: 0.5 }, catGridLine: { style: 'none' },
  showLegend: true, legendPos: 't', legendFontSize: 10, legendFontFace: '+mn-lt', showTitle: true, title: 'Residential population growth since the 2021 Census, by area', titleFontSize: 12, titleFontFace: '+mn-lt', titleColor: '404040' });
const gaps = R.areas.map(a => ({ a, gap: a.mapPop - a.total.p_bo })).sort((x, y) => y.gap - x.gap);
s.addText([
  { text: 'Largest gaps (Region map minus app build-out)', options: { bold: true, breakLine: true, color: '5A0000' } },
  ...gaps.slice(0, 5).map((g, i) => ({ text: `${g.a.code} ${g.a.name}: ${f0(g.gap)} people`, options: { bullet: true, breakLine: true } })),
  { text: 'App exceeds the map', options: { bold: true, breakLine: true, color: '5A0000' } },
  ...gaps.filter(g => g.gap < 0).sort((x, y) => x.gap - y.gap).slice(0, 4).map((g, i, arr) => ({ text: `${g.a.code} ${g.a.name}: +${f0(-g.gap)}`, options: { bullet: true, breakLine: i < arr.length - 1 } })),
], { x: 9.3, y: 1.1, w: 3.55, h: 5.8, fontSize: 13, color: '1F1F1F', paraSpaceAfter: 6, valign: 'top', isTextBox: true });

// 6 Crosswalk
s = add('CONTENT', 'Summary');
s.addText('Crosswalk: how many Region map points have an app application', { placeholder: 'title' });
const cr = [[hc('Area'), hc('Region points'), hc('Matched ≤ 400 m'), hc('App planning applications'), hc('Permit-only sites'), hc('Main app plan')]];
for (const a of R.areas) {
  const plans = {}; for (const r of a.rows) if (r.plan) plans[r.plan] = (plans[r.plan] || 0) + 1;
  const top = Object.entries(plans).sort((x, y) => y[1] - x[1])[0];
  const m = a.dots.filter(d => d.match).length;
  cr.push([`${a.code} ${a.name}`, { text: String(a.dots.length), options: { align: 'center' } }, { text: String(m), options: { align: 'center', color: m < a.dots.length ? 'C00000' : '1F1F1F', bold: m < a.dots.length } }, { text: String(a.nApps), options: { align: 'center' } }, { text: f0(a.nPermitOnly), options: { align: 'center' } }, top ? top[0] : '']);
}
s.addTable(cr, { x: 0.5, y: 0.98, w: 8.4, colW: [2.5, 0.95, 1.05, 1.2, 0.95, 1.75], fontSize: 10, fontFace: 'Calibri', rowH: 0.26, border: { type: 'solid', pt: 0.5, color: 'D9D9D9' }, valign: 'middle', margin: [0, 0.05, 0, 0.05] });
s.addText([
  { text: 'Region points were read off the PDF map. Where points overlap they are split by size, so counts in dense clusters are approximate.', options: { bullet: true, breakLine: true } },
  { text: 'Red = some points have no app planning application within 400 m. For those, the Region models lands that have no file in the app\'s open data (A06 McLaughlin Road and A02 Humber Station have none near any point).', options: { bullet: true, breakLine: true } },
  { text: 'Point-by-point detail, with each matched development ID: Excel sheet "Crosswalk". Points are the black rings on each area map.', options: { bullet: true } },
], { x: 9.15, y: 1.1, w: 3.7, h: 5.8, fontSize: 13, color: '1F1F1F', paraSpaceAfter: 8, valign: 'top', isTextBox: true });

// 7-25 area slides
pres.addSection({ title: 'Areas A01–A19' });
for (const a of R.areas) {
  s = add('CONTENT', 'Areas A01–A19');
  const t = a.total;
  s.addText(`${a.code} · ${a.name}`, { placeholder: 'title' });
  s.addImage({ path: `${DIR}/app-screens/${a.code}_${slug(a.name)}_app.png`, x: 0.5, y: 1.0, w: 7.68, h: 4.8, altText: `Peel Growth Pipeline app: ${a.name} drawn as a selection` });
  s.addText(`App screenshot: Peel Growth Pipeline full map. Dashed = the area as an app selection; labels = development no. (${a.code}-###). The app's panel shows the developments' full size, pre-2021 included. Region map reference: maps/${a.code}_${slug(a.name)}.png`, { x: 0.5, y: 5.9, w: 7.68, h: 0.6, fontSize: 10, italic: true, color: '595959', isTextBox: true, margin: 0 });
  const g = { bold: true, color: 'FFFFFF', fill: { color: '7A0000' }, align: 'center', fontSize: 11 };
  s.addTable([
    [{ text: 'Growth', options: g }, { text: '2021–26', options: g }, { text: '2021–31', options: g }, { text: 'Build-out', options: g }, { text: 'Pre-2021*', options: { ...g, fill: { color: '8C8C8C' } } }],
    ...[['Units', 'u'], ['Res. pop.', 'p'], ['Jobs', 'j']].map(([l, k]) => [{ text: l, options: { bold: true, color: '5A0000' } }, num(t[k + '_ex']), num(t[k + '_31']), num(t[k + '_bo'], { bold: true }), num(t[k + '_pre'], { color: '7F7F7F' })]),
  ], { x: 8.4, y: 1.05, w: 4.45, colW: [0.93, 0.85, 0.85, 0.94, 0.88], fontSize: 12, fontFace: 'Calibri', rowH: 0.32, border: { type: 'solid', pt: 0.5, color: 'D9D9D9' }, valign: 'middle', margin: [0, 0.04, 0, 0.04] });
  const m = a.dots.filter(d => d.match).length;
  const munis = Object.entries(a.munis).map(([k, v]) => `${k} ${v}`).join(', ');
  s.addText([
    { text: '*Pre-2021 = built before census day 2021-05-11, already in the 2021 Census (not added).', options: { breakLine: true, color: '7F7F7F' } },
    { text: `Region map: ${f0(a.mapPop)} people on ${a.mapHa} ha. App build-out = ${Math.round(100 * t.p_bo / a.mapPop)}% of that.`, options: { breakLine: true } },
    { text: `${f0(a.nDevs)} developments: ${a.nApps} planning applications and ${f0(a.nPermitOnly)} permit-only (${munis}). ${m} of ${a.dots.length} Region points matched.`, options: {} },
  ], { x: 8.4, y: 2.45, w: 4.45, h: 1.25, fontSize: 10.5, color: '36454F', valign: 'top', isTextBox: true, margin: 0 });
  const apps = a.rows.filter(r => r.kind === 'Planning application').slice(0, 7);
  const ah = { bold: true, color: '5A0000', fill: { color: 'F6EEEE' } };
  s.addTable([
    [{ text: 'No. / development', options: ah }, { text: 'Stage', options: ah }, { text: 'Units', options: { ...ah, align: 'right' } }, { text: '2021–31', options: { ...ah, align: 'right' } }],
    ...apps.map(r => [`${r.id.split('-')[1].replace(/^0+/, '')}  ${r.title.length > 24 ? r.title.slice(0, 23) + '…' : r.title}`, r.stage, num(r.u_bo), num(r.u_31)]),
  ], { x: 8.4, y: 3.8, w: 4.45, colW: [2.1, 1.05, 0.6, 0.7], fontSize: 9.5, fontFace: 'Calibri', rowH: 0.28, border: { type: 'solid', pt: 0.5, color: 'D9D9D9' }, valign: 'middle', margin: [0, 0.04, 0, 0.04] });
  s.addText(`Largest ${apps.length} of ${a.nApps} applications by units, as growth since 2021. Every development: Excel sheet "${a.code}"`, { x: 8.4, y: 6.55, w: 4.45, h: 0.45, fontSize: 10, italic: true, color: '595959', isTextBox: true, margin: 0 });
  s.addNotes(`${a.code} ${a.name}. Planning applications in the area (ID, title, stage, units build-out, files):\n` + a.rows.filter(r => r.kind === 'Planning application').map(r => `${r.id} ${r.title} | ${r.stage} | ${f0(r.u_bo)} units | ${r.files}`).join('\n'));
}

// 26 Method
pres.addSection({ title: 'Method' });
s = add('CONTENT', 'Method');
s.addText('Method, definitions and caveats', { placeholder: 'title' });
const col = (x, head, items) => {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.1, w: 3.95, h: 5.75, fill: { color: 'F6EEEE' }, line: { color: 'F6EEEE' }, rectRadius: 0.1, objectName: 'method card' });
  s.addText(head, { x: x + 0.2, y: 1.2, w: 3.55, h: 0.5, fontSize: 18, bold: true, color: '7A0000', fontFace: 'Cambria', isTextBox: true, margin: 0 });
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })), { x: x + 0.2, y: 1.75, w: 3.6, h: 5.0, fontSize: 12, color: '1F1F1F', paraSpaceAfter: 6, valign: 'top', isTextBox: true });
};
col(0.5, 'Areas', ['Red boxes from the Region PDF, georeferenced by fitting its municipal boundary to the app\'s (scale within 0.02% of 1:192,036; ~160 m fit).', 'A development counts in an area when its site point is inside the box.', 'Names follow the map labels, checked against app plan names.']);
col(4.68, 'Figures (the app\'s)', ['Base: the 2021 Census. Everything is growth from census day (2021-05-11).', 'Existing 2021–26 = permits completed since census day (Growth › 2021 existing, "Built since"). Brampton and Caledon completion dates are estimated from issue dates.', '2021–31 = that plus the Forecast\'s 2026–2031 share (Growth › Forecast › By period).', 'Build-out = 2021–26 plus everything left to build.', 'People = units × persons per unit by type (4.2 / 3.4 / 3.1 or 2.7 / 2.7).', 'Jobs = non-residential floor area on the applications; employment counts by 2031 when approved to under construction.']);
col(8.86, 'Caveats', ['Unofficial screening estimate from public open data, not the Region\'s capacity ledger.', 'Sites at a box edge may belong to a neighbouring area.', 'Lands with no application yet are not in the app, so the Region\'s figures can be higher.', 'Untimed developments (e.g. the 9,862-unit Heritage / Bovaird block) count nothing by 2031.']);

(async () => { await pres.writeFile({ fileName: OUT }); await applyTheme(OUT, THEME); console.log('ok'); })();
