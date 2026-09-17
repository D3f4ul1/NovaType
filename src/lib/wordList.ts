/**
 * Word corpus — the ~500 most common English words, plus the language registry.
 *
 * The raw list is de-duplicated once at module load. Keeping a Set here rather than
 * trusting hand-maintained uniqueness costs a fraction of a millisecond on startup
 * and guarantees the sampler is uniform.
 */

const RAW_ENGLISH: string[] = [
  // ── Core function words ────────────────────────────────────────
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it',
  'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this',
  'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or',
  'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so',
  'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when',
  'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people',
  'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
  'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
  'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even',
  'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is',
  'such', 'find', 'here', 'thing', 'many', 'still', 'should', 'long', 'much', 'before',
  'right', 'too', 'mean', 'old', 'same', 'tell', 'does', 'set', 'three', 'state',
  'never', 'become', 'between', 'high', 'really', 'something', 'another', 'both', 'part', 'against',
  'under', 'during', 'without', 'again', 'place', 'around', 'however', 'home', 'small', 'found',
  'thought', 'went', 'say', 'great', 'where', 'help', 'through', 'much', 'before', 'line',

  // ── Common verbs ───────────────────────────────────────────────
  'was', 'are', 'were', 'been', 'being', 'has', 'had', 'did', 'said', 'made',
  'got', 'took', 'came', 'saw', 'knew', 'told', 'became', 'showed', 'left', 'felt',
  'put', 'brought', 'began', 'kept', 'held', 'wrote', 'stood', 'heard', 'let', 'met',
  'ran', 'paid', 'sat', 'spoke', 'led', 'read', 'grew', 'lost', 'fell', 'sent',
  'built', 'drew', 'broke', 'spent', 'cut', 'rose', 'drove', 'bought', 'wore', 'chose',
  'asked', 'tried', 'needed', 'helped', 'talked', 'turned', 'started', 'played', 'moved', 'lived',
  'believed', 'worked', 'seemed', 'waited', 'served', 'died', 'expected', 'stayed', 'reached', 'remained',
  'suggested', 'raised', 'passed', 'sold', 'required', 'reported', 'decided', 'pulled', 'returned', 'explained',
  'hoped', 'developed', 'carried', 'received', 'agreed', 'supported', 'produced', 'covered', 'caught', 'caused',
  'listened', 'realized', 'dropped', 'accepted', 'judged', 'described', 'wondered', 'enjoyed', 'preferred', 'picked',
  'wished', 'counted', 'proved', 'shared', 'saved', 'handled', 'worried', 'thanked', 'existed', 'pushed',
  'joined', 'settled', 'prepared', 'delivered', 'replaced', 'mentioned', 'argued', 'treated', 'focused', 'arrived',
  'visited', 'sought', 'discussed', 'applied', 'related', 'assumed', 'connected', 'improved', 'attended', 'noticed',
  'survived', 'offered', 'formed', 'included', 'continued', 'learned', 'changed', 'avoided', 'ignored', 'refused',
  'explained', 'created', 'allowed', 'added', 'opened', 'walked', 'won', 'remembered', 'loved', 'considered',
  'appeared', 'served', 'died', 'sent', 'grew', 'remained', 'suggested', 'watched', 'followed', 'stopped',

  // ── Nouns ──────────────────────────────────────────────────────
  'man', 'woman', 'child', 'world', 'life', 'hand', 'eye', 'week', 'case', 'point',
  'government', 'company', 'number', 'group', 'problem', 'fact', 'water', 'room', 'mother', 'area',
  'money', 'story', 'month', 'lot', 'study', 'book', 'word', 'business', 'issue', 'side',
  'kind', 'head', 'house', 'service', 'friend', 'father', 'power', 'hour', 'game', 'end',
  'member', 'law', 'car', 'city', 'community', 'name', 'president', 'team', 'minute', 'idea',
  'kid', 'body', 'information', 'parent', 'face', 'level', 'office', 'door', 'health', 'person',
  'art', 'war', 'history', 'party', 'result', 'change', 'morning', 'reason', 'research', 'girl',
  'guy', 'moment', 'air', 'teacher', 'force', 'education', 'foot', 'boy', 'age', 'policy',
  'process', 'music', 'market', 'sense', 'nation', 'plan', 'college', 'interest', 'death', 'experience',
  'effect', 'class', 'control', 'care', 'field', 'development', 'role', 'effort', 'rate', 'heart',
  'voice', 'wife', 'police', 'mind', 'price', 'report', 'decision', 'son', 'view', 'relationship',
  'town', 'road', 'arm', 'difference', 'value', 'building', 'action', 'model', 'season', 'society',
  'tax', 'director', 'position', 'player', 'record', 'paper', 'space', 'ground', 'form', 'event',
  'official', 'matter', 'center', 'couple', 'site', 'project', 'activity', 'star', 'table', 'need',
  'court', 'production', 'human', 'language', 'letter', 'mile', 'night', 'window', 'energy', 'memory',
  'figure', 'method', 'mission', 'island', 'engine', 'surface', 'pattern', 'future', 'series', 'pattern',
  'science', 'nature', 'object', 'picture', 'system', 'letter', 'result', 'morning', 'period', 'letter',

  // ── Adjectives ─────────────────────────────────────────────────
  'other', 'new', 'good', 'high', 'old', 'great', 'big', 'small', 'large', 'national',
  'young', 'different', 'black', 'long', 'little', 'important', 'political', 'bad', 'white', 'real',
  'best', 'social', 'public', 'sure', 'low', 'early', 'able', 'local', 'late', 'hard',
  'major', 'better', 'economic', 'strong', 'possible', 'whole', 'free', 'military', 'true', 'federal',
  'international', 'full', 'special', 'easy', 'clear', 'recent', 'certain', 'personal', 'open', 'red',
  'difficult', 'available', 'likely', 'short', 'single', 'medical', 'current', 'wrong', 'private', 'past',
  'foreign', 'fine', 'common', 'poor', 'natural', 'significant', 'similar', 'hot', 'dead', 'central',
  'happy', 'serious', 'ready', 'simple', 'physical', 'general', 'environmental', 'financial', 'blue', 'democratic',
  'dark', 'various', 'entire', 'close', 'legal', 'religious', 'cold', 'final', 'main', 'green',
  'nice', 'huge', 'popular', 'traditional', 'cultural', 'basic', 'successful', 'modern', 'quiet', 'bright',

  // ── Adverbs and connectives ────────────────────────────────────
  'very', 'often', 'always', 'sometimes', 'usually', 'already', 'yet', 'soon', 'where', 'why',
  'almost', 'together', 'away', 'along', 'across', 'behind', 'above', 'below', 'near', 'inside',
  'outside', 'since', 'until', 'while', 'perhaps', 'rather', 'quite', 'nearly', 'forward', 'instead',
]

/** De-duplicated corpus. */
export const ENGLISH_WORDS: string[] = Array.from(new Set(RAW_ENGLISH))

export interface LanguageDefinition {
  code: string
  label: string
  words: string[]
  /** Whether the language is written right-to-left. */
  rtl: boolean
}

/**
 * Language registry. Only English ships today; a new language is a single entry
 * here plus a `LanguageCode` member in `types.ts`.
 */
export const LANGUAGES = {
  english: {
    code: 'english',
    label: 'English',
    words: ENGLISH_WORDS,
    rtl: false,
  },
} as const

export const LANGUAGE_ORDER = ['english'] as const
