import type { FactCategory } from '../types'
import { migrateLegacyKeys, STORAGE_KEYS } from './storage'

/**
 * Prompt material for the fact-based text sources.
 *
 * These are written as complete, self-contained sentences with natural punctuation, and
 * the generator tokenises them into words as they are. Two consequences, both intended:
 *
 *  • Facts read like prose even with the Punctuation and Numbers toggles off, because the
 *    punctuation belongs to the sentence rather than being injected. Those toggles keep
 *    governing the random word source, where they are the only source of punctuation.
 *  • Facts are shuffled per cycle and the whole set is walked before any repeat, so the
 *    stream stays continuous and never settles into a loop the user can memorise.
 */

export const FACT_CATEGORY_LABELS: Record<FactCategory, string> = {
  science: 'Science',
  sport: 'Sport',
  history: 'History',
  tech: 'Tech',
  nature: 'Nature',
  general: 'General',
}

export const FACT_CATEGORY_ORDER: FactCategory[] = [
  'science',
  'sport',
  'history',
  'tech',
  'nature',
  'general',
]

export const FACTS: Record<FactCategory, string[]> = {
  science: [
    'Light from the Sun takes about eight minutes and twenty seconds to reach the Earth.',
    'A teaspoon of neutron star material would weigh around six billion tonnes on Earth.',
    'Water expands by roughly nine percent when it freezes, which is why ice floats.',
    'The human body holds enough carbon to make about nine thousand pencils.',
    'Sound travels about four times faster through water than it does through air.',
    'Absolute zero sits at minus two hundred and seventy three degrees Celsius.',
    'A bolt of lightning heats the air around it to roughly thirty thousand degrees Celsius.',
    'The DNA inside a single human cell would stretch about two metres if it were unravelled.',
    "Earth's magnetic field comes from molten iron swirling in the outer core.",
    'There are more possible games of chess than there are atoms in the observable universe.',
    'Helium was found in the spectrum of the Sun before it was discovered on Earth.',
    'Glass is not a slow flowing liquid; old windows are thicker at the bottom because of how they were made.',
    'A day on Mercury lasts about fifty nine Earth days, but a year there is only eighty eight.',
    'The Pacific Ocean is deeper at its lowest point than Mount Everest is tall.',
    'A newborn baby has around three hundred bones; an adult has two hundred and six.',
    'Thunder is the sound of air expanding faster than the speed of sound around a lightning bolt.',
    'Venus is the hottest planet, even though Mercury orbits far closer to the Sun.',
    'Raindrops are not teardrop shaped; the small ones are almost perfect spheres.',
    'Photosynthesis turns carbon dioxide and water into sugar using nothing but sunlight.',
    'By the time you finish this sentence, your body will have replaced millions of cells.',
  ],
  sport: [
    'A marathon is forty two point one nine five kilometres, a distance fixed at the nineteen oh eight London Olympics.',
    'Basketball was invented in eighteen ninety one by James Naismith, a physical education teacher.',
    'The modern Olympic Games began in Athens in eighteen ninety six.',
    'The laws of football allow a pitch to vary in length by up to thirty five metres.',
    'Table tennis only became an Olympic sport in nineteen eighty eight.',
    'The Tour de France covers roughly three thousand five hundred kilometres in three weeks.',
    "Cricket's Ashes urn is about eleven centimetres tall and almost never leaves its case.",
    'Wimbledon has been played on grass every year since eighteen seventy seven.',
    'An ice hockey puck can travel faster than one hundred and sixty kilometres per hour.',
    'The fastest recorded tennis serve was over two hundred and sixty kilometres per hour.',
    'In sumo the highest rank is yokozuna, and it can never be lost once it is earned.',
    'A standard basketball hoop stands ten feet above the floor, or just over three metres.',
    'A cricket ball is both harder and heavier than a baseball.',
    'In Formula One a pit stop can be completed in under three seconds.',
    'The Stanley Cup is the oldest trophy competed for by professional athletes in North America.',
    'A volleyball court is eighteen metres long and nine metres wide.',
    'The Open Championship in golf has been played every year since eighteen sixty.',
    'Rugby union began in eighteen twenty three when a player picked up the ball and ran with it.',
    'The first modern marathon was won by a Greek water carrier named Spyridon Louis.',
    'An Olympic swimming pool holds two and a half million litres of water.',
  ],
  history: [
    'The Colosseum in Rome could hold around fifty thousand spectators.',
    'The printing press reached Europe in the fourteen hundreds and changed how ideas spread.',
    'The Rosetta Stone was the key to reading ancient Egyptian hieroglyphs.',
    'The Great Wall of China was built over many centuries by several different dynasties.',
    'Vikings reached North America around the year one thousand, long before Columbus set sail.',
    'The Silk Road was never a single road but a network of trade routes across Asia.',
    'The Magna Carta was sealed by King John in twelve fifteen.',
    'Machu Picchu was built in the fifteen hundreds by the Inca civilisation.',
    'The Library of Alexandria was part of a larger research institution in ancient Egypt.',
    'The first successful powered flight took place in nineteen oh three in North Carolina.',
    'Ancient Rome had apartment blocks up to six storeys tall called insulae.',
    'The compass reached Europe through trade routes that crossed the Islamic world.',
    'The Hundred Years War actually lasted one hundred and sixteen years.',
    'Baghdad was founded in seven sixty two and grew into a centre of learning.',
    'The Ottoman Empire lasted more than six hundred years.',
    'In ancient Egypt both men and women wore cosmetics and perfume.',
    'The wreck of the Titanic sits about three point eight kilometres below the surface.',
    'The first newspapers appeared in seventeenth century Europe.',
    'Angkor Wat is the largest religious monument ever built.',
    'Cleopatra lived closer in time to the first Moon landing than to the Great Pyramid.',
  ],
  tech: [
    'The first computer bug was a real moth found in a relay of the Harvard Mark II.',
    'A kilobyte was originally one thousand and twenty four bytes because memory came in powers of two.',
    'The QWERTY layout was designed in the eighteen seventies for mechanical typewriters.',
    'The first web page went live in nineteen ninety one at CERN.',
    'Transistors replaced vacuum tubes and made computers far smaller and more reliable.',
    'The term robot comes from a Czech word for forced labour.',
    'The first hard drive, built in nineteen fifty six, weighed more than a tonne.',
    'Laser stands for light amplification by stimulated emission of radiation.',
    'Open source software ships with its source code so anyone can inspect and change it.',
    "The at sign was chosen for email in nineteen seventy one by Ray Tomlinson.",
    'A modern phone chip holds more transistors than there are people on Earth.',
    'Fibre optic cables carry data as pulses of light rather than electrical signals.',
    'The first computer mouse was carved out of wood.',
    'Email predates the World Wide Web by roughly twenty years.',
    'A phone today has far more computing power than the computer that landed Apollo eleven.',
    'The word byte was coined in nineteen fifty six during work on an IBM mainframe.',
    'Undersea cables carry more than ninety percent of international internet traffic.',
    'The first home video game console went on sale in nineteen seventy two.',
    'Binary arithmetic was described by Gottfried Leibniz in the seventeenth century.',
    'A modern processor can switch billions of times every second.',
  ],
  nature: [
    'An octopus has three hearts and blue blood.',
    'Bamboo can grow almost a metre in a single day.',
    'Honeybees tell each other where flowers are by dancing in a figure of eight.',
    'The blue whale is the largest animal that has ever lived on Earth.',
    'Trees in a forest share sugars and minerals through fungal networks in the soil.',
    'Emperor penguins balance their single egg on their feet under a fold of skin.',
    'Some jellyfish can revert to an earlier stage of life and begin again.',
    'Coral reefs cover under one percent of the ocean floor but support a quarter of marine life.',
    'A group of flamingos is called a flamboyance.',
    'Antarctica is the driest, windiest and coldest continent on the planet.',
    'Sloths can hold their breath far longer than dolphins can.',
    'The Sahara desert is roughly the size of the United States.',
    "A hummingbird's heart can beat more than a thousand times a minute.",
    'Elephants talk to each other in rumbles too low for human ears to hear.',
    'A single large tree can release hundreds of litres of water into the air in a day.',
    'The arctic tern migrates further than any other animal, pole to pole and back.',
    'Fungi are more closely related to animals than they are to plants.',
    'The deepest trench in the ocean is nearly eleven kilometres down.',
    "A blue whale's heart is about the size of a small car.",
    'Lichens are a partnership between a fungus and an alga.',
  ],
  general: [
    'Honey never spoils, and pots found in ancient tombs were still edible.',
    'The Eiffel Tower grows more than fifteen centimetres taller in summer heat.',
    'A day on Venus lasts longer than a full year on Venus.',
    'Bananas are berries, while strawberries are not.',
    'The dot over a lowercase i is called a tittle.',
    'The shortest war in history lasted about thirty eight minutes.',
    'Smell is tied so closely to memory because of how the brain routes the signals.',
    'Cold water is slightly denser than hot water.',
    "The word alphabet comes from the first two Greek letters, alpha and beta.",
    'The Great Barrier Reef is the largest structure built by living things.',
    'Yawning is contagious in humans, and in some other animals too.',
    'A jiffy is a real unit of time used in physics and engineering.',
    'Go is the shortest complete sentence in English.',
    'A stack of ten thousand sheets of paper stands about one metre tall.',
    'Nepal is the only country whose national flag is not rectangular.',
    'Mount Everest grows roughly four millimetres taller every year.',
    'The first alarm clock could only be set to ring at four in the morning.',
    'A group of crows is called a murder.',
    'Bubble wrap was invented by accident, by people trying to sell textured wallpaper.',
    'The lining of your stomach replaces itself every few days.',
  ],
}

