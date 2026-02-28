import { useLocation, Link } from 'react-router-dom'

interface Design {
  id: number
  name: string
}

interface DesignNavProps {
  designs: Design[]
  variant?: 'light' | 'dark' | 'glass'
}

export default function DesignNav({ designs, variant = 'dark' }: DesignNavProps) {
  const location = useLocation()
  const currentDesign = parseInt(location.pathname.replace('/', '')) || 1

  const baseStyles = {
    light: 'bg-white border-slate-200 text-slate-600',
    dark: 'bg-black/80 border-white/10 text-white/60',
    glass: 'bg-white/10 backdrop-blur-xl border-white/20 text-white/60',
  }

  const activeStyles = {
    light: 'bg-slate-900 text-white',
    dark: 'bg-white text-black',
    glass: 'bg-white/20 text-white',
  }

  const hoverStyles = {
    light: 'hover:bg-slate-100',
    dark: 'hover:bg-white/10',
    glass: 'hover:bg-white/10',
  }

  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 p-1 rounded-full border ${baseStyles[variant]}`}>
      {designs.map((design) => {
        const isActive = currentDesign === design.id
        return (
          <Link
            key={design.id}
            to={`/${design.id}`}
            className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all ${
              isActive ? activeStyles[variant] : hoverStyles[variant]
            }`}
          >
            <span>{design.id}</span>
            {isActive && <span className="hidden sm:inline">{design.name}</span>}
          </Link>
        )
      })}
    </div>
  )
}
