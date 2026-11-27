import { useEffect, useState } from 'react'
import { useContent } from '../lib/content'
import { activeGroup } from '../lib/items'
import { Learner, UnitProgress, getLearner, loadUnitProgress, loadWeekCounts } from '../lib/supabase'
import { STAGES, type Unit } from '../data/curriculum'
import { nextUnit, stageName, unitTitle } from '../lib/plan'
import { JourneyMap } from '../components/ui/JourneyMap'
import { AnimalCollection } from '../components/ui/StarBar'
import { Pet } from '../components/ui/Pet'
import { ANIMALS, SCENES, STARS_PER_ANIMAL, animalsEarned, sceneAt, stationsReached, useStars } from '../lib/stars'
import { t } from '../lib/i18n'

export type GameId =
  | 'hear_syllable'
  | 'read_aloud'
  | 'syllable_train'
  | 'build_word'
  | 'similar_letters'
  | 'right_letter'
  | 'read_text'
  | 'rsvp'

type GameCard = { id: GameId; icon: string; title: string; subtitle: string; color: string }

/** The games are books in the library, on two shelves. */
const SHELVES: { title: string; games: GameCard[] }[] = [
  {
    title: t('שומעים ומדברים'),
    games: [
      { id: 'hear_syllable', icon: '👂', title: t('שמע ובחר'), subtitle: t('שומעים ובוחרים'), color: '#3a78c9' },
      { id: 'read_aloud', icon: '🗣️', title: t('קרא בקול'), subtitle: t('רואים וקוראים'), color: '#c2475f' },
      { id: 'syllable_train', icon: '🚂', title: t('רכבת ההברות'), subtitle: t('מיקרופון פתוח, הרכבת נוסעת'), color: '#c97d0e' },
      { id: 'build_word', icon: '🧩', title: t('בנה מילה'), subtitle: t('מחברים הברות'), color: '#3b9a6e' },
    ],
  },
  {
    title: t('אותיות וקריאה'),
    games: [
      { id: 'similar_letters', icon: '🔍', title: t('אותיות דומות'), subtitle: t('מי מהן?'), color: '#7656c2' },
      { id: 'right_letter', icon: '✅', title: t('האות הנכונה'), subtitle: t('הפוכה, שבורה, או נכונה?'), color: '#2b8fa8' },
      { id: 'read_text', icon: '📖', title: t('קריאת טקסט'), subtitle: t('טקסטים משלי'), color: '#b0582f' },
      { id: 'rsvp', icon: '⚡', title: t('קריאה בשטף'), subtitle: t('מילים בזו אחר זו, בקצב שבוחרים'), color: '#5f7a1f' },
    ],
  },
]

/** Rounds a week that fill a game's bar. */
const WEEK_GOAL = 5

type Props = {
  userName: string
  onPlay: (id: GameId) => void
  onSettings: () => void
  onPlan: () => void
  onLesson: (u: Unit) => void
  onSwitchUser: () => void
  /** School users: back to their home screen. */
  onPortal?: () => void
}

