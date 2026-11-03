// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { Chat } from '../src/renderer/src/screens/Chat'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Chat ohne KI-Schlüssel (Neukunde)', () => {
  it('bietet die lokalen Aufgaben trotzdem an – Ordner aufräumen braucht keinen Schlüssel', async () => {
    vi.stubGlobal('nexora', {
      getChatProvider: async () => ({ provider: null, model: null }),
      onChatDelta: () => () => undefined
    })
    render(<Chat />)
    await screen.findByRole('button', { name: /Schlüssel eintragen/ })
    const gallery = screen.getByTestId('task-chips')
    expect(within(gallery).getByRole('button', { name: /Ordner aufräumen/ })).toBeTruthy()
  })
})