/* ══════════════════════════════════════════════════════════════
   Freshness

   A pool of facts is only refreshing if the next test does not open with something the
   last one already showed. That needs memory *across* tests, which is what these helpers
   provide: every fact that gets handed to the typist is remembered, and each new cycle
   puts the ones not seen lately ahead of the ones that were.

   Ids are `${category}:${index}`, so appending new facts to a category never invalidates
   the memory — and the stored list is filtered against the live corpus on load, so
   removing a fact is safe too.
   ══════════════════════════════════════════════════════════════ */

const RECENT_KEY = STORAGE_KEYS.recentFacts

// A session that has been running since before the rename already has a freshness memory
// under the old key. Move it before the first read below, or the library would look
// untouched and every fact would come round again.
migrateLegacyKeys()

/**
 * How many recently used facts the memory holds. Deliberately larger than the corpus, so
 * the list can express "everything except the unseen few" and, once every fact has been
 * used, still know which was used longest ago.
 */
const RECENT_LIMIT = 200

/** Every fact id in the current corpus. */
export const FACT_IDS: string[] = FACT_CATEGORY_ORDER.flatMap((category) =>
  FACTS[category].map((_, index) => `${category}:${index}`),
)

const FACTS_BY_ID = new Map<string, string>(
  FACT_CATEGORY_ORDER.flatMap((category) =>
    FACTS[category].map((text, index) => [`${category}:${index}`, text] as const),
  ),
)

