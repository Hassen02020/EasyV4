import Image from "next/image"

export function OmratySection() {
  return (
    <section className="py-12 bg-muted/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-card rounded-2xl overflow-hidden shadow-sm border border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Content */}
            <div className="p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#1e3a5f] mb-3">
                Omraty
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
                Une clème antique et un respectful aspect à Tunis. Découvrez nos programmes Omra avec un accompagnement complet, visa inclus et hôtels à proximité du Haram.
              </p>
            </div>
            
            {/* Image */}
            <div className="relative h-64 lg:h-auto">
              <Image
                src="https://images.unsplash.com/photo-1564769625905-50e93615e769?w=800&h=500&fit=crop"
                alt="Omraty - Programme de pèlerinage"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
