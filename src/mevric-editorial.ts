/** US-focused, neutral editorial selection. No generated claims or invented urgency. */
export type EditorialStory = { title: string; url: string; publisher: string; publishedAt: string };
export type EditorialAssessment = { eligible: boolean; priority: number; reason: string };

const usContext = /\b(?:u\.?s\.?a?\.?|united states|america(?:n|ns)?|white house|congress|congressional|senate|senator|capitol hill|supreme court|federal reserve|wall street|dow jones|s&p 500|midterms?|trump|biden|democrats?|republicans?|gop|maga|texas|florida|california|new york|pennsylvania|georgia|michigan|ohio|wisconsin|arizona|nevada|iowa|kansas|missouri|mississippi|maine|virginia|washington d\.?c\.?|kentucky|arkansas|minnesota|illinois|colorado|massachusetts|new jersey|north carolina|south carolina|tennessee)\b/i;
const political = /\b(?:elections?|midterms?|vot(?:e|es|ing|ers)|ballot|politic(?:al|s|ian|ians)|governor|government|congress|congressional|senate|senator|president|white house|legislation|lawmakers?|supreme court|democrats?|republicans?|gop|campaign|referendum|redistricting|tariffs?|federal policy|immigration|cabinet|supreme court|constitutional)\b/i;
const nationalImpact = /\b(?:federal|nationwide|national|economy|inflation|interest rates?|unemployment|jobs report|stock market|dow (?:jones|surges|plunges)|wall street|federal reserve|supreme court|ruling|sanctions|security|cyberattack|hurricane|wildfire|earthquake|pandemic|public health|significant|bill|law|military|defense|border|protests?|mass shooting|terror attack|explosion|chemical plant|congress|ceasefire|trade war)\b/i;
const majorEvent = /\b(?:breaking(?: news)?|developing(?: story)?|major|historic|landslide|war|invasion|ceasefire|airstrikes?|missile(?:s)?|bombings?|deadly (?:bombing|strike|attack)|killed (?:\d{2,}|dozens|scores)|mass shooting|hurricane|earthquake|tsunami|wildfire|catastroph(?:e|ic)|large explosion|nuclear|peace deal|sanctions|global crisis|market crash|state of emergency|congressional control|take control of congress)\b/i;
const lowValueFormat = /^\s*(?:WATCH|LIVE|LISTEN|PHOTOS|VIDEO|REVIEW|PODCAST|QUIZ)\s*:/i;
const lowValueSubject = /\b(?:training incident|in pictures|maps and charts|celebrity gossip|viral meme|celebrity outfit|restaurant opening|new restaurant|parking fines?|school fair|neighborhood festival|town festival|leisure centre|council meeting|local parade|minor traffic|petty theft|shoplifting|stolen bicycle|parking dispute|pet dispute)\b/i;
const minorCrime = /\b(?:petty theft|shoplifting|stolen (?:bike|bicycle|car)|parking dispute|minor (?:accident|collision|crime)|local burglary|neighborhood vandalism)\b/i;
// Immediate public-safety incidents are not "minor local news". Select only
// event reports, not retrospectives, trials, documentaries or training drills.
const seriousIncident = /\b(?:shootings?|shots? fired|gunfire|gunman|armed attack|active (?:shooter|threat)|swat|hostage(?:s)?|hostage situation|bombing|bomb threat|explosion|chemical plant|plane crash|aircraft crash|helicopter crash|train derailment|major collision|mass casualties|multiple (?:people )?(?:dead|killed|injured)|(?:suspect|victim|officer|people|person) (?:is |was )?(?:dead|killed|shot)|deadly (?:incident|attack|fire|blast|crash)|building collapse|bridge collapse|hurricane|tornado|earthquake|tsunami|wildfire|active fire|evacuat(?:ion|ions|ed)|flash flood|terror(?:ist)? attack)\b/i;
const retrospective = /\b(?:anniversary|years? (?:after|ago)|decades? (?:after|ago)|historical|documentary|trial|sentenced|sentencing|convicted|conviction|judge rules|court hears|pleads guilty|training exercise|drill|simulation|movie|video game|fictional)\b/i;

