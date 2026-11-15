import { render, screen } from '@testing-library/react'
import App, { APP_NAME } from './App'

describe('App shell', () => {
  it('opens straight to a blank document', () => {
    render(<App />)
    expect(screen.getByRole('textbox', { name: 'Document' })).toBeInTheDocument()
    expect(screen.getByText('Untitled document')).toBeInTheDocument()
    expect(screen.getByText(APP_NAME)).toBeInTheDocument()
  })
})
