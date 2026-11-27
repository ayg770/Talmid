import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { rememberAccount, switchAccount } from '../lib/account'
import { getLang } from '../lib/i18n'
import {
  Roster,
  SchoolError,
  SchoolPerson,
  cachedRoster,
  forgetSchool,
  getSchoolKey,
  loadRoster,
  schoolFirstCode,
  schoolLogin,
} from '../lib/school'

// The school's front door. Everything is written in Hebrew and Russian together,
// so nobody has to switch languages before signing in.
// Classes → names (all on one screen, no scrolling) → personal code.

/** One text in both languages: Hebrew on top, Russian under it. */
function Bi({ he, ru, className = '' }: { he: string; ru: string; className?: string }) {
  return (
    <span className={`bi ${className}`}>
      <span className="bi-he" dir="rtl">
        {he}
      </span>
      <span className="bi-ru" dir="ltr">
        {ru}
      </span>
    </span>
  )
}

const ERRORS: Record<SchoolError, { he: string; ru: string }> = {
  'bad school key': { he: 'קוד בית הספר לא נכון', ru: 'Неверный код школы' },
  'no code yet': { he: 'עוד אין קוד — בחרו קוד חדש', ru: 'Кода ещё нет — придумайте новый' },
  locked: { he: 'יותר מדי ניסיונות. נסו שוב בעוד 10 דקות', ru: 'Слишком много попыток. Попробуйте через 10 минут' },
  'wrong code': { he: 'הקוד לא נכון', ru: 'Неверный код' },
  'already has a code': { he: 'כבר נבחר קוד. הקלידו אותו', ru: 'Код уже выбран. Введите его' },
  offline: { he: 'אין חיבור לשרת', ru: 'Нет связи с сервером' },
  other: { he: 'משהו השתבש, נסו שוב', ru: 'Что-то пошло не так, попробуйте ещё раз' },
}

const TEACHERS = '__teachers__'

type View = { kind: 'classes' } | { kind: 'names'; group: string } | { kind: 'code'; person: SchoolPerson }

export function SchoolEntry({ onOther }: { onOther: () => void }) {
  const [roster, setRoster] = useState<Roster | null>(cachedRoster)
  const [needKey, setNeedKey] = useState(!getSchoolKey())
  const [view, setView] = useState<View>({ kind: 'classes' })

  // Refresh the list in the background (new students, codes chosen on other devices).
  useEffect(() => {
    const key = getSchoolKey()
    if (!key) return
    loadRoster(key)
      .then(setRoster)
      .catch((e: SchoolError) => {
        if (e === 'bad school key') {
          forgetSchool()
          setRoster(null)
          setNeedKey(true)
        }
      })
  }, [])

  if (needKey || !roster)
    return (
      <SchoolKey
        onDone={(r) => {
          setRoster(r)
          setNeedKey(false)
        }}
        onOther={onOther}
      />
    )

  if (view.kind === 'code')
    return <CodePad person={view.person} onBack={() => setView({ kind: 'names', group: view.person.class ?? TEACHERS })} />

  if (view.kind === 'names') {
    const people = roster.people.filter((p) =>
      view.group === TEACHERS ? p.kind === 'teacher' : p.kind === 'student' && p.class === view.group,
    )
    const cls = roster.classes.find((c) => c.id === view.group)
    const title = cls ? { he: `כיתה ${cls.he}׳`, ru: `${cls.ru} класс` } : { he: 'מורים', ru: 'Учителя' }
    return (
      <div className="school school-names">
        <div className="school-bar">
          <button className="school-back" onClick={() => setView({ kind: 'classes' })}>
            <Bi he="→ חזרה" ru="← Назад" />
          </button>
          <Bi he={title.he} ru={title.ru} className="school-title" />
        </div>
        <FitGrid count={people.length}>
          {people.map((p) => (
            <button key={p.id} className="school-name" onClick={() => setView({ kind: 'code', person: p })}>
              <span dir="auto">{p.name}</span>
            </button>
          ))}
        </FitGrid>
      </div>
    )
  }

  return (
    <div className="school school-classes">
      <Bi he="מי נכנס? בחרו כיתה" ru="Кто входит? Выберите класс" className="school-title" />
      <div className="class-grid">
        {roster.classes.map((c) => (
          <button key={c.id} className="class-tile" onClick={() => setView({ kind: 'names', group: c.id })}>
            <span className="class-letter">{c.he}</span>
            <Bi he={`כיתה ${c.he}׳`} ru={`${c.ru} класс`} />
          </button>
        ))}
      </div>
      <div className="school-foot">
        <button className="class-tile teacher-tile" onClick={() => setView({ kind: 'names', group: TEACHERS })}>
          <Bi he="כניסת מורה" ru="Вход для учителя" />
        </button>
        <button className="link" onClick={onOther}>
          <Bi he="כניסה אחרת" ru="Другой вход" />
        </button>
      </div>
    </div>
  )
}

/**
 * Lays the names out in as many columns as needed so they all fit on the screen
 * without scrolling, with the largest text that still fits.
 */
