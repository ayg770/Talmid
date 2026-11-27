import { createClient } from '@supabase/supabase-js'

// School sign-in: the class list and names come from the school system. Reading them
// (and signing in) needs the school key, which a school device stores once.
// The list is kept on the device, so the screen appears at once and is refreshed
// in the background.

export type SchoolClass = { id: string; he: string; ru: string }
export type SchoolPerson = { id: string; kind: 'student' | 'teacher'; class: string | null; name: string; has_code: boolean }
export type Roster = { classes: SchoolClass[]; people: SchoolPerson[] }

const KEY_KEY = 'school-key'
const ROSTER_KEY = 'school-roster'

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

export const getSchoolKey = () => read(KEY_KEY)
export const forgetSchool = () => {
  write(KEY_KEY, null)
  write(ROSTER_KEY, null)
}

export function cachedRoster(): Roster | null {
  try {
    const raw = read(ROSTER_KEY)
    return raw ? (JSON.parse(raw) as Roster) : null
  } catch {
    return null
  }
}

/** Errors the screen knows how to explain. */
export type SchoolError = 'bad school key' | 'no code yet' | 'locked' | 'wrong code' | 'already has a code' | 'offline' | 'other'

function toError(message: string | undefined): SchoolError {
  const known: SchoolError[] = ['bad school key', 'no code yet', 'locked', 'wrong code', 'already has a code']
  return known.find((k) => message?.includes(k)) ?? 'other'
}

/** Fetch the roster with a key; stores both when the key is right. */
export async function loadRoster(key: string): Promise<Roster> {
  if (!client) throw 'offline' as SchoolError
  const { data, error } = await client.rpc('school_roster', { p_key: key })
  if (error) throw toError(error.message)
  const roster = data as Roster
  write(KEY_KEY, key)
  write(ROSTER_KEY, JSON.stringify(roster))
  return roster
}

type Signed = { id: string; name: string }

export async function schoolLogin(person: string, code: string): Promise<Signed> {
  if (!client) throw 'offline' as SchoolError
  const { data, error } = await client.rpc('school_login', { p_key: getSchoolKey(), p_person: person, p_code: code })
  if (error) throw toError(error.message)
  return data as Signed
}

export async function schoolFirstCode(person: string, code: string, language: string): Promise<Signed> {
  if (!client) throw 'offline' as SchoolError
  const { data, error } = await client.rpc('school_first_code', {
    p_key: getSchoolKey(),
    p_person: person,
    p_code: code,
    p_language: language,
  })
  if (error) throw toError(error.message)
  return data as Signed
}