/** Assess the subject matter, not the publisher: US politics and major US events rank first. */
const excluded = /\b(?:analysis|opinion|explainer|here.s what|early details|special report|takeaways|recap|roundup|what to know|what we know|after almost|deeply sorry|preview|podcast|the takeout|cbs sunday morning|face the nation|meet the press|interview|newsletter|watch live|livestream|climate policy|health policy|campaign trail|polling|polls show|fact check|guide to|how to|why it matters|anniversary|years? ago|documentary|trial|sentenced|sentencing|convicted|training exercise|simulation|drill)\b/i;
const eventIncident = /\b(?:shooting|shot dead|shots fired|gunfire|gunman|active shooter|active threat|swat|armed attack|attack kills|attack leaves|deadly attack|deadly strike|terror(?:ist)? attack|airstrike|missile strike|bombing|explosion|hostages?|earthquake|tsunami|hurricane|tornado|wildfire|flooding|flash flood|landslide|building collapse|bridge collapse|plane crash|aircraft crash|helicopter crash|train (?:crash|derailment)|bus crash|multi-vehicle crash|deadly crash|(?:tanker|ship|vessel|boat|ferry|cruise ship) (?:hits|hit|slams into|strikes|collides with|crashes into)|(?:ship|boat|vessel|ferry) collision|cyberattack|(?:nationwide|national|global|widespread|massive|major) (?:power |network |internet |cloud )?(?:outage|blackout|ground stop|shutdown|disruption|failure)|ground stop (?:ordered|issued)|(?:faa|airport|airports).*ground stop|global outage|major (?:collision|accident|outage|blackout|power failure|network outage)|evacuat(?:ed|ion|ions)|arrested|arrests?|taken into custody|detained|charged with|dies at|has died|dead at|death of|killed in|found dead)\b/i;
const electionResult = /\b(?:election|vote|race|ballot|referendum|house|senate|presidential)\b.*\b(?:wins?|won|elected|defeats?|projected winner|results? announced|results? confirmed|declared winner|takes? control|gains? majority)\b|\b(?:wins?|won|elected|defeats?|projected winner|declared winner|projects|projected to win)\b.*\b(?:election|vote|race|ballot|referendum|house|senate|presidential)\b/i;
const deathPerson = /\b(?:actor|actress|singer|musician|rapper|author|director|president|former president|prime minister|celebrity|star|legend|icon|leader|politician|governor|senator)\b.*\b(?:dies|died|dead|killed)\b|\b(?:dies|died|dead)\b.*\b(?:actor|actress|singer|musician|rapper|author|director|president|prime minister|celebrity|star|legend|icon|leader|politician|governor|senator)\b/i;
// Non-urgent reporting supplies the regular 40-50/day editorial stream.
// It is US-led but still covers major world developments. Avoid opinion,
// lifestyle promotions, isolated local trivia and repeat media clips.
const usNews = /\b(?:u\.?s\.?a?\.?|united states|americans?|white house|congress|congressional|senate|supreme court|federal|fbi|cia|pentagon|wall street|federal reserve|dow jones|nasdaq|s&p|trump|biden|democrats?|republicans?|gop|alaska|arizona|arkansas|california|colorado|connecticut|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|san francisco|los angeles|chicago|houston|tampa|miami|atlanta|boston|seattle|detroit|philadelphia|san diego|denver|las vegas|new orleans)\b/i;
const usPolitics = /\b(?:president|congress|congressional|senate|senator|governor|white house|supreme court|democrats?|republicans?|gop|legislation|lawmakers?|federal judge|election|midterm|votes?|ballot|immigration|federal policy|tariffs?)\b/i;
const generalNews = /\b(?:economy|inflation|business|stocks?|trade|technology|tech|ai|artificial intelligence|research|space|nasa|science|medical|health|climate|energy|transportation|education|policy|government|politic|company|companies|court|judge|lawsuit|decision|ruling|launch|announc|unveil|report|investigat|resign|approve|reject|arrest|indict|security|defen[cs]e|aviation|aviat|travel|employment|jobs|workforce|funding|budget|election|president|minister|econom|government|military|nato|iran|russia|ukraine|china|israel|gaza|ceasefire)\b/i;

/** True US hot alerts: severe recent incidents, not every US article or old prosecution. */
const hotIncident = /\b(?:active shooter|active threat|shots? fired|shooting|gunfire|gunman|armed attack|hostages?|terror(?:ist)? attack|bombing|bomb blast|major explosion|explosion|plane crash|aircraft crash|helicopter crash|train derailment|bridge collapse|building collapse|mass casualties|deadly (?:attack|crash|fire)|hurricane|tornado|earthquake|tsunami|wildfire|flash flood|massive (?:blackout|power outage)|nationwide (?:blackout|ground stop|outage)|ground stop ordered|faa.*ground stop|chemical plant (?:explosion|fire))\b/i;
const historicalIncident = /\b(?:years? (?:after|ago)|decades? (?:after|ago)|historic trial|retrial|trial|sentenced|convicted|pleads guilty|parole|anniversary|documentary|training|drill|simulation|old footage|cold case|in 19\d\d|in 20(?:0\d|1\d))\b/i;
const usEventLocation = /\b(?:u\.?s\.?a?\.?|united states|america|american airports|nationwide|federal aviation|faa|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|tampa|miami|boston|chicago|houston|seattle|philadelphia|detroit|atlanta|los angeles|san francisco|san diego|las vegas|new orleans|denver|phoenix|dallas|austin|portland|baltimore|memphis|nashville|minneapolis|st\.? louis|kansas city|sacramento)\b/i;
const foreignIncidentLocation = /\b(?:in|near|outside|across|at)\s+(?:ukraine|russia|iraq|iran|israel|gaza|china|taiwan|india|pakistan|afghanistan|mexico|canada|france|britain|england|germany|spain|italy|japan|south korea|north korea|syria|lebanon|australia|south africa|costa rica|brazil|argentina|london|paris|kyiv|moscow|beijing|tehran|tel aviv|tokyo)\b/i;

