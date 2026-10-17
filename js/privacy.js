/* No one's name, contact or internal note from any source (PeelPrivacy).
 *
 * The project rule: never store or show people's names, contacts, contractors or internal notes
 * from any source. Public agencies (the Region, the cities and towns, the Province, conservation
 * authorities, school boards) stay. Everything here is pure (tests/privacy.test.js) and runs where
 * the data is built (scripts/build-*.js) and, for live records, where the app reads a source
 * (js/phases.js normalizeRecord, js/dev-detail.js / js/devtab.js recordRows).
 *
 *   scrubPeople(s)       council agenda / minutes text and titles: names out, the role stays
 *                        ("Councillor", "Resident", "Development Planner"), so the item still reads;
 *                        a named owner / applicant / agent reads "the owner" / "the applicant" /
 *                        "the agent", and a "c/o …" party is dropped.
 *   docName(n)           a council document's name, by an allowlist: only planning-document words,
 *                        numbers, dates, item numbers and file references stay (no writer, no firm).
 *   scrubDescription(s)  a development record's description: no e-mail, phone number, named person,
 *                        builder / contractor / consultant, nor a staff note ("cancelled per …",
 *                        refunds, "see email", "**…**" admin notes). Conditions and unit details stay.
 *   safeProps(p, drop)   a source record's raw attributes without the people / contact / note fields.
 *   fsrTitle(t)          a servicing report's title without the consultant who prepared it.
 *   isContactList(l)     an EA appendix that is a contact / mailing list (not published).
 *   givenNameHits(s)     the backstop: "<common given name> <Surname>" left in a string.
 */
