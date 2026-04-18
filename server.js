import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DIST_DIR = join(__dirname, 'frontend', 'dist')
const FRONTEND_DIR = join(__dirname, 'frontend')
const PORT = Number(process.env.PORT ?? 3000)
const BOT_TOKEN = process.env.BOT_TOKEN ?? ''
const WEBAPP_URL = process.env.WEBAPP_URL ?? ''
const BOT_LABEL = process.env.BOT_LABEL ?? 'Turbo Tap'

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

function log(message) {
  console.log(`[turbo-tap] ${message}`)
}

function runCommand(command, args, description) {
  log(description)
  const result = spawnSync(command, args, {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    throw new Error(`${description} завершилась с кодом ${result.status ?? 'unknown'}`)
  }
}

function ensureFrontendBuilt() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const frontendNodeModulesDir = join(FRONTEND_DIR, 'node_modules')
  const frontendIndexPath = join(DIST_DIR, 'index.html')

  if (!existsSync(frontendNodeModulesDir)) {
    runCommand(npmCommand, ['--prefix', 'frontend', 'install'], 'Устанавливаю зависимости фронтенда')
  }

  if (!existsSync(frontendIndexPath)) {
    runCommand(npmCommand, ['--prefix', 'frontend', 'run', 'build'], 'Собираю фронтенд мини-приложения')
  }
}

function getSafeFilePath(requestPathname) {
  const normalizedPath = normalize(decodeURIComponent(requestPathname)).replace(/^(\.\.[/\\])+/, '')
  const cleanedPath = normalizedPath === '\\' || normalizedPath === '/' ? 'index.html' : normalizedPath.replace(/^[/\\]/, '')
  return join(DIST_DIR, cleanedPath)
}

async function tryServeStaticFile(filePath, response) {
  try {
    const fileStats = await stat(filePath)

    if (!fileStats.isFile()) {
      return false
    }

    response.writeHead(200, {
      'Content-Length': fileStats.size,
      'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': filePath.includes(`${resolve(DIST_DIR, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    })

    createReadStream(filePath).pipe(response)
    return true
  } catch {
    return false
  }
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  response.end(body)
}

async function telegramRequest(method, payload = {}) {
  if (!BOT_TOKEN) {
    throw new Error('Переменная BOT_TOKEN не задана')
  }

  const httpResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!httpResponse.ok) {
    const body = await httpResponse.text()
    throw new Error(`Telegram API ${method}: ${httpResponse.status} ${body}`)
  }

  const result = await httpResponse.json()

  if (!result.ok) {
    throw new Error(`Telegram API ${method}: ${JSON.stringify(result)}`)
  }

  return result.result
}

async function sendLaunchMessage(chatId) {
  if (!WEBAPP_URL) {
    await telegramRequest('sendMessage', {
      chat_id: chatId,
      text: 'Бот запущен, но переменная WEBAPP_URL пока не настроена. Добавь публичный HTTPS-адрес мини-приложения.',
    })
    return
  }

  await telegramRequest('sendMessage', {
    chat_id: chatId,
    text: 'Нажми кнопку ниже и открой кликер в Telegram.',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть кликер',
            web_app: {
              url: WEBAPP_URL,
            },
          },
        ],
      ],
    },
  })
}

async function handleTelegramUpdate(update) {
  const message = update.message

  if (!message?.chat?.id) {
    return
  }

  const text = message.text?.trim() ?? ''

  if (text.startsWith('/start') || text.startsWith('/app')) {
    await sendLaunchMessage(message.chat.id)
    return
  }

  await telegramRequest('sendMessage', {
    chat_id: message.chat.id,
    text: 'Используй /start, чтобы открыть кликер.',
  })
}

async function configureTelegramMenu() {
  if (!BOT_TOKEN || !WEBAPP_URL) {
    return
  }

  try {
    await telegramRequest('setMyCommands', {
      commands: [
        {
          command: 'start',
          description: 'Открыть кликер',
        },
        {
          command: 'app',
          description: 'Показать кнопку Web App',
        },
      ],
    })

    await telegramRequest('setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: BOT_LABEL,
        web_app: {
          url: WEBAPP_URL,
        },
      },
    })

    log('Telegram menu button настроена')
  } catch (error) {
    log(`Не удалось настроить menu button: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function startTelegramPolling() {
  if (!BOT_TOKEN) {
    log('BOT_TOKEN не задан, сервер запущен только как HTTP-хост для мини-приложения')
    return
  }

  let offset = 0

  while (true) {
    try {
      const updates = await telegramRequest('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message'],
      })

      for (const update of updates) {
        offset = update.update_id + 1
        await handleTelegramUpdate(update)
      }
    } catch (error) {
      log(`Ошибка polling: ${error instanceof Error ? error.message : String(error)}`)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000))
    }
  }
}

function createStaticServer() {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed' })
      return
    }

    if (requestUrl.pathname === '/health') {
      sendJson(response, 200, {
        ok: true,
        bot: Boolean(BOT_TOKEN),
        webAppUrlConfigured: Boolean(WEBAPP_URL),
      })
      return
    }

    const requestedFile = getSafeFilePath(requestUrl.pathname)

    if (await tryServeStaticFile(requestedFile, response)) {
      return
    }

    if (await tryServeStaticFile(join(DIST_DIR, 'index.html'), response)) {
      return
    }

    sendJson(response, 503, {
      error: 'Frontend build is missing',
      hint: 'Run npm --prefix frontend run build',
    })
  })
}

async function main() {
  ensureFrontendBuilt()

  const server = createStaticServer()
  server.listen(PORT, () => {
    log(`HTTP server listening on port ${PORT}`)
  })

  await configureTelegramMenu()
  void startTelegramPolling()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
