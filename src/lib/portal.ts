import { supabase } from './supabase'
import { createClient } from '@supabase/supabase-js'

// The student's home (portal) and the admin panel that decides what is on it.

export type HomeModule = { key: string; he: string; ru: string; icon: string }
export type HomeUnit = { id: string; title: string; body: string; link: string | null }
export type MyHome = { name: string; kind: 'student' | 'teacher'; admin: boolean; modules: HomeModule[]; units: HomeUnit[] }

/** null: not a school user (they keep the reading app as their home). */
export async function myHome(): Promise<MyHome | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('my_home')
  if (error) {
    console.warn('my_home', error)
    return null
  }
  return (data as MyHome | null) ?? null
}

export async function loadNote(userId: string): Promise<string> {
  if (!supabase) return ''
  const { data } = await supabase.from('student_notes').select('body').eq('user_id', userId).maybeSingle()
  return (data?.body as string | undefined) ?? ''
}

export async function saveNote(userId: string, body: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('student_notes')
    .upsert({ user_id: userId, body, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Admin panel

export type AdminModule = { key: string; title_he: string; title_ru: string; icon: string; enabled: boolean; ready: boolean }
export type Target = { target: 'all' } | { target: 'class' | 'student'; id: string }
export type AudienceRow = { kind: 'module' | 'unit'; key: string; target: Target['target']; id: string | null }
export type AdminUnit = { id?: string; title: string; body: string; link: string | null; published: boolean; sort_order: number }
export type AdminPerson = { id: string; kind: 'student' | 'teacher'; class: string | null; name: string; admin: boolean; has_code: boolean }
export type AdminState = {
  me: string
  modules: AdminModule[]
  audience: AudienceRow[]
  units: AdminUnit[]
  classes: { id: string; he: string }[]
  people: AdminPerson[]
}

const TOKEN_KEY = 'school-admin'
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const client =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'admin' } }) : null

export const adminToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
export const adminLogout = () => {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!client) throw new Error('אין חיבור לשרת')
  const { data, error } = await client.rpc(fn, { p_token: adminToken(), ...args })
  if (error) {
    if (error.message.includes('admin session expired')) adminLogout()
    throw new Error(error.message)
  }
  return data as T
}

export async function adminLogin(person: string, code: string): Promise<void> {
  if (!client) throw new Error('אין חיבור לשרת')
  const { data, error } = await client.rpc('admin_login', { p_person: person, p_code: code })
  if (error) throw new Error(error.message)
  try {
    sessionStorage.setItem(TOKEN_KEY, (data as { token: string }).token)
  } catch {
    // ignore
  }
}

export const adminState = () => call<AdminState>('admin_state')
export const setModule = (key: string, enabled: boolean) => call('admin_set_module', { p_key: key, p_enabled: enabled })
export const setAudience = (kind: 'module' | 'unit', key: string, targets: Target[]) =>
  call('admin_set_audience', { p_kind: kind, p_key: key, p_targets: targets })
export const saveUnit = (unit: AdminUnit) => call<string>('admin_save_unit', { p_unit: unit })
export const deleteUnit = (id: string) => call('admin_delete_unit', { p_unit: id })
export const setAdmin = (person: string, admin: boolean) => call('admin_set_admin', { p_person: person, p_admin: admin })
export const resetCode = (person: string) => call('admin_reset_code', { p_person: person })
