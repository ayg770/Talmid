import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Bi } from '../components/ui/Bi'
import { supabase } from '../lib/supabase'

// A story unit: read the story (freely or at a set pace), then exercises at three
// levels. The first option of every choice question is the right one (they are
// shuffled on screen). Every answer is saved with how long it took; a level opens
// when the one before it was answered well and quickly.

export type Level = 'easy' | 'medium' | 'hard'
type Choice = { id: string; type: 'mc' | 'spelling' | 'fit' | 'plural' | 'gap'; q: string; options: string[] }
type TrueFalse = { id: string; type: 'tf'; q: string; answer: boolean; timed?: boolean }
type Match = { id: string; type: 'match'; q: string; pairs: [string, string][] }
type Order = { id: string; type: 'order'; q: string; items: string[] }
export type Exercise = Choice | TrueFalse | Match | Order
export type StoryContent = { lang: 'ru' | 'he'; text: string; levels: Record<Level, Exercise[]> }

const LEVELS: { id: Level; he: string; ru: string }[] = [
  { id: 'easy', he: 'קל', ru: 'Легко' },
  { id: 'medium', he: 'בינוני', ru: 'Средне' },
  { id: 'hard', he: 'קשה', ru: 'Сложно' },
]
/** To open the next level: this share right, and (easy) this fast on average. */
const PASS = 0.85
const FAST_MS = 7000
const TIMED_MS = 8000

type Answer = { level: Level; exercise: string; correct: boolean; ms: number }

function shuffle<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/** Passed a level: the latest answer to each of its exercises, enough right and fast. */
function passed(content: StoryContent, answers: Answer[], level: Level): boolean {
  const ids = content.levels[level].map((e) => e.id)
  const latest = new Map<string, Answer>()
  for (const a of answers) if (a.level === level) latest.set(a.exercise, a)
  if (ids.some((id) => !latest.has(id))) return false
  const list = ids.map((id) => latest.get(id)!)
  const right = list.filter((a) => a.correct).length / list.length
  const avg = list.reduce((s, a) => s + a.ms, 0) / list.length
  return right >= PASS && (level !== 'easy' || avg <= FAST_MS)
}

export function StoryUnit({
  title,
  unitId,
  userId,
  content,
  onBack,
}: {
  title: string
  unitId: string
  userId: string
  content: StoryContent
  onBack: () => void
}) {
  const [answers, setAnswers] = useState<Answer[]>([])
  const [view, setView] = useState<{ kind: 'menu' } | { kind: 'read' } | { kind: 'play'; level: Level }>({ kind: 'menu' })

  useEffect(() => {
    if (!supabase) return
    void supabase
      .from('unit_answers')
      .select('level, exercise, correct, ms')
      .eq('unit_id', unitId)
      .order('created_at')
      .then(({ data }) => setAnswers((data as Answer[] | null) ?? []))
  }, [unitId])

  const open = (l: Level) => l === 'easy' || passed(content, answers, l === 'medium' ? 'easy' : 'medium')
  const dir = content.lang === 'he' ? 'rtl' : 'ltr'

  const save = (a: Answer) => {
    setAnswers((prev) => [...prev, a])
    void supabase?.from('unit_answers').insert({ user_id: userId, unit_id: unitId, ...a })
  }

  if (view.kind === 'read') return <ReadText title={title} text={content.text} dir={dir} onBack={() => setView({ kind: 'menu' })} />
  if (view.kind === 'play')
    return (
      <Play
        key={view.level}
        content={content}
        level={view.level}
        dir={dir}
        onAnswer={save}
        onDone={() => setView({ kind: 'menu' })}
        nextOpens={(all) => view.level !== 'hard' && passed(content, all, view.level)}
        answersBefore={answers}
      />
    )

  return (
    <div className="portal story">
      <div className="school-bar">
        <button className="school-back" onClick={onBack}>
          <Bi he="→ חזרה" ru="← Назад" />
        </button>
        <span className="school-title" dir="auto">
          {title}
        </span>
      </div>
      <button className="portal-tile story-read" onClick={() => setView({ kind: 'read' })}>
        <span className="portal-icon">📖</span>
        <Bi he="קריאת הסיפור" ru="Читать рассказ" className="portal-title" />
      </button>
      <div className="level-row">
        {LEVELS.map((l) => {
          const ok = open(l.id)
          const done = passed(content, answers, l.id)
          return (
            <button key={l.id} className={`level-tile ${l.id} ${ok ? '' : 'locked'}`} disabled={!ok} onClick={() => setView({ kind: 'play', level: l.id })}>
              <span className="level-icon">{done ? '⭐' : ok ? '▶' : '🔒'}</span>
              <Bi he={l.he} ru={l.ru} />
              <span className="level-count">{content.levels[l.id].length}</span>
            </button>
          )
        })}
      </div>
      <Bi he="רמה נפתחת אחרי שעונים נכון ומהר על הרמה שלפניה" ru="Уровень открывается, когда предыдущий пройден верно и быстро" className="muted" />
    </div>
  )
}

