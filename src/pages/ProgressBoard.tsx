import { Fragment, useEffect, useMemo, useState } from 'react'
import { Exercise, Level, passed } from './StoryUnit'
import { ProgressAnswer, ProgressData, ProgressUnit, loadProgress, staffLogout } from '../lib/progress'

// Teachers' progress board (Hebrew, like the admin panel): per class, every student's stars,
// accuracy, speed and last activity; a student's detail by unit and level; and the questions
// most students get wrong.

const LEVELS: { id: Level; he: string }[] = [
  { id: 'easy', he: 'קל' },
  { id: 'medium', he: 'בינוני' },
  { id: 'hard', he: 'קשה' },
]
const LEVEL_HE: Record<Level, string> = { easy: 'קל', medium: 'בינוני', hard: 'קשה' }
const DAY = 24 * 3600 * 1000

type Sort = 'name' | 'stars' | 'recent'
type StudentRow = {
  id: string
  name: string
  entered: boolean
  stars: number
  started: number
  answered: number
  right: number
  avgMs: number | null
  last: number | null
  units: Map<string, ProgressAnswer[]>
}

const toAnswer = (a: ProgressAnswer) => ({ level: a.l, exercise: a.e, correct: a.c, ms: a.ms })

function ago(t: number | null): string {
  if (t === null) return '—'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.ceil((today.getTime() - t) / DAY)
  if (t >= today.getTime()) return 'היום'
  if (days <= 1) return 'אתמול'
  if (days < 7) return `לפני ${days} ימים`
  return new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

const pctClass = (p: number) => (p >= 0.85 ? 'good' : p >= 0.6 ? 'mid' : 'bad')
const pct = (p: number) => `${Math.round(p * 100)}%`
const secs = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} ש׳`)

function correctText(ex: Exercise): string {
  switch (ex.type) {
    case 'tf':
      return ex.answer ? 'נכון' : 'לא נכון'
    case 'match':
      return ex.pairs.map(([a, b]) => `${a} – ${b}`).join(' · ')
    case 'order':
      return ex.items.join(' ← ')
    default:
      return ex.options[0]
  }
}

export function ProgressBoard({ asAdmin = false, onExit }: { asAdmin?: boolean; onExit?: () => void }) {
  const [data, setData] = useState<ProgressData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cls, setCls] = useState<string | null>(null)
  const [tab, setTab] = useState<'students' | 'hard'>('students')
  const [sort, setSort] = useState<Sort>('name')
  const [open, setOpen] = useState<string | null>(null)

  const reload = () =>
    loadProgress(asAdmin)
      .then((d) => {
        setData(d)
        setError(null)
        setCls((c) => c ?? d.classes[0]?.id ?? null)
      })
      .catch((e: Error) => setError(e.message))

  useEffect(() => {
    void reload()
  }, [])

  const unitsById = useMemo(() => new Map((data?.units ?? []).map((u) => [u.id, u])), [data])

  const rows = useMemo<StudentRow[]>(() => {
    if (!data) return []
    const by = new Map<string, Map<string, ProgressAnswer[]>>()
    for (const a of data.answers) {
      if (!unitsById.has(a.u)) continue
      let m = by.get(a.s)
      if (!m) by.set(a.s, (m = new Map()))
      const list = m.get(a.u)
      if (list) list.push(a)
      else m.set(a.u, [a])
    }
    return data.students
      .filter((s) => s.class === cls)
      .map((s) => {
        const units = by.get(s.id) ?? new Map<string, ProgressAnswer[]>()
        let stars = 0
        let answered = 0
        let right = 0
        let ms = 0
        let last: number | null = null
        for (const [uid, list] of units) {
          const unit = unitsById.get(uid)!
          const answers = list.map(toAnswer)
          stars += LEVELS.filter((l) => passed(unit.content, answers, l.id)).length
          for (const a of list) {
            answered++
            if (a.c) right++
            ms += a.ms
            const t = Date.parse(a.at)
            if (last === null || t > last) last = t
          }
        }
        return { id: s.id, name: s.name, entered: s.entered, stars, started: units.size, answered, right, avgMs: answered ? ms / answered : null, last, units }
      })
      .sort((a, b) =>
        sort === 'stars'
          ? b.stars - a.stars || b.answered - a.answered
          : sort === 'recent'
            ? (b.last ?? 0) - (a.last ?? 0)
            : a.name.localeCompare(b.name, 'he'),
      )
  }, [data, cls, sort, unitsById])

  const hard = useMemo(() => {
    if (!data) return []
    const inClass = new Set(rows.map((r) => r.id))
    const agg = new Map<string, { unit: ProgressUnit; level: Level; ex: Exercise; n: number; right: number; tries: number }>()
    for (const a of data.answers) {
      if (!inClass.has(a.s)) continue
      const unit = unitsById.get(a.u)
      const ex = unit?.content.levels[a.l]?.find((e) => e.id === a.e)
      if (!unit || !ex) continue
      const key = `${a.u}|${a.l}|${a.e}`
      let g = agg.get(key)
      if (!g) agg.set(key, (g = { unit, level: a.l, ex, n: 0, right: 0, tries: 0 }))
      g.n++
      if (a.c) g.right++
      g.tries += a.n
    }
    return [...agg.values()]
      .filter((g) => g.n >= 2 && g.right / g.n < 0.85)
      .sort((a, b) => a.right / a.n - b.right / b.n || b.n - a.n)
      .slice(0, 30)
  }, [data, rows, unitsById])

  if (error?.includes('session expired'))
    return (
      <div className="admin progress">
        <p className="error">פג תוקף הכניסה. היכנסו שוב עם הקוד.</p>
        {onExit && (
          <button className="btn primary" onClick={onExit}>
            חזרה
          </button>
        )}
      </div>
    )
  if (!data) return <div className="admin muted">{error ?? '…'}</div>

  const totalStars = data.units.length * 3
  const entered = rows.filter((r) => r.entered).length
  const week = rows.filter((r) => r.last !== null && r.last > Date.now() - 7 * DAY).length
  const classAnswered = rows.reduce((s, r) => s + r.answered, 0)
  const classRight = rows.reduce((s, r) => s + r.right, 0)
  const classStars = rows.reduce((s, r) => s + r.stars, 0)

  return (
    <div className={asAdmin ? 'progress' : 'admin progress'} dir="rtl">
      {!asAdmin && (
        <header className="admin-head">
          <h1>📊 התקדמות התלמידים</h1>
          <div className="row-gap">
            <button className="btn small" onClick={() => void reload()}>
              רענון
            </button>
            {onExit && (
              <button
                className="btn small"
                onClick={() => {
                  staffLogout()
                  onExit()
                }}
              >
                יציאה
              </button>
            )}
          </div>
        </header>
      )}

      <nav className="class-chips">
        {data.classes.map((c) => (
          <button
            key={c.id}
            className={c.id === cls ? 'class-chip on' : 'class-chip'}
            onClick={() => {
              setCls(c.id)
              setOpen(null)
            }}
          >
            כיתה {c.he}׳
          </button>
        ))}
      </nav>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-num">
            {entered}/{rows.length}
          </span>
          <span className="stat-label">נכנסו לאתר</span>
        </div>
        <div className="stat">
          <span className="stat-num">{week}</span>
          <span className="stat-label">פעילים השבוע</span>
        </div>
        <div className="stat">
          <span className="stat-num">⭐ {classStars}</span>
          <span className="stat-label">כוכבים בכיתה</span>
        </div>
        <div className="stat">
          <span className={`stat-num ${classAnswered ? pctClass(classRight / classAnswered) : ''}`}>
            {classAnswered ? pct(classRight / classAnswered) : '—'}
          </span>
          <span className="stat-label">תשובות נכונות</span>
        </div>
      </div>

      <div className="progress-bar-row">
        <nav className="admin-tabs">
          <button className={tab === 'students' ? 'admin-tab on' : 'admin-tab'} onClick={() => setTab('students')}>
            👦 תלמידים
          </button>
          <button className={tab === 'hard' ? 'admin-tab on' : 'admin-tab'} onClick={() => setTab('hard')}>
            ❗ שאלות קשות {hard.length > 0 && <span className="count-badge">{hard.length}</span>}
          </button>
        </nav>
        {tab === 'students' && (
          <label className="sort-pick">
            מיון:
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="name">לפי שם</option>
              <option value="stars">לפי כוכבים</option>
              <option value="recent">לפי פעילות אחרונה</option>
            </select>
          </label>
        )}
      </div>

      {tab === 'students' &&
        (rows.length === 0 ? (
          <p className="muted">אין תלמידים בכיתה הזו.</p>
        ) : (
          <table className="admin-table progress-table">
            <thead>
              <tr>
                <th>תלמיד</th>
                <th>כוכבים</th>
                <th>יחידות</th>
                <th>נכונות</th>
                <th>זמן לתשובה</th>
                <th>פעילות אחרונה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className={`progress-row ${open === r.id ? 'open' : ''} ${r.answered ? '' : 'idle'}`} onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td>
                      <span className="p-name">
                        <span className="caret">{open === r.id ? '▾' : '◂'}</span>
                        {r.name}
                        {!r.entered && <span className="tag grey">לא נכנס עדיין</span>}
                      </span>
                    </td>
                    <td>
                      <div className="stars-cell">
                        <strong>⭐ {r.stars}</strong>
                        <span className="mini-bar">
                          <span style={{ width: `${totalStars ? (r.stars / totalStars) * 100 : 0}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="num">
                      {r.started}/{data.units.length}
                    </td>
                    <td className="num">{r.answered ? <span className={`pct ${pctClass(r.right / r.answered)}`}>{pct(r.right / r.answered)}</span> : '—'}</td>
                    <td className="num">{secs(r.avgMs)}</td>
                    <td className={r.last !== null && r.last > Date.now() - 7 * DAY ? 'recent' : 'muted'}>{ago(r.last)}</td>
                  </tr>
                  {open === r.id && (
                    <tr className="detail-row">
                      <td colSpan={6}>
                        <StudentDetail row={r} units={data.units} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        ))}

      {tab === 'hard' &&
        (hard.length === 0 ? (
          <p className="muted">אין עדיין שאלות שרוב התלמידים בכיתה טועים בהן (נספרות שאלות ששני תלמידים לפחות ענו עליהן).</p>
        ) : (
          <div className="hard-list">
            <p className="muted">לפי התשובה האחרונה של כל תלמיד. מהקשה ביותר.</p>
            {hard.map((g) => (
              <div key={`${g.unit.id}${g.level}${g.ex.id}`} className="hard-item">
                <div className={`hard-pct ${pctClass(g.right / g.n)}`}>
                  <strong>{pct(g.right / g.n)}</strong>
                  <span>
                    {g.right}/{g.n} ענו נכון
                  </span>
                </div>
                <div className="hard-body">
                  <div className="hard-where">
                    {g.unit.title} · {LEVEL_HE[g.level]}
                    {g.tries > g.n && <span className="muted"> · {(g.tries / g.n).toFixed(1)} ניסיונות בממוצע</span>}
                  </div>
                  <div className="hard-q" dir="auto">
                    {g.ex.q}
                  </div>
                  <div className="hard-a" dir="auto">
                    ✓ {correctText(g.ex)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}

function StudentDetail({ row, units }: { row: StudentRow; units: ProgressUnit[] }) {
  if (row.started === 0) return <p className="muted">עוד לא ענה על אף תרגיל.</p>
  const shown = units.filter((u) => row.units.has(u.id))
  return (
    <div className="detail">
      <table className="detail-table">
        <thead>
          <tr>
            <th>יחידה</th>
            {LEVELS.map((l) => (
              <th key={l.id}>{l.he}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((u) => {
            const list = row.units.get(u.id)!
            const answers = list.map(toAnswer)
            return (
              <tr key={u.id}>
                <td className="d-unit">{u.title}</td>
                {LEVELS.map((l) => {
                  const total = u.content.levels[l.id]?.length ?? 0
                  const mine = list.filter((a) => a.l === l.id)
                  if (mine.length === 0) return <td key={l.id} className="cell none">—</td>
                  const right = mine.filter((a) => a.c).length
                  const ok = passed(u.content, answers, l.id)
                  const avg = mine.reduce((s, a) => s + a.ms, 0) / mine.length
                  return (
                    <td key={l.id} className={`cell ${ok ? 'done' : 'part'}`}>
                      <strong>{ok ? '⭐ עבר' : `${mine.length}/${total}`}</strong>
                      <span>
                        {pct(right / mine.length)} · {secs(avg)}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      {shown.length < units.length && <p className="muted small">{units.length - shown.length} יחידות שעוד לא התחיל לא מוצגות.</p>}
    </div>
  )
}
