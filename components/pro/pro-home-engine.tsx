"use client"

import { useState } from "react"
import { ProModuleTabs, type ProModule } from "./pro-module-tabs"
import { ProSearchBar } from "./pro-search-bar"

export function ProHomeEngine() {
  const [module, setModule] = useState<ProModule>("hotels")
  return (
    <div className="space-y-4 md:space-y-5">
      <ProModuleTabs value={module} onChange={setModule} />
      <ProSearchBar module={module} />
    </div>
  )
}
