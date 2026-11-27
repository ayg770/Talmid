import { Pet } from './Pet'

/**
 * The start of the journey: the house, the child and the first friend waiting in its nest.
 * A strip of countryside under the title of the sign-in and school screens.
 */
export function Landscape() {
  return (
    <div className="landscape" aria-hidden="true">
      <svg viewBox="0 0 980 150" preserveAspectRatio="xMidYMax slice">
        <circle cx="140" cy="40" r="30" fill="#ffe27a" />
        <path d="M0 90 Q160 40 330 80 T700 70 T980 60 V150 H0Z" fill="#8fd18c" />
        <path d="M0 120 Q220 85 480 115 T980 105 V150 H0Z" fill="#6cc070" />
        <path d="M600 150 Q590 125 545 115 T430 100" className="road-bed" />
        <path d="M600 150 Q590 125 545 115 T430 100" className="road-top" />
        <text x="430" y="106" fontSize="44" textAnchor="middle">
          🏠
        </text>
        <text x="528" y="116" fontSize="36" textAnchor="middle">
          🧒
        </text>
        <Pet index={0} x={556} y={72} width={46} height={46} />
      </svg>
    </div>
  )
}
