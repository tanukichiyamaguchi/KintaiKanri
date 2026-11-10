import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ホーム画面アプリ化（Service Worker）。本番ビルドのときだけ登録する。
// 画面の部品を端末に保存して 2 回目以降の起動を速くする。新しい版は次に開いたときに自動で反映される。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(registration => {
        // アプリに戻ってきたときに新しい版が出ていないか確認する（ホーム画面アプリは長く開いたままになりやすいため）
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {})
        })
      })
      .catch(() => {
        // 登録できなくても通常どおり動作する
      })
  })
}
