import { createClient } from '@supabase/supabase-js'
import type { StoryContent } from '../pages/StoryUnit'
import { adminToken } from './portal'

// Teachers' progress board and the roster sync (admin). Teachers sign in with their own code;
// the session token is kept for this tab only.

export type ProgressUnit = { id: string; title: string; category: string | null; content: StoryContent }
export type ProgressStudent = { id: string; name: string; class: string | null; entered: boolean }
/** The latest answer of a student to one exercise (n = how many times it was answered). */
export type ProgressAnswer = { s: string; u: string; l: 'easy' | 'medium' | 'hard'; e: string; c: boolean; ms: number; n: number; at: string }
export type ProgressData = {
  me: string
  classes: { id: string; he: string }[]
  units: ProgressUnit[]
  students: ProgressStudent[]
  answers: ProgressAnswer[]
}
export type RosterStatus = {
  last: { at: string; added: number; updated: number; returned: number; left: number; students: number; teachers: number } | null
  error: { at: string; error: string } | null
  inactive: number
}

const STAFF_KEY = 'school-staff'
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const client =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'staff' } }) : null

export const staffToken = () => {
  try {
    return sessionStorage.getItem(STAFF_KEY)
  } catch {
    return null
  }
}
export const staffLogout = () => {
  try {
    sessionStorage.removeItem(STAFF_KEY)
  } catch {
    // ignore
  }
}

export async function staffLogin(person: string, code: string): Promise<void> {
  if (!client) throw new Error('אין חיבור לשרת')
  const { data, error } = await client.rpc('staff_login', { p_person: person, p_code: code })
  if (error) throw new Error(error.message)
  try {
    sessionStorage.setItem(STAFF_KEY, (data as { token: string }).token)
  } catch {
    // ignore
  }
}

/** The board's data — with the teacher's session, or the admin's (from the admin panel). */
export async function loadProgress(asAdmin = false): Promise<ProgressData> {
  if (!client) throw new Error('אין חיבור לשרת')
  const { data, error } = await client.rpc('staff_progress', { p_token: asAdmin ? adminToken() : staffToken() })
  if (error) {
    if (error.message.includes('session expired') && !asAdmin) staffLogout()
    throw new Error(error.message)
  }
  return data as ProgressData
}

export async function rosterStatus(): Promise<RosterStatus> {
  if (!client) throw new Error('אין חיבור לשרת')
  const { data, error } = await client.rpc('admin_roster_status', { p_token: adminToken() })
  if (error) throw new Error(error.message)
  return data as RosterStatus
}

/** Run the sync now (admin). Returns what changed. */
export async function syncRosterNow(): Promise<RosterStatus['last']> {
  if (!url || !anonKey) throw new Error('אין חיבור לשרת')
  const res = await fetch(`${url}/functions/v1/sync-roster`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: anonKey, authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ token: adminToken() }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.detail || body.error || `שגיאה ${res.status}`)
  return body.result
}
