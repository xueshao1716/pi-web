import { AppProvider } from './store'
import AppLayout from './AppLayout'
import { Toaster } from './components/Toast'

export default function App() {
  return (
    <AppProvider>
      <AppLayout />
      <Toaster />
    </AppProvider>
  )
}
