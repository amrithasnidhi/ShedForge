import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Smoke Test', () => {
    it('renders a button correctly', () => {
        render(<Button>Click me</Button>)
        const button = screen.getByRole('button', { name: /click me/i })
        expect(button).toBeInTheDocument()
    })
})
