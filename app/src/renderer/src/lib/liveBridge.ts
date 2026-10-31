import { useNexora } from '../state/store'

/** Verbindet den Store mit den Worker-Events aus dem Main-Prozess (Historie + Live-Stream). */
/** Holt den vollständigen Verlauf erneut (doppelte Events verwirft der Reducer anhand der ID). */
export async function resyncFromWorker(): Promise<void> {
  const { ingest } = useNexora.getState()
  const events = await window.nexora.getWorkerHistory()
  events.forEach((e) => ingest(e))
}

export function initLiveBridge(): () => void {
  const { ingest, setWorker } = useNexora.getState()
  const offStatus = window.nexora.onWorkerStatus(setWorker)
  const offEvent = window.nexora.onWorkerEvent((e) => {
    ingest(e)
  })
  void window.nexora.getWorkerStatus().then(setWorker, () => undefined)
  void window.nexora.getWorkerHistory().then(
    (events) => events.forEach((e) => ingest(e)),
    () => undefined
  )
  return () => {
    offStatus()
    offEvent()
  }
}