export function isHotUsAlert(story: EditorialStory, now = Date.now()): boolean {
  const age = now - Date.parse(story.publishedAt);
  const title = story.title.trim();
  if (age < 0 || age > 90 * 60_000 || !hotIncident.test(title) || historicalIncident.test(title)) return false;
  if (!usEventLocation.test(title) || foreignIncidentLocation.test(title)) return false;
  return !lowValueFormat.test(title) && !lowValueSubject.test(title) && !minorCrime.test(title) && !excluded.test(title);
}

/** Rank original trusted headlines, with US emergency stories preempting routine updates. */
export function assessEditorialStory(story: EditorialStory): EditorialAssessment {
  const title=story.title.trim();
  if (!title || lowValueFormat.test(title) || excluded.test(title) || retrospective.test(title) || lowValueSubject.test(title) || minorCrime.test(title)) return {eligible:false,priority:0,reason:'routine_or_retrospective'};
  if (/\b(?:ap|associated press|networks?) projects\b/i.test(title) && /\b(?:lose|loses|lost|win|wins|won|seat|congress|senate|house|race)\b/i.test(title)) return {eligible:true,priority:180,reason:'election_projection'};
  if (isHotUsAlert(story)) return {eligible:true,priority:350,reason:'hot_us_alert'};
  if (electionResult.test(title)) return {eligible:true,priority:usNews.test(title) ? 175 : 105,reason:'election_result'};
  if (eventIncident.test(title)) {
    const harm = /\b(?:dead|killed|fatal|death toll|mass casualties|hostages?|active (?:shooter|threat))\b/i.test(title);
    return {eligible:true,priority:usNews.test(title) ? (harm ? 205 : 185) : (harm ? 130 : 115),reason:'significant_event'};
  }
  if (deathPerson.test(title)) return {eligible:true,priority:120,reason:'person_death'};
  if (usNews.test(title) && usPolitics.test(title)) return {eligible:true,priority:125,reason:'us_politics'};
  if (usNews.test(title) && generalNews.test(title)) return {eligible:true,priority:110,reason:'us_national_news'};
  // Merely naming a US city/state is NOT newsworthiness: a hotel contest,
  // lifestyle promotion or a neighborhood celebration must not fill slots.
  if (usNews.test(title)) return {eligible:false,priority:0,reason:'us_local_without_national_significance'};
  if (/\blocal elections?\b/i.test(title)) return {eligible:false,priority:0,reason:'foreign_local_news'};
  if (majorEvent.test(title) && generalNews.test(title)) return {eligible:true,priority:75,reason:'major_world_news'};
  if (generalNews.test(title)) return {eligible:true,priority:50,reason:'world_news'};
  return {eligible:false,priority:0,reason:'low_priority_or_off_topic'};
}

