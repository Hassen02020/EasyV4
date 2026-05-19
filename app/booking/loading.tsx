import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1 py-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Skeleton className="mb-4 h-4 w-24" />
          <Skeleton className="mb-2 h-8 w-2/3" />
          <Skeleton className="mb-6 h-4 w-1/2" />
          <Skeleton className="mb-8 h-10 w-full" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-72 lg:col-span-2" />
            <Skeleton className="h-72" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
