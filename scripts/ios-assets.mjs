// Renders the iPhone app icon (1024px) and launch screen (2732px) from public/icon.svg.
// Run after changing the icon: node scripts/ios-assets.mjs (uses Playwright's Chromium).
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/icon.svg', 'utf8')
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const assets = 'ios/App/App/Assets.xcassets'
// The icon's own background, so the launch screen fades straight into the icon's colours.
const background = svg.match(/<rect[^>]*fill="(#[0-9a-f]{6})"/i)?.[1] ?? '#000000'

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const page = await browser.newPage({ deviceScaleFactor: 1 })

async function render(size, imageSize, path) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<body style="margin:0;background:${background};display:grid;place-items:center;height:100vh">` +
      `<img src="${src}" width="${imageSize}" height="${imageSize}"></body>`,
  )
  await page.locator('img').evaluate((img) => img.decode())
  await page.screenshot({ path, omitBackground: false })
}

await render(1024, 1024, `${assets}/AppIcon.appiconset/AppIcon-512@2x.png`)
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  await render(2732, 640, `${assets}/Splash.imageset/${name}`)
await browser.close()
console.log('Wrote the app icon and launch screen.')
