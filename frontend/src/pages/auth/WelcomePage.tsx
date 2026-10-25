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
          登录
        </Link>
      </header>

      <main className="welcome__main">
        <section className="welcome__intro">
          <p className="o-eyebrow">YOUR PRIVATE STYLING STUDIO</p>
          <h1 className="welcome__headline">
            明天，
            <br />
            <span className="serif">穿得像自己。</span>
          </h1>
          <p className="welcome__lede">
            把衣橱交给 OUL。根据明天的天气、场景和你的身体参数，
            从真正属于你的衣服里，挑出几套刚刚好的造型。
          </p>
        </section>

        <section className="welcome-art" aria-label="OUL 品牌视觉">
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
            AI 试穿合成
          </div>
        </section>

        <section className="welcome__proof">
          <div className="welcome__proof-item">
            <span className="welcome__proof-icon">
              <Shirt size={18} strokeWidth={1.8} />
            </span>
            <div>
              <strong>只穿你的衣服</strong>
              <p>上传真实衣橱，不推荐买不到的单品。</p>
            </div>
          </div>
          <div className="welcome__proof-item">
            <span className="welcome__proof-icon">
              <WandSparkles size={18} strokeWidth={1.8} />
            </span>
            <div>
              <strong>先看上身效果</strong>
              <p>AI 把你的基础照片与整套衣服合成。</p>
            </div>
          </div>
          <div className="welcome__proof-item">
            <span className="welcome__proof-icon">
              <LockKeyhole size={18} strokeWidth={1.8} />
            </span>
            <div>
              <strong>照片只属于你</strong>
              <p>私人媒体需要登录凭证才能访问。</p>
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
          建立我的私享衣橱
        </Button>
        <p className="welcome__privacy">免费开始 · 约 3 分钟完成身体档案</p>
      </footer>
    </div>
  )
}
