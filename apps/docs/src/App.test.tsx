import { render, screen } from '@testing-library/react'
import App, { APP_NAME } from './App'

describe('App shell', () => {
  it('opens straight to a blank document with the formatting toolbar', () => {
    render(<App />)
    expect(screen.getByRole('textbox', { name: 'Document' })).toBeInTheDocument()
    expect(screen.getByText('Untitled document')).toBeInTheDocument()
    expect(screen.getByText(APP_NAME)).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument()
  })

  it('gives every toolbar button a tooltip, and shortcut buttons show their shortcut', () => {
    render(<App />)
    const buttons = screen.getByRole('toolbar').querySelectorAll('button')
    expect(buttons.length).toBeGreaterThan(15)
    for (const b of buttons) expect(b.title).not.toBe('')
    expect(screen.getByRole('button', { name: 'Bold' }).title).toMatch(/\((Ctrl\+|⌘)B\)/)
  })
})
