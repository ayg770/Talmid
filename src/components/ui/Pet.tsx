import type { SVGProps } from 'react'
import { ANIMALS } from '../../lib/stars'

// The journey friends, drawn instead of emoji so they can grow up, wear glasses and beards.
// Each drawing is a 100x100 picture standing on its feet at the bottom.

type Bird = {
  s: number
  body: string
  belly: string
  wing: string
  comb?: 'big' | 'small'
  wattle?: boolean
  tail?: [string, string]
  beard?: string
  beardLine?: string
  glasses?: boolean
  open?: boolean
  fuzz?: string
  nest?: boolean
}

type Goat = {
  s: number
  fur: string
  line?: string
  ear: string
  muzzle: string
  horns?: 'small' | 'big'
  horn?: string
  beard?: string
  beardLine?: string
  glasses?: boolean
}

const glasses = (x1: number, y: number, x2: number, r: number) =>
  `<g stroke="#2b2b2b" stroke-width="2.2" fill="rgba(255,255,255,.28)"><circle cx="${x1}" cy="${y}" r="${r}"/><circle cx="${x2}" cy="${y}" r="${r}"/><path d="M${x1 + r} ${y} Q${(x1 + x2) / 2} ${y - 3} ${x2 - r} ${y}" fill="none"/></g>`

const scaled = (g: string, s: number) => `<g transform="translate(50 97) scale(${s}) translate(-50 -97)">${g}</g>`

function bird(o: Bird): string {
  let g = ''
  if (o.nest) g += `<path d="M18 80 Q50 104 82 80 Q50 90 18 80Z" fill="#a8743f"/><path d="M20 80 Q50 72 80 80" stroke="#c79358" stroke-width="5" fill="none"/>`
  if (o.tail) g += `<path d="M68 60 Q94 30 86 16 Q82 34 64 50Z" fill="${o.tail[0]}"/><path d="M70 66 Q100 50 97 30 Q88 48 66 58Z" fill="${o.tail[1]}"/><path d="M68 72 Q98 72 99 52 Q88 64 64 66Z" fill="${o.tail[0]}"/>`
  if (!o.nest) g += `<path d="M43 86 v9 M57 86 v9 M38 95 h9 M52 95 h9" stroke="#e99a1e" stroke-width="3.2" stroke-linecap="round"/>`
  g += `<ellipse cx="50" cy="66" rx="25" ry="22" fill="${o.body}"/><ellipse cx="50" cy="72" rx="15" ry="12" fill="${o.belly}"/>`
  g += `<ellipse cx="27" cy="65" rx="7" ry="13" fill="${o.wing}" transform="rotate(16 27 65)"/><ellipse cx="73" cy="65" rx="7" ry="13" fill="${o.wing}" transform="rotate(-16 73 65)"/>`
  g += `<circle cx="50" cy="38" r="17" fill="${o.body}"/>`
  if (o.comb === 'big') g += `<path d="M39 25 q2-12 8-3 q3-13 8-2 q5-11 8 3 q-12 6-24 2Z" fill="#e2352b"/>`
  if (o.comb === 'small') g += `<path d="M43 24 q3-9 7-2 q3-9 7 2 q-7 4-14 0Z" fill="#e2352b"/>`
  if (o.fuzz) g += `<path d="M45 22 q2-8 5-1 q3-8 5 1" stroke="${o.fuzz}" stroke-width="3" fill="none" stroke-linecap="round"/>`
  g += `<circle cx="43" cy="36" r="2.6" fill="#222"/><circle cx="57" cy="36" r="2.6" fill="#222"/>`
  g += o.open
    ? `<path d="M43 42 L50 38 L57 42 L50 45Z" fill="#f6a623"/><path d="M45 44 L50 51 L55 44Z" fill="#e9811c"/>`
    : `<path d="M45 41 L55 41 L50 48Z" fill="#f6a623"/>`
  if (o.wattle && !o.beard) g += `<ellipse cx="50" cy="52" rx="3.5" ry="5" fill="#e2352b"/>`
  if (o.beard)
    g += `<path d="M39 45 Q42 64 50 67 Q58 64 61 45 Q56 50 50 49 Q44 50 39 45Z" fill="${o.beard}" stroke="${o.beardLine ?? 'none'}" stroke-width="1.5"/><path d="M45 54 l2 7 M50 55 v8 M55 54 l-2 7" stroke="rgba(0,0,0,.18)" stroke-width="1.2"/>`
  if (o.glasses) g += glasses(43, 36, 57, 6)
  return scaled(g, o.s)
}

