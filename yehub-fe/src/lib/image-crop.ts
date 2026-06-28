export type PixelCrop = { x: number; y: number; width: number; height: number }

export type CropImageOptions = {
  file: File
  pixelCrop: PixelCrop
  rotation: number // degrees, multiple of 90
  maxSize: number // longest side of output, in px
  outputMime: 'image/png' | 'image/jpeg'
  quality: number // 0..1, ignored for PNG
}

export async function cropImageToBlob({
  file,
  pixelCrop,
  rotation,
  maxSize,
  outputMime,
  quality,
}: CropImageOptions): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const rotated = drawRotated(image, rotation)
    const cropped = extractCrop(rotated, pixelCrop, maxSize)
    return await canvasToBlob(cropped, outputMime, quality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function pickOutputMime(inputType: string): 'image/png' | 'image/jpeg' {
  return inputType === 'image/png' ? 'image/png' : 'image/jpeg'
}

export function swapExtension(filename: string, mime: 'image/png' | 'image/jpeg'): string {
  const ext = mime === 'image/png' ? 'png' : 'jpg'
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.slice(0, dot) : filename
  return `${base}.${ext}`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

function drawRotated(image: HTMLImageElement, rotation: number): HTMLCanvasElement {
  const rotRad = (rotation * Math.PI) / 180
  const { width: boxW, height: boxH } = rotatedBox(image.width, image.height, rotation)
  const canvas = document.createElement('canvas')
  canvas.width = boxW
  canvas.height = boxH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.translate(boxW / 2, boxH / 2)
  ctx.rotate(rotRad)
  ctx.drawImage(image, -image.width / 2, -image.height / 2)
  return canvas
}

function rotatedBox(width: number, height: number, rotation: number): { width: number; height: number } {
  const rotRad = (rotation * Math.PI) / 180
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  }
}

function extractCrop(source: HTMLCanvasElement, pixelCrop: PixelCrop, maxSize: number): HTMLCanvasElement {
  const longSide = Math.max(pixelCrop.width, pixelCrop.height)
  const scale = longSide > maxSize ? maxSize / longSide : 1
  const outW = Math.round(pixelCrop.width * scale)
  const outH = Math.round(pixelCrop.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(source, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, outW, outH)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))), mime, quality)
  })
}
