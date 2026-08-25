import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

interface CopyCloudfunctionsOptions {
  enabled: boolean
  mode: string
}

export function createCopyCloudfunctionsPlugin(options: CopyCloudfunctionsOptions): Plugin {
  return {
    name: 'copy-cloudfunctions',
    closeBundle() {
      if (!options.enabled) {
        return
      }

      const rootDir = process.cwd()
      const sourceDir = path.resolve(rootDir, 'cloudfunctions')
      const outputDir = path.resolve(rootDir, 'dist', options.mode === 'production' ? 'build' : 'dev', 'mp-weixin', 'cloudfunctions')

      if (!fs.existsSync(sourceDir)) {
        return
      }

      fs.rmSync(outputDir, { recursive: true, force: true })
      fs.cpSync(sourceDir, outputDir, {
        recursive: true,
        filter: source => !source.includes('node_modules'),
      })
    },
  }
}