(function (root) {
  'use strict';
  const UP = 'A-ZÀ-ÖØ-Þ', LO = "a-zß-öø-ÿ'’\\-‑";
  const T = `[${UP}][${LO}]+(?:[${UP}][${LO}]+)?`;                 // a capitalized word (MacDoe, Doe‑Roe)
  const I = `[${UP}]\\.`;                                          // an initial
  // Words that start a sentence or a clause, never a name.
  const STOP = 'That|The|This|These|Those|Seconded|Moved|Whereas|WHEREAS|And|Or|To|Of|In|On|For|At|By|From|With|Recommendation|Item|Items|Carried|Lost|File|Files|Re|Regarding|Staff|Committee|Council|City|Region|Regional|Planning|Members|Member|Ward|Mayor|Councillor|Deputy|Chair|Director|Commissioner|Development|Application|Applications|Report|Correspondence|Delegation|Presentation|Petition|No|Yes|All|Approved|Received|Referred|Deferred|Resident|Residents|Brampton|Mississauga|Caledon|Peel|Ontario|Toronto|See|Note|Notes|Public|Meeting|Motion|Members|Owner|Owners|Agent|Applicant';
  // After the first word, only clause words stop a name (a surname can be Ward or Park).
  const STOP2 = 'That|The|This|These|Seconded|Moved|Whereas|WHEREAS|And|Or|To|Of|In|On|For|At|By|From|With|Item|Items|File|Files|Re|Regarding|See|Recommendation|Carried|Lost|Brampton|Mississauga|Caledon|Resident|Residents';
  const W = `(?!(?:${STOP})\\b)${T}`;                              // a name's first word: not a stop word
  const W2 = `(?!(?:${STOP2})\\b)${T}`;                            // its later words
  // J. Doe · Jane Doe · Jane Ward · Jane Mary Doe · Jane (Janie) Doe
  const NAME = `(?:(?:${I}\\s?)+${W2}|${W}\\s\\(${T}\\)\\s${W2}|${W}(?:\\s(?:${I}|${W2})){1,3})`;
  const NAME1 = `(?:(?:${I}\\s?)*${W}(?:\\s${W2})?)`;            // after a title one word is enough (Mayor Doe)
  const NAMES = `${NAME}(?:(?:,\\s+|\\s+(?:and|&|or)\\s+)${NAME})*`; // several, "A, B and C" / "A or B"
  const TITLE = "(?:Regional |City |Deputy |Acting )?(?:Coun\\w{0,3}llor|Mayor|Chair|Vice[- ]Chair|Commissioner|Minister|MPP|MP)s?";
  const ROLE = "(?:[A-Z][a-z]+ )?(?:[Rr]esident|VP|SVP|AVP|Planner|Director|President|Vice|Lawyer|Counsel|Solicitor|Manager|Agent|Principal|Partner|Associate|Consultant|Architect|Engineer|Owner|Chair|Member|Coordinator|Supervisor|Commissioner|Advisor|Adviser|Analyst|Officer|Senior|Legal|Development|Planning|Representative|Executive|Founder|CEO|Chief|Head|Lead|Specialist|Technician|Clerk|Treasurer|Secretary|Volunteer|Homeowner|Ratepayer)";
  const VERB = '(?:provided|spoke|expressed|enquired|inquired|presented|asked|noted|responded|indicated|advised|requested|stated|explained|commented|addressed|outlined|answered|thanked|raised|declared|appeared|submitted|delegated|discussed|confirmed|clarified|reviewed|highlighted|acknowledged|withdrew)';
  const COMPANY_W = 'Inc|Ltd|Limited|Corp|Corporation|LLP|LP|GP|ULC|Group|Holdings|Developments?|Developers?|Homes|Properties|Investments|Realty|Management|Partners|Partnership|Company|Companies|Co|Trust|Church|Association|Board|Region|City|Town|Canada|Ontario|Construction|Consulting|Consultants|Capital|Builders|Enterprises|Ventures|Estates|Communities|Lands?|Centre|Center|Society|Foundation|School|University|Hospital|Mattamy|Planning|Architects?|Architecture|Engineering|Law|Legal|Incorporated|Developer|Bank|Hydro|Railway|REIT|Equities|Services|Solutions|Strategies|Design';
  const COMPANY = new RegExp(`\\b(?:${COMPANY_W})\\b\\.?`);
  const STREET = /\b(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Parkway|Pkwy|Lane|Line|Way|Court|Crt|Crescent|Cres|Place|Trail|Circle|Gate|Square|Terrace|Highway|Hwy|Sideroad|Ward|Plan|Plans|By-law|Zoning|Subdivision|Amend|Application|Recommendation|Committee|Report|Item|Secondary|Block|Phase|North|South|East|West|Village|Park|Heights|Valley|Creek|Centre)\b/;

  const ROLE_START = new RegExp(`^${ROLE}`);   // a role run into a list of names ("…, Strategic Leader")
  // A road is not a person ("East of Airport Road, South of …").
  const ROADS = /\b(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Parkway|Pkwy|Lane|Way|Court|Crt|Crescent|Cres|Place|Trail|Circle|Gate|Square|Terrace|Highway|Hwy|Sideroad|Line)\b\.?/;
  const rx = (s, f = 'g') => new RegExp(s, f);
  const R_TITLE = rx(`\\b(${TITLE})\\s+${NAME1}(?:(?:,\\s+|\\s+(?:and|&)\\s+)${NAME1})*(?=[\\s,.;:)]|$)`);
  // "Mr Roe", "Dr. A. Doe" (with whatever name runs into it: "Jane Doe Mr Roe"). "Dr" after a
  // capitalized word is a Drive ("Railside Dr. and"), and Mr. Lube is a business.
  const R_HON = rx(`(?:${T}\\s+){0,3}\\b(?:Mr|Mrs|Ms|Miss|Mx)\\.?\\s+(?!Lube\\b)${NAME1}|(?<![${UP}][${LO}]*\\s)\\bDr\\.?\\s+${NAME1}`);
  const R_FROMBY = rx(`\\b((?:Delegations?|Correspondence|Presentations?|Petitions?|Submissions?|Letters?|Reports?|Memos?|Memorandum|Comments?|Emails?|presentation|report|letter|petition|delegation|correspondence)(?:\\s+\\w+){0,2}?\\s+(?:initiated\\s+)?(?:from|by))\\s+(${NAMES})(?=\\s*[,.(]|\\s+(?:re\\b|regarding|dated|and\\b)|\\s*$)`);
  const R_ROLE = rx(`(^|[\\s(;:.\\-–])(${NAMES}),\\s+()(?=${ROLE})`);
  // (then with a firm between: "Jane Doe, Credit Valley Residents Association, Brampton Resident")
  const R_ROLE_ORG = rx(`(^|[\\s(;:.\\-–])(${NAMES}),\\s+([A-Z][\\w&.'’\\- ]{2,50}?,\\s+)(?=${ROLE})`);
  const R_VERB = rx(`(^|[\\s(;:.])(${NAMES})(,\\s+[A-Z][\\w&.'’\\- ]{2,40}?)?,?\\s+(?=${VERB}\\b)`);
  // "Jane Doe, Doe Consulting Ltd. and …": a person, then the firm they speak for (the firm stays).
  const FIRM_W = 'Inc|Ltd|Limited|Corp|Corporation|LLP|ULC|Associates|Consulting|Consultants|Planning|Group|Partners|Architects?|Architecture|Engineering|Law|Design|Homes|Developments?|Holdings|Properties|Realty|Management|Strategies|Solutions|Services';
  const R_PERSON_FIRM = rx(`(^|[\\s(;:.\\-–])(${NAME}),\\s+(?:of\\s+)?(?=(?:[A-Z][\\w&.'’\\-]*\\s){0,4}(?:${FIRM_W})\\b)`);
  // "Delegation Jane Doe" / "Delegation - Jane Doe" (no "from").
  const R_DELEG = rx(`\\b(Delegations?|Deputations?|Correspondence|Petition)(\\s*[-–:]\\s*|\\s+)(${NAMES})(?=\\s*(?:[,.(;]|[-–]\\s|re\\b|regarding\\b|dated\\b|$))`);
  // A match that runs into a firm ("Heritage Board Jane Doe"): the firm stays, the name after it goes.
  const split = who => { const w = who.split(/\s+/); let i = -1; w.forEach((x, j) => { if (COMPANY.test(x)) i = j; }); return i < 0 ? { firm: '', person: who } : { firm: w.slice(0, i + 1).join(' '), person: w.slice(i + 1).join(' ') }; };
  // Of a matched run ("Jane Doe, Doe Consulting"), what stays: the firms. null: nothing to take out.
  const cut = who => {
    let took = false;
    const kept = who.split(/,\s+|\s+(?:and|&|or)\s+/).map(part => {
      const s = split(part);
      if (!s.firm) {
        // An address run into a name ("1 Example Road Jane Doe, Planner"): the road stays.
        const road = new RegExp(`^(.*${ROADS.source})\\s+(\\S+(?:\\s\\S+)+)$`).exec(part);
        if (road && !ROADS.test(road[2]) && !ROLE_START.test(road[2])) { took = true; return road[1]; }
        if (ROADS.test(part) || ROLE_START.test(part)) return part;
        took = true; return '';
      }
      if (s.person.split(/\s+/).length >= 2) { took = true; return s.firm; }
      return part;
    }).filter(Boolean);
    return took ? kept.join(', ') : null;
  };

  // ---- Named parties: "Owner: …", "Applicant: …", "Agent: …", "c/o …" ------------------------
  // The party runs to the file number, the ward, the address or the next clause.
  const STREET_SUFFIX = 'Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Parkway|Pkwy|Lane|Ln|Way|Court|Crt|Ct|Crescent|Cres|Place|Pl|Trail|Circle|Gate|Square|Terrace|Highway|Hwy|Sideroad|Line|Gardens|Mews|Common|Path|Grove|Close';
  const PARTY_END = new RegExp([
    `\\s+(?=(?:City\\s+)?Files?\\b|F\\s?ile\\s?s?\\b|Ward\\b|Address\\b|RECOMMENDATION\\b|RESOLUTION\\b|Pre-Bill\\b|Bill\\s+\\d|be\\s+(?:approved|received|adopted|refused|referred|considered|endorsed|deferred)\\b|to\\s+(?:the\\s+Planning|amend|change|permit|remove|maintain|add|allow)\\b|re:|regarding\\b|on\\s+behalf\\b|is\\s+the\\b|has\\s+been\\b|and\\s+(?:the|that)\\b|(?:Development\\s+)?Planner\\b|Councillor\\b)`,
    '\\s*[,;–—]\\s*', '\\s+-\\s*', '-\\s+', '\\s*\\(\\s*(?:City\\s+)?File',
    `(?<=[A-Za-z.)])(?=\\d+(?:[-–]\\d+)?(?:,|\\s+(?:and|&)\\s+\\d|\\s+(?:[A-Z][a-z]+\\s+){1,3}(?:${STREET_SUFFIX})\\b))`,
    `\\s+(?=\\d+(?:[-–]\\d+)?(?:,\\s*\\d|\\s+(?:and|&)\\s+\\d|\\s+(?:The\\s+)?(?:[A-Z][a-z]+\\s+){1,3}(?:${STREET_SUFFIX})\\b))`,
    '(?<=[a-z]{4})\\.\\s+(?=[A-Z][a-z])(?!Files?\\b)', '$',
  ].join('|'));
  const R_PARTY = /\b(Owners?|Applicants?|Agents?)\s*:\s*/g;
  const R_CO = /\s*\(\s*(?:c\/o|C\/O)\s+[^)]*\)|\s*\b(?:c\/o|C\/O)\s+/g;
  const ROLE_OF = { owner: 'the owner', owners: 'the owners', applicant: 'the applicant', applicants: 'the applicants', agent: 'the agent', agents: 'the agents' };
  function partyEnd(s, from) {
    // A numbered company starts with its number ("2421845 Ontario Inc."): not an address.
    const lead = /^\d+\s+(?:Ontario|Canada)\b[^,;–]*?\b(?:Inc|Ltd|Limited|Corp|Corporation|ULC)\b\.?/.exec(s.slice(from));
    const at = from + (lead ? lead[0].length : 0);
    const rest = s.slice(at);
    const m = PARTY_END.exec(rest);
    let end = at + (m ? m.index : rest.length);
    // A bracket opened in the party closes in it ("Doe Developments Limited (Doe Homes)"); one
    // closing what came before ends it ("(… c/o Doe Inc.)").
    let depth = 0;
    for (let i = from; i < end; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') { if (!depth) { end = i; break; } depth--; }
    }
    if (depth > 0) { const close = s.indexOf(')', end); if (close > 0 && close - end < 60) end = close + 1; }
    // "… Inc." keeps its full stop.
    if (s[end] === '.' && /\b(?:Inc|Ltd|Corp|Co|Bros|Assoc)$/.test(s.slice(from, end))) end++;
    return end;
  }
  function scrubParties(t) {
    let out = '', last = 0, m;
    R_PARTY.lastIndex = 0;
    while ((m = R_PARTY.exec(t))) {
      let end = partyEnd(t, m.index + m[0].length);
      // A list of parties: "Owner: Doe Inc., and Roe Corporation File: …".
      for (let more; (more = /^,?\s+(?:and|&)\s+(?=[A-Z0-9])/.exec(t.slice(end)));) end = partyEnd(t, end + more[0].length);
      const party = t.slice(m.index + m[0].length, end).trim();
      if (!party || /^the (owner|applicant|agent)s?\b/.test(party) || /^(?:Item|File|Ward)\b/.test(party)) continue;
      out += `${t.slice(last, m.index)}${m[1]}: ${ROLE_OF[m[1].toLowerCase()]}`;
      last = end; R_PARTY.lastIndex = Math.max(end, R_PARTY.lastIndex);
    }
    t = out + t.slice(last);
    // "… under File OZ 25-15 W8, Jane Doe, 1 Main Street": the party named after the file reads "the owner".
    out = ''; last = 0;
    const R_UNDER = /\bunder\s+(?:F\s?ile\s?s?|Files?)\s+(?=[^,]{0,80}\d)[^,]{2,80}?,\s+(?!the owner\b|be\b|to\b|and\b|as\b|which\b|that\b)(?=[A-Z0-9])/g;
    while ((m = R_UNDER.exec(t))) {
      const from = m.index + m[0].length, end = partyEnd(t, from);
      const party = t.slice(from, end);
      // An address, not a party: it starts with its civic number and names no firm.
      if (!party.trim() || /\bbe\b/.test(party) || (/^\d/.test(party) && !/^\d+\s+(?:Ontario|Canada)\b/.test(party) && !COMPANY.test(party))) continue;
      out += `${t.slice(last, from)}the owner`; last = end; R_UNDER.lastIndex = Math.max(end, R_UNDER.lastIndex);
    }
    t = out + t.slice(last);
    // "… c/o Jane Doe, 1 Main Street": the party in someone's care is dropped.
    let res = ''; last = 0;
    R_CO.lastIndex = 0;
    while ((m = R_CO.exec(t))) {
      if (m[0].trim().startsWith('(')) { res += t.slice(last, m.index); last = m.index + m[0].length; continue; }
      const end = partyEnd(t, m.index + m[0].length);
      res += t.slice(last, m.index); last = end; R_CO.lastIndex = Math.max(end, R_CO.lastIndex);
    }
    return res + t.slice(last);
  }
  // "Agreement between Jane Doe and John Doe": the parties who are people read "the owner".
  const R_BETWEEN = rx(`\\b(between)\\s+(${NAME}(?:\\s+(?:and|&)\\s+${NAME})?)(?=\\s+(?:and|&)\\s+(?:the\\s+)?(?:Corporation|City|Town|Region|Regional|The)\\b|,|\\s*$)`);

  // ---- The backstop: a common given name followed by a surname ---------------------------------
  const GIVEN = 'James John Robert Michael William David Richard Joseph Thomas Charles Christopher Daniel Matthew Anthony Donald Steven Paul Andrew Joshua Kenneth Kevin Brian George Timothy Ronald Edward Jason Jeffrey Ryan Jacob Gary Nicholas Eric Jonathan Stephen Larry Justin Scott Brandon Benjamin Samuel Gregory Alexander Frank Patrick Raymond Jack Dennis Jerry Tyler Aaron Jose Adam Nathan Henry Douglas Zachary Peter Kyle Walter Ethan Jeremy Harold Keith Christian Roger Noah Gerald Carl Terry Sean Austin Arthur Lawrence Jesse Dylan Bryan Joe Jordan Billy Bruce Albert Willie Gabriel Logan Alan Juan Wayne Roy Ralph Randy Eugene Vincent Russell Elijah Louis Bobby Philip Johnny Mary Patricia Jennifer Linda Elizabeth Barbara Susan Jessica Sarah Karen Nancy Lisa Betty Margaret Sandra Ashley Kimberly Emily Donna Michelle Dorothy Carol Amanda Melissa Deborah Stephanie Rebecca Sharon Laura Cynthia Kathleen Amy Shirley Angela Helen Anna Brenda Pamela Nicole Emma Samantha Katherine Christine Debra Rachel Catherine Carolyn Janet Ruth Maria Heather Diane Virginia Julie Joyce Olivia Kelly Christina Lauren Joan Evelyn Judith Megan Cheryl Andrea Hannah Martha Jacqueline Frances Gloria Ann Teresa Kathryn Sara Janice Jean Alice Madison Doris Abigail Julia Judy Denise Amber Marilyn Beverly Danielle Theresa Sophia Marie Diana Brittany Natalie Isabella Charlotte Alexis Kayla Mike Dave Steve Jim Bob Tom Chris Nick Rob Greg Ron Ken Jeff Tony Dan Matt Sam Ben Sue Jill Gurpreet Harpreet Amanjot Manpreet Navdeep Sukhwinder Rajinder Parminder Jaspreet Simran Amrit Ravi Raj Sanjay Amit Rahul Vikram Anil Sunil Ashok Deepak Rohit Mohammed Mohamed Ahmed Ali Omar Hassan Fatima Ayesha Priya Neha Pooja Arjun Nirmal Jaswinder Harjit Balwinder Kulwinder Gurinder Jasbir Satnam Navjot Sandeep Kuldeep Mandeep Ramesh Suresh Kamal Faisal Imran Tariq Nadia Sana Ian Colin Derek Graham Neil Glenn Craig Marc Luc Pierre Francois Claude Andre Mario Luigi Marco Giovanni Antonio Franco Carlo Angelo Enzo Vito Rocco Domenic Dominic Sergio Fernando Carlos Manuel Pedro Luis Miguel Ricardo Jorge Wei Ming Eddie Lynn Leslie Dana Kerri Kristin Krista Tracy Tara Tina Wendy Sheila Yvonne Lorraine Colleen Maureen Eileen Bonnie Carmen Elena Sonia Monica Veronica Gina Lori Shannon Jenna Kara Cara Leah Allison Alison Natasha Tanya Vanessa Jasmine Melanie Joanne Johanna Marlene Elaine Irene Gail Gwen Jane Kate Kathy Kristen Rick Doug Gord Gordon Stuart Stewart Trevor Darren Shawn Shane Todd Troy Murray Allan Allen Hugh Angus Duncan Malcolm Fraser Harvey Howard Jay Joel Leo Martin Morgan Oliver Owen Rod Rodney Roland Simon Stan Victor Warren Adrian Jared Blair Cameron Curtis Dale Darryl Earl Gerry Harry Ivan Jerome Karl Lance Lloyd Marvin Nelson Norman Phil Randall Rex Ricky Rudy Wade Wesley Mark Rose Grace Glen Dean Clark Ross Reid Ray Lou Pat Don Max Bill Victoria Erin Kim Li Chen Hong Jun Jean-Pierre'.split(' ');
  // Second words that make it a place, a street, a facility or a firm, not a person.
  const NOT_SURNAME = /^(?:Road|Street|Drive|Avenue|Parkway|Boulevard|Park|Place|Court|Crescent|Line|Way|Trail|Lane|Square|Gate|Circle|Terrace|Homes|Developments?|Holdings|Investments|Group|Inc|Ltd|Limited|School|Secondary|Public|Catholic|Elementary|Hospital|Church|Centre|Center|Village|Hall|Island|Creek|Valley|Heights|Lake|Bay|Hill|Hills|Forest|Woods|Grove|Gardens|Estates|Mills|Farm|Station|Parish|Mall|Plaza|Commons|Tower|Towers|Manor|House|Rd|St|Dr|Ave|Blvd|Pkwy|Cres|Corridor|Bridge|Promenade|Common|North|South|East|West|Trunk|Sewer|Watermain|Pumping|Reservoir|Treatment|Subdivision|Lands|Phase|Block|Precinct|Plan|Area|Expressway|Highway|Sideroad|Medical|Arena|Library|Pool|Community|Recreation|Middle|Academy|College|University|Mews|Walk|Green|Glen|Ridge|Point|Landing|Harbour|Shores|Pond|River|Lodge|Ventures|Construction|Consulting|Associates|Planning|Properties|Realty|Capital|Corporation|Corp|Building|Partners|Booth|Kennedy|Erin|Eden|Abbey|Meadows?|Oaks?|Pines?|Chase|Run|Crossing|Boulevard|Gore|Heritage|Business|Industrial|Employment|Secondary|Plaza|Market|Square|Theatre|Arts|Museum|Elementary|Junior|Senior|Memorial|Conservation|Wood|Woodlot|Tract|Natural|Wetland|Valleylands|Floodplain|Collegiate|High|Avenues|Streets|Roads|Drives|Park(?:way)?s?|Bill|Act|Report|Amendment|Application|Mattamy|Canada|Ontario|Region|Regional|City|Town|Inlet|Junction|Terminal|Yard|Depot|Sports|Soccer|Cricket|Baseball|Golf|Club|Country|Casino|Hotel|Inn|Restaurant|Cafe|Bar|Grill|Pizza|Burger|Lube|Tire|Gas|Petroleum|Motors?|Auto|Dental|Clinic|Pharmacy|Daycare|Montessori|Retirement|Residence|Care|Nursing|Seniors?|Apartments?|Condominiums?|Lofts?|Suites?|Mission|Temple|Mosque|Gurdwara|Mandir|Synagogue|Cathedral|Chapel|Cemetery|Funeral|Rotary|Legion|Lions|Kiwanis|Elections?|Foundation|Charity|Society|Institute|Council|Committee|Board|Agency|Authority|Commission|Ministry|Department|Division|Branch|Office|Services|Service|Zone|Zones|Line|Lines|Units?)$/;
  // A word after the pair that makes it a place or a firm ("Glen Erin Drive", "Jane Doe & Associates").
  const NOT_PERSON_AFTER = /^\s*(?:[-–]\s*)?(?:Road|Rd|Street|St|Drive|Dr|Avenue|Ave|Park|Pkwy|Parkway|Blvd|Boulevard|Trail|Way|Crescent|Cres|Court|Crt|Circle|Line|Lane|Gate|Place|Square|Sideroad|Highway|Hwy|Homes|Developments?|Holdings|Investments|Group|Inc|Ltd|Limited|Corp|School|Secondary|Public|Catholic|Elementary|Community|Pumping|Water|WTP|Centre|Creek|Valley|Village|Heights|Estates|Gardens|Mills|Station|Plaza|Mall|Hospital|Library|Arena|Pool|Church|Park|and Associates|& Associates|Associates|Architects?|Planning|Consulting|Engineering|Law|LLP|Partners|Properties|Realty|Construction|Capital|Ventures|Lands)\b/;
  const R_GIVEN = rx(`(?<![\\w&])(${GIVEN.join('|')})\\s(?:${I}\\s)?(${T})(?:\\s(${T}))?(?![\\w‑])`);
  /** "<given name> <Surname>" runs left in a string (a street, a facility or a firm is not one). */
  function givenNameHits(s) {
    const out = [];
    if (typeof s !== 'string' || !s) return out;
    for (const m of s.matchAll(R_GIVEN)) {
      if (NOT_SURNAME.test(m[2]) || (m[3] && NOT_SURNAME.test(m[3]))) continue;
      const after = s.slice(m.index + m[0].length, m.index + m[0].length + 30);
      if (NOT_PERSON_AFTER.test(after)) continue;
      // Part of a firm's name: "Jane Doe and Associates", "Doe Jane LLP", "c/o … Inc."
      if (/^\s*(?:&|and)\s+[A-Z][a-z]+\s+(?:Associates|Partners|Inc|Ltd|LLP)\b/.test(after)) continue;
      if (/^(?:,?\s*(?:[A-Z][\w&.'’]*\s){0,3})(?:Inc|Ltd|Limited|Corp|Corporation|LLP|ULC)\b/.test(after) && !/^,/.test(after)) continue;
      out.push({ index: m.index, length: m[0].length, text: m[0] });
    }
    return out;
  }
  const R_NAMED_FIRM = rx(`(?<![\\w&])(?:${GIVEN.join('|')})\\s(?:${I}\\s)?${T}\\s(?:and|&)\\s(?:Associates|Partners)\\b(?:\\s(?:Inc|Ltd|Limited|LLP)\\b\\.?)?(?:\\s\\((?:[A-Z]{2,6})\\))?`);
  // Replace each hit with a role (an individual), from the right so the indices hold.
  function replaceGiven(s, by = 'an individual') {
    const hits = givenNameHits(s);
    for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; s = s.slice(0, h.index) + by + s.slice(h.index + h.length); }
    return s;
  }

  function scrubPeople(s) {
    if (typeof s !== 'string' || !s) return s;
    let t = s;
    t = t.replace(R_TITLE, '$1');
    t = t.replace(R_HON, '');
    // (a firm keeps its name: "Correspondence from Doe Howe LLP")
    t = t.replace(R_FROMBY, (m, k, who) => { const c = cut(who); return c == null ? m : `${k}${c ? ` ${c}` : ''}`; });
    t = t.replace(R_DELEG, (m, k, sep, who) => { const c = cut(who); return c == null ? m : `${k}${c ? `${sep}${c}` : ''}`; });
    for (const R of [R_ROLE, R_ROLE_ORG]) t = t.replace(R, (m, pre, who, org) => { const c = cut(who); return c == null ? m : `${pre}${c ? `${c}, ` : ''}${org || ''}`; });
    t = t.replace(R_VERB, (m, pre, who, org) => { const c = cut(who); return c == null ? m : `${pre}${c ? `${c} ` : ''}${org ? org.replace(/^,\s+/, '') : c ? '' : 'A speaker'} `; });
    t = t.replace(R_PERSON_FIRM, (m, pre, who) => (COMPANY.test(who) || ROADS.test(who) || ROLE_START.test(who) || who.split(/\s+/).some(x => DOC_WORDS.has(x.toLowerCase())) ? m : pre));
    t = t.replace(R_BETWEEN, (m, k, who) => { const c = cut(who); return c == null ? m : `${k} ${c || 'the owner'}`; });
    t = scrubParties(t);
    // An applicant listed by name between dashes, beside a company: "– Doe Limited – Jane Doe –".
    if (/\s?[–-]\s/.test(t)) {
      const parts = t.split(/(\s?[–-]\s)/);
      if (parts.some(p => COMPANY.test(p))) {
        t = parts.map(p => (/^\s?[A-Z][a-z'’\-]+(?:\s[A-Z][a-z'’\-]+){1,2}\s?$/.test(p) && !COMPANY.test(p) && !STREET.test(p) && !/\d/.test(p) ? 'an individual' : p)).join('');
      }
    }
    // A consultant's firm named after a person ("Jane Doe & Associates Inc."): a contractor, and a name.
    t = t.replace(R_NAMED_FIRM, (m, off, all) => (/(?:^|[.!?]\s+|^\W+)$/.test(all.slice(0, off)) ? 'The consultant' : 'the consultant'));
    // The backstop: any common given name with a surname still left.
    t = replaceGiven(t);
    // Tidy what a removed name leaves behind.
    return t.replace(/\b(from|by)\s*,\s*/g, '$1 ').replace(/\s+by(?=\.pdf\b)/gi, '')
      .replace(rx(`\\b(from|by) (?!the\\b|a\\b|an\\b)(?=${ROLE}\\b)`), '$1 a ').replace(/\b(from|by)\s+(?=[.(]|re\b|dated\b|$)/g, '').replace(/,\s*,/g, ',').replace(/(?<!\b(?:Inc|Ltd|Corp|Co|St|Rd|Dr|Ave|Blvd|Cres|Jr|Sr))\.,/g, '.').replace(/\(\s*,\s*/g, '(').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  }

  // ---- Council document names: an allowlist --------------------------------------------------
  const DOC_WORDS = new Set(`appendix appendices attachment attachments schedule schedules sch exhibit exhibits report reports staff
    recommendation recommendations rec recom recc info information presentation presentations correspondence letter letters memo memos
    memorandum minutes agenda notice notices map maps mapping plan plans concept concepts conceptual draft official zoning by-law by-laws bylaw
    bylaws law amendment amendments amend amended amending site subdivision subdivisions study studies analysis brief comments comment
    response responses matrix table tables figure figures drawing drawings elevation elevations rendering renderings survey surveys appraisal heritage
    traffic transportation servicing functional environmental planning justification urban design terms reference petition petitions
    delegation delegations deputation deputations request requests application applications applicant public meeting statutory secondary
    designation designations location aerial existing land use uses key supplementary detailed preliminary registered assumption
    initiation initiate initiated release rezoning proposed revised revision revisions updated update updates summary results circulation
    sustainability snapshot block blocks precinct phase phases lands context policy policies condition conditions agreement motion resolution
    council committee development community housing model models massing section sections view views photo photos photograph photographs
    streetview landscape grading noise shadow wind tree trees parking natural cultural archaeological assessment impact final approved approval
    part parts lot lots register overall general explanatory note notes form forms sheet sheets material materials supporting temporary
    temporarily holding removal symbol provision framework guidelines strategy area areas corridor station employment growth density height
    angular plane degree west east north south northwest northeast southwest southeast elevation context redacted resident residents
    ratepayers dated received addendum consolidation consolidated office consent variance minor tertiary designation record process
    timeline steps next options option current previous original future specific lot overview background inventory statistics chart
    charts image images questions answers outline existing revised appendix interim technical memorandum review peer conformity compliance status
    item items attachment official boundary boundaries
    secondary area city town region regional brampton mississauga caledon peel ontario province provincial mecp trca cvc
    conservation authority school board district catholic municipal housekeeping authorizing establishing establish adopt adopting adoption
    exempt exemption removal remove h holding cover covering letter request deferral deferred report recommended english french fig
    storey storeys apartment apartments building buildings residential townhouse townhouses units unit detached semi semi-detached mixed-use
    mixed commercial industrial office retail tower towers condominium condominiums dwelling dwellings house houses perspective perspectives
    exceptions exception sound level levels scenarios rental affordable seniors parkland stormwater water wastewater sanitary
    sewer watermain infrastructure capacity allocation signed copy redline clean alternate alternative`.split(/\s+/).filter(Boolean));
  const DOC_ACRONYMS = new Set('OZ OPA ZBA ZBLA ZBL OP SP SPA OZS POPA RZ MOPA MOP ROPA PDC APP ATT HERT ELU CONV LOC BP ICBL ZKM ZON DC HOZ OZA OZOPA BL PIM PIR MZO DPS DP OLT LPAT OMB MTSA TOC PPT PM AM RV NW NE SW SE CON SUB SWM FSR EIS EIR TIS PJR UDB UDR ESR EA MCEA PIC CIL GFA FSI CPR PSEZ HDA NHS LOR WTP WWTP DPA CRA TTA TOR'.split(' '));
  // File prefixes: kept, but they don't make a document's name on their own (a writer's letter on a
  // file reads "Correspondence - OZ 18-015 W7").
  const FILE_ACRONYMS = new Set('OZ OZS OPA POPA RZ SPA HOZ OZA OZOPA MOPA ROPA SP'.split(' '));
  const MONTHS = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?$/i;
  const NEEDS_NUM = /^(?:wards?|highway|hwy|line|road|rd|street|st|drive|dr|avenue|ave|court|way|trail|crescent|boulevard|blvd|parkway|park|house|school|sideroad|concession)$/i;
  const CONNECT = new Set(['and', 'of', 'to', 'the', 'for', 're', 're:', 'on', 'in', 'with', 'at', 'a', 'an', 'from', 'by', '&', '+', 'or', 'as', 'per']);
  const LABELS = /^(?:appendix|appendices|attachment|schedule|sch|exhibit|phase|block|part|section|elevation|figure|table|map|item|option|precinct|area|plan|lot|ward|stage)$/i;
  const SUFFIX = /^(?:Inc|Ltd|Limited|Corp|Corporation|LLP|LP|GP|ULC|Incorporated|Co|Company|Companies|Holdings|Developments|Developers?|Homes|Properties|Investments|Realty|Partners|Partnership|Associates|Consulting|Consultants|Architects|Architecture|Engineering|Builders|Enterprises|Ventures|REIT|Equities|Group|Estates|Management|Communities|Construction)\.?$/;
  const ADDRESS = new RegExp(`\\b\\d{1,5}(?:\\s*[-–&]\\s*\\d{1,5}|,\\s*\\d{1,5}|\\s+and\\s+\\d{1,5})*\\s+(?:The\\s+)?(?:[A-Z][A-Za-z'’]+\\s+){1,3}(?:${STREET_SUFFIX})\\b\\.?(?:\\s+(?:North|South|East|West|N|S|E|W)(?![A-Za-z]))?`, 'g');
  const lastWord = s => (/[A-Za-z]+$/.exec(String(s || '').replace(/[^A-Za-z0-9-]+$/, '')) || [''])[0];
  const tokType = (raw, prev, next) => {
    const w = raw.replace(/(?:\(\d+\))+$/, '').replace(/^[("'‘“[]+|[)"'’”\].:;!?]+$/g, '');
    if (!w) return /\d/.test(raw) ? 'keep' : 'sep';
    if (w.includes('\u0001')) return 'doc';                            // an address
    if (/\d/.test(w)) {                                                 // numbers, dates, items, files
      const alpha = w.split(/[^A-Za-z]+/).filter(x => x.length > 1);
      if (alpha.some(x => DOC_WORDS.has(x.toLowerCase())) || /^(?:APP|ATT|SCH|APPX)\d/i.test(w)) return 'doc';
      return alpha.some(x => DOC_ACRONYMS.has(x.toUpperCase()) && !FILE_ACRONYMS.has(x.toUpperCase())) ? 'doc' : 'keep';
    }
    if (SUFFIX.test(w)) return 'firm';
    if (/^[A-Z]$/.test(w)) return LABELS.test(lastWord(prev)) || w === 'H' ? 'keep' : 'drop';
    const lw = w.toLowerCase();
    if (CONNECT.has(lw)) return 'connect';
    if (DOC_ACRONYMS.has(w.toUpperCase()) && (w === w.toUpperCase() || w.length <= 3)) return FILE_ACRONYMS.has(w.toUpperCase()) ? 'keep' : 'doc';
    // A month, a ward or a road stays beside its number ("June 2, 2021", "Ward 3", "Highway 50"); alone
    // it can be a name.
    if (MONTHS.test(w) || NEEDS_NUM.test(w)) return /\d/.test(`${prev || ''}${next || ''}`) ? 'keep' : 'drop';
    if (DOC_WORDS.has(lw) || (lw.includes('-') && lw.split('-').every(x => DOC_WORDS.has(x) || DOC_ACRONYMS.has(x.toUpperCase()) || /^\d/.test(x)))) return 'doc';
    return 'drop';
  };
  // Separators between tokens: en / em dashes, a hyphen with a space on one side, commas, underscores.
  const DOC_SEP = /(\s*[–—]\s*|\s+-\s*|-\s+|(?<=[.)])-(?=[A-Za-z])|\s*,\s*|\s*;\s*|_+|\s+)/;
  const SEP_RANK = s => (/[–—]|\s-|-\s/.test(s) ? 4 : /,/.test(s) ? 3 : /;/.test(s) ? 3 : /_/.test(s) ? 2 : /-/.test(s) ? 2 : 1);
  function docName(n) {
    const s0 = String(n || '');
    const ext = (/\.(pdf|docx?|xlsx?|pptx?)$/i.exec(s0) || [''])[0];
    let s = ext ? s0.slice(0, -ext.length) : s0;
    s = s.replace(ADDRESS, m => m.replace(/\s/g, '\u0001'));         // an address is one token (kept)
    const parts = s.split(DOC_SEP);
    const toks = [];
    for (let i = 0; i < parts.length; i += 2) toks.push({ sep: i ? parts[i - 1] : '', raw: parts[i] });
    toks.forEach((t, i) => { t.type = t.raw ? tokType(t.raw, (toks[i - 1] || {}).raw, (parts[(i + 1) * 2] || '')) : 'sep'; });
    // A firm: its suffix and the capitalized words (and the number of a numbered company) before it.
    toks.forEach((t, i) => {
      if (t.type !== 'firm') return;
      for (let j = i - 1; j >= 0; j--) {
        const u = toks[j]; if (SEP_RANK(toks[j + 1].sep) >= 3) break;
        if (u.type === 'doc' && /^(?:appendix|attachment|schedule|report|correspondence|delegation|presentation|letter|map|amendment|by-law|zoning|official|recommendation|information|staff|draft|item|plan)$/i.test(u.raw.replace(/[^A-Za-z-]/g, ''))) break;
        if (/\d/.test(u.raw) && !/^\d+$/.test(u.raw)) break;
        u.type = 'drop';
      }
      t.type = 'drop';
    });
    // Connectors stay only between kept words; a month stays beside its number.
    const kept = t => t.type === 'keep' || t.type === 'doc';
    const near = list => list.find(x => x.type !== 'sep' && x.type !== 'connect' && x.type !== 'joined');
    toks.forEach((t, i) => { if (t.type === 'connect') { const p = near(toks.slice(0, i).reverse()), q = near(toks.slice(i + 1)); t.type = p && q && kept(p) && kept(q) && SEP_RANK(t.sep) < 3 ? 'joined' : 'drop'; } });
    toks.forEach(t => { if (t.type === 'joined') t.type = 'doc'; });
    let out = '', sep = '', hasDoc = false, first = null;
    for (const t of toks) {
      if (sep === null || SEP_RANK(t.sep) > SEP_RANK(sep)) sep = t.sep;
      if (!kept(t)) continue;
      if (t.type === 'doc' && !/^(?:and|of|to|the|for|re|on|in|with|at|a|an|from|by|&|\+|or|as|per|dated)$/i.test(t.raw)) hasDoc = true;
      if (out) out += /^\s+$/.test(sep) || !sep ? ' ' : sep.replace(/^\s*,\s*$/, ', ').replace(/^\s*[–—]\s*$/, m => ` ${m.trim()} `).replace(/^\s*-\s*$/, ' - ');
      else first = t;
      out += t.raw;
      sep = '';
    }
    out = out.replace(/\u0001/g, ' ');
    // Brackets left open or closed by a dropped word.
    let depth = 0; out = [...out].filter(ch => { if (ch === '(') { depth++; return true; } if (ch === ')') { if (!depth) return false; depth--; } return true; }).join('');
    while (depth-- > 0) { const i = out.lastIndexOf('('); out = out.slice(0, i) + out.slice(i + 1); }
    out = out.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s,;:._–—-]+|[\s,;:_–—-]+$/g, '').trim();
    if (!hasDoc) out = out ? `Correspondence${MONTHS.test((first && first.raw) || '') || /^dated\b/i.test(out) ? ', ' : ' - '}${out}` : 'Correspondence';
    return out + ext;
  }

  // ---- Development record descriptions -------------------------------------------------------
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const PHONE = /(?:\+?1[ .-]?)?(?:\(\d{3}\)\s?|\b\d{3}[ .-])\d{3}[ .-]\d{4}\b(?:\s*(?:ext\.?|x)\s*\d{1,5}\b)?|\bext\.?\s*\d{3,5}\b/gi;
  // A staff note: who asked, who was called or written to, refunds, fees, cancellations on request,
  // compliance extensions, "see attached email". (Never a condition such as "Development Charges to
  // be paid prior to occupancy", "FIREBREAK LOT" or a conditional permit's compliance date.)
  const NOTE = /\b(?:cancel(?:l?ed|lation|l?ing)?\b[^.*"]{0,80}?\b(?:per|by|as per)\b|cancel(?:l?ed|lation)?\s+(?:request|permit|as|per|by|due|-|–)|(?:as )?per (?:the )?(?:owner|applicant|homeowner|agent|builder|contractor|cbo|chief building official|supervisor|manager|inspector|staff|email|e-mail|phone|conversation|request|discussion)\b|refund\w*|re-?inspection fee|registered mail|letter (?:from|to|sent)|sent (?:to|via|by)\b|see (?:attached |the )?(?:e-?mail|correspondence|letter)|e-?mail(?:ed)? (?:from|to|on file|attached|correspondence)|on file\b|contacted|called\b|left (?:a )?(?:message|voicemail)|voicemail|spoke (?:with|to)|follow[- ]?up|hey team|folder created|created in error|entered in error|duplicate permit|transfer (?:permit|file) to|compl(?:iance|\.)\s*(?:date\s*)?ext|date extended|\bDC'?s? outstanding|\bCIL (?:has been |was )?paid|cil paid|fees? (?:paid|outstanding|owing|waived)|outstanding (?:fees?|otc)|cannot be cancelled|hold cancellation|inactive permit|not supported with|out of date|no hard copy|status is|application package|applicant to (?:provide|submit|pick)|owner to (?:provide|submit)|call for inspections?|site super\w*|superintendent|contact (?:person|name|info|number|details)|authori[sz]ed agent|direct all communications|checked and cleared|coordinated by|correspondence provided to|as requested by|confirmed on|given to|cheque|revoked by|will not be processed|collect(?:ed)? payment|payment (?:received|outstanding|collected)|emailed\b|as per (?:the )?request|plan ?track?\b|deleted from|re-?created to)/i;
  // "per Jane Doe" (case matters: "units per hectare" is not a note).
  const NOTE_PER = new RegExp(`\\b(?:per|PER|Per)\\s+(?:(?:${GIVEN.join('|')})\\s+[A-Z][a-z]+|(?:${GIVEN.map(g => g.toUpperCase()).join('|')})\\s+[A-Z]{2,})`);
  const isNote = s => NOTE.test(s) || NOTE_PER.test(s);
  // A labelled builder / contractor / consultant / owner: "Builder: Doe Homes", "Contractor - Doe Ltd".
  const R_LABELLED = /\b(?:Builder|Contractor|Architect|Consultant|Designer|Engineer|Owner|Agent|Applicant)s?\s*(?:[:#]|\s-\s)\s*[^,;.()—\n]*?(?=\s*(?:[,;.()—]|\s-\s|$))/gi;
  // "on behalf of (our client,) Doe Holdings Inc.": the party reads "the owner"; a public agency stays.
  const PUBLIC = /^(?:the\s+)?(?:City|Town|Region|Regional|Corporation of|Province|Ministry|Government|Peel|Brampton|Mississauga|Caledon|Dufferin|Toronto and Region|Credit Valley|Conservation|TRCA|CVC|MECP|Metrolinx|Hydro One|Alectra|Enbridge|Salvation Army|Peel Housing|Peel District|Dufferin-Peel|[\w-]+ (?:Catholic )?District School Board|Landowner|landowner|owner|applicant|our (?:client|office)|others\b)/i;
  const R_BEHALF = /\b(on behalf of|prepared by|designed by|submitted by|retained by|represented by)(\s+(?:our\s+client,?\s*|the\s+owner,?\s*)?)([A-Z0-9][^,;.()—]*?(?:\s*\([^()]{1,30}\)(?:\s+(?:Inc|Ltd|Limited|Corp|Corporation)\b\.?)?)?(?:\b(?:Inc|Ltd|Corp|Co|L\.P|LP)\.)?)(?=\s*(?:[,;()—]|\.(?:\s|$)|\s+(?:to|for|is|are|and(?!\s+[A-Z])|we|who|which|that|owners?|the\s+registered|has|have|in|at|on|regarding|re|dated|contemplates|shows?|showing)\b|$))/g;
  const R_CONSULTANT = new RegExp(`(^|[.—]\\s+|^\\s*)((?:[A-Z0-9][\\w&.'’\\-]*\\s+){0,6}?(?:${COMPANY_W})\\b\\.?(?:\\s*\\([^)]{1,40}\\))?,?)(?=\\s+(?:is pleased|has been retained|is requesting|is the authori[sz]ed|are pleased|is submitting|on behalf of|have been retained|is acting))`, 'g');
  // A builder named ahead of the model in a permit: "Construct Single - Doe Homes Model: Hayley".
  const R_BUILDER_MODEL = new RegExp(`(\\s[-–]\\s)(?:[A-Z][\\w&.'’]*\\s+){0,3}(?:${COMPANY_W})\\b\\.?\\s+(?=Model\\b)`, 'g');
  const STAR = /\*{2,}[^*]*?(?:\*{2,}|…$|$)/g;
  const QUOTE = /"[^"]{0,120}"/g;
  const PAREN = /\s*\([^()]*\)/g;
  const CLAUSE = /((?<=[.!?])\s+(?=[A-Z("*])|\s+[—–-]\s+)/;
  // A staff sign-off after a note: "Jane D 10.02.23", "Jane Doe…".
  const SIGNOFF = /^[A-Z][a-z]+(?:\s[A-Z][a-z]*\.?){0,2}(?:\s+[\d./-]{6,10})?\s*…?$/;
  // A note's clause from where the note starts; what the clause said before it stays ("Erect Single").
  const noteHead = seg => {
    const at = Math.min(...[NOTE.exec(seg), NOTE_PER.exec(seg)].filter(Boolean).map(m => m.index));
    return seg.slice(0, at).replace(/\b(?:note(?: to \w+)?|notes|nb|see|please|owner|applicant|homeowner|agent|builder|contractor)'?s?\s*:?\s*$/i, '').replace(/[\s(,;:*"-]+$/, '');
  };
  // The staff notes in a description, each as its own edit (the guard takes them one by one):
  // "**…**" admin segments, quoted staff stamps ("CANCELLATION REQUEST SENT TO INSPECTION"), notes in
  // brackets, "Call for inspections …".
  function noteEdits(s) {
    const out = [];
    for (const re of [STAR, QUOTE, PAREN]) for (const m of s.matchAll(re)) if (isNote(m[0])) out.push(t => t.replace(m[0], ' '));
    out.push(t => t.replace(/\s*\bCall for inspections?\b.*$/i, ''));
    return out;
  }
  // Then sentences and dash-separated clauses that are notes, and the sign-off after one.
  function clauseEdits(t) {
    const parts = t.split(CLAUSE), out = [];
    let prevNote = false;
    parts.forEach((seg, i) => {
      if (i % 2) return;
      const note = !!seg && isNote(seg), sign = !note && prevNote && SIGNOFF.test(seg.trim());
      if (note || sign) out.push(x => { const ps = x.split(CLAUSE); if (ps[i] !== seg) return x; ps[i] = (note && noteHead(seg)) || ' '; return ps.join(''); });
      prevNote = note || sign;
    });
    return out;
  }
  // What the app reads from a description (units, homes lost, new build, dwelling types, employment
  // uses and floor areas, heights, the tree's roles and wording tests, the growth filter): a scrub
  // step that would change any of it is not taken, so no count, phase, layer or grouping moves.
  // The modules load lazily (they all load before any record is read; in Node, by require).
  const mod = (g, f) => root[g] || (typeof require === 'function' ? (() => { try { return require(f); } catch (e) { return null; } })() : null);
  // Copies of wording tests kept inside other modules' functions (tests/privacy.test.js checks they match).
  const GROWTH_TEXT = /subdivision|block plan|precinct|mixed[- ]use|secondary plan|draft plan|apartment|townhouse|condominium|stacked|residential (development|community|uses|units)|dwelling units/i;
  const NOT_GROWTH = /replac|existing (dwelling|house|building)|addition to|renovat|accessory|garage|pool|deck|tenant|interior|temporary use|day ?care/i;
  const REVISES_P = /revis|minor|previously approved|amend\w* (to )?(the )?(approved|existing)|increase\b.{0,40}\bfrom\b|re-?submi|update[sd]? to/i;
  const REVISES_T = /revis|minor|previously approved|amend\w* (to )?(the )?(approved|existing)|re-?submi|update[sd]? to/i;
  const RESUB = /revis|re-?submi|new application|replac|supersed|amend\w* (to )?(the )?(approved|previous)|previously (approved|submitted)|update[sd]? (site )?plan/i;
  const PHASE_ID = /\b(phase|stage|tower|building|bldg|block)\s*(\d+[a-z]?|[ivx]+\b|[a-h]\b|one|two|three|four)/gi;
  function signals(d, rec) {
    const P = mod('PeelPhases', './phases.js'), D = mod('PeelDemand', './demand.js'), E = mod('PeelEmployment', './employment.js');
    const M = mod('PeelMassingCore', './massing-core.js'), Tr = mod('PeelTree', './tree.js');
    const r = { kind: 'application', type: '', ref: '', scope: '', ...(rec || {}), description: d }, text = `${r.type || ''} ${d}`;
    const out = [];
    const add = f => { try { const v = f(); out.push(v instanceof Set ? [...v] : v); } catch (e) { out.push('!'); } };
    if (P) {
      add(() => P.unitsFromText(d)); add(() => P.lostHomesInText(text, false)); add(() => P.lostHomesInText(d, true)); add(() => P.lostHomesInText(d, false));
      if (rec) for (const f of ['isNewBuild', 'permitAddsUnits', 'isDemolition', 'permitRole', 'isHolding', 'fileKind', 'zoningOf']) if (P[f]) add(() => P[f](r));
      if (rec && r.kind === 'application') { add(() => P.stageOf(r)); add(() => P.isMinorFile(r)); }
      if (rec && P.lostHomes) add(() => P.lostHomes([r]));
    }
    if (D) { add(() => D.unitTypeOf(text)); if (rec) add(() => D.isSubdivisionFile(r)); add(() => D.unitSplit({ units: 100, types: r.type ? [r.type] : [], description: d, records: [{ ...r, units: r.units || 100 }] }, 'all')); }
    if (E) { add(() => E.usesInOrder(text)); add(() => E.areasOf(d)); if (rec) add(() => E.permitUse(r)); }
    if (M) { add(() => M.statedHeight(d)); add(() => M.isApartment({ description: d, types: r.type ? [r.type] : [] })); add(() => /\b(addition|extension|alteration|renovation)s?\b/i.test(d)); }
    if (Tr && r.kind === 'application') {   // the tree reads planning files only (js/tree.js fileNodes)
      if (rec) add(() => { const c = Tr.classifyRole(r); return [c.role, c.roles]; });
      add(() => Tr.growthKind([d])); add(() => Tr.buildingsOf(d)); add(() => Tr.homeKinds(d)); add(() => Tr.PRECINCT.test(d));
    }
    const transfer = /TRANSFER FILE \D*(\d{2})[-/ ]\d/i.exec(d);
    out.push(GROWTH_TEXT.test(text), GROWTH_TEXT.test(d), NOT_GROWTH.test(d), REVISES_P.test(d), REVISES_T.test(d), RESUB.test(d),
      [...d.matchAll(PHASE_ID)].map(m => `${m[1].toLowerCase()} ${m[2].toLowerCase()}`).join(','), transfer ? transfer[1] : '',
      /^limited site plan|site plan minor|revisions? to (the )?site plan|minor (changes?|revisions?)/i.test(d), /^revision to (bp|permit)|site servicing/i.test(d),
      /alteration to existing|^\s*(interior )?alteration|^\s*(replace|repair)/i.test(`${r.scope || ''} ${d}`), /draft plan of subdivision/i.test(d.split(' — ')[0]),
      d.includes(' — ') ? d.split(' — ')[0] : '');
    return JSON.stringify(out);
  }
  const tidy = t => t.replace(/\(\s*\)/g, '').replace(/\s*[-–]\s*(?=[-–]\s)/g, ' ').replace(/(—)\s*[–-]\s+/g, '$1 ').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/([—(])\s*[,.;:]\s*/g, '$1 ').replace(/\s*[—–-]\s*$/, '').replace(/^\s*[,.;:—-]\s*/, '').trim();
  // The steps after the notes, in order. Contacts always go; each other edit is taken only when what
  // the app reads stays the same.
  const STEPS = [
    t => t.replace(R_LABELLED, m => (/^\s*(?:owner|applicant|agent)s?\s*:\s*(?:the|an?)\b/i.test(m) ? m : ' ')),
    t => t.replace(/\s*\(\s*(?:hereinafter|henceforth)\b[^)]*\)/gi, ''),
    t => t.replace(R_BEHALF, (m, k, mid, who) => (PUBLIC.test(who) ? m : `${k}${/client/i.test(mid) ? ' our client' : /prepared|designed/i.test(k) ? ' the consultant' : ' the owner'}`)),
    t => t.replace(R_CONSULTANT, (m, pre, who) => (PUBLIC.test(who) ? m : `${pre}The consultant`)),
    t => t.replace(R_BUILDER_MODEL, '$1'),
    t => t.replace(R_NAMED_FIRM, (m, off, all) => (/(?:^|[.!?—]\s+)$/.test(all.slice(0, off)) ? 'The consultant' : 'the consultant')),
    // The backstop, except in a house model's name ("Model: TH-3 Allison, Elevation B").
    t => (/\bmodel\b|\belev(?:ation)?\b/i.test(t) ? t : replaceGiven(t, 'an individual')),
  ];
  /**
   * A record's description without e-mail addresses, phone numbers, named people, builders,
   * contractors, consultants or staff notes. `rec` (the record: kind, type, ref, scope, units) lets
   * the guard check the record-level readings too.
   */
  function scrubDescription(s, rec) {
    if (typeof s !== 'string' || !s) return s;
    let t = s.replace(/[-–]?\s*\b(?:owner|contractor|builder|agent|applicant|architect)'?s?\s+(?:e-?mail|phone|cell|tel(?:ephone)?)\b\s*:?/gi, ' ').replace(EMAIL, ' ').replace(PHONE, ' ');
    if (t !== s) t = tidy(t);
    let base = null;
    const take = edit => {
      const next = edit(t);
      if (next === t) return;
      const cand = tidy(next);
      if (cand === t) return;
      if (base == null) base = signals(s, rec);
      if (signals(cand, rec) === base) t = cand;
    };
    // Until nothing more comes out (a removed note can leave another clause standing alone), so the
    // scrubbed text is a fixed point: scrubbing it again changes nothing.
    for (let pass = 0, prev = null; pass < 4 && prev !== t; pass++) {
      prev = t;
      take(x => x.replace(R_HON, ' '));
      noteEdits(t).forEach(take);
      clauseEdits(t).forEach(take);
      STEPS.forEach(take);
    }
    return t === s ? s : t;
  }

  // ---- Raw source attributes, EA appendices, servicing report titles ---------------------------
  const PRIVATE_KEY = /owner|applicant|agent|contact|contractor|builder|architect|consult|engineer|planner|phone|email|e_mail|fax|note|comment|remark|name|person|staff|author|inspector|developer|company|firm|mail|tel(?:ephone)?$/i;
  // Field names that are places, not people (a street name, a plan or subdivision name).
  const PLACE_KEY = /^(?:st(?:reet)?_?name|street|road_?name|plan_?name|subdivision_?name|sub_?name|area_?name|ward_?name|muni(?:cipality)?_?name|layer_?name|zone_?name|zoning_?name|community_?name|neighbourhood_?name|neighborhood_?name|secondary_?plan_?name|sp_?name|use_?name)$/i;
  const privateKey = k => PRIVATE_KEY.test(String(k)) && !PLACE_KEY.test(String(k));
  /** The raw attributes without the people, contact and note fields; `drop` lists more keys to leave out. */
  function safeProps(p, drop = []) {
    const out = {};
    const skip = new Set(drop.filter(Boolean));
    for (const [k, v] of Object.entries(p || {})) {
      if (skip.has(k) || privateKey(k)) continue;
      out[k] = typeof v === 'string' && /[@]|\d{3}[ .-]\d{3}[ .-]\d{4}/.test(v) ? v.replace(EMAIL, '').replace(PHONE, '').trim() : v;
    }
    return out;
  }
  const isContactList = label => /\b(?:contact|mailing|notification|stakeholder|distribution)[\s_-]+lists?\b/i.test(String(label || ''));
  function fsrTitle(t) {
    if (typeof t !== 'string' || !t) return t;
    return t.replace(/,?\s*\b(?:prepared|completed|written|submitted)\s+by\s+[^,;]+/gi, '')
      .replace(new RegExp(`^(?:[A-Z][\\w&.'’]*\\s+){1,4}?(?=(?:Engineering|Consulting|Planning|Consultants)\\s+(?:Letter|Memo|Memorandum|Report|Brief)\\b)`), '')
      .replace(new RegExp(`^(?:[A-Z][\\w&.'’]*\\s+){1,4}(?:${FIRM_W})\\b\\.?\\s+(?=(?:Letter|Memo|Memorandum)\\b)`), '')
      .replace(/\s*,\s*(?=,)|,\s*$|;\s*$/g, '').replace(/\s{2,}/g, ' ').trim();
  }

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

  const api = { scrubPeople, scrubCouncil, hasPeople, docName, scrubDescription, descriptionSignals: signals, isNote, safeProps, privateKey, isContactList, fsrTitle, givenNameHits, EMAIL, PHONE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelPrivacy = api;
})(typeof window !== 'undefined' ? window : globalThis);
