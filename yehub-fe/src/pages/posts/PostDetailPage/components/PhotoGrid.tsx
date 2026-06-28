interface PhotoGridProps {
  photos: string[]
  onPhotoClick: (index: number) => void
}

export function PhotoGrid({ photos, onPhotoClick }: PhotoGridProps) {
  const count = photos.length

  if (count === 1) {
    return (
      <div className="mt-3 rounded-lg overflow-hidden cursor-pointer" onClick={() => onPhotoClick(0)}>
        <img src={photos[0]} alt="" className="w-full max-h-[480px] object-cover" />
      </div>
    )
  }

  if (count === 2) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-0.5 rounded-lg overflow-hidden">
        {photos.map((url, i) => (
          <div key={i} className="cursor-pointer aspect-square" onClick={() => onPhotoClick(i)}>
            <img src={url} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    )
  }

  if (count === 3) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-0.5 rounded-lg overflow-hidden" style={{ height: 400 }}>
        <div className="row-span-2 cursor-pointer" onClick={() => onPhotoClick(0)}>
          <img src={photos[0]} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="cursor-pointer" onClick={() => onPhotoClick(1)}>
          <img src={photos[1]} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="cursor-pointer" onClick={() => onPhotoClick(2)}>
          <img src={photos[2]} alt="" className="h-full w-full object-cover" />
        </div>
      </div>
    )
  }

  const visible = photos.slice(0, 4)
  const remaining = count - 4

  return (
    <div className="mt-3 grid grid-cols-2 gap-0.5 rounded-lg overflow-hidden">
      {visible.map((url, i) => (
        <div key={i} className="relative cursor-pointer aspect-square" onClick={() => onPhotoClick(i)}>
          <img src={url} alt="" className="h-full w-full object-cover" />
          {i === 3 && remaining > 0 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white text-2xl font-semibold">+{remaining}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
