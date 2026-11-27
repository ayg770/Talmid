import { useEffect, useState } from 'react'
import {
  AdminState,
  AdminUnit,
  Target,
  adminLogout,
  adminState,
  deleteUnit,
  resetCode,
  saveUnit,
  setAdmin,
  setAudience,
  setModule,
} from '../lib/portal'
import { RosterStatus, rosterStatus, syncRosterNow } from '../lib/progress'
import { ProgressBoard } from './ProgressBoard'

// The admin panel (Hebrew only, like the school system's): what students see after
// signing in, learning units, and which teachers are admins.

type Tab = 'modules' | 'units' | 'progress' | 'teachers' | 'roster'

export function AdminPanel({ onExit }: { onExit: () => void }) {
  const [state, setState] = useState<AdminState | null>(null)
  const [tab, setTab] = useState<Tab>('modules')
  const [error, setError] = useState<string | null>(null)

  const reload = () =>
    adminState()
      .then((s) => {
        setState(s)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))

  useEffect(() => {
    void reload()
  }, [])

  /** Run a change, then show the fresh state. */
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const exit = () => {
    adminLogout()
    onExit()
  }

  if (error?.includes('admin session expired'))
    return (
      <div className="admin">
        <p className="error">פג תוקף הכניסה לפאנל. היכנסו שוב.</p>
        <button className="btn primary" onClick={exit}>
          חזרה למסך הכניסה
        </button>
      </div>
    )
  if (!state) return <div className="admin muted">{error ?? '…'}</div>

  return (
    <div className="admin" dir="rtl">
      <header className="admin-head">
        <h1>⚙️ ניהול אתר התלמידים</h1>
        <button className="btn small" onClick={exit}>
          יציאה
        </button>
      </header>
      <nav className="admin-tabs">
        {(
          [
            ['modules', '🧭 מה התלמידים רואים'],
            ['units', '🧩 יחידות לימוד'],
            ['progress', '📊 התקדמות'],
            ['teachers', '👩‍🏫 מורים ומנהלים'],
            ['roster', '🔄 רשימת התלמידים'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? 'admin-tab on' : 'admin-tab'} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {error && <p className="error">{error}</p>}

      {tab === 'modules' && (
        <div className="admin-list">
          <p className="muted">מה מופיע לתלמידים במסך הבית שלהם אחרי הכניסה, ולמי. מורים רואים תמיד את כל מה שפתוח.</p>
          {state.modules.map((m) => {
            const targets = targetsOf(state, 'module', m.key)
            return (
              <section key={m.key} className={`admin-card ${m.enabled && m.ready ? 'on' : ''}`}>
                <div className="admin-card-head">
                  <span className="admin-icon">{m.icon}</span>
                  <div className="admin-card-title">
                    <strong>{m.title_he}</strong>
                    <span className="muted">{m.title_ru}</span>
                  </div>
                  {m.ready ? (
                    <label className="switch">
                      <input type="checkbox" checked={m.enabled} onChange={(e) => void run(() => setModule(m.key, e.target.checked))} />
                      <span>{m.enabled ? 'פתוח' : 'סגור'}</span>
                    </label>
                  ) : (
                    <span className="soon">בקרוב — דורש חיבור</span>
                  )}
                </div>
                {m.ready && m.enabled && (
                  <AudienceEditor state={state} value={targets} onChange={(t) => void run(() => setAudience('module', m.key, t))} />
                )}
              </section>
            )
          })}
        </div>
      )}

      {tab === 'units' && <Units state={state} run={run} />}

      {tab === 'progress' && <ProgressBoard asAdmin />}

      {tab === 'roster' && <RosterSync onSynced={() => void reload()} />}

      {tab === 'teachers' && (
        <div className="admin-list">
          <p className="muted">מנהל יכול לפתוח את הפאנל הזה. "איפוס קוד" — המורה יבחר קוד חדש בכניסה הבאה.</p>
          <table className="admin-table">
            <thead>
              <tr>
                <th>מורה</th>
                <th>קוד</th>
                <th>מנהל</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.people
                .filter((p) => p.kind === 'teacher')
                .map((p) => (
                  <tr key={p.id}>
                    <td dir="auto">{p.name}</td>
                    <td>{p.has_code ? <span className="tag ok">יש קוד</span> : <span className="tag">עוד לא נכנס</span>}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={p.admin}
                        disabled={p.id === state.me}
                        title={p.id === state.me ? 'אי אפשר להסיר את עצמך' : ''}
                        onChange={(e) => void run(() => setAdmin(p.id, e.target.checked))}
                      />
                    </td>
                    <td>
                      {p.has_code && (
                        <button
                          className="link"
                          onClick={() => {
                            if (confirm(`לאפס את הקוד של ${p.name}?`)) void run(() => resetCode(p.id))
                          }}
                        >
                          איפוס קוד
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function targetsOf(state: AdminState, kind: 'module' | 'unit', key: string): Target[] {
  return state.audience
    .filter((a) => a.kind === kind && a.key === key)
    .map((a) => (a.target === 'all' ? { target: 'all' } : { target: a.target, id: a.id! }))
}

/** Who sees it: everyone, chosen classes, or chosen students (any mix of classes and students). */
function AudienceEditor({ state, value, onChange }: { state: AdminState; value: Target[]; onChange: (t: Target[]) => void }) {
  const all = value.some((t) => t.target === 'all')
  const classes = new Set(value.flatMap((t) => (t.target === 'class' ? [t.id] : [])))
  const students = new Set(value.flatMap((t) => (t.target === 'student' ? [t.id] : [])))
  const [pickIn, setPickIn] = useState<string | null>(null)

  const build = (c: Set<string>, s: Set<string>): Target[] => [
    ...[...c].map((id) => ({ target: 'class' as const, id })),
    ...[...s].map((id) => ({ target: 'student' as const, id })),
  ]
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }
  const studentsIn = (classId: string) => state.people.filter((p) => p.kind === 'student' && p.class === classId)
  const nobody = !all && classes.size === 0 && students.size === 0

  return (
    <div className="audience">
      <div className="audience-row">
        <span className="audience-label">למי:</span>
        <button className={all ? 'chip-btn on' : 'chip-btn'} onClick={() => onChange(all ? [] : [{ target: 'all' }])}>
          כל התלמידים
        </button>
        {!all &&
          state.classes.map((c) => (
            <button
              key={c.id}
              className={classes.has(c.id) ? 'chip-btn on' : 'chip-btn'}
              onClick={() => onChange(build(toggle(classes, c.id), students))}
            >
              כיתה {c.he}׳
            </button>
          ))}
      </div>
      {!all && (
        <div className="audience-row">
          <span className="audience-label">או תלמידים מסוימים מכיתה:</span>
          {state.classes.map((c) => {
            const n = studentsIn(c.id).filter((p) => students.has(p.id)).length
            return (
              <button key={c.id} className={pickIn === c.id ? 'chip-btn small on' : 'chip-btn small'} onClick={() => setPickIn(pickIn === c.id ? null : c.id)}>
                {c.he}׳{n > 0 ? ` (${n})` : ''}
              </button>
            )
          })}
        </div>
      )}
      {!all && pickIn && (
        <div className="audience-students">
          {studentsIn(pickIn).map((p) => (
            <label key={p.id} className={students.has(p.id) ? 'student-pick on' : 'student-pick'}>
              <input type="checkbox" checked={students.has(p.id)} onChange={() => onChange(build(classes, toggle(students, p.id)))} />
              <span dir="auto">{p.name}</span>
            </label>
          ))}
        </div>
      )}
      {nobody && <p className="warn">עדיין אף תלמיד לא רואה את זה — בחרו למי.</p>}
    </div>
  )
}

function Units({ state, run }: { state: AdminState; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState<AdminUnit | null>(null)
  const unitsOn = state.modules.find((m) => m.key === 'units')?.enabled

  if (editing)
    return (
      <div className="admin-list">
        <section className="admin-card on">
          <label className="field">
            כותרת
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} dir="auto" />
          </label>
          <div className="field-row">
            <label className="field">
              קטגוריה (עברית)
              <input value={editing.category_he ?? ''} onChange={(e) => setEditing({ ...editing, category_he: e.target.value })} placeholder="רוסית" />
            </label>
            <label className="field">
              קטגוריה (רוסית)
              <input value={editing.category_ru ?? ''} onChange={(e) => setEditing({ ...editing, category_ru: e.target.value })} dir="ltr" placeholder="Русский язык" />
            </label>
          </div>
          {editing.kind === 'story' && <p className="muted">📖 יחידת סיפור עם תרגילים בשלוש רמות. את הסיפור והתרגילים מכינים יחד עם Claude.</p>}
          {editing.kind !== 'story' && (
          <>
          <label className="field">
            תוכן / הסבר לתלמיד
            <textarea rows={8} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} dir="auto" />
          </label>
          <label className="field">
            קישור (לא חובה) — דף עבודה, סרטון, משחק
            <input value={editing.link ?? ''} onChange={(e) => setEditing({ ...editing, link: e.target.value })} dir="ltr" placeholder="https://…" />
          </label>
          </>
          )}
          <label className="switch">
            <input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} />
            <span>{editing.published ? 'מפורסם לתלמידים' : 'טיוטה (לא מוצג)'}</span>
          </label>
          <div className="admin-actions">
            <button
              className="btn primary"
              disabled={!editing.title.trim()}
              onClick={() =>
                void run(async () => {
                  await saveUnit(editing)
                  setEditing(null)
                })
              }
            >
              שמירה
            </button>
            <button className="btn" onClick={() => setEditing(null)}>
              ביטול
            </button>
          </div>
        </section>
      </div>
    )

  return (
    <div className="admin-list">
      {!unitsOn && <p className="warn">המודול "יחידות לימוד" סגור כרגע — פתחו אותו בלשונית "מה התלמידים רואים" כדי שהתלמידים יראו את היחידות.</p>}
      <button className="btn primary" onClick={() => setEditing({ title: '', body: '', link: null, published: false, sort_order: state.units.length })}>
        + יחידה חדשה
      </button>
      {state.units.map((u, k) => (
        <div key={u.id} className="admin-unit-wrap">
        {(k === 0 || state.units[k - 1].category_he !== u.category_he) && <h3 className="admin-group">{u.category_he ?? 'ללא קטגוריה'}</h3>}
        <section className={`admin-card ${u.published ? 'on' : ''}`}>
          <div className="admin-card-head">
            <span className="admin-icon">{u.kind === 'story' ? '📖' : '🧩'}</span>
            <div className="admin-card-title">
              <strong dir="auto">{u.title}</strong>
              <span className="muted">{u.published ? 'מפורסם' : 'טיוטה'}</span>
            </div>
            <button className="btn small" onClick={() => setEditing(u)}>
              עריכה
            </button>
            <button
              className="btn small danger"
              onClick={() => {
                if (confirm(`למחוק את "${u.title}"?`)) void run(() => deleteUnit(u.id!))
              }}
            >
              מחיקה
            </button>
          </div>
          <AudienceEditor state={state} value={targetsOf(state, 'unit', u.id!)} onChange={(t) => void run(() => setAudience('unit', u.id!, t))} />
        </section>
        </div>
      ))}
    </div>
  )
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Students and teachers come from the cheder and timetable systems, every hour. */
function RosterSync({ onSynced }: { onSynced: () => void }) {
  const [status, setStatus] = useState<RosterStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = () =>
    rosterStatus()
      .then(setStatus)
      .catch((e: Error) => setError(e.message))
  useEffect(() => {
    void load()
  }, [])
  const last = status?.last
  const failedLater = status?.error && (!last || status.error.at > last.at)
  return (
    <div className="admin-list">
      <p className="muted">
        רשימת התלמידים מתעדכנת לבד כל שעה ממערכת "חדר מנחם", והמורים — ממערכת לוח הזמנים. תלמיד שעזב לא נמחק: הוא מוסתר, והתשובות שלו נשמרות.
        כיתות שאין באתר (גן, א׳) לא נכנסות.
      </p>
      <section className={`admin-card sync-card ${failedLater ? 'bad' : 'on'}`}>
        <div className="sync-head">
          <div>
            <strong>{last ? `עודכן לאחרונה: ${when(last.at)}` : 'עוד לא עודכן'}</strong>
            {last && (
              <div className="sync-facts">
                <span>{last.students} תלמידים במקור</span>
                <span>{last.teachers} מורים</span>
                <span className={last.added ? 'pos' : ''}>+{last.added} חדשים</span>
                <span>{last.updated} שינויי שם/כיתה</span>
                <span className={last.left ? 'neg' : ''}>{last.left} הוסתרו</span>
              </div>
            )}
          </div>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await syncRosterNow()
                await load()
                onSynced()
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
                await load()
              }
              setBusy(false)
            }}
          >
            {busy ? 'מעדכן…' : '🔄 לעדכן עכשיו'}
          </button>
        </div>
        {failedLater && (
          <p className="error">
            העדכון האחרון נכשל ({when(status!.error!.at)}): {status!.error!.error}
          </p>
        )}
        {status && <p className="muted small">מוסתרים כרגע (עזבו או לא במקור): {status.inactive}</p>}
      </section>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
