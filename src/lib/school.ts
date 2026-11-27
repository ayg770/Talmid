import { createClient } from '@supabase/supabase-js'

// The school's front door: classes and names come from the school system.
// A teacher "opens" a device with their code until the end of the day; on an open
// device a student just taps their name. The list is kept on the device so the
// screen appears at once, and is refreshed in the background.

export type SchoolClass = { id: string; he: string; ru: string }
export type SchoolPerson = { id: string; kind: 'student' | 'teacher'; class: string | null; name: string; has_code: boolean; admin?: boolean }
export type OpenDevice = { teacher: string; until: string }
export type Roster = { classes: SchoolClass[]; people: SchoolPerson[]; open: OpenDevice | null }
export type Signed = { id: string; name: string; token?: string }

const ROSTER_KEY = 'school-roster'
const DEVICE_KEY = 'school-device'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const client =
  url && anonKey
    ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'school' } })
    : null

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // private mode
  }
}

const deviceToken = () => read(DEVICE_KEY)

export function cachedRoster(): Roster | null {
  try {
    const raw = read(ROSTER_KEY)
    if (!raw) return null
    const r = JSON.parse(raw) as Roster
    // "Open until" passed while the page was closed
    if (r.open && new Date(r.open.until) <= new Date()) r.open = null
    return r
  } catch {
    return null
  }
}

/** Errors the screen knows how to explain. */
export type SchoolError =
  | 'no code yet'
  | 'locked'
  | 'wrong code'
  | 'already has a code'
  | 'device closed'
  | 'offline'
  | 'other'

function toError(message: string | undefined): SchoolError {
  const known: SchoolError[] = ['no code yet', 'locked', 'wrong code', 'already has a code', 'device closed']
  return known.find((k) => message?.includes(k)) ?? 'other'
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!client) throw 'offline' as SchoolError
  const { data, error } = await client.rpc(fn, args)
  if (error) throw toError(error.message)
  return data as T
}

export async function loadRoster(): Promise<Roster> {
  const roster = await call<Roster>('school_roster', { p_device: deviceToken() })
  if (!roster.open) write(DEVICE_KEY, null)
  write(ROSTER_KEY, JSON.stringify(roster))
  return roster
}

export const schoolLogin = (person: string, code: string) =>
  call<Signed>('school_login', { p_person: person, p_code: code })

export const schoolFirstCode = (person: string, code: string, language: string) =>
  call<Signed>('school_first_code', { p_person: person, p_code: code, p_language: language })

/** A teacher opens this device for students until the end of the day. */
export async function openDevice(person: string, code: string): Promise<OpenDevice> {
  const r = await call<{ token: string; teacher: string; until: string }>('school_open', { p_person: person, p_code: code })
  write(DEVICE_KEY, r.token)
  return { teacher: r.teacher, until: r.until }
}

/** Close the device now (students signed in through it are signed out). */
export async function closeDevice(): Promise<void> {
  const token = deviceToken()
  write(DEVICE_KEY, null)
  if (token) await call('school_close', { p_device: token }).catch(() => undefined)
}

/** On an open device: a student taps their name and is in. */
export const enterStudent = (person: string, language: string) =>
  call<Signed>('school_enter', { p_device: deviceToken(), p_person: person, p_language: language })

/** Sign-ins made through an open device carry a long token instead of a personal code. */
export const isDeviceToken = (code: string) => code.length >= 32
