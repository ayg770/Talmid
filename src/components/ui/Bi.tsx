/** One text in both languages: Hebrew on top, Russian under it. */
export function Bi({ he, ru, className = '' }: { he: string; ru: string; className?: string }) {
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
