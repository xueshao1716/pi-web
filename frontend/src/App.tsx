import { AppProvider } from './store'
import AppLayout from './AppLayout'

export default function App() {
  return (
    <AppProvider>
      <AppLayout />
    </AppProvider>
  )
}
