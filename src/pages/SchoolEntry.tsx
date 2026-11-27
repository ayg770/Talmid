import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getAccounts, forgetAccount, rememberAccount, switchAccount } from '../lib/account'
import { getLang } from '../lib/i18n'
import { Bi } from '../components/ui/Bi'
import { AdminPanel } from './AdminPanel'
import { adminLogin } from '../lib/portal'
import {
  Roster,
  SchoolError,
  SchoolPerson,
  Signed,
  cachedRoster,
  closeDevice,
  enterAsTest,
  enterStudent,
  isDeviceToken,
  loadRoster,
  openDevice,
  schoolFirstCode,
  schoolLogin,
} from '../lib/school'

// The school's front door. Everything is written in Hebrew and Russian together,
// so nobody has to switch languages before signing in.
// Classes → names (all on one screen, no scrolling). A teacher opens the device with
// their code; then a student only taps their name.

const ERRORS: Record<SchoolError | 'mismatch', { he: string; ru: string }> = {
  'no code yet': { he: 'עוד אין קוד — בחרו קוד חדש', ru: 'Кода ещё нет — придумайте новый' },
  locked: { he: 'יותר מדי ניסיונות. נסו שוב בעוד 10 דקות', ru: 'Слишком много попыток. Попробуйте через 10 минут' },
  'wrong code': { he: 'הקוד לא נכון', ru: 'Неверный код' },
  'already has a code': { he: 'כבר נבחר קוד. הקלידו אותו', ru: 'Код уже выбран. Введите его' },
  'device closed': { he: 'הכניסה נסגרה. מורה צריך לפתוח אותה שוב', ru: 'Вход закрыт. Учитель должен открыть его снова' },
  offline: { he: 'אין חיבור לשרת', ru: 'Нет связи с сервером' },
  other: { he: 'משהו השתבש, נסו שוב', ru: 'Что-то пошло не так, попробуйте ещё раз' },
  mismatch: { he: 'הקודים לא זהים, נסו שוב', ru: 'Коды не совпадают, попробуйте снова' },
}

const TEACHERS = '__teachers__'

type View =
  | { kind: 'classes' }
  | { kind: 'names'; group: string }
  | { kind: 'code'; person: SchoolPerson }
  | { kind: 'teacher'; person: SchoolPerson; signed: Signed; code: string }
  | { kind: 'ask-teacher'; person: SchoolPerson }
  | { kind: 'admin' }

const asError = (e: unknown) => (typeof e === 'string' ? e : 'other') as SchoolError

/** Sign in as this user on this device. Sign-ins through an open device replace each other. */
function signIn(signed: Signed, code: string) {
  if (isDeviceToken(code)) {
    for (const a of getAccounts()) if (isDeviceToken(a.code)) forgetAccount(a.id, false)
  }
  rememberAccount({ id: signed.id, name: signed.name, code })
  switchAccount(signed.id)
}

