import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

interface CopyCloudfunctionsOptions {
  enabled: boolean
  mode: string
}

function isCloudFunctionDir(dirent: fs.Dirent) {
  return dirent.isDirectory() && dirent.name !== 'common'
}

function rewriteCommonRequires(dir: string) {
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, dirent.name)

    if (dirent.isDirectory()) {
      if (dirent.name !== 'node_modules' && dirent.name !== 'common') {
        rewriteCommonRequires(fullPath)
      }
      continue
    }

    if (!dirent.name.endsWith('.js')) {
      continue
    }

    const content = fs.readFileSync(fullPath, 'utf8')
    const nextContent = content.replaceAll("require('../common/", "require('./common/")

    if (nextContent !== content) {
      fs.writeFileSync(fullPath, nextContent)
    }
  }
}

function copyCommonModulesToFunctions(outputDir: string) {
  const commonDir = path.join(outputDir, 'common')

  if (!fs.existsSync(commonDir)) {
    return
  }

  for (const dirent of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (!isCloudFunctionDir(dirent)) {
      continue
    }

    const functionDir = path.join(outputDir, dirent.name)
    const functionPackageJson = path.join(functionDir, 'package.json')

    if (!fs.existsSync(functionPackageJson)) {
      continue
    }

    fs.cpSync(commonDir, path.join(functionDir, 'common'), {
      recursive: true,
    })
    rewriteCommonRequires(functionDir)
  }
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
      copyCommonModulesToFunctions(outputDir)
    },
  }
}