const tokenStopwords = new Set('the a an in on at by and or of for to from with about after before over under into through as is are was were be been says said says report reports reported news latest new how why what who where when more this that these those its their his her have has had get gets got will can could may might not it up down out first second third us usa american watch live latest analysis update updates'.split(' '));
function newsTerms(title: string): Set<string> {
  return new Set(title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(?:u\.?s\.?a?)\b/g, 'unitedstates')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length > 2 && !tokenStopwords.has(t)));
}
function electionOutcomeKey(title: string): string | undefined {
  if (!/\b(?:democrats?|republicans?|gop)\b/i.test(title) || !/\b(?:midterm|election|house|senate|congress)\b/i.test(title) || !/\b(?:take|gain|seize|win|wins|won|control|majority)\b/i.test(title)) return;
  // Explicit winner and chamber, with projected and confirmed results separated.
  const winner = /\bdemocrats?\b/i.test(title) ? 'democrat' : 'republican';
  const house = /\bhouse\b/i.test(title);
  const senate = /\bsenate\b/i.test(title);
  const congress = /\bcongress\b/i.test(title) && !house && !senate;
  if (!house && !senate && !congress) return;
  const stage = /\b(?:projected|projection|expected)\b/i.test(title) ? 'projected' : 'confirmed';
  const topic = house && senate ? 'both' : house ? 'house' : senate ? 'senate' : 'congress';
  // Articles about particular candidates or state races are distinct events.
  if (/\b(?:texas|michigan|maine|ohio|iowa|georgia|california|kansas|wisconsin|missouri|arkansas|nevada|pennsylvania|south carolina|north carolina)\b/i.test(title)) return;
  return `${winner}:${topic}:${stage}`;
}
/** Conservative duplicate check across publishers without collapsing unrelated breaking news. */
/** Allow a short-gap publish only for fresh, serious incidents with a trusted RSS source. */
export function isUrgentBreakingStory(story: EditorialStory, now = Date.now()): boolean {
  const age = now - Date.parse(story.publishedAt);
  return isHotUsAlert(story, now);
}

export function isSameNewsEvent(a: EditorialStory, b: EditorialStory): boolean {
  if (a.url === b.url) return true;
  // Source wording often differs for the same nationally identified incident.
  // Require a distinctive shared actor AND event type, not generic words alone.
  const eventTag = (s: string): string | undefined => {
    if (/\b(?:faa|federal aviation administration)\b/i.test(s) && /\b(?:ground\s?stop|grounded|flights? halted)\b/i.test(s) && /\b(?:nationwide|national|all u\.?s\.? airports|airports)\b/i.test(s)) return 'faa:national-ground-stop';
    if (/\b(?:tanker|vessel|ship)\b/i.test(s) && /\b(?:river cruise|cruise ship|river cruiser|cruise boat)\b/i.test(s) && /\bnew orleans\b/i.test(s)) return 'new-orleans:tanker-cruise-collision';
    return undefined;
  };
  const tagA=eventTag(a.title),tagB=eventTag(b.title);
  if (tagA && tagA===tagB) return true;
  const aOutcome = electionOutcomeKey(a.title), bOutcome = electionOutcomeKey(b.title);
  // A projected result followed by an official confirmation IS a new event.
  if (aOutcome && bOutcome && aOutcome.split(':').slice(0,2).join(':') === bOutcome.split(':').slice(0,2).join(':') && aOutcome !== bOutcome) return false;
  const one = newsTerms(a.title), two = newsTerms(b.title);
  if (one.size < 4 || two.size < 4) {
    const aKey = electionOutcomeKey(a.title), bKey = electionOutcomeKey(b.title);
    return !!aKey && aKey === bKey;
  }
  const intersect = [...one].filter(term => two.has(term)).length;
  const jaccard = intersect / (one.size + two.size - intersect);
  if (intersect >= 4 && jaccard >= 0.7) return true;
  // Two outlets often describe the same major public-safety incident very
  // differently (e.g. SWAT response vs shooting). Require at least four
  // common concrete terms, close timestamps and substantive overlap.
  const closeInTime = Math.abs(Date.parse(a.publishedAt) - Date.parse(b.publishedAt)) < 6 * 3600_000;
  const bothSerious = seriousIncident.test(a.title) && seriousIncident.test(b.title);
  if (closeInTime && bothSerious && intersect >= 5 && jaccard >= 0.30) return true;
  const aKey = electionOutcomeKey(a.title), bKey = electionOutcomeKey(b.title);
  return !!aKey && aKey === bKey;
}

/** Only an independently stated fact may justify a second report on an incident. */
export function materialEventUpdate(next: EditorialStory, previous: EditorialStory[]): boolean {
  if (!previous.length) return true;
  const facts = (title:string) => {
    const numbers=[...title.matchAll(/\b\d+(?:,\d{3})*\b/g)].map(m=>m[0]);
    const statements=[...title.matchAll(/\b(?:police|sheriff|officials?|authorities|government|minister|president|prosecutor|coroner)\s+(?:say|says|said|confirm|confirms|confirmed|announce|announces|announced|identify|identifies|identified)\b/gi)].map(m=>m[0].toLowerCase());
    const developments=[...title.matchAll(/\b(?:suspect (?:arrested|identified|charged|killed|dead)|arrested suspect|death toll|injury toll|casualty toll|confirmed dead|confirmed killed|declared winner|results? confirmed)\b/gi)].map(m=>m[0].toLowerCase());
    return [...numbers,...statements,...developments];
  };
  const oldFacts=new Set(previous.flatMap(p=>facts(p.title)));
  return facts(next.title).some(f=>!oldFacts.has(f));
}
