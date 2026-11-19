import { render, screen } from '@testing-library/react'
import App from './App'

test('boots to an empty deck shell', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Untitled deck' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Slides' })).toBeInTheDocument()
  expect(screen.getByRole('main', { name: 'Slide editor' })).toBeInTheDocument()
  expect(document.title).toBe('Untitled deck - MySlides')
})