function goat(o: Goat): string {
  let g = `<ellipse cx="50" cy="94" rx="26" ry="10" fill="${o.fur}" stroke="${o.line ?? 'none'}" stroke-width="1.5"/>`
  if (o.horns) {
    const big = o.horns === 'big'
    g += `<path d="M40 30 Q34 ${big ? 6 : 14} 22 ${big ? 10 : 18}" stroke="${o.horn}" stroke-width="${big ? 7 : 5}" fill="none" stroke-linecap="round"/><path d="M60 30 Q66 ${big ? 6 : 14} 78 ${big ? 10 : 18}" stroke="${o.horn}" stroke-width="${big ? 7 : 5}" fill="none" stroke-linecap="round"/>`
  }
  g += `<ellipse cx="24" cy="42" rx="12" ry="5" fill="${o.ear}" transform="rotate(18 24 42)"/><ellipse cx="76" cy="42" rx="12" ry="5" fill="${o.ear}" transform="rotate(-18 76 42)"/>`
  g += `<path d="M32 34 Q50 20 68 34 L63 70 Q50 84 37 70Z" fill="${o.fur}" stroke="${o.line ?? 'none'}" stroke-width="1.5"/>`
  g += `<ellipse cx="50" cy="70" rx="11" ry="8" fill="${o.muzzle}"/><circle cx="46" cy="70" r="1.6" fill="#5a4038"/><circle cx="54" cy="70" r="1.6" fill="#5a4038"/>`
  g += `<ellipse cx="42" cy="46" rx="4.2" ry="3.6" fill="#fff6c8"/><rect x="39.6" y="45.1" width="4.8" height="1.9" rx="1" fill="#222"/><ellipse cx="58" cy="46" rx="4.2" ry="3.6" fill="#fff6c8"/><rect x="55.6" y="45.1" width="4.8" height="1.9" rx="1" fill="#222"/>`
  if (o.beard) g += `<path d="M40 74 Q50 110 60 74 Q50 81 40 74Z" fill="${o.beard}" stroke="${o.beardLine ?? 'none'}" stroke-width="1.4"/>`
  if (o.glasses) g += glasses(42, 46, 58, 6.5)
  return scaled(g, o.s)
}

function sheep(): string {
  let g = ''
  for (const [x, y] of [[30, 40], [40, 30], [52, 27], [64, 31], [72, 42], [70, 56], [30, 56]])
    g += `<circle cx="${x}" cy="${y}" r="11" fill="#fbfbf7" stroke="#e3e0d6" stroke-width="1.5"/>`
  g += `<ellipse cx="50" cy="94" rx="30" ry="11" fill="#fbfbf7" stroke="#e3e0d6" stroke-width="1.5"/>`
  g += `<ellipse cx="25" cy="54" rx="10" ry="5" fill="#4a3d3a" transform="rotate(20 25 54)"/><ellipse cx="75" cy="54" rx="10" ry="5" fill="#4a3d3a" transform="rotate(-20 75 54)"/>`
  g += `<ellipse cx="50" cy="58" rx="15" ry="20" fill="#4a3d3a"/><circle cx="44" cy="54" r="2.6" fill="#fff"/><circle cx="56" cy="54" r="2.6" fill="#fff"/><ellipse cx="50" cy="69" rx="6" ry="4" fill="#6b5a55"/>`
  return scaled(g, 0.92)
}

function deer(): string {
  let g = `<path d="M38 28 L30 10 M33 18 L22 14 M31 13 L34 4 M62 28 L70 10 M67 18 L78 14 M69 13 L66 4" stroke="#7a5233" stroke-width="3.4" fill="none" stroke-linecap="round"/>`
  g += `<ellipse cx="50" cy="94" rx="24" ry="10" fill="#b5713a"/>`
  g += `<ellipse cx="27" cy="38" rx="11" ry="6" fill="#b5713a" transform="rotate(-25 27 38)"/><ellipse cx="73" cy="38" rx="11" ry="6" fill="#b5713a" transform="rotate(25 73 38)"/>`
  g += `<path d="M34 34 Q50 22 66 34 L60 72 Q50 82 40 72Z" fill="#c27d43"/><ellipse cx="50" cy="72" rx="9" ry="7" fill="#f4e3cf"/><ellipse cx="50" cy="69" rx="3.5" ry="2.5" fill="#3a2a22"/>`
  g += `<circle cx="43" cy="47" r="3" fill="#222"/><circle cx="57" cy="47" r="3" fill="#222"/><circle cx="38" cy="58" r="1.6" fill="#f4e3cf"/><circle cx="62" cy="58" r="1.6" fill="#f4e3cf"/>`
  return scaled(g, 1)
}

