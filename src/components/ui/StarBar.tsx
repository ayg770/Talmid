import { useEffect, useRef, useState } from 'react'
import { sfx } from '../../lib/audio'
import {
  ANIMALS,
  SCENES,
  STARS_PER_ANIMAL,
  animalName,
  animalsEarned,
  dismissNewAnimal,
  sceneAt,
  stationsReached,
  useStars,
} from '../../lib/stars'
import { Confetti } from './Confetti'
import { Pet } from './Pet'

const SCENES_COUNT = SCENES.length
import { t } from '../../lib/i18n'

/**
 * The fixed row of stars: total, ten slots filling toward the next animal
 * (shown as a silhouette until earned), and the newest animal earned.
 */
export function StarBar() {
  const { stars, loaded, newAnimal, newScene } = useStars()
  const [pop, setPop] = useState(false)
  const prev = useRef(stars)

  // A little bounce whenever a star is added.
  useEffect(() => {
    if (loaded && stars > prev.current) {
      setPop(true)
      const t = setTimeout(() => setPop(false), 600)
      prev.current = stars
      return () => clearTimeout(t)
    }
    prev.current = stars
  }, [stars, loaded])

  const inRow = stars % STARS_PER_ANIMAL
  const earned = animalsEarned(stars)
  const stations = stationsReached(stars)
  const arrived = stations < SCENES_COUNT

  return (
    <>
      <div className={pop ? 'star-bar pop' : 'star-bar'} aria-label={t('{n} כוכבים', { n: stars })}>
        <span className="star-total">
          ⭐<b>{stars}</b>
        </span>
        <span className="star-slots">
          {Array.from({ length: STARS_PER_ANIMAL }, (_, i) => (
            <span key={i} className={i < inRow ? 'slot on' : 'slot'}>
              {i < inRow ? '⭐' : ''}
            </span>
          ))}
        </span>
        {arrived ? (
          <span className="star-next" title={t('התחנה הבאה')}>
            {sceneAt(stations + 1)}
          </span>
        ) : (
          <span className="star-next earned">🏆</span>
        )}
        {earned > 0 && <Pet index={earned - 1} className="star-last" />}
      </div>
      {newAnimal && <NewAnimal index={ANIMALS.indexOf(newAnimal)} scene={newScene} onClose={dismissNewAnimal} />}
    </>
  )
}

function NewAnimal({ index, scene, onClose }: { index: number; scene: string | null; onClose: () => void }) {
  useEffect(() => {
    sfx.finish()
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div className="new-animal" onClick={onClose}>
      <Confetti fire={1} big />
      <div className="new-animal-card">
        {scene && <span className="new-scene">{scene}</span>}
        <Pet index={index} className="new-animal-pet" />
        <span className="new-animal-name">{animalName(ANIMALS[index])}</span>
        <span className="new-animal-stars">⭐⭐⭐</span>
      </div>
    </div>
  )
}

/** All the friends: earned ones in color with their name, the rest faded with the stars they need. */
export function AnimalCollection() {
  const { stars } = useStars()
  const earned = animalsEarned(stars)
  return (
    <div className="collection" aria-label={t('האוסף שלי')}>
      {ANIMALS.map((a, i) => {
        const state = i < earned ? 'on' : i === earned ? 'next' : ''
        return (
          <span key={a.id} className={`col-animal ${state}`}>
            <Pet index={i} />
            {i < earned ? (
              <span className="col-name">{animalName(a)}</span>
            ) : (
              <span className="col-stars">{(i + 1) * STARS_PER_ANIMAL} ⭐</span>
            )}
          </span>
        )
      })}
    </div>
  )
}
