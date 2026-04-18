export type ShopCategory = 'tap' | 'auto'

export interface ShopItem {
  id: string
  category: ShopCategory
  title: string
  description: string
  baseCost: number
  costScale: number
  power: number
  unitLabel: string
  accent: string
}

export interface GameState {
  coins: number
  totalCoins: number
  totalManualTaps: number
  purchases: Record<string, number>
  lastUpdatedAt: number
}

export interface DerivedShopItem extends ShopItem {
  owned: number
  price: number
  affordable: boolean
}

export interface DerivedGameView {
  perTap: number
  passivePerSecond: number
  incomePerMinute: number
  totalOwned: number
  stageTitle: string
  nextGoal: DerivedShopItem | null
  items: DerivedShopItem[]
}

export interface ResumeResult {
  state: GameState
  offlineGain: number
}

export interface PurchaseResult {
  purchased: boolean
  state: GameState
  price: number
  shortfall: number
}

const MAX_IDLE_SECONDS = 60 * 60 * 12

export const STORAGE_KEY = 'telegram-clicker-state-v1'

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'spark-gloves',
    category: 'tap',
    title: 'Искровые перчатки',
    description: 'Добавляют уверенную отдачу каждому нажатию.',
    baseCost: 15,
    costScale: 1.18,
    power: 1,
    unitLabel: 'за тап',
    accent: '#ffd166',
  },
  {
    id: 'turbo-thumb',
    category: 'tap',
    title: 'Турбо-палец',
    description: 'Ускоряет ритм и поднимает доход за один клик.',
    baseCost: 90,
    costScale: 1.22,
    power: 4,
    unitLabel: 'за тап',
    accent: '#ff8f5e',
  },
  {
    id: 'pulse-reactor',
    category: 'tap',
    title: 'Пульс-реактор',
    description: 'Преобразует каждый тап в мощный денежный импульс.',
    baseCost: 420,
    costScale: 1.25,
    power: 12,
    unitLabel: 'за тап',
    accent: '#ff5da2',
  },
  {
    id: 'royal-combo',
    category: 'tap',
    title: 'Королевский комбо-мод',
    description: 'Готовит настоящие залпы монет при каждом касании.',
    baseCost: 1_600,
    costScale: 1.28,
    power: 35,
    unitLabel: 'за тап',
    accent: '#f7c948',
  },
  {
    id: 'pocket-bot',
    category: 'auto',
    title: 'Карманный бот',
    description: 'Тихо кликает за тебя и не устает.',
    baseCost: 50,
    costScale: 1.2,
    power: 0.6,
    unitLabel: 'в сек.',
    accent: '#6ee7c8',
  },
  {
    id: 'conveyor-cat',
    category: 'auto',
    title: 'Конвейер-кот',
    description: 'Запускает стабильный поток пассивных монет.',
    baseCost: 250,
    costScale: 1.24,
    power: 3,
    unitLabel: 'в сек.',
    accent: '#6ccff6',
  },
  {
    id: 'neon-drone',
    category: 'auto',
    title: 'Неон-дрон',
    description: 'Разворачивает автономную ферму быстрых касаний.',
    baseCost: 1_100,
    costScale: 1.28,
    power: 12,
    unitLabel: 'в сек.',
    accent: '#9f7aea',
  },
  {
    id: 'orbital-farm',
    category: 'auto',
    title: 'Орбитальная ферма',
    description: 'Выводит пассивный доход на межзвездный уровень.',
    baseCost: 5_200,
    costScale: 1.31,
    power: 45,
    unitLabel: 'в сек.',
    accent: '#8fffd6',
  },
]

function sanitizeNumber(value: unknown, fallback = 0): number {
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

function createBlankPurchases(): Record<string, number> {
  return SHOP_ITEMS.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.id] = 0
    return accumulator
  }, {})
}

function getElapsedSeconds(lastUpdatedAt: number, now: number): number {
  const safeNow = Math.max(now, lastUpdatedAt)
  return Math.min((safeNow - lastUpdatedAt) / 1000, MAX_IDLE_SECONDS)
}

function getStageTitle(totalCoins: number): string {
  if (totalCoins < 150) {
    return 'Разминка'
  }
  if (totalCoins < 900) {
    return 'Уверенный темп'
  }
  if (totalCoins < 4_000) {
    return 'Монетный спринт'
  }
  if (totalCoins < 20_000) {
    return 'Фабрика кликов'
  }
  return 'Легенда Telegram'
}

export function createInitialState(now = Date.now()): GameState {
  return {
    coins: 0,
    totalCoins: 0,
    totalManualTaps: 0,
    purchases: createBlankPurchases(),
    lastUpdatedAt: now,
  }
}

