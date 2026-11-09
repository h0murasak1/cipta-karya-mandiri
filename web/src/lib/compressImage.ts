const MAX_IMAGE_DIMENSION = 1600
const JPEG_QUALITY = 0.8

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Foto tidak dapat dibaca oleh browser.'))
    }
    image.src = url
  })
}

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File yang dipilih harus berupa gambar.')
  }

  const image = await loadImage(file)
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Browser tidak mendukung pemrosesan foto.')
  context.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('Foto gagal dikompres.')

  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'foto'}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