export function SchoolEntry({ onOther, notice }: { onOther: () => void; notice?: SchoolError | null }) {
  const [roster, setRoster] = useState<Roster | null>(cachedRoster)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>({ kind: 'classes' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SchoolError | null>(notice ?? null)

  const refresh = () =>
    loadRoster()
      .then((r) => {
        setRoster(r)
        setFailed(false)
      })
      .catch(() => setFailed(true))

  // Refresh in the background (new students, the device opened or closed elsewhere).
  useEffect(() => {
    void refresh()
  }, [])

  if (!roster)
    return (
      <div className="school school-classes">
        {failed ? (
          <>
            <Bi he={ERRORS.offline.he} ru={ERRORS.offline.ru} className="error" />
            <button className="btn primary" onClick={() => void refresh()}>
              <Bi he="נסו שוב" ru="Повторить" />
            </button>
          </>
        ) : (
          <div className="muted">…</div>
        )}
      </div>
    )

  const open = roster.open
  const back = () => setView({ kind: 'classes' })

  if (view.kind === 'code')
    return (
      <CodePad
        person={view.person}
        onBack={() => setView({ kind: 'names', group: view.person.class ?? TEACHERS })}
        onSigned={(signed, code) =>
          view.person.kind === 'teacher' ? setView({ kind: 'teacher', person: view.person, signed, code }) : signIn(signed, code)
        }
      />
    )

  if (view.kind === 'admin') return <AdminPanel onExit={back} />

  if (view.kind === 'teacher')
    return (
      <div className="school school-choice">
        <div className="school-bar">
          <button className="school-back" onClick={back}>
            <Bi he="→ חזרה" ru="← Назад" />
          </button>
        </div>
        <div className="code-who" dir="auto">
          {view.person.name}
        </div>
        <button
          className="choice-big open-choice"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await openDevice(view.person.id, view.code)
              await refresh()
              setError(null)
              back()
            } catch (e) {
              setError(asError(e))
            }
            setBusy(false)
          }}
        >
          <Bi he="🔓 לפתוח את הכניסה לתלמידים" ru="🔓 Открыть вход для учеников" />
          <Bi he="במכשיר הזה, עד סוף היום" ru="на этом устройстве, до конца дня" className="choice-sub" />
        </button>
        <button className="choice-big" disabled={busy} onClick={() => signIn(view.signed, view.code)}>
          <Bi he="להיכנס בעצמי" ru="Войти самому" />
        </button>
        <button
          className="choice-big test-choice"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const signed = await enterAsTest(view.person.id, view.code, getLang())
              signIn(signed, signed.token!)
            } catch (e) {
              setError(asError(e))
              setBusy(false)
            }
          }}
        >
          <Bi he="🧪 כניסה כתלמיד בדיקה" ru="🧪 Войти как тестовый ученик" />
          <Bi he="לנסות את החומרים בלי נקודות לתלמיד אמיתי" ru="попробовать материалы без баллов настоящему ученику" className="choice-sub" />
        </button>
        {view.person.admin && (
          <button
            className="choice-big admin-choice"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await adminLogin(view.person.id, view.code)
                setView({ kind: 'admin' })
              } catch {
                setError('other')
              }
              setBusy(false)
            }}
          >
            <Bi he="⚙️ פאנל ניהול" ru="⚙️ Панель управления" />
          </button>
        )}
        {error && <Bi he={ERRORS[error].he} ru={ERRORS[error].ru} className="error" />}
      </div>
    )

  if (view.kind === 'ask-teacher')
    return (
      <div className="school school-choice">
        <div className="school-bar">
          <button className="school-back" onClick={() => setView({ kind: 'names', group: view.person.class ?? TEACHERS })}>
            <Bi he="→ חזרה" ru="← Назад" />
          </button>
        </div>
        <div className="code-who" dir="auto">
          {view.person.name}
        </div>
        <div className="ask-teacher">🔒</div>
        <Bi he="הכניסה לתלמידים עוד סגורה. בקשו מהמורה לפתוח אותה" ru="Вход для учеников закрыт. Попросите учителя открыть его" className="code-prompt" />
        <button className="class-tile teacher-tile" onClick={() => setView({ kind: 'names', group: TEACHERS })}>
          <Bi he="כניסת מורה" ru="Вход для учителя" />
        </button>
        {view.person.has_code && (
          <button className="link" onClick={() => setView({ kind: 'code', person: view.person })}>
            <Bi he="יש לי קוד אישי" ru="У меня есть личный код" />
          </button>
        )}
      </div>
    )

  if (view.kind === 'names') {
    const people = roster.people.filter((p) =>
      view.group === TEACHERS ? p.kind === 'teacher' : p.kind === 'student' && p.class === view.group,
    )
    const cls = roster.classes.find((c) => c.id === view.group)
    const title = cls ? { he: `כיתה ${cls.he}׳`, ru: `${cls.ru} класс` } : { he: 'מורים', ru: 'Учителя' }

    const tap = async (p: SchoolPerson) => {
      if (p.kind === 'teacher') return setView({ kind: 'code', person: p })
      if (!open) return setView({ kind: 'ask-teacher', person: p })
      setBusy(true)
      try {
        const signed = await enterStudent(p.id, getLang())
        signIn(signed, signed.token!)
      } catch (e) {
        setBusy(false)
        const err = asError(e)
        setError(err)
        if (err === 'device closed') {
          await refresh()
          back()
        }
      }
    }

    return (
      <div className="school school-names">
        <div className="school-bar">
          <button className="school-back" onClick={back}>
            <Bi he="→ חזרה" ru="← Назад" />
          </button>
          <Bi he={title.he} ru={title.ru} className="school-title" />
          {error && <Bi he={ERRORS[error].he} ru={ERRORS[error].ru} className="error" />}
        </div>
        <FitGrid count={people.length} longest={Math.max(...people.map((p) => p.name.length), 4)}>
          {people.map((p) => (
            <button key={p.id} className="school-name" disabled={busy} onClick={() => void tap(p)}>
              <span dir="auto">{p.name}</span>
            </button>
          ))}
        </FitGrid>
      </div>
    )
  }

  return (
    <div className="school school-classes">
      {open ? (
        <div className="open-bar">
          <Bi he={`🔓 הכניסה פתוחה לתלמידים עד סוף היום — נפתחה ע״י ${open.teacher}`} ru={`🔓 Вход для учеников открыт до конца дня — открыл(а) ${open.teacher}`} />
          <button
            className="close-btn"
            onClick={async () => {
              await closeDevice()
              await refresh()
            }}
          >
            <Bi he="לסגור" ru="Закрыть" />
          </button>
        </div>
      ) : (
        <div className="open-bar closed">
          <Bi he="🔒 הכניסה לתלמידים סגורה — מורה פותח אותה עם הקוד שלו" ru="🔒 Вход для учеников закрыт — учитель открывает его своим кодом" />
        </div>
      )}
      <Bi he="מי נכנס? בחרו כיתה" ru="Кто входит? Выберите класс" className="school-title" />
      {error && <Bi he={ERRORS[error].he} ru={ERRORS[error].ru} className="error" />}
      <div className="school-frame">
        <div className="school-badge">
          <span className="he">חדר מנחם · מוסקבה</span>
          <span className="ru">Хедер Менахем · Москва</span>
        </div>
      <div className="class-grid">
        {roster.classes.map((c) => (
          <button
            key={c.id}
            className="class-tile"
            onClick={() => {
              setError(null)
              setView({ kind: 'names', group: c.id })
            }}
          >
            <span className="class-letter">{c.he}</span>
            <Bi he={`כיתה ${c.he}׳`} ru={`${c.ru} класс`} />
          </button>
        ))}
      </div>
      <div className="school-foot">
        <button
          className="class-tile teacher-tile"
          onClick={() => {
            setError(null)
            setView({ kind: 'names', group: TEACHERS })
          }}
        >
          <Bi he="כניסת מורה" ru="Вход для учителя" />
        </button>
      </div>
      </div>
      <div className="school-foot other">
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
function FitGrid({ count, longest, children }: { count: number; longest: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ cols: 3, font: 22 })

  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current
      if (!el || count === 0) return
      const W = el.clientWidth
      const H = el.clientHeight
      const gap = 10
      let best = { cols: 1, font: 10 }
      for (let cols = 1; cols <= Math.min(count, 8); cols++) {
        const rows = Math.ceil(count / cols)
        const w = (W - gap * (cols - 1)) / cols
        const h = (H - gap * (rows - 1)) / rows
        // Hebrew letters are about 0.55em wide; leave room for the padding.
        const font = Math.min(h * 0.42, (w - 16) / (longest * 0.55), 44)
        if (font > best.font) best = { cols, font }
      }
      setLayout({ cols: best.cols, font: Math.floor(best.font) })
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [count, longest])

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

/** Personal code on big digit buttons. The first time (teachers), chosen and typed twice. */
function CodePad({
  person,
  onBack,
  onSigned,
}: {
  person: SchoolPerson
  onBack: () => void
  onSigned: (signed: Signed, code: string) => void
}) {
  const [isNew, setIsNew] = useState(!person.has_code)
  const [code, setCode] = useState('')
  const [first, setFirst] = useState<string | null>(null)
  const [error, setError] = useState<SchoolError | 'mismatch' | null>(null)
  const [busy, setBusy] = useState(false)

  const enter = async (value: string) => {
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
      onSigned(signed, value)
    } catch (e) {
      const err = asError(e)
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
      ? { he: 'פעם ראשונה: בחרו קוד — 4 ספרות', ru: 'Первый вход: придумайте код — 4 цифры' }
      : { he: 'הקלידו את הקוד שוב', ru: 'Введите код ещё раз' }
  const err = error && ERRORS[error]

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
