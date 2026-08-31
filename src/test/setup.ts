import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-fs', () => ({
  watch: vi.fn(() => Promise.resolve(vi.fn())),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}))

// Mock @linch-tech/desktop-core
vi.mock('@linch-tech/desktop-core', () => ({
  useLocalStorage: vi.fn((key, initialValue) => [initialValue, vi.fn()]),
  useTheme: vi.fn(() => ({ theme: 'light', setTheme: vi.fn() })),
  ThemeSwitcher: 'div',
  LanguageSwitcher: 'div',
  PageHeader: 'div',
  Button: 'button',
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))
