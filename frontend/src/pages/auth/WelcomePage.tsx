import { ArrowRight, LockKeyhole, Sparkles, Shirt, WandSparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '@/components/Brand'
import { Button } from 'oul-ui'

export function WelcomePage() {
  const navigate = useNavigate()
  return (
    <div className="app-frame welcome">
      <header className="welcome__nav">
        <Brand />
        <Link to="/login" className="welcome__login">
          Sign in
        </Link>
      </header>

      <main className="welcome__main">
        <section className="welcome__intro">
          <p className="o-eyebrow">YOUR PRIVATE STYLING STUDIO</p>
          <h1 className="welcome__headline">
            Tomorrow,
            <br />
            <span className="serif">dressed like you.</span>
          </h1>
          <p className="welcome__lede">
            Hand your wardrobe to OUL. Using tomorrow's weather, your occasion, and your body
            profile, it picks a few just-right looks from the clothes you actually own.
          </p>
        </section>

        <section className="welcome-art" aria-label="OUL brand artwork">
          <div className="welcome-art__grain" aria-hidden="true" />
          <div className="welcome-art__sun" aria-hidden="true" />
          <div className="welcome-art__drape welcome-art__drape--one" aria-hidden="true" />
          <div className="welcome-art__drape welcome-art__drape--two" aria-hidden="true" />
          <div className="welcome-art__type serif">the</div>
          <div className="welcome-art__type welcome-art__type--two serif">edit</div>
          <div className="welcome-art__caption">
            <span>01 / 03</span>
            <span>WEATHER · MOOD · YOU</span>
          </div>
          <div className="welcome-art__label">
            <Sparkles size={13} />
            AI try-on
          </div>
        </section>

        <section className="welcome__proof">
          <div className="welcome__proof-item">
            <span className="welcome__proof-icon">
              <Shirt size={18} strokeWidth={1.8} />
            </span>
            <div>
              <strong>Only your clothes</strong>
              <p>A real wardrobe, so every piece is something you can actually wear.</p>
            </div>
          </div>
          <div className="welcome__proof-item">
            <span className="welcome__proof-icon">
              <WandSparkles size={18} strokeWidth={1.8} />
            </span>
            <div>
              <strong>See it on you first</strong>
              <p>AI pairs your base photo with the full outfit.</p>
            </div>
          </div>
          <div className="welcome__proof-item">
            <span className="welcome__proof-icon">
              <LockKeyhole size={18} strokeWidth={1.8} />
            </span>
            <div>
              <strong>Your photos stay yours</strong>
              <p>Private media needs sign-in credentials to view.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="welcome__footer">
        <Button
          variant="primary"
          size="lg"
          full
          rightIcon={<ArrowRight size={18} />}
          onClick={() => navigate('/register')}
        >
          Build my private wardrobe
        </Button>
        <p className="welcome__privacy">Free to start · Body profile in about 3 minutes</p>
      </footer>
    </div>
  )
}
