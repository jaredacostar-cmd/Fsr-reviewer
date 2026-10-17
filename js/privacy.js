/* People's names out of the council text (PeelPrivacy). The council and committee agendas and
 * minutes name staff, councillors, residents, delegations, letter writers and individual owners.
 * The app keeps none of them: scrubPeople() takes the names out and keeps the role ("Councillor",
 * "Resident", "Development Planner"), so the item still reads. It runs when the council data is built
 * (scripts/build-council.js), was run once over the stored data, and runs again on what History shows.
 *
 * Pure (tests/privacy.test.js). A pattern scrub: it finds names by what surrounds them (a title, a
 * role after a comma, "from" / "by", a speaking verb, "Owner:"), so a firm named after a person
 * (for example a planning consultant) keeps its name.
 */
(function (root) {
  'use strict';
  const T = "[A-Z][a-z'’\\-]+(?:[A-Z][a-z'’\\-]+)?";              // a capitalized word (McFadden)
  const I = '[A-Z]\\.';                                            // an initial
  // Words that start a sentence or a clause, never a name.
  const STOP = 'That|The|This|These|Those|Seconded|Moved|Whereas|WHEREAS|And|Or|To|Of|In|On|For|At|By|From|With|Recommendation|Item|Items|Carried|Lost|File|Files|Re|Regarding|Staff|Committee|Council|City|Region|Regional|Planning|Members|Member|Ward|Mayor|Councillor|Deputy|Chair|Director|Commissioner|Development|Application|Applications|Report|Correspondence|Delegation|Presentation|Petition|No|Yes|All|Approved|Received|Referred|Deferred|Resident|Residents|Brampton|Mississauga|Caledon|Peel|Ontario|Toronto|See|Note|Notes|Public|Meeting|Motion|Members|Owner|Owners|Agent|Applicant';
  // After the first word, only clause words stop a name (a surname can be Ward or Park).
  const STOP2 = 'That|The|This|These|Seconded|Moved|Whereas|WHEREAS|And|Or|To|Of|In|On|For|At|By|From|With|Item|Items|File|Files|Re|Regarding|See|Recommendation|Carried|Lost|Brampton|Mississauga|Caledon|Resident|Residents';
  const W = `(?!(?:${STOP})\\b)${T}`;                              // a name's first word: not a stop word
  const W2 = `(?!(?:${STOP2})\\b)${T}`;                            // its later words
  const NAME = `(?:(?:${I}\\s?)+${W2}|${W}(?:\\s(?:${I}|${W2})){1,3})`; // J. Kovac · Anna Wynveen · Teresa Ward · Cahn Huy Ha
  const NAME1 = `(?:(?:${I}\\s?)*${W}(?:\\s${W2})?)`;            // after a title one word is enough (Mayor Crombie)
  const NAMES = `${NAME}(?:(?:,\\s+|\\s+(?:and|&|or)\\s+)${NAME})*`; // several, "A, B and C" / "A or B"
  const TITLE = "(?:Regional |City |Deputy |Acting )?(?:Coun\\w{0,3}llor|Mayor|Chair|Vice[- ]Chair|Commissioner)s?";
  const ROLE = "(?:[A-Z][a-z]+ )?(?:[Rr]esident|VP|SVP|AVP|Planner|Director|President|Vice|Lawyer|Counsel|Solicitor|Manager|Agent|Principal|Partner|Associate|Consultant|Architect|Engineer|Owner|Chair|Member|Coordinator|Supervisor|Commissioner|Advisor|Adviser|Analyst|Officer|Senior|Legal|Development|Planning|Representative|Executive|Founder|CEO|Chief|Head|Lead|Specialist|Technician|Clerk|Treasurer|Secretary|Volunteer|Homeowner|Ratepayer)";
  const VERB = '(?:provided|spoke|expressed|enquired|inquired|presented|asked|noted|responded|indicated|advised|requested|stated|explained|commented|addressed|outlined|answered|thanked|raised|declared|appeared|submitted|delegated|discussed|confirmed|clarified|reviewed)';
  const COMPANY = /\b(?:Inc|Ltd|Limited|Corp|Corporation|LLP|LP|GP|Group|Holdings|Developments?|Homes|Properties|Investments|Realty|Management|Partners|Company|Companies|Co|Trust|Church|Association|Board|Region|City|Town|Canada|Ontario|Construction|Consulting|Capital|Builders|Enterprises|Ventures|Estates|Communities|Lands?|Centre|Center|Society|Foundation|School|University|Hospital|Mattamy|Planning|Architects?|Engineering|Law|Legal|Incorporated|Developer|Bank|Hydro|Railway)\b\.?/;
  const STREET = /\b(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Parkway|Pkwy|Lane|Line|Way|Court|Crt|Crescent|Cres|Place|Trail|Circle|Gate|Square|Terrace|Highway|Hwy|Sideroad|Ward|Plan|Plans|By-law|Zoning|Subdivision|Amend|Application|Recommendation|Committee|Report|Item|Secondary|Block|Phase|North|South|East|West|Village|Park|Heights|Valley|Creek|Centre)\b/;

  const ROLE_START = new RegExp(`^${ROLE}`);   // a role run into a list of names ("…, Strategic Leader")
  // A road is not a person ("East of Airport Road, South of …").
  const ROADS = /\b(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Parkway|Pkwy|Lane|Way|Court|Crt|Crescent|Cres|Place|Trail|Circle|Gate|Square|Terrace|Highway|Hwy|Sideroad|Line)\b\.?/;
  const rx = (s, f = 'g') => new RegExp(s, f);
  const R_TITLE = rx(`\\b(${TITLE})\\s+${NAME1}(?:(?:,\\s+|\\s+(?:and|&)\\s+)${NAME1})*(?=[\\s,.;:)]|$)`);
  // "Mr Law", "Dr. A. Singh" (with whatever name runs into it: "Ka Yipng Tor Mr Law")
  const R_HON = rx(`(?:${T}\\s+){0,3}\\b(?:Mr|Mrs|Ms|Miss|Dr)\\.?\\s+${NAME1}`);
  const R_FROMBY = rx(`\\b((?:Delegations?|Correspondence|Presentations?|Petitions?|Submissions?|Letters?|Reports?|Memos?|Memorandum|Comments?|Emails?|presentation|report|letter|petition|delegation|correspondence)(?:\\s+\\w+){0,2}?\\s+(?:initiated\\s+)?(?:from|by))\\s+(${NAMES})(?=\\s*[,.(]|\\s+(?:re\\b|regarding|dated|and\\b)|\\s*$)`);
  const R_ROLE = rx(`(^|[\\s(;:.\\-–])(${NAMES}),\\s+()(?=${ROLE})`);
  // (then with a firm between: "Samir Shah, Credit Valley Residents Association, Brampton Resident")
  const R_ROLE_ORG = rx(`(^|[\\s(;:.\\-–])(${NAMES}),\\s+([A-Z][\\w&.'’\\- ]{2,50}?,\\s+)(?=${ROLE})`);
  const R_VERB = rx(`(^|[\\s(;:.])(${NAMES})(,\\s+[A-Z][\\w&.'’\\- ]{2,40}?)?,?\\s+(?=${VERB}\\b)`);
  // A match that runs into a firm ("Heritage Board Sylvia Roberts"): the firm stays, the name after it goes.
  const split = who => { const w = who.split(/\s+/); let i = -1; w.forEach((x, j) => { if (COMPANY.test(x)) i = j; }); return i < 0 ? { firm: '', person: who } : { firm: w.slice(0, i + 1).join(' '), person: w.slice(i + 1).join(' ') }; };
  // Of a matched run ("Robert Walters, Weston Consulting"), what stays: the firms. null: nothing to take out.
  const cut = who => {
    let took = false;
    const kept = who.split(/,\s+|\s+(?:and|&|or)\s+/).map(part => {
      const s = split(part);
      if (!s.firm) { if (ROADS.test(part) || ROLE_START.test(part)) return part; took = true; return ''; }
      if (s.person.split(/\s+/).length >= 2) { took = true; return s.firm; }
      return part;
    }).filter(Boolean);
    return took ? kept.join(', ') : null;
  };
  const R_OWNER = rx(`\\b(Owners?:|c\\/o|C\\/O)\\s+(${NAME})(?=[\\s,.;)]|$)`);

  function scrubPeople(s) {
    if (typeof s !== 'string' || !s) return s;
    let t = s;
    t = t.replace(R_TITLE, '$1');
    t = t.replace(R_HON, '');
    // (a firm keeps its name: "Correspondence from Davies Howe LLP")
    t = t.replace(R_FROMBY, (m, k, who) => { const c = cut(who); return c == null ? m : `${k}${c ? ` ${c}` : ''}`; });
    for (const R of [R_ROLE, R_ROLE_ORG]) t = t.replace(R, (m, pre, who, org) => { const c = cut(who); return c == null ? m : `${pre}${c ? `${c}, ` : ''}${org || ''}`; });
    t = t.replace(R_VERB, (m, pre, who, org) => { const c = cut(who); return c == null ? m : `${pre}${c ? `${c} ` : ''}${org ? org.replace(/^,\s+/, '') : c ? '' : 'A speaker'} `; });
    t = t.replace(R_OWNER, (m, k, who) => (COMPANY.test(who) ? m : `${k} an individual`));
    // An applicant listed by name between dashes, beside a company: "– Candevcon Limited – Navjot Brar –".
    if (/\s?[–-]\s/.test(t)) {
      const parts = t.split(/(\s?[–-]\s)/);
      if (parts.some(p => COMPANY.test(p))) {
        t = parts.map(p => (/^\s?[A-Z][a-z'’\-]+(?:\s[A-Z][a-z'’\-]+){1,2}\s?$/.test(p) && !COMPANY.test(p) && !STREET.test(p) && !/\d/.test(p) ? 'an individual' : p)).join('');
      }
    }
    // Tidy what a removed name leaves behind.
    return t.replace(/\b(from|by)\s*,\s*/g, '$1 ').replace(/\s+by(?=\.pdf\b)/gi, '')
      .replace(rx(`\\b(from|by) (?!the\\b|a\\b|an\\b)(?=${ROLE}\\b)`), '$1 a ').replace(/\b(from|by)\s+(?=[.(]|re\b|dated\b|$)/g, '').replace(/,\s*,/g, ',').replace(/\.,/g, '.').replace(/\(\s*,\s*/g, '(').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  }
  // A document named after its writer ("Parin Patel, August 21, 2021 - OZS-2021-0025.pdf"): it reads
  // "Correspondence" and keeps its date and file.
  const R_DOCNAME = rx(`^${NAMES}(?=\\s*(?:,|-|–|\\.pdf$|$))`, '');
  const docName = n => scrubPeople(String(n || '').replace(R_DOCNAME, m => (COMPANY.test(m) ? m : 'Correspondence')));
  // The council data (data/council.json): every item's title, text and document names.
  function scrubCouncil(data) {
    for (const m of Object.values((data && data.meetings) || {})) {
      for (const it of m.items || []) {
        it.title = scrubPeople(it.title);
        it.text = scrubPeople(it.text);
        it.docs = (it.docs || []).map(([id, name]) => [id, docName(name)]);
      }
    }
    return data;
  }
  // A string still names someone when scrubbing it would change it (scrubbed text is left as is).
  const hasPeople = s => typeof s === 'string' && scrubPeople(s) !== s;

  const api = { scrubPeople, scrubCouncil, hasPeople };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelPrivacy = api;
})(typeof window !== 'undefined' ? window : globalThis);
