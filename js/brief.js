/*
 * Council and committee items in brief: what kind of item it is, what was decided, the issues
 * raised and the requirements attached, read from the agenda / minutes text (data/council.json).
 * Extractive only: every phrase shown comes from the text. Pure functions (testable in Node).
 */
(function (root) {
  'use strict';

  function itemKind(it) {
    const t = it.title || '', all = t + ' ' + (it.docs || []).map(d => d[1]).join(' ');
    if (/^\W*(correspondence|petition|letter)|\bcorrespondence re\b/i.test(t)) return 'Correspondence';
    if (/^\W*delegation/i.test(t)) return 'Delegation';
    if (/presentation/i.test(t)) return 'Staff presentation';
    if (/public meeting/i.test(t)) return 'Public meeting';
    if (/recommendation/i.test(all)) return 'Recommendation report';
    if (/information report/i.test(all)) return 'Information report';
    if (/staff report/i.test(t)) return 'Staff report';
    if (/^\W*(a )?by-?law\b|^\W*BL-\d{4}-\d+/i.test(t)) return 'By-law';
    return 'Item';
  }

  // Topics, in the order they are listed. `infra` marks the ones an infrastructure planner reads first.
  const TOPICS = [
    ['Water / wastewater servicing', /servicing|sanitary|sewer|wastewater|watermain|water (supply|service|pressure)|allocation|capacity/i, true],
    ['Stormwater / flooding', /storm ?water|flood|drainage|grading/i, true],
    ['Traffic / roads', /traffic|congestion|road|intersection|transportation|transit|access/i, false],
    ['Parking', /parking/i, false],
    ['Height / density', /height|density|storey|massing|scale|intensi/i, false],
    ['Schools', /school/i, false],
    ['Parks / trees', /parkland|\bparks?\b|trees?\b|green ?space|natural heritage/i, false],
    ['Shadow / privacy', /shadow|privacy|overlook/i, false],
    ['Construction impacts', /construction|noise|dust/i, false],
    ['Safety', /safety|pedestrian/i, false],
    ['Neighbourhood character', /character|compatib/i, false],
  ];
  const topicsOf = s => TOPICS.filter(([, re]) => re.test(s)).map(([t]) => t);

  // Requirements and conditions attached to the item. [label, test, infra].
  const REQUIREMENTS = [
    ['Holding provision (H)', /holding provision|"H" symbol|\bH[- ]OZ\b|\(H\)/i, true],
    ['Servicing / allocation', /servicing|allocation|sanitary|watermain/i, true],
    ['Stormwater management', /stormwater/i, true],
    ['Region of Peel comments', /Region of Peel|Regional (comments|conditions|requirements|staff)/i, true],
    ['Draft plan conditions', /conditions? of draft|draft plan conditions|draft approval conditions/i, false],
    ['Development agreement', /(development|servicing|subdivision|site plan|section 37) agreement/i, false],
    ['Section 37 / community benefits', /section 37|community benefit/i, false],
    ['Parkland / cash-in-lieu', /parkland|cash.in.lieu/i, false],
    ['Affordable housing', /affordable/i, false],
    ['Traffic / transportation study', /(traffic|transportation) (impact )?(study|report|assessment)/i, false],
    ['Tribunal / appeal', /Ontario Land Tribunal|\bOLT\b|\bLPAT\b|\bOMB\b|appeal/i, false],
  ];

  const clip = (s, n) => s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, '')} …`;

  // The motion: "That …" after RECOMMENDATION (or the first "That …"), up to the vote; the
  // staff-report boilerplate is shortened.
  // A file number as a pattern on its digit groups: "OZ/OPA 25-8" matches "OZ/OPA 25-8 W2" and "OZ 25/008".
  function refPattern(ref) {
    const nums = String(ref || '').match(/\d+/g);
    if (!nums || nums.join('').length < 3) return null;
    return new RegExp(`(?:^|\\D)${nums.map(n => `0*${Number(n)}`).join('\\D{1,4}')}(?!\\d)`);
  }
  function decisionText(text, refRes) {
    if (!text) return '';
    const rec = text.search(/RECOMMENDATION|Recommendation\b/);
    const from = text.slice(rec >= 0 ? rec : 0);
    // A report covering several files (a consent agenda): the clause naming this development's file.
    const own = refRes && refRes.length ? from.split(/(?=\bThat\b)/).find(c => /^That\b/.test(c) && refRes.some(re => re.test(c))) : null;
    const r = from.search(/\bThat the (staff )?(report|presentation|recommendation)/), i = own ? from.indexOf(own) : r >= 0 ? r : from.search(/\bThat\b/);
    if (i < 0) return '';
    let s = from.slice(i).split(/\s+(?:YES \(|NO \(|ABSENT \(|Carried\b|CARRIED\b|Lost\b|LOST\b|Defeated\b|Dealt with under)/)[0];
    s = s.replace(/the report dated [A-Z][a-z]+ \d{1,2}\s?, ?\d{4},? from the (Commissioner|Director|General Manager|Chief)[^,]*?(?=,| regarding| recommending| outlining| to | be )/g, 'the staff report')
      .replace(/Moved By [^,]*?(?=That\b)/g, '').replace(/\s+/g, ' ').trim();
    // Receipt of submissions is procedural: drop it.
    s = s.replace(/\s*(?:\d+\s?\.\s*)?That (?:the )?[\w\s()]*?(?:oral|written) submissions? be received\s*\.?/gi, '').trim();
    // Stop at the next numbered recommendation (another file on the same report).
    if (own) s = s.split(/\s+[A-Z]{2,5}-? ?\d{2,4}-\d{4}\b/)[0].replace(/\s+\d+\s?\.?$/, '').trim();
    return clip(s, 320);
  }

  // A short verdict: what happened at this item.
  function verdictOf(it, passed, refRes) {
    const t = it.text || '', d = decisionText(t, refRes), o = it.outcome || '';
    if (/DEFEATED|LOST/.test(o)) return 'Motion defeated';
    if (/DEFERRED/.test(o) || /\bbe deferred\b/i.test(d)) return 'Deferred';
    if (/REFERRED/.test(o) || /\bbe referred\b/i.test(d)) return 'Referred back';
    if (/refus/i.test(d)) return 'Refused';
    const byLaw = t.match(/See By-?law (\d[\d-]*)/i) || (passed && (it.title || '').match(/^\W*(?:By-?law (\d+-\d{4})|(BL-\d{4}-\d+))/i)) || (/^\W*A by-?law/i.test(it.title || '') && passed ? [null, ''] : null);
    if (byLaw) return byLaw[2] ? `${byLaw[2]} passed` : `By-law${byLaw[1] ? ` ${byLaw[1]}` : ''} passed`;
    if (/recommending approval|be approved|approve the|be adopted/i.test(d) && passed) return 'Approval endorsed';
    if (/be received/i.test(d)) return 'Received';
    if (/public meeting/i.test(it.title || '') && passed) return 'Public meeting held';
    if (/Consent Resolution/i.test(t)) return 'Passed on consent';
    if (o) return o.charAt(0) + o.slice(1).toLowerCase();
    return passed ? '' : 'On the agenda';
  }

  function concernsOf(text) {
    const out = [];
    const re = /concerns?\s+(?:regarding|about|with|related to|over|for|on|relating to)\s+([^.;]+)/gi;
    let m;
    while ((m = re.exec(text || ''))) out.push(...topicsOf(m[1]));
    return [...new Set(out)];
  }

  function summarizeItem(it, passed, refs) {
    const refRes = (refs || []).map(refPattern).filter(Boolean);
    const text = it.text || '';
    const vote = text.match(/(Carried|Lost|Defeated)\s*\((\d+)\s*to\s*(\d+)\)/i);
    const money = text.match(/(?:sum of |amount of |contribution of )?\$\s?([\d,]{4,}(?:\.\d{2})?)/);
    const months = text.match(/within (\d+|eighteen|twelve|twenty-four) months/i);
    const reqs = REQUIREMENTS.filter(([, re]) => re.test(text) || re.test(it.title || '')).map(([label, , infra]) => ({
      label: label === 'Section 37 / community benefits' && money ? `${label} $${money[1].replace(/\.00$/, '')}` : label, infra,
    }));
    if (months) reqs.push({ label: `By-law within ${months[1]} months or a new application`, infra: false });
    return {
      kind: itemKind(it),
      verdict: verdictOf(it, passed, refRes),
      decision: decisionText(text, refRes),
      concerns: concernsOf(text),
      requirements: reqs,
      vote: vote ? `${vote[1][0].toUpperCase()}${vote[1].slice(1).toLowerCase()} ${vote[2]}–${vote[3]}` : '',
    };
  }

  // Issues and requirements across all items (most recent first), each with how many items raised it.
  function across(items) {
    const conc = new Map(), req = new Map();
    for (const { s } of items) {
      for (const c of s.concerns) conc.set(c, (conc.get(c) || 0) + 1);
      for (const r of s.requirements) { const k = r.label.replace(/ \$.*$/, ''); if (!req.has(k)) req.set(k, { label: r.label, infra: r.infra, n: 0 }); req.get(k).n++; }
    }
    return { concerns: [...conc].map(([label, n]) => ({ label, n, infra: TOPICS.find(t => t[0] === label)[2] })), requirements: [...req.values()] };
  }

  // The item to brief from: the latest one with a decision, else the latest one.
  function latestDecisive(items) {
    return items.find(x => x.s.decision || /Approval|By-law|Refused|Deferred|Referred|defeated/.test(x.s.verdict)) || items[0] || null;
  }

  const api = { refPattern, itemKind, summarizeItem, decisionText, verdictOf, concernsOf, across, latestDecisive, TOPICS, REQUIREMENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelBrief = api;
})(typeof window !== 'undefined' ? window : globalThis);
