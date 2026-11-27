// Pulls the student/teacher list from the timetable project (roster-feed) and applies it.
// Called hourly by pg_cron (x-sync-key) or by an admin from the panel ({token}).
// verify_jwt=false — authorization is checked here.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-sync-key',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const reply = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'method' }, 405)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: cfg, error: cfgErr } = await db.rpc('roster_sync_config')
  if (cfgErr || !cfg?.feed_url) return reply({ error: 'config' }, 500)

  const syncKey = req.headers.get('x-sync-key') || ''
  let ok = !!cfg.sync_key && syncKey === cfg.sync_key
  if (!ok) {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.token === 'string') {
      const { data } = await db.rpc('roster_admin_ok', { p_token: body.token })
      ok = data === true
    }
  }
  if (!ok) return reply({ error: 'forbidden' }, 403)

  try {
    const res = await fetch(cfg.feed_url, { headers: { 'x-api-key': cfg.feed_key } })
    if (!res.ok) throw new Error(`feed ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const feed = await res.json()
    const { data, error } = await db.rpc('apply_roster', { p: feed })
    if (error) throw new Error(error.message)
    return reply({ ok: true, result: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.rpc('roster_sync_failed', { p_error: msg })
    return reply({ error: 'sync_failed', detail: msg }, 502)
  }
})