export function Home({ userName, onPlay, onSettings, onPlan, onLesson, onSwitchUser, onPortal }: Props) {
  const content = useContent()
  const { stars } = useStars()
  const [learner, setLearner] = useState<Learner | null>(null)
  useEffect(() => {
    void getLearner().then(setLearner)
  }, [content])
  const group = activeGroup(content, learner)
  const [progress, setProgress] = useState<UnitProgress[] | null>(null)
  const [week, setWeek] = useState<Record<string, number>>({})
  useEffect(() => {
    void loadUnitProgress().then(setProgress)
    void loadWeekCounts().then(setWeek)
  }, [])

  const next = progress ? nextUnit(progress) : null
  const stage = next ? STAGES.find((s) => s.units.includes(next)) : null
  const stageDone = stage ? stage.units.filter((u) => progress?.find((p) => p.unit_code === u.code)?.done).length : 0

  const friends = animalsEarned(stars)
  const allFriends = friends >= ANIMALS.length
  const inRow = stars % STARS_PER_ANIMAL
  const stations = stationsReached(stars)

  return (
    <div className="home">
      <div className="home-top">
        <button className="user-chip" onClick={onSwitchUser} aria-label={t('החלפת משתמש')}>
          <span className="who-avatar small">{userName.slice(0, 1)}</span>
          {userName} ⇄
        </button>
        <div className="home-top-end">
          <span className="star-pill" aria-label={t('{n} כוכבים', { n: stars })}>
            ⭐ <b>{stars}</b>
          </span>
          {onPortal && (
            <button className="round-btn" onClick={onPortal} aria-label={t('חזרה')}>
              🏠
            </button>
          )}
          <button className="round-btn" onClick={onSettings} aria-label={t('הגדרות')}>
            ⚙️
          </button>
        </div>
      </div>

      <div className="home-land">
        <div className="land-title">
          <h1>{t('{name} קורא', { name: userName })}</h1>
          <p className="nikud-row">בַּ בִּ בָּ</p>
          {group && <p className="group-tag">⭐ {group.name}</p>}
        </div>
        <JourneyMap />
      </div>

      <div className="go-wrap">
        <button className="go" disabled={!progress} onClick={() => (next ? onLesson(next) : onPlan())}>
          <span className="go-play">▶</span>
          <b>{t('יוצאים לדרך')}</b>
        </button>
        {next && (
          <p className="today">
            {t('היום:')} <b>{t('שיעור של 3 דקות')}</b> · {unitTitle(next)}
          </p>
        )}
        {progress && !next && <p className="today">{t('כל המסלול הושלם! אפשר לבחור משחק מהספרייה.')}</p>}
        <button className="btn plan-btn" onClick={onPlan}>
          📋 {t('מסלול הלימוד')}
        </button>
      </div>

      <div className="gauges">
        <div className="gauge">
          <Ring frac={allFriends ? 1 : inRow / STARS_PER_ANIMAL} color="#ffc61a">
            {allFriends ? '🏆' : `${inRow}/${STARS_PER_ANIMAL}`}
          </Ring>
          <b>{t('לחבר הבא')}</b>
          {allFriends ? (
            <small>{t('כל החברים כאן!')}</small>
          ) : (
            <small>
              {t('עוד {n} ⭐', { n: STARS_PER_ANIMAL - inRow })} <Pet index={friends} className="gauge-pet" />
            </small>
          )}
        </div>
        <button className="gauge" onClick={onPlan}>
          <Ring frac={stage ? stageDone / stage.units.length : 1} color="#2fa86b">
            {stage ? `${stageDone}/${stage.units.length}` : '✓'}
          </Ring>
          <b>{stage ? stageName(stage) : t('מסלול הלימוד')}</b>
          <small>{stage ? t('{done} מתוך {all} משימות', { done: stageDone, all: stage.units.length }) : t('הושלם')}</small>
        </button>
        <div className="gauge">
          <Ring frac={stations / SCENES.length} color="#3e8ef7">{`${stations}/${SCENES.length}`}</Ring>
          <b>{t('המסע')}</b>
          <small>{t('תחנה {scene} מתוך {all}', { scene: sceneAt(stations), all: SCENES.length })}</small>
        </div>
      </div>

      <h2 className="library-title">{t('הספרייה של {name}', { name: userName })}</h2>
      <div className="bookcase">
        <p className="shelf-label">{t('החברים למסע · כל 10 כוכבים מצטרף חבר')}</p>
        <AnimalCollection />
        <div className="plank" />
        {SHELVES.map((shelf) => (
          <div key={shelf.title}>
            <p className="shelf-label">{shelf.title}</p>
            <div className="books">
              {shelf.games.map((g) => {
                const done = week[g.id] ?? 0
                return (
                  <button key={g.id} className="book" style={{ background: g.color }} onClick={() => onPlay(g.id)}>
                    {done > 0 && <span className="ribbon" />}
                    <span className="book-icon">{g.icon}</span>
                    <span className="book-title">{g.title}</span>
                    <span className="book-sub">{g.subtitle}</span>
                    <span className="book-meter" aria-hidden="true">
                      <i style={{ width: `${Math.min(1, done / WEEK_GOAL) * 100}%` }} />
                    </span>
                    <span className="book-count">
                      {done >= WEEK_GOAL
                        ? t('{n} השבוע ✓', { n: done })
                        : done
                          ? t('{n} מתוך {goal} השבוע', { n: done, goal: WEEK_GOAL })
                          : t('עוד לא השבוע')}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="plank" />
          </div>
        ))}
      </div>
    </div>
  )
}

function Ring({ frac, color, children }: { frac: number; color: string; children: React.ReactNode }) {
  const c = 2 * Math.PI * 31
  return (
    <span className="ring">
      <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r="31" fill="none" stroke="#eef2f5" strokeWidth="8" />
        <circle cx="38" cy="38" r="31" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span className="ring-in">{children}</span>
    </span>
  )
}
