import { startTransition, useEffect, useEffectEvent, useState, type CSSProperties } from 'react'
import './App.css'
import {
  buyShopItem,
  createInitialState,
  deriveGameView,
  hydrateGameState,
  resumeGame,
  STORAGE_KEY,
  tapGame,
  type DerivedShopItem,
  type GameState,
  type ShopCategory,
} from './game'
import { getTelegramDisplayName, setupTelegramApp, type TelegramWebApp } from './telegram'

type PanelKey = 'arena' | 'shop'

type FloatingBurst = {
  id: string
  amount: number
  createdAt: number
  x: number
}

type AppBootstrapState = {
  telegramApp: TelegramWebApp | null
  playerName: string
  gameState: GameState
  offlineGain: number
}

const compactFormatter = new Intl.NumberFormat('ru-RU', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const preciseFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 1,
})

const wholeFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
})

function formatAmount(value: number): string {
  if (value >= 10_000) {
    return compactFormatter.format(value)
  }

  if (value >= 100) {
    return wholeFormatter.format(value)
  }

  return preciseFormatter.format(value)
}

function getStatusText(category: ShopCategory): string {
  return category === 'tap' ? 'за тап' : 'в секунду'
}

function filterItems(items: DerivedShopItem[], category: ShopCategory): DerivedShopItem[] {
  return items.filter((item) => item.category === category)
}

function createBootstrapState(): AppBootstrapState {
  const telegramApp = typeof window === 'undefined' ? null : setupTelegramApp()
  const playerName = getTelegramDisplayName(telegramApp)
  const fallbackState = createInitialState()

  if (typeof window === 'undefined') {
    return {
      telegramApp,
      playerName,
      gameState: fallbackState,
      offlineGain: 0,
    }
  }

  try {
    const rawState = window.localStorage.getItem(STORAGE_KEY)
    const parsedState = rawState ? JSON.parse(rawState) : null
    const { state, offlineGain } = resumeGame(hydrateGameState(parsedState))

    return {
      telegramApp,
      playerName,
      gameState: state,
      offlineGain: offlineGain > 0.1 ? offlineGain : 0,
    }
  } catch {
    return {
      telegramApp,
      playerName,
      gameState: fallbackState,
      offlineGain: 0,
    }
  }
}

