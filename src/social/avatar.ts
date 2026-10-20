/** Longest side of a stored profile photo, in pixels: sharp at 3x for the largest (88pt) avatar. */
const SIZE = 256

/**
 * Turns a chosen photo into a small square JPEG data URL (centre-cropped, about 15–30 kB), which is
 * what the profiles table stores. iPhone photos arrive as JPEG from the picker, so HEIC isn't a concern.
 */
export async function photoToAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.min(SIZE, side)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height)
    // The server only accepts JPEG under 60 kB; step the quality down until it fits.
    for (const quality of [0.85, 0.7, 0.5]) {
      const data = canvas.toDataURL('image/jpeg', quality)
      if (data.length <= 60_000) return data
    }
    throw new Error('That photo couldn’t be made small enough. Try another.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
