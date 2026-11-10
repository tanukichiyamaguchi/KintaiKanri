import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// public/ から事前に保存しておくファイル（オフラインでも表示できるように）
const PUBLIC_PRECACHE = [
  'logo.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'favicon-32.png',
  'manifest.webmanifest',
]

/**
 * ビルドのたびに Service Worker（sw.js）を生成する。
 * 今回のビルドで出力された画面の部品（ハッシュ付きファイル名）と入口の HTML を事前保存の対象にし、
 * ビルドごとに異なる版名を付ける（ブラウザが新しい版を検出し、古い保存分を削除できるように）。
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'kintai-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter(f => f === 'index.html' || /^assets\/.+\.(js|css)$/.test(f))
      const precache = [...built, ...PUBLIC_PRECACHE]
      const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8')
      const version = new Date().toISOString().replace(/[-:.TZ]/g, '')
      const source = template
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('__PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  base: process.env.GITHUB_ACTIONS ? '/KintaiKanri/' : '/',
})