export function factText(id: string): string {
  return FACTS_BY_ID.get(id) ?? ''
}

function readStored(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && FACTS_BY_ID.has(id))
  } catch {
    return []
  }
}

let recentIds: string[] = typeof window === 'undefined' ? [] : readStored()
let flushTimer: number | undefined

/** Newest last, oldest first — a plain LRU list. */
export function recentFactIds(): readonly string[] {
  return recentIds
}

/**
 * Records facts as used. The in-memory list updates immediately; the write to
 * localStorage is deferred, because this runs inside a keystroke (the buffer tops itself
 * up mid-typing) and a synchronous storage write there would land on the hot path.
 */
export function noteFactsUsed(ids: string[]): void {
  if (ids.length === 0) return
  for (const id of ids) {
    const at = recentIds.indexOf(id)
    if (at !== -1) recentIds.splice(at, 1)
    recentIds.push(id)
  }
  if (recentIds.length > RECENT_LIMIT) recentIds = recentIds.slice(-RECENT_LIMIT)

  if (typeof window === 'undefined') return
  window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds))
    } catch {
      // Storage disabled or full: freshness degrades to per-session, which is fine.
    }
  }, 900)
}

/**
 * Splits ids into the ones the typist has not seen lately and the ones they have, keeping
 * the given order inside each group. Consuming the result in order therefore starts with
 * fresh material and only revisits the recent set once the reserve is exhausted.
 */
export function orderByFreshness(ids: string[], recentOverride?: readonly string[]): string[] {
  const recentList = recentOverride ?? recentIds
  const rank = new Map(recentList.map((id, index) => [id, index] as const))
  const fresh: string[] = []
  const seen: string[] = []
  for (const id of ids) (rank.has(id) ? seen : fresh).push(id)
  // Within the already-seen group, the least recently used comes first — so a long session
  // keeps rotating through the whole corpus rather than drifting back over recent hits.
  seen.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
  return [...fresh, ...seen]
}
