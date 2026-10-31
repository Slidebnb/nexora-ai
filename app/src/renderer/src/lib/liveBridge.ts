import { useNexora } from '../state/store'

/** Verbindet den Store mit den Worker-Events aus dem Main-Prozess (Historie + Live-Stream). */
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
