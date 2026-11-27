import { useEffect, useState } from 'react'
import { speakUi } from './audio'
import { getLang, t } from './i18n'
import { addStars, getLearner } from './supabase'

// Stars across all games. The journey: every STARS_PER_ANIMAL stars the traveler reaches the
// next station, and the animal of that station joins the trip.

export const STARS_PER_ANIMAL = 10

/** The scenery of each station on the way; the last one is the destination. */
export const SCENES = ['🌳', '🌲', '🌉', '🏞️', '🌾', '⛰️', '🏔️', '🏜️', '🌵', '🏖️', '🌊', '🏝️', '🌴', '🏕️', '🌋', '🏰', '🌅', '🌃', '🌄', '🏡', '⛲', '🕍']

/**
 * The friends who join the journey, in order: only kosher animals, each family growing up
 * (small, big, wise with glasses, bearded, white-bearded). `name` is the key for t(); in
 * Hebrew the name is shown with nikud, so reading it is practice too. Drawn in Pet.tsx.
 */
export const ANIMALS: { id: string; name: string; nikud: string }[] = [
  { id: 'fledgling', name: 'גוזל', nikud: 'גּוֹזָל' },
  { id: 'bird', name: 'ציפור', nikud: 'צִפּוֹר' },
  { id: 'wise-bird', name: 'ציפור חכמה', nikud: 'צִפּוֹר חֲכָמָה' },
  { id: 'chick', name: 'אפרוח', nikud: 'אֶפְרוֹחַ' },
  { id: 'pullet', name: 'פרגית', nikud: 'פַּרְגִּית' },
  { id: 'rooster', name: 'תרנגול', nikud: 'תַּרְנְגוֹל' },
  { id: 'bearded-rooster', name: 'תרנגול עם זקן', nikud: 'תַּרְנְגוֹל עִם זָקָן' },
  { id: 'white-bearded-rooster', name: 'תרנגול עם זקן לבן', nikud: 'תַּרְנְגוֹל עִם זָקָן לָבָן' },
  { id: 'kid', name: 'גדי', nikud: 'גְּדִי' },
  { id: 'goat', name: 'עז', nikud: 'עֵז' },
  { id: 'wise-goat', name: 'עז חכמה', nikud: 'עֵז חֲכָמָה' },
  { id: 'bearded-goat', name: 'תיש עם זקן', nikud: 'תַּיִשׁ עִם זָקָן' },
  { id: 'white-bearded-goat', name: 'תיש עם זקן לבן', nikud: 'תַּיִשׁ עִם זָקָן לָבָן' },
  { id: 'sheep', name: 'כבשה', nikud: 'כִּבְשָׂה' },
  { id: 'deer', name: 'צבי', nikud: 'צְבִי' },
  { id: 'cow', name: 'פרה', nikud: 'פָּרָה' },
  { id: 'ox', name: 'שור', nikud: 'שׁוֹר' },
]

/** A friend's name in the interface language (with nikud in Hebrew). */
export function animalName(a: (typeof ANIMALS)[number]): string {
  return getLang() === 'he' ? a.nikud : t(a.name)
}

export function animalsEarned(stars: number): number {
  return Math.min(ANIMALS.length, Math.floor(stars / STARS_PER_ANIMAL))
}

/** Stations reached on the road: one every STARS_PER_ANIMAL stars, up to the destination. */
export function stationsReached(stars: number): number {
  return Math.min(SCENES.length, Math.floor(stars / STARS_PER_ANIMAL))
}

/** Next animal to earn, or null when he has them all. */
export function nextAnimal(stars: number) {
  return ANIMALS[animalsEarned(stars)] ?? null
}

/** Scenery of the station the traveler has just reached, or the home start. */
export function sceneAt(stationsReached: number): string {
  return stationsReached <= 0 ? '🏠' : (SCENES[stationsReached - 1] ?? '🕍')
}

type State = {
  stars: number
  loaded: boolean
  newAnimal: (typeof ANIMALS)[number] | null
  newScene: string | null
}

let state: State = { stars: 0, loaded: false, newAnimal: null, newScene: null }
const listeners = new Set<(s: State) => void>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l(state))
}

let loading: Promise<void> | null = null
function load() {
  loading ??= getLearner().then((l) => set({ stars: l?.stars ?? 0, loaded: true }))
  return loading
}

export function useStars(): State {
  const [s, setS] = useState(state)
  useEffect(() => {
    listeners.add(setS)
    void load()
    return () => {
      listeners.delete(setS)
    }
  }, [])
  return s
}

/** A right answer: one more star, and a new animal every STARS_PER_ANIMAL. */
export function earnStar() {
  const before = state.stars
  const after = before + 1
  const earned = animalsEarned(after) > animalsEarned(before) ? ANIMALS[animalsEarned(after) - 1] : null
  set({ stars: after, newAnimal: earned ?? state.newAnimal, newScene: earned ? sceneAt(animalsEarned(after)) : state.newScene })
  if (earned) setTimeout(() => void speakUi(animalName(earned) + '!'), 1800)
  void addStars(1).then((total) => {
    // The server's count wins if another device added stars meanwhile.
    if (total !== null && total > state.stars) set({ stars: total })
  })
}

export function dismissNewAnimal() {
  set({ newAnimal: null, newScene: null })
}
