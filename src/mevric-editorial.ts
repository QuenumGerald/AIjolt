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
export function assessEditorialStory(story: EditorialStory): EditorialAssessment {
  const title = story.title.trim();
  if (!title) return { eligible:false, priority:0, reason:'empty_title' };
  if (lowValueFormat.test(title) || /^(?:\d+\s+takeaways|analysis:|review:)/i.test(title)) return { eligible:false, priority:0, reason:'video_live_or_promotional' };
  if (lowValueSubject.test(title) || minorCrime.test(title)) return { eligible:false, priority:0, reason:'minor_local_or_low_value' };
  const isUs = usContext.test(title);
  // Serious incidents are newsworthy regardless of whether the location is
  // a state capital. Breaking severity outranks routine political coverage.
  if (seriousIncident.test(title) && !retrospective.test(title)) {
    // A confirmed fatality, hostage situation or active threat outweighs an
    // incident reporting only minor injuries; neither can bypass the daily cap.
    const seriousHarm = /\b(?:dead|killed|fatal|deaths?|hostages?|active (?:shooter|threat)|mass shooting)\b/i.test(title);
    return { eligible:true, priority:(isUs ? 210 : 180) + (seriousHarm ? 20 : 0), reason:isUs ? 'urgent_us_incident' : 'urgent_world_incident' };
  }
  const isPolitical = political.test(title);
  const isMajor = majorEvent.test(title);
  const isNational = nationalImpact.test(title);
  if (isUs && isPolitical) return { eligible:true, priority:110, reason:'us_politics' };
  if (isUs && isMajor) return { eligible:true, priority:100, reason:'major_us_event' };
  if (isUs && isNational) return { eligible:true, priority:90, reason:'us_national_impact' };
  if (isUs) return { eligible:true, priority:65, reason:'us_news' };
  if (isMajor) return { eligible:true, priority:50, reason:'major_world_event' };
  return { eligible:false, priority:0, reason:'outside_us_or_major_scope' };
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
  return age >= 0 && age <= 3 * 3600_000 && assessEditorialStory(story).reason.startsWith('urgent_');
}

export function isSameNewsEvent(a: EditorialStory, b: EditorialStory): boolean {
  if (a.url === b.url) return true;
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
