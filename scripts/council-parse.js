/**
 * Parse eSCRIBE meeting pages (agenda / minutes HTML) into agenda items, and find the
 * development application file numbers each item names. Used by scripts/build-council.js.
 */
'use strict';
const P = require('../js/phases.js');

// File numbers as they appear in agenda titles and report names.
const FILE_RE = /\bOZOPA\s*\d{2}[\/\s-]\d{1,3}(?:\s*W\d{1,2})?\b|\b(?:OZ\s*[\/-]?\s*OPA|OZ|OPA|OPZ)\s*\d{2}[\/\s-]\d{1,3}(?:\s*W\d{1,2})?\b|\b(?:OZS|OZ|SPA|DPS|DPC|CDM|PRE|POPA|RZ|DEV|SPA)\s*-?\s*\d{4}\s*-\s*\d{3,4}\b|\b21T\s*-?\s*[A-Z]?\s*-?\s*\d{2}\s*[-\s]?\d{2,4}[A-Z]?\b|\b21CDM\s*-?\s*[A-Z]?\s*\d{2}\s*[-\s]?\d{1,4}\b|\bSP\s*\d{2}[\/-]\d{1,4}(?:\s*W\d{1,2})?\b/gi;

const decode = s => String(s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&ndash;|&mdash;/g, '–').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
const text = h => decode(String(h).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|div|li|h\d)>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Keys a file number matches in the snapshot (same canonical form as the records). */
function fileKeys(ref, muni) {
  const k = P.canonRef(String(ref).replace(/\bOZOPA\b/i, 'OZ OPA'));
  const out = new Set([k]);
  // Mississauga "OZ/OPA 25-8" files can be listed as "OZ 25 8" or "OPA 25 8".
  if (/^OZ\|OPA\|/.test(k)) { out.add(k.replace(/^OZ\|OPA\|/, 'OZ|')); out.add(k.replace(/^OZ\|OPA\|/, 'OPA|')); }
  out.add(k.replace(/(\d)[A-Z]$/, '$1'));   // subdivision files with a municipality letter: "21T-17008B"
  if (muni === 'Caledon') {
    // Caledon records carry the bare number ("2026-0016"); agendas prefix it ("RZ 2026-0016").
    const bare = k.replace(/^(RZ|POPA|OPA|SPA|DEV|CDM)\|/, '');
    out.add(bare);
    out.add(bare.replace(/(\d)[A-Z]$/, '$1'));   // "21T-21002C" → "21T|21002"
  }
  return [...out].filter(Boolean);
}

const OUTCOME_RE = /\b(CARRIED AS AMENDED|CARRIED|DEFEATED|LOST|DEFERRED|REFERRED|RECEIVED|WITHDRAWN|APPROVED|ADOPTED)\b/gi;

/** Agenda items with their title, attachments (report names + document ids), body text and outcome. */
function parseItems(html) {
  const h = String(html), cut = h.lastIndexOf('No Item Selected');
  const page = cut > 0 ? h.slice(0, cut) : h;   // drop the attachment viewer panel after the items
  const parts = page.split(/<DIV class='AgendaItemContainer/i).slice(1).map(p => p.replace(/^[^>]*>/, ''));
  const items = [];
  for (const part of parts) {
    const title = (part.match(/class='AgendaItemTitle'[^>]*>\s*(?:<a[^>]*>)?([\s\S]*?)<\/(?:a|DIV)>/i) || [])[1];
    if (!title) continue;
    const counter = text((part.match(/class='AgendaItemCounter'[^>]*>([\s\S]*?)<\/DIV>/i) || [])[1] || '');
    const docs = [];
    for (const m of part.matchAll(/href="(?:\.\/)?filestream\.ashx\?DocumentId=(\d+)"[^>]*>\s*<SPAN[^>]*>([\s\S]*?)<\/SPAN>/gi)) {
      if (!docs.some(d => d.id === m[1])) docs.push({ id: m[1], name: text(m[2]) });
    }
    // Body: everything in this item (minutes discussion, motions) minus its title and attachments.
    let body = text(part.replace(/class='AgendaItemTitleRow'[\s\S]*?<\/H\d>/i, '').replace(/<DIV class='AgendaItemAttachment[\s\S]*?<\/DIV>/gi, ''));
    const t = text(title);
    body = body.replace(t, '').replace(/^\W+/, '').trim();
    const outcomes = [...body.matchAll(OUTCOME_RE)].map(m => m[1].toUpperCase());
    items.push({ counter, title: t, docs, body, outcome: outcomes.length ? outcomes[outcomes.length - 1] : null });
  }
  return items;
}

/** File numbers an item names (title, report names, the start of its body). */
function itemFiles(item) {
  const hay = [item.title, ...item.docs.map(d => d.name), item.body.slice(0, 600)].join(' ');
  return [...new Set((hay.match(FILE_RE) || []).map(s => s.replace(/\s+/g, ' ').trim().toUpperCase()))];
}

module.exports = { FILE_RE, parseItems, itemFiles, fileKeys, text };
