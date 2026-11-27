import { useEffect, useRef, useState } from 'react'
import { Bi } from '../components/ui/Bi'
import { HomeUnit, MyHome, loadNote, saveNote } from '../lib/portal'
import { StoryUnit } from './StoryUnit'

// A school user's home: the tiles the admin chose for them. "reading" opens the
// reading app (its own screens); the rest open here.

type Open = { kind: 'tiles' } | { kind: 'notes' } | { kind: 'units' } | { kind: 'unit'; unit: HomeUnit }

export function StudentHome({
  home,
  userId,
  onReading,
  onSwitchUser,
}: {
  home: MyHome
  userId: string
  onReading: () => void
  onSwitchUser: () => void
}) {
  const [open, setOpen] = useState<Open>({ kind: 'tiles' })
  const back = () => setOpen({ kind: 'tiles' })

  if (open.kind === 'notes') return <Notes userId={userId} onBack={back} />
  if (open.kind === 'unit' && open.unit.kind === 'story' && open.unit.content)
    return (
      <StoryUnit
        title={open.unit.title}
        unitId={open.unit.id}
        userId={userId}
        content={open.unit.content}
        onBack={() => setOpen({ kind: 'units' })}
      />
    )
  if (open.kind === 'unit') return <UnitView unit={open.unit} onBack={() => setOpen({ kind: 'units' })} />
  if (open.kind === 'units')
    return (
      <div className="portal">
        <PortalBar title={{ he: 'יחידות לימוד', ru: 'Учебные блоки' }} onBack={back} />
        {home.units.length === 0 ? (
          <Bi he="עוד אין יחידות לימוד" ru="Учебных блоков пока нет" className="muted portal-empty" />
        ) : (
          <div className="portal-grid">
            {home.units.map((u) => (
              <button key={u.id} className="portal-tile unit-tile" onClick={() => setOpen({ kind: 'unit', unit: u })}>
                <span className="portal-icon">{u.kind === 'story' ? '📖' : '🧩'}</span>
                <span className="portal-title" dir="auto">
                  {u.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )

  const tap = (key: string) => {
    if (key === 'reading') onReading()
    else if (key === 'notes') setOpen({ kind: 'notes' })
    else if (key === 'units') setOpen({ kind: 'units' })
  }

  return (
    <div className="portal">
      <div className="portal-top">
        <button className="user-chip" onClick={onSwitchUser}>
          <span className="who-avatar small">{home.name.slice(0, 1)}</span>
          <span dir="auto">{home.name}</span> ⇄
        </button>
      </div>
      <Bi he={`שלום, ${home.name.split(' ')[0]}!`} ru={`Привет, ${home.name.split(' ')[0]}!`} className="school-title" />
      <div className="portal-grid">
        {home.modules.map((m) => (
          <button key={m.key} className="portal-tile" onClick={() => tap(m.key)}>
            <span className="portal-icon">{m.icon}</span>
            <Bi he={m.he} ru={m.ru} className="portal-title" />
          </button>
        ))}
      </div>
      {home.modules.length === 0 && <Bi he="עוד לא נפתח כאן כלום" ru="Здесь пока ничего не открыто" className="muted portal-empty" />}
    </div>
  )
}

function PortalBar({ title, onBack }: { title: { he: string; ru: string }; onBack: () => void }) {
  return (
    <div className="school-bar">
      <button className="school-back" onClick={onBack}>
        <Bi he="→ חזרה" ru="← Назад" />
      </button>
      <Bi he={title.he} ru={title.ru} className="school-title" />
    </div>
  )
}

function UnitView({ unit, onBack }: { unit: HomeUnit; onBack: () => void }) {
  return (
    <div className="portal">
      <div className="school-bar">
        <button className="school-back" onClick={onBack}>
          <Bi he="→ חזרה" ru="← Назад" />
        </button>
        <span className="school-title" dir="auto">
          {unit.title}
        </span>
      </div>
      <div className="panel unit-body" dir="auto">
        {unit.body}
      </div>
      {unit.link && (
        <a className="btn primary unit-link" href={unit.link} target="_blank" rel="noreferrer">
          <Bi he="פתיחה ▶" ru="Открыть ▶" />
        </a>
      )}
    </div>
  )
}

/** Personal notes: saved by themselves a moment after typing stops. */
function Notes({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [state, setState] = useState<'saved' | 'saving' | 'error'>('saved')
  const timer = useRef<number>()

  useEffect(() => {
    void loadNote(userId).then(setText)
  }, [userId])

  const change = (v: string) => {
    setText(v)
    setState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      saveNote(userId, v)
        .then(() => setState('saved'))
        .catch(() => setState('error'))
    }, 800)
  }

  return (
    <div className="portal">
      <PortalBar title={{ he: 'הפתקים שלי', ru: 'Мои заметки' }} onBack={onBack} />
      {text === null ? (
        <div className="muted">…</div>
      ) : (
        <textarea className="notes-area" value={text} onChange={(e) => change(e.target.value)} dir="auto" autoFocus />
      )}
      <span className={`notes-state ${state}`}>
        {state === 'saving' ? (
          <Bi he="שומר…" ru="Сохраняю…" />
        ) : state === 'error' ? (
          <Bi he="לא נשמר — בדקו חיבור" ru="Не сохранено — проверьте связь" />
        ) : (
          <Bi he="✓ נשמר" ru="✓ Сохранено" />
        )}
      </span>
    </div>
  )
}
