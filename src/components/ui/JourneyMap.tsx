import { useEffect, useRef, useState } from 'react'
import { speakUi } from '../../lib/audio'
import { t } from '../../lib/i18n'
import { ANIMALS, SCENES, STARS_PER_ANIMAL, animalName, animalsEarned, sceneAt, stationsReached, useStars } from '../../lib/stars'
import { Pet } from './Pet'

const STEP = 116 // horizontal distance between stations
const HEIGHT = 330
const NODES = SCENES.length + 1 // the start and every station

const x = (i: number) => 70 + i * STEP
const y = (i: number) => 200 + Math.sin(i * 0.9) * 34

/** Position along the road for a (fractional) station number. */
function at(p: number): { x: number; y: number } {
  const i = Math.min(NODES - 1, Math.max(0, Math.floor(p)))
  const f = Math.min(1, p - i)
  const j = Math.min(NODES - 1, i + 1)
  return { x: x(i) + (x(j) - x(i)) * f, y: y(i) + (y(j) - y(i)) * f }
}

/**
 * The journey: a winding road through the countryside with a station every 10 stars. The
 * traveler walks along it as stars are earned; the newest friends walk behind (tap one!).
 */
export function JourneyMap() {
  const { stars } = useStars()
  const scroller = useRef<HTMLDivElement>(null)
  const [wiggle, setWiggle] = useState<number | null>(null)

  const progress = Math.min(NODES - 1, stars / STARS_PER_ANIMAL)
  const reached = stationsReached(stars)
  const friends = animalsEarned(stars)
  const me = at(progress)
  const width = x(NODES - 1) + 80

  // Bring the traveler to the middle of the view.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ left: Math.max(0, me.x - el.clientWidth / 2), behavior: 'smooth' })
  }, [me.x])

  const road = Array.from({ length: NODES }, (_, i) => `${i ? 'L' : 'M'}${x(i)},${y(i)}`).join(' ')
  const walked = `M${x(0)},${y(0)} ` + Array.from({ length: Math.floor(progress) }, (_, k) => `L${x(k + 1)},${y(k + 1)}`).join(' ') + ` L${me.x},${me.y}`

  // The last few friends walk behind the traveler.
  const followers = ANIMALS.slice(0, friends).slice(-3)

  return (
    <div className="journey" ref={scroller} dir="ltr" aria-label={t('המסע שלי')}>
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
        <defs>
          <linearGradient id="journey-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9fd8ff" />
            <stop offset="1" stopColor="#e3f4ff" />
          </linearGradient>
        </defs>
        <rect width={width} height={HEIGHT} fill="url(#journey-sky)" />
        <circle cx={width - 90} cy={70} r={36} fill="#ffe27a" />
        <g fill="#fff" opacity={0.9}>
          {Array.from({ length: Math.ceil(width / 420) }, (_, k) => (
            <ellipse key={k} cx={260 + k * 420} cy={k % 2 ? 105 : 125} rx={k % 2 ? 60 : 46} ry={15} />
          ))}
        </g>
        {Array.from({ length: Math.ceil(NODES / 2) }, (_, k) => (
          <ellipse key={k} cx={x(k * 2) + 40} cy={HEIGHT - 50} rx={170} ry={70} fill="#8fd18c" />
        ))}
        <rect y={HEIGHT - 90} width={width} height={90} fill="#6cc070" />
        <path d={road} className="road-bed" />
        <path d={road} className="road-top" />
        <path d={road} className="road-future" />
        <path d={walked} className="road-walked" />
        {Array.from({ length: NODES }, (_, i) => {
          const passed = i <= reached
          const last = i === NODES - 1
          return (
            <g key={i} className={passed ? 'station passed' : 'station'} transform={`translate(${x(i)},${y(i)})`}>
              <circle r={last ? 30 : 26} />
              <text className="scene" textAnchor="middle" dy={last ? '0.38em' : '0.36em'} fontSize={last ? 34 : 26}>
                {sceneAt(i)}
              </text>
            </g>
          )
        })}
        {followers.map((a, k) => {
          const pos = at(Math.max(0, progress - 0.34 * (followers.length - k)))
          const index = friends - followers.length + k
          return (
            <Pet
              key={a.id}
              index={index}
              x={pos.x - 23}
              y={pos.y - 70}
              width={46}
              height={46}
              className={wiggle === index ? 'follower wiggle' : 'follower'}
              onClick={() => {
                setWiggle(index)
                void speakUi(animalName(a) + '!')
                window.setTimeout(() => setWiggle(null), 900)
              }}
            />
          )
        })}
        <text x={me.x} y={me.y - 28} textAnchor="middle" fontSize={40} className="traveler">
          🧒
        </text>
      </svg>
    </div>
  )
}
