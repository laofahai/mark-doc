import { createRoot } from 'react-dom/client'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { SettingsAboutSection } from '../../src/components/SettingsAboutSection'
import en from '../../src/locales/en'
import zh from '../../src/locales/zh'
import '../../src/index.css'

const query = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', query.has('dark'))
void i18next.use(initReactI18next).init({
  lng: query.get('lang') ?? 'zh',
  resources: { en: { translation: en }, zh: { translation: zh } },
  interpolation: { escapeValue: false },
}).then(() => createRoot(document.getElementById('root')!).render(
  <div style={{ maxWidth: 480, margin: '24px auto', background: 'var(--background)', color: 'var(--foreground)' }}>
    <SettingsAboutSection />
  </div>,
))
