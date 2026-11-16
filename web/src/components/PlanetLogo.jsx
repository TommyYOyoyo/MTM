import { useId } from 'react'

// space out logo: mars with a small earth on its orbit (same drawing as planet-icon.svg, no background)
export default function PlanetLogo({ size = 16, className = '' }) {
  const id = useId().replaceAll(':', '')
  return <svg className={`planet-logo ${className}`} width={size} height={size} viewBox="4 4 56 56" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}-mars`} cx="38%" cy="34%" r="70%">
        <stop offset="0" stopColor="#f6d2b4" />
        <stop offset=".45" stopColor="#d9784c" />
        <stop offset="1" stopColor="#7c3220" />
      </radialGradient>
      <radialGradient id={`${id}-earth`} cx="35%" cy="35%" r="70%">
        <stop offset="0" stopColor="#cfe8fb" />
        <stop offset="1" stopColor="#3f8fd0" />
      </radialGradient>
    </defs>
    <ellipse cx="32" cy="33" rx="27" ry="10" fill="none" stroke="#efbf9d" strokeOpacity=".55" strokeWidth="2.5" transform="rotate(-24 32 33)" />
    <circle cx="31" cy="33" r="16" fill={`url(#${id}-mars)`} />
    <path d="M19 30c5 2 9 1 13-1s9-2 13 1" fill="none" stroke="#7c3220" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
    <circle cx="52.5" cy="20.5" r="5.5" fill={`url(#${id}-earth)`} />
  </svg>
}