export function hydrateGameState(rawState: unknown, now = Date.now()): GameState {
  const initialState = createInitialState(now)

  if (!rawState || typeof rawState !== 'object') {
    return initialState
  }

  const sourceState = rawState as Partial<GameState> & {
    purchases?: Record<string, unknown>
  }

  const purchases = { ...initialState.purchases }

  for (const item of SHOP_ITEMS) {
    purchases[item.id] = Math.max(0, Math.floor(sanitizeNumber(sourceState.purchases?.[item.id], 0)))
  }

  return {
    coins: Math.max(0, sanitizeNumber(sourceState.coins, 0)),
    totalCoins: Math.max(0, sanitizeNumber(sourceState.totalCoins, 0)),
    totalManualTaps: Math.max(0, Math.floor(sanitizeNumber(sourceState.totalManualTaps, 0))),
    purchases,
    lastUpdatedAt: Math.max(0, Math.floor(sanitizeNumber(sourceState.lastUpdatedAt, now))),
  }
}

export function getOwnedCount(state: GameState, itemId: string): number {
  return state.purchases[itemId] ?? 0
}

export function getItemPrice(item: ShopItem, ownedCount: number): number {
  return Math.max(1, Math.round(item.baseCost * item.costScale ** ownedCount))
}

export function getTapPower(state: GameState): number {
  return SHOP_ITEMS.reduce((power, item) => {
    if (item.category !== 'tap') {
      return power
    }

    return power + item.power * getOwnedCount(state, item.id)
  }, 1)
}

export function getPassivePerSecond(state: GameState): number {
  return SHOP_ITEMS.reduce((power, item) => {
    if (item.category !== 'auto') {
      return power
    }

    return power + item.power * getOwnedCount(state, item.id)
  }, 0)
}

export function deriveGameView(state: GameState): DerivedGameView {
  const perTap = getTapPower(state)
  const passivePerSecond = getPassivePerSecond(state)
  const items = SHOP_ITEMS.map<DerivedShopItem>((item) => {
    const owned = getOwnedCount(state, item.id)
    const price = getItemPrice(item, owned)

    return {
      ...item,
      owned,
      price,
      affordable: state.coins >= price,
    }
  })

  const nextGoal = items.toSorted((firstItem, secondItem) => firstItem.price - secondItem.price)[0] ?? null
  const totalOwned = items.reduce((total, item) => total + item.owned, 0)

  return {
    perTap,
    passivePerSecond,
    incomePerMinute: passivePerSecond * 60,
    totalOwned,
    stageTitle: getStageTitle(state.totalCoins),
    nextGoal,
    items,
  }
}

export function advanceGame(state: GameState, now = Date.now()): GameState {
  if (now <= state.lastUpdatedAt) {
    return state
  }

  const elapsedSeconds = getElapsedSeconds(state.lastUpdatedAt, now)
  const passivePerSecond = getPassivePerSecond(state)
  const generatedCoins = passivePerSecond * elapsedSeconds

  return {
    ...state,
    coins: state.coins + generatedCoins,
    totalCoins: state.totalCoins + generatedCoins,
    lastUpdatedAt: now,
  }
}

export function resumeGame(state: GameState, now = Date.now()): ResumeResult {
  const elapsedSeconds = getElapsedSeconds(state.lastUpdatedAt, now)
  const offlineGain = getPassivePerSecond(state) * elapsedSeconds

  return {
    state: advanceGame(state, now),
    offlineGain,
  }
}

export function tapGame(state: GameState, now = Date.now()): GameState {
  const advancedState = advanceGame(state, now)
  const tapPower = getTapPower(advancedState)

  return {
    ...advancedState,
    coins: advancedState.coins + tapPower,
    totalCoins: advancedState.totalCoins + tapPower,
    totalManualTaps: advancedState.totalManualTaps + 1,
  }
}

export function buyShopItem(state: GameState, itemId: string, now = Date.now()): PurchaseResult {
  const advancedState = advanceGame(state, now)
  const item = SHOP_ITEMS.find((candidate) => candidate.id === itemId)

  if (!item) {
    return {
      purchased: false,
      state: advancedState,
      price: 0,
      shortfall: 0,
    }
  }

  const ownedCount = getOwnedCount(advancedState, item.id)
  const price = getItemPrice(item, ownedCount)

  if (advancedState.coins < price) {
    return {
      purchased: false,
      state: advancedState,
      price,
      shortfall: price - advancedState.coins,
    }
  }

  return {
    purchased: true,
    state: {
      ...advancedState,
      coins: advancedState.coins - price,
      purchases: {
        ...advancedState.purchases,
        [item.id]: ownedCount + 1,
      },
    },
    price,
    shortfall: 0,
  }
}