function FitGrid({ count, children }: { count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ cols: 3, font: 22 })

  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current
      if (!el || count === 0) return
      const W = el.clientWidth
      const H = el.clientHeight
      const gap = 8
      let best = { cols: 1, font: 12 }
      // Try every column count; keep the one that gives the tallest cells (a name ≈ 4:1).
      for (let cols = 1; cols <= Math.min(count, 8); cols++) {
        const rows = Math.ceil(count / cols)
        const w = (W - gap * (cols - 1)) / cols
        const h = (H - gap * (rows - 1)) / rows
        const font = Math.min(h * 0.42, w / 7.5, 40)
        if (font > best.font) best = { cols, font }
      }
      setLayout({ cols: best.cols, font: Math.floor(best.font) })
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [count])

  const rows = Math.ceil(count / layout.cols)
  return (
    <div
      ref={ref}
      className="fit-grid"
      style={{
        gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        fontSize: `${layout.font}px`,
      }}
    >
      {children}
    </div>
  )
}

/** Personal code: typed on big digit buttons. The first time, chosen and typed twice. */
function CodePad({ person, onBack }: { person: SchoolPerson; onBack: () => void }) {
  const [isNew, setIsNew] = useState(!person.has_code)
  const [code, setCode] = useState('')
  const [first, setFirst] = useState<string | null>(null)
  const [error, setError] = useState<SchoolError | 'mismatch' | null>(null)
  const [busy, setBusy] = useState(false)

  const enter = async (value: string) => {
    if (busy) return
    setError(null)
    if (isNew && first === null) {
      setFirst(value)
      setCode('')
      return
    }
    if (isNew && first !== value) {
      setError('mismatch')
      setFirst(null)
      setCode('')
      return
    }
    setBusy(true)
    try {
      const signed = isNew ? await schoolFirstCode(person.id, value, getLang()) : await schoolLogin(person.id, value)
      rememberAccount({ id: signed.id, name: signed.name, code: value })
      switchAccount(signed.id)
    } catch (e) {
      const err = (typeof e === 'string' ? e : 'other') as SchoolError
      if (err === 'no code yet') setIsNew(true)
      if (err === 'already has a code') setIsNew(false)
      setFirst(null)
      setError(err)
      setCode('')
      setBusy(false)
    }
  }

  const press = (d: string) => {
    if (busy) return
    const next = (code + d).slice(0, 4)
    setCode(next)
    if (next.length === 4) void enter(next)
  }

  const prompt = !isNew
    ? { he: 'הקלידו את הקוד שלכם', ru: 'Введите свой код' }
    : first === null
      ? { he: 'בחרו קוד חדש — 4 ספרות', ru: 'Придумайте код — 4 цифры' }
      : { he: 'הקלידו את הקוד שוב', ru: 'Введите код ещё раз' }
  const err = error === 'mismatch' ? { he: 'הקודים לא זהים, נסו שוב', ru: 'Коды не совпадают, попробуйте снова' } : error && ERRORS[error]

  return (
    <div className="school school-code">
      <div className="school-bar">
        <button className="school-back" onClick={onBack}>
          <Bi he="→ חזרה" ru="← Назад" />
        </button>
      </div>
      <div className="code-who" dir="auto">
        {person.name}
      </div>
      <Bi he={prompt.he} ru={prompt.ru} className="code-prompt" />
      <div className="code-dots" dir="ltr">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < code.length ? 'dot on' : 'dot'} />
        ))}
      </div>
      {err && <Bi he={err.he} ru={err.ru} className="error" />}
      <div className="code-pad" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)} disabled={busy}>
            {d}
          </button>
        ))}
        <button className="pad-clear" onClick={() => setCode(code.slice(0, -1))} disabled={busy} aria-label="delete">
          ⌫
        </button>
        <button onClick={() => press('0')} disabled={busy}>
          0
        </button>
        <span />
      </div>
      {busy && <div className="muted">…</div>}
    </div>
  )
}

/** Once per device: the school key opens the class list. */
function SchoolKey({ onDone, onOther }: { onDone: (r: Roster) => void; onOther: () => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState<SchoolError | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onDone(await loadRoster(key.trim()))
    } catch (err) {
      setError((typeof err === 'string' ? err : 'other') as SchoolError)
      setBusy(false)
    }
  }

  return (
    <div className="school school-key">
      <Bi he="כניסה לתלמידי בית הספר" ru="Вход для учеников школы" className="school-title" />
      <form className="panel key-form" onSubmit={submit}>
        <Bi he="קוד בית הספר (פעם אחת במכשיר הזה)" ru="Код школы (один раз на этом устройстве)" />
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          className="key-input"
        />
        {error && <Bi he={ERRORS[error].he} ru={ERRORS[error].ru} className="error" />}
        <button className="btn primary" disabled={busy || key.trim().length < 4}>
          {busy ? '…' : <Bi he="המשך" ru="Далее" />}
        </button>
      </form>
      <button className="link" onClick={onOther}>
        <Bi he="אני לא מבית הספר" ru="Я не из школы" />
      </button>
    </div>
  )
}
