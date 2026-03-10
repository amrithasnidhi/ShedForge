import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

describe('UI Components', () => {
    describe('Input', () => {
        it('renders correctly', () => {
            render(<Input placeholder="test input" />)
            const input = screen.getByPlaceholderText('test input')
            expect(input).toBeInTheDocument()
        })
    })

    describe('Card', () => {
        it('renders content correctly', () => {
            render(
                <Card>
                    <CardHeader>
                        <CardTitle>Test Card</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>Card content</p>
                    </CardContent>
                </Card>
            )
            expect(screen.getByText('Test Card')).toBeInTheDocument()
            expect(screen.getByText('Card content')).toBeInTheDocument()
        })
    })
})
