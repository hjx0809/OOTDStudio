import { ArrowRight, MessageSquareText, Shirt, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '@/components/Brand'
import { Button } from 'oul-ui'

const STEPS = [
  { icon: Shirt, label: 'Add your clothes' },
  { icon: MessageSquareText, label: 'Say where you’re going' },
  { icon: Sparkles, label: 'Swipe AI try-on looks' },
]

export function WelcomePage() {
  const navigate = useNavigate()
  return (
    <div className="app-frame welcome">
      <header className="bare-nav">
        <Brand />
      </header>

      <main className="welcome__main">
        <h1 className="welcome__title">
          Tomorrow’s outfit,
          <br />
          from your own closet.
        </h1>

        <ol className="how-steps">
          {STEPS.map(({ icon: Icon, label }, index) => (
            <li key={label} className="how-step">
              <span className="how-step__num">{index + 1}</span>
              <span className="how-step__icon">
                <Icon size={20} strokeWidth={1.7} />
              </span>
              <span className="how-step__label">{label}</span>
            </li>
          ))}
        </ol>
      </main>

      <footer className="welcome__footer">
        <Button size="lg" full rightIcon={<ArrowRight size={18} />} onClick={() => navigate('/register')}>
          Get started
        </Button>
        <Button size="lg" variant="secondary" full onClick={() => navigate('/login')}>
          Sign in
        </Button>
      </footer>
    </div>
  )
}
