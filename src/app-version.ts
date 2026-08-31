import pkg from '../package.json' with { type: 'json' }

export const APP_VERSION =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : pkg.version
