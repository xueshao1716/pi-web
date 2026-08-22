import { useEffect, useState, Component, ReactNode } from 'react'

// ── 极轻 hash 路由（零依赖）：#/chat #/models #/assets #/tasks ──
export type Route = 'chat' | 'models' | 'assets' | 'tasks'
const ROUTES: Route[] = ['chat', 'models', 'assets', 'tasks']

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'chat'
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const nav = (r: Route) => { location.hash = '#/' + r; setRoute(r) }
  return [route, nav]
}

// ── 页面级 ErrorBoundary（路线图：每路由 lazy + ErrorBoundary）──
interface EBProps { children: ReactNode; page: string }
export class PageErrorBoundary extends Component<EBProps, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (this.state.err) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="panel p-6 max-w-md text-center">
            <div className="text-2xl mb-2">⚠️</div>
            <div className="font-semibold text-pi-text mb-1">{this.props.page} 页面出错了</div>
            <div className="text-xs text-pi-dim2 font-mono break-all mb-4">{this.state.err.message}</div>
            <button className="btn-primary text-xs px-4 py-1.5" onClick={() => this.setState({ err: null })}>重试</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
