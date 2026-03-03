import { Application } from 'pixi.js'

async function bootstrap(): Promise<void> {
  const app = new Application()
  await app.init({
    width: 960,
    height: 540,
    background: '#1b3a2f',
  })

  const root = document.getElementById('app')
  if (!root) {
    throw new Error('Missing #app mount node')
  }

  root.appendChild(app.canvas)
}

bootstrap().catch((error: unknown) => {
  console.error('Client bootstrap failed', error)
})