/** The story, free reading or at a chosen pace (words light up one by one). */
function ReadText({ title, text, dir, onBack }: { title: string; text: string; dir: string; onBack: () => void }) {
  const words = useMemo(() => text.split(/(\s+)/), [text])
  const [wpm, setWpm] = useState<number | null>(null)
  const [pos, setPos] = useState(-1)

  useEffect(() => {
    if (!wpm) return
    setPos(0)
    const t = window.setInterval(() => setPos((p) => (p >= words.length ? p : p + 2)), 60000 / wpm)
    return () => window.clearInterval(t)
  }, [wpm, words.length])

  useEffect(() => {
    document.querySelector('.word.now')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [pos])

  return (
    <div className="portal story">
      <div className="school-bar">
        <button className="school-back" onClick={onBack}>
          <Bi he="→ חזרה" ru="← Назад" />
        </button>
        <span className="school-title" dir="auto">
          {title}
        </span>
      </div>
      <div className="pace-row">
        <Bi he="קריאה בקצב:" ru="Читать в темпе:" />
        {[40, 60, 90, 120].map((w) => (
          <button key={w} className={wpm === w ? 'chip-btn on' : 'chip-btn'} onClick={() => setWpm(wpm === w ? null : w)}>
            {w} <small>сл/мин</small>
          </button>
        ))}
      </div>
      <div className="panel story-text" dir={dir}>
        {words.map((w, i) =>
          /\s+/.test(w) ? (
            w.includes('\n') ? <br key={i} /> : ' '
          ) : (
            <span key={i} className={wpm ? (i === pos ? 'word now' : i < pos ? 'word read' : 'word') : 'word'}>
              {w}
            </span>
          ),
        )}
      </div>
    </div>
  )
}

/** One level: the exercises one after another, then the result. */
function Play({
  content,
  level,
  dir,
  onAnswer,
  onDone,
  nextOpens,
  answersBefore,
}: {
  content: StoryContent
  level: Level
  dir: string
  onAnswer: (a: Answer) => void
  onDone: () => void
  nextOpens: (all: Answer[]) => boolean
  answersBefore: Answer[]
}) {
  const list = content.levels[level]
  const [i, setI] = useState(0)
  const [mine, setMine] = useState<Answer[]>([])
  const start = useRef(Date.now())

  const answer = (correct: boolean) => {
    const a = { level, exercise: list[i].id, correct, ms: Date.now() - start.current }
    onAnswer(a)
    setMine((m) => [...m, a])
    window.setTimeout(() => {
      start.current = Date.now()
      setI((x) => x + 1)
    }, correct ? 700 : 1400)
  }

  if (i >= list.length) {
    const right = mine.filter((a) => a.correct).length
    const avg = Math.round(mine.reduce((s, a) => s + a.ms, 0) / Math.max(1, mine.length) / 100) / 10
    const opened = nextOpens([...answersBefore, ...mine])
    return (
      <div className="portal story result">
        <div className="result-stars">{right === list.length ? '🌟🌟🌟' : right >= list.length * PASS ? '🌟🌟' : '🌟'}</div>
        <Bi he={`${right} מתוך ${list.length} נכון`} ru={`${right} из ${list.length} верно`} className="school-title" />
        <Bi he={`בממוצע ${avg} שניות לשאלה`} ru={`В среднем ${avg} сек. на вопрос`} className="muted" />
        {opened && <Bi he="🎉 נפתחה הרמה הבאה!" ru="🎉 Открыт следующий уровень!" className="unlocked" />}
        <button className="btn primary" onClick={onDone}>
          <Bi he="המשך" ru="Дальше" />
        </button>
      </div>
    )
  }

  const ex = list[i]
  return (
    <div className="portal story">
      <div className="school-bar">
        <button className="school-back" onClick={onDone}>
          <Bi he="✕ יציאה" ru="✕ Выход" />
        </button>
        <div className="progress-dots">
          {list.map((e, k) => (
            <span key={e.id} className={k < i ? (mine[k]?.correct ? 'dot ok' : 'dot bad') : k === i ? 'dot now' : 'dot'} />
          ))}
        </div>
      </div>
      <div className="exercise" dir={dir} key={ex.id}>
        <div className="ex-q">{ex.q}</div>
        {ex.type === 'tf' && <TrueFalseEx ex={ex} onAnswer={answer} />}
        {(ex.type === 'mc' || ex.type === 'spelling' || ex.type === 'fit' || ex.type === 'plural' || ex.type === 'gap') && (
          <ChoiceEx ex={ex} onAnswer={answer} />
        )}
        {ex.type === 'match' && <MatchEx ex={ex} onAnswer={answer} />}
        {ex.type === 'order' && <OrderEx ex={ex} onAnswer={answer} />}
      </div>
    </div>
  )
}

function TrueFalseEx({ ex, onAnswer }: { ex: TrueFalse; onAnswer: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<boolean | null>(null)
  const pick = (v: boolean | null) => {
    if (picked !== null) return
    setPicked(v ?? !ex.answer)
    onAnswer(v === ex.answer)
  }
  useEffect(() => {
    if (!ex.timed) return
    const t = window.setTimeout(() => pick(null), TIMED_MS)
    return () => window.clearTimeout(t)
  })
  const cls = (v: boolean) => (picked === null ? '' : v === ex.answer ? 'right' : picked === v ? 'wrong' : '')
  return (
    <>
      {ex.timed && <div className="timer-bar" style={{ animationDuration: `${TIMED_MS}ms`, animationPlayState: picked === null ? 'running' : 'paused' }} />}
      <div className="tf-row">
        <button className={`choice tf yes ${cls(true)}`} onClick={() => pick(true)}>
          ✓ <Bi he="נכון" ru="Верно" />
        </button>
        <button className={`choice tf no ${cls(false)}`} onClick={() => pick(false)}>
          ✗ <Bi he="לא נכון" ru="Неверно" />
        </button>
      </div>
    </>
  )
}

function ChoiceEx({ ex, onAnswer }: { ex: Choice; onAnswer: (ok: boolean) => void }) {
  const options = useMemo(() => shuffle(ex.options.map((o, k) => ({ o, right: k === 0 }))), [ex])
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <div className={`choices ${ex.type}`}>
      {options.map((c, k) => (
        <button
          key={k}
          className={`choice ${picked === null ? '' : c.right ? 'right' : picked === k ? 'wrong' : 'dim'}`}
          onClick={() => {
            if (picked !== null) return
            setPicked(k)
            onAnswer(c.right)
          }}
        >
          {c.o}
        </button>
      ))}
    </div>
  )
}

/** Tap a word, then its pair: a line joins them. Right only if no wrong tries. */
function MatchEx({ ex, onAnswer }: { ex: Match; onAnswer: (ok: boolean) => void }) {
  const left = useMemo(() => shuffle(ex.pairs.map((p, k) => ({ t: p[0], k }))), [ex])
  const right = useMemo(() => shuffle(ex.pairs.map((p, k) => ({ t: p[1], k }))), [ex])
  const [sel, setSel] = useState<number | null>(null)
  const [done, setDone] = useState<number[]>([])
  const [bad, setBad] = useState<number | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; k: number }[]>([])

  useLayoutEffect(() => {
    const b = box.current
    if (!b) return
    const r0 = b.getBoundingClientRect()
    setLines(
      done.map((k) => {
        const a = b.querySelector(`[data-l="${k}"]`)!.getBoundingClientRect()
        const c = b.querySelector(`[data-r="${k}"]`)!.getBoundingClientRect()
        const ltr = a.left < c.left
        return {
          k,
          x1: (ltr ? a.right : a.left) - r0.left,
          y1: a.top + a.height / 2 - r0.top,
          x2: (ltr ? c.left : c.right) - r0.left,
          y2: c.top + c.height / 2 - r0.top,
        }
      }),
    )
  }, [done])

  const tapRight = (k: number) => {
    if (sel === null || done.includes(k)) return
    if (k === sel) {
      const next = [...done, k]
      setDone(next)
      setSel(null)
      if (next.length === ex.pairs.length) window.setTimeout(() => onAnswer(mistakes === 0), 400)
    } else {
      setMistakes((m) => m + 1)
      setBad(k)
      window.setTimeout(() => setBad(null), 500)
    }
  }

  return (
    <div className="match" ref={box}>
      <svg className="match-lines">
        {lines.map((l) => (
          <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={`c${l.k % 7}`} />
        ))}
      </svg>
      <div className="match-col">
        {left.map((w) => (
          <button
            key={w.k}
            data-l={w.k}
            className={`match-item ${done.includes(w.k) ? `done c${w.k % 7}` : sel === w.k ? 'sel' : ''}`}
            onClick={() => !done.includes(w.k) && setSel(w.k)}
          >
            {w.t}
          </button>
        ))}
      </div>
      <div className="match-col">
        {right.map((w) => (
          <button
            key={w.k}
            data-r={w.k}
            dir="auto"
            className={`match-item ${done.includes(w.k) ? `done c${w.k % 7}` : bad === w.k ? 'wrong' : ''}`}
            onClick={() => tapRight(w.k)}
          >
            {w.t}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Tap the events in the order they happened. Right only if no wrong taps. */
function OrderEx({ ex, onAnswer }: { ex: Order; onAnswer: (ok: boolean) => void }) {
  const items = useMemo(() => shuffle(ex.items.map((t, k) => ({ t, k }))), [ex])
  const [next, setNext] = useState(0)
  const [bad, setBad] = useState<number | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const tap = (k: number) => {
    if (k < next) return
    if (k === next) {
      setNext(next + 1)
      if (next + 1 === ex.items.length) window.setTimeout(() => onAnswer(mistakes === 0), 400)
    } else {
      setMistakes((m) => m + 1)
      setBad(k)
      window.setTimeout(() => setBad(null), 500)
    }
  }
  return (
    <div className="order">
      {items.map((it) => (
        <button key={it.k} className={`choice order-item ${it.k < next ? 'right' : bad === it.k ? 'wrong' : ''}`} onClick={() => tap(it.k)}>
          {it.k < next && <span className="order-num">{it.k + 1}</span>}
          {it.t}
        </button>
      ))}
    </div>
  )
}
