import { Camera, ImagePlus } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { compressImage, cn, formatFileSize } from '@/lib/utils'

interface ImagePickerProps {
  previewUrl?: string | null
  onSelect: (blob: Blob, filename: string, previewUrl: string) => void
  title: string
  subtitle?: string
  aspect?: 'portrait' | 'square' | 'tall'
  variant?: 'base' | 'garment'
  disabled?: boolean
}

const MAX_BYTES = 12 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export function ImagePicker({
  previewUrl,
  onSelect,
  title,
  subtitle,
  aspect = 'portrait',
  variant = 'base',
  disabled = false,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const processFile = async (file: File) => {
    setError(null)
    if (!ACCEPTED.includes(file.type)) {
      setError('Use a JPG, PNG, WebP or HEIC photo')
      return
    }
    if (file.size > MAX_BYTES) {
      setError(`Max 12 MB — this one is ${formatFileSize(file.size)}`)
      return
    }
    setBusy(true)
    try {
      const result = await compressImage(file, variant === 'base' ? 2000 : 1600, 0.9)
      onSelect(result.blob, result.filename, result.previewUrl)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Couldn't read that photo")
    } finally {
      setBusy(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void processFile(file)
  }

  const open = () => inputRef.current?.click()

  return (
    <div className="image-picker-block">
      <div
        className={cn(
          'image-picker',
          `image-picker--${aspect}`,
          previewUrl && 'has-image',
          dragging && 'is-dragging',
          disabled && 'is-disabled',
        )}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {previewUrl ? (
          <>
            <img src={previewUrl} alt="Selected photo" className="image-picker__preview" />
            <button
              type="button"
              className="image-picker__replace"
              onClick={open}
              disabled={disabled || busy}
            >
              {busy ? <span className="o-spinner o-spinner--sm" /> : <Camera size={14} />}
              Change
            </button>
          </>
        ) : (
          <button
            type="button"
            className="image-picker__empty"
            onClick={open}
            disabled={disabled || busy}
          >
            <span className="image-picker__icon">
              {busy ? <span className="o-spinner" /> : <ImagePlus size={24} strokeWidth={1.6} />}
            </span>
            <span className="image-picker__title">{title}</span>
            {subtitle && <span className="image-picker__subtitle">{subtitle}</span>}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="o-sr-only"
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void processFile(file)
            event.target.value = ''
          }}
        />
      </div>
      {error && (
        <p className="o-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
