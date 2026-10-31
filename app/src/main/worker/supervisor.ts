import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { EventEmitter } from 'node:events'

export type WorkerState = 'disconnected' | 'starting' | 'connected' | 'error'

export interface WorkerStatus {
  state: WorkerState
  message?: string
}

export interface WorkerLaunch {
  command: string
  args: string[]
  cwd: string
}

/**
 * Ermittelt, wie der Worker gestartet wird:
 * - NEXORA_WORKER_PYTHON (Umgebungsvariable) für Sonderfälle
 * - gepackt: resources/worker/nexora-worker(.exe) (PyInstaller, Phase 4)
 * - Entwicklung: worker/.venv (angelegt mit `uv sync`)
 */
export function resolveWorkerLaunch(opts: { packaged: boolean; resourcesPath: string; appPath: string; dataDir: string }): WorkerLaunch | null {
  const args = ['--data-dir', opts.dataDir, '--watch-stdin']
  if (opts.packaged) {
    const exe = join(opts.resourcesPath, 'worker', process.platform === 'win32' ? 'nexora-worker.exe' : 'nexora-worker')
    return existsSync(exe) ? { command: exe, args, cwd: join(opts.resourcesPath, 'worker') } : null
  }
  const workerDir = resolve(opts.appPath, '..', 'worker')
  const override = process.env['NEXORA_WORKER_PYTHON']
  const venvPython =
    process.platform === 'win32' ? join(workerDir, '.venv', 'Scripts', 'python.exe') : join(workerDir, '.venv', 'bin', 'python')
  const python = override ?? venvPython
  if (!existsSync(python)) return null
  return { command: python, args: ['-m', 'nexora_worker', ...args], cwd: workerDir }
}

/** Startet den Worker, wartet auf die READY-Zeile, startet bei Absturz begrenzt neu. */
export class WorkerSupervisor extends EventEmitter {
  private child: ChildProcess | null = null
  private restarts = 0
  private stopping = false
  readonly token = randomBytes(32).toString('hex')
  port: number | null = null
  status: WorkerStatus = { state: 'disconnected' }

  constructor(private readonly launch: () => WorkerLaunch | null) {
    super()
  }

  private setStatus(status: WorkerStatus): void {
    this.status = status
    this.emit('status', status)
  }

  start(): void {
    const launch = this.launch()
    if (!launch) {
      this.setStatus({ state: 'error', message: 'Worker nicht installiert. Im Ordner „worker“ einmal `uv sync` ausführen.' })
      return
    }
    this.stopping = false
    this.setStatus({ state: 'starting' })
    const child = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env: { ...process.env, NEXORA_WORKER_TOKEN: this.token, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    this.child = child
    let stderr = ''
    child.stderr?.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000)
    })
    const timeout = setTimeout(() => {
      if (this.port === null) {
        this.setStatus({ state: 'error', message: 'Worker hat nicht rechtzeitig geantwortet' })
        child.kill()
      }
    }, 30_000)
    createInterface({ input: child.stdout! }).on('line', (line) => {
      if (!line.startsWith('NEXORA_WORKER_READY ')) return
      try {
        const { port } = JSON.parse(line.slice('NEXORA_WORKER_READY '.length)) as { port: number }
        if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('ungültiger Port')
        clearTimeout(timeout)
        this.port = port
        this.restarts = 0
        this.emit('ready', port)
      } catch {
        this.setStatus({ state: 'error', message: 'Ungültige Startmeldung des Workers' })
      }
    })
    child.on('exit', (code) => {
      clearTimeout(timeout)
      this.child = null
      this.port = null
      if (this.stopping) {
        this.setStatus({ state: 'disconnected' })
        return
      }
      const detail = stderr.trim().split('\n').slice(-1)[0] ?? ''
      if (this.restarts < 3) {
        this.restarts += 1
        this.setStatus({ state: 'starting', message: `Worker beendet (Code ${code}). Neustart ${this.restarts}/3 …` })
        setTimeout(() => this.start(), 1000 * this.restarts)
      } else {
        this.setStatus({ state: 'error', message: `Worker wiederholt abgestürzt (Code ${code}). ${detail}`.trim() })
      }
    })
    child.on('error', (err) => {
      this.setStatus({ state: 'error', message: `Worker konnte nicht gestartet werden: ${err.message}` })
    })
  }

  markConnected(): void {
    this.setStatus({ state: 'connected' })
  }

  stop(): Promise<void> {
    this.stopping = true
    const child = this.child
    if (!child) return Promise.resolve()
    return new Promise((done) => {
      const kill = setTimeout(() => child.kill(), 5000)
      child.once('exit', () => {
        clearTimeout(kill)
        done()
      })
      child.stdin?.end() // Worker beendet sich selbst bei stdin-EOF
    })
  }
}
