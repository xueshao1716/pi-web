import { useState } from 'react'
import { Ellipsis } from 'lucide-react'
import type { Route } from '../hooks/useHashRoute'
import { RAIL_MORE } from '../nav'

export default function DesktopMoreMenu({
  items,
  route,
  nav,
}: {
  items: { route: Route; icon: typeof Ellipsis; label: string }[]
  route: Route
  nav: (r: Route) => void
}) {
  const [open, setOpen] = useState(false)
  const moreActive = (RAIL_MORE as readonly string[]).includes(route)

  return (
    <div className="relative">
      <button
        aria-label="更多"
        aria-expanded={open}
        aria-current={moreActive ? 'page' : undefined}
        title="更多"
        className={`w-10 h-10 rounded-xl flex items-center justify-center relative transition-[background-color,color,border-color,box-shadow,transform] duration-200 ${
          moreActive || open ? 'bg-pi-accent text-white shadow-md shadow-pi-accent/25' : 'text-pi-dim2 hover:text-pi-text hover:bg-pi-bg3'}`}
        onClick={() => setOpen(v => !v)}
      >
        <Ellipsis className="w-[18px] h-[18px]" strokeWidth={1.8} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-12 top-0 z-20 panel p-1.5 flex flex-col gap-0.5 w-36">
            {items.map(n => (
              <button
                key={n.route}
                aria-current={route === n.route ? 'page' : undefined}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-pi-sm text-xs ${
                  route === n.route ? 'bg-pi-accent/10 text-pi-text' : 'text-pi-dim hover:bg-pi-bg3 hover:text-pi-text'}`}
                onClick={() => { nav(n.route); setOpen(false) }}
              >
                <n.icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} />
                {n.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