function cow(o: { fur: string; line?: string; ear: string; muzzle: string; patch?: boolean; bull?: boolean }): string {
  let g = `<ellipse cx="50" cy="94" rx="30" ry="11" fill="${o.fur}" stroke="${o.line ?? 'none'}" stroke-width="1.5"/>`
  g += o.bull
    ? `<path d="M34 32 Q20 30 16 14" stroke="#f1e6cc" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M66 32 Q80 30 84 14" stroke="#f1e6cc" stroke-width="7" fill="none" stroke-linecap="round"/>`
    : `<path d="M36 30 Q30 24 30 18" stroke="#e8dcc0" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M64 30 Q70 24 70 18" stroke="#e8dcc0" stroke-width="5" fill="none" stroke-linecap="round"/>`
  g += `<ellipse cx="22" cy="42" rx="11" ry="6" fill="${o.ear}" transform="rotate(15 22 42)"/><ellipse cx="78" cy="42" rx="11" ry="6" fill="${o.ear}" transform="rotate(-15 78 42)"/>`
  g += `<path d="M30 32 Q50 22 70 32 L66 66 Q50 74 34 66Z" fill="${o.fur}" stroke="${o.line ?? 'none'}" stroke-width="1.5"/>`
  if (o.patch) g += `<path d="M54 30 Q66 30 67 44 Q60 48 54 40Z" fill="#2f2f2f"/>`
  g += `<ellipse cx="50" cy="70" rx="17" ry="11" fill="${o.muzzle}"/><ellipse cx="44" cy="70" rx="2.5" ry="3" fill="#6b3f3a"/><ellipse cx="56" cy="70" rx="2.5" ry="3" fill="#6b3f3a"/>`
  g += `<circle cx="41" cy="47" r="3" fill="#222"/><circle cx="59" cy="47" r="3" fill="#222"/>`
  if (o.bull) g += `<path d="M45 77 Q50 85 55 77" stroke="#d4af37" stroke-width="2.6" fill="none"/>`
  return scaled(g, o.bull ? 1 : 0.95)
}

const ROOSTER = { body: '#f7f3ea', belly: '#fff', wing: '#e6ddcb', comb: 'big', tail: ['#2f7d4f', '#b4432f'] } as const
const BLUE = { body: '#6aa7e8', belly: '#e8f2fc', wing: '#4b86c7' }
const NANNY = { fur: '#ffffff', line: '#d8d0c0', ear: '#f1ebe0', muzzle: '#f6dcd0', horns: 'small', horn: '#c9b79a' } as const

/** The drawing of each friend, by its id in ANIMALS. */
const DRAWINGS: Record<string, () => string> = {
  fledgling: () => bird({ s: 0.62, body: '#f3c4b1', belly: '#fbe1d6', wing: '#e8a992', open: true, fuzz: '#d99a84', nest: true }),
  bird: () => bird({ s: 0.76, ...BLUE }),
  'wise-bird': () => bird({ s: 0.8, ...BLUE, glasses: true }),
  chick: () => bird({ s: 0.7, body: '#ffd84a', belly: '#fff1a8', wing: '#f2bf00', fuzz: '#f2bf00' }),
  pullet: () => bird({ s: 0.84, body: '#d9a066', belly: '#f1cf9e', wing: '#b97d45', comb: 'small' }),
  rooster: () => bird({ s: 1, ...ROOSTER, tail: [...ROOSTER.tail], wattle: true }),
  'bearded-rooster': () => bird({ s: 1, ...ROOSTER, tail: [...ROOSTER.tail], beard: '#8a5a2b' }),
  'white-bearded-rooster': () =>
    bird({ s: 1, body: '#e2dccf', belly: '#f2eee4', wing: '#cfc6b3', comb: 'big', tail: ['#5f7c6b', '#9a6b5c'], beard: '#ffffff', beardLine: '#bdb5a3' }),
  kid: () => goat({ s: 0.74, fur: '#f3e3c9', ear: '#e9d2ae', muzzle: '#f8d9c4' }),
  goat: () => goat({ s: 0.9, ...NANNY }),
  'wise-goat': () => goat({ s: 0.9, ...NANNY, glasses: true }),
  'bearded-goat': () => goat({ s: 1, fur: '#8b5e3c', ear: '#7a5133', muzzle: '#c89a7a', horns: 'big', horn: '#6b5b4a', beard: '#2e1a0d' }),
  'white-bearded-goat': () =>
    goat({ s: 1, fur: '#9a8f84', ear: '#877c71', muzzle: '#c9bdb2', horns: 'big', horn: '#5e554c', beard: '#ffffff', beardLine: '#bdb5a3' }),
  sheep,
  deer,
  cow: () => cow({ fur: '#ffffff', line: '#d8d0c0', ear: '#f1ebe0', muzzle: '#f4b6b0', patch: true }),
  ox: () => cow({ fur: '#7b4a2a', ear: '#6a3f23', muzzle: '#d9a38a', bull: true }),
}

/** One friend of the journey. Works on its own or nested inside another SVG (pass x, y, width, height). */
export function Pet({ index, ...rest }: { index: number } & SVGProps<SVGSVGElement>) {
  const a = ANIMALS[index]
  if (!a) return null
  // The drawings are fixed strings from this file, never user text.
  return <svg viewBox="0 0 100 100" aria-hidden="true" {...rest} dangerouslySetInnerHTML={{ __html: DRAWINGS[a.id]() }} />
}
