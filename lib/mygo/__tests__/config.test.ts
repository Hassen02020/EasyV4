import test from "node:test"
import assert from "node:assert/strict"
import { getMyGoConfig, resetMyGoConfig } from "../config"

const env = process.env as Record<string, string | undefined>

test("getMyGoConfig : MYGO_MODE=virtual + NODE_ENV=production => throw (garde-fou production)", () => {
  const originalMode = env.MYGO_MODE
  const originalEnv = env.NODE_ENV
  resetMyGoConfig()
  try {
    env.MYGO_MODE = "virtual"
    env.NODE_ENV = "production"
    assert.throws(() => getMyGoConfig(), /interdit en production/)
  } finally {
    if (originalMode === undefined) delete env.MYGO_MODE
    else env.MYGO_MODE = originalMode
    if (originalEnv === undefined) delete env.NODE_ENV
    else env.NODE_ENV = originalEnv
    resetMyGoConfig()
  }
})

test("getMyGoConfig : MYGO_MODE=virtual hors production reste autorisé (dev/test)", () => {
  const originalMode = env.MYGO_MODE
  const originalEnv = env.NODE_ENV
  resetMyGoConfig()
  try {
    env.MYGO_MODE = "virtual"
    delete env.NODE_ENV
    const config = getMyGoConfig()
    assert.equal(config.mode, "virtual")
  } finally {
    if (originalMode === undefined) delete env.MYGO_MODE
    else env.MYGO_MODE = originalMode
    if (originalEnv === undefined) delete env.NODE_ENV
    else env.NODE_ENV = originalEnv
    resetMyGoConfig()
  }
})