function App() {
  const [bootstrapState] = useState(() => createBootstrapState())
  const [activePanel, setActivePanel] = useState<PanelKey>('arena')
  const [statusMessage, setStatusMessage] = useState('')
  const [offlineGain, setOfflineGain] = useState(bootstrapState.offlineGain)
  const [gameState, setGameState] = useState<GameState>(bootstrapState.gameState)
  const [bursts, setBursts] = useState<FloatingBurst[]>([])
  const telegramApp = bootstrapState.telegramApp
  const playerName = bootstrapState.playerName

  const gameView = deriveGameView(gameState)
  const upgradeItems = filterItems(gameView.items, 'tap')
  const autoItems = filterItems(gameView.items, 'auto')
  const progressToGoal = gameView.nextGoal ? Math.min(gameState.coins / gameView.nextGoal.price, 1) : 1

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState))
  }, [gameState])

  const tickPassiveIncome = useEffectEvent(() => {
    setGameState((currentState) => resumeGame(currentState).state)
  })

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      tickPassiveIncome()
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  const pruneBursts = useEffectEvent(() => {
    const now = Date.now()
    setBursts((currentBursts) => currentBursts.filter((burst) => now - burst.createdAt < 900))
  })

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      pruneBursts()
    }, 120)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!statusMessage) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage('')
    }, 1800)

    return () => window.clearTimeout(timeoutId)
  }, [statusMessage])

  function handleTap() {
    telegramApp?.HapticFeedback?.impactOccurred('light')

    setGameState((currentState) => tapGame(currentState))
    setBursts((currentBursts) => [
      ...currentBursts,
      {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        amount: gameView.perTap,
        createdAt: Date.now(),
        x: 42 + Math.random() * 16,
      },
    ])
  }

  function handlePurchase(item: DerivedShopItem) {
    const result = buyShopItem(gameState, item.id)
    setGameState(result.state)

    if (!result.purchased) {
      telegramApp?.HapticFeedback?.notificationOccurred('warning')
      setStatusMessage(`Нужно еще ${formatAmount(result.shortfall)} монет`)
      return
    }

    telegramApp?.HapticFeedback?.notificationOccurred('success')
    setStatusMessage(`Куплено: ${item.title}`)
  }

  function handlePanelChange(nextPanel: PanelKey) {
    startTransition(() => {
      setActivePanel(nextPanel)
    })
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <div>
            <p className="eyebrow">Telegram Web App clicker</p>
            <h1>Turbo Tap</h1>
            <p className="hero-text">
              Копи монеты, усиливай каждый тап и собирай армию авто-кликеров, которая
              зарабатывает даже пока мини-приложение закрыто.
            </p>
          </div>
          <div className="identity-card">
            <span className="identity-name">{playerName}</span>
            <span className="identity-mode">
              {telegramApp ? 'Telegram mini app' : 'Локальный браузерный режим'}
            </span>
          </div>
        </div>

        <div className="hero-score">
          <p className="hero-score__label">Баланс</p>
          <strong>{formatAmount(gameState.coins)}</strong>
          <span>монет на счету</span>
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <span>За тап</span>
            <strong>+{formatAmount(gameView.perTap)}</strong>
          </article>
          <article className="stat-card">
            <span>Пассивно</span>
            <strong>{formatAmount(gameView.passivePerSecond)}/сек</strong>
          </article>
          <article className="stat-card">
            <span>В минуту</span>
            <strong>{formatAmount(gameView.incomePerMinute)}</strong>
          </article>
          <article className="stat-card">
            <span>Всего тапов</span>
            <strong>{formatAmount(gameState.totalManualTaps)}</strong>
          </article>
          <article className="stat-card">
            <span>Доход за все время</span>
            <strong>{formatAmount(gameState.totalCoins)}</strong>
          </article>
          <article className="stat-card">
            <span>Ранг</span>
            <strong>{gameView.stageTitle}</strong>
          </article>
        </div>

        {offlineGain > 0.1 ? (
          <div className="notice-banner">
            <span>Пока тебя не было, авто-кликеры принесли {formatAmount(offlineGain)} монет.</span>
            <button type="button" onClick={() => setOfflineGain(0)}>
              Закрыть
            </button>
          </div>
        ) : null}

        {statusMessage ? <div className="status-toast">{statusMessage}</div> : null}
      </section>

      <nav className="segmented-nav" aria-label="Разделы приложения">
        <button
          type="button"
          className={activePanel === 'arena' ? 'is-active' : ''}
          onClick={() => handlePanelChange('arena')}
        >
          Арена
        </button>
        <button
          type="button"
          className={activePanel === 'shop' ? 'is-active' : ''}
          onClick={() => handlePanelChange('shop')}
        >
          Магазин
        </button>
      </nav>

      <section className="panel-grid">
        <article className={`panel arena-panel ${activePanel === 'arena' ? 'is-active' : ''}`}>
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Главный цикл</p>
              <h2>Тапай и держи темп</h2>
            </div>
            <div className="goal-chip">
              <span>Ближайшая цель</span>
              <strong>{gameView.nextGoal?.title ?? 'Все куплено'}</strong>
            </div>
          </div>

          <div className="progress-card">
            <div className="progress-copy">
              <span>До следующей покупки</span>
              <strong>
                {formatAmount(gameState.coins)} /{' '}
                {formatAmount(gameView.nextGoal?.price ?? gameState.coins)}
              </strong>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${progressToGoal * 100}%` }} />
            </div>
          </div>

          <div className="tap-stage">
            <button type="button" className="tap-core" onClick={handleTap}>
              <span className="tap-core__ring tap-core__ring--outer" />
              <span className="tap-core__ring tap-core__ring--inner" />
              {bursts.map((burst) => (
                <span
                  key={burst.id}
                  className="tap-burst"
                  style={
                    {
                      '--burst-offset': `${burst.x}%`,
                    } as CSSProperties
                  }
                >
                  +{formatAmount(burst.amount)}
                </span>
              ))}
              <span className="tap-core__hint">Нажимай</span>
              <strong className="tap-core__value">+{formatAmount(gameView.perTap)}</strong>
            </button>
          </div>

          <div className="mini-cards">
            <div className="mini-card">
              <span>Куплено улучшений</span>
              <strong>{formatAmount(gameView.totalOwned)}</strong>
            </div>
            <div className="mini-card">
              <span>Авто-кликеры</span>
              <strong>{formatAmount(autoItems.reduce((total, item) => total + item.owned, 0))}</strong>
            </div>
            <div className="mini-card">
              <span>Улучшения тапа</span>
              <strong>
                {formatAmount(upgradeItems.reduce((total, item) => total + item.owned, 0))}
              </strong>
            </div>
          </div>
        </article>

        <article className={`panel shop-panel ${activePanel === 'shop' ? 'is-active' : ''}`}>
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Экономика</p>
              <h2>Магазин усилений</h2>
            </div>
            <div className="goal-chip">
              <span>Текущий темп</span>
              <strong>{formatAmount(gameView.incomePerMinute)}/мин</strong>
            </div>
          </div>

          <section className="shop-group">
            <div className="shop-group__head">
              <h3>Улучшения клика</h3>
              <p>Повышают доход за одно нажатие и ускоряют разгон.</p>
            </div>
            <div className="shop-list">
              {upgradeItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`shop-card ${item.affordable ? 'is-affordable' : ''}`}
                  onClick={() => handlePurchase(item)}
                  style={
                    {
                      '--accent': item.accent,
                    } as CSSProperties
                  }
                >
                  <div className="shop-card__top">
                    <span className="shop-card__title">{item.title}</span>
                    <span className="shop-card__price">{formatAmount(item.price)}</span>
                  </div>
                  <strong className="shop-card__boost">
                    +{formatAmount(item.power)} {getStatusText(item.category)}
                  </strong>
                  <p>{item.description}</p>
                  <div className="shop-card__footer">
                    <span>Куплено: {formatAmount(item.owned)}</span>
                    <span>{item.affordable ? 'Можно купить' : 'Нужно копить'}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="shop-group">
            <div className="shop-group__head">
              <h3>Авто-кликеры</h3>
              <p>Продолжают добывать монеты без ручных тапов.</p>
            </div>
            <div className="shop-list">
              {autoItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`shop-card ${item.affordable ? 'is-affordable' : ''}`}
                  onClick={() => handlePurchase(item)}
                  style={
                    {
                      '--accent': item.accent,
                    } as CSSProperties
                  }
                >
                  <div className="shop-card__top">
                    <span className="shop-card__title">{item.title}</span>
                    <span className="shop-card__price">{formatAmount(item.price)}</span>
                  </div>
                  <strong className="shop-card__boost">
                    +{formatAmount(item.power)} {getStatusText(item.category)}
                  </strong>
                  <p>{item.description}</p>
                  <div className="shop-card__footer">
                    <span>Куплено: {formatAmount(item.owned)}</span>
                    <span>{item.affordable ? 'Пассив включен' : 'Пока дорого'}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </article>
      </section>
    </main>
  )
}

export default App
