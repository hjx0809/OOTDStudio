import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Snowflake,
  Sun,
} from 'lucide-react'
import type { Weather } from '@/lib/types'

export function WeatherIcon({
  condition,
  size = 24,
  strokeWidth = 1.7,
}: {
  condition: string
  size?: number
  strokeWidth?: number
}) {
  const iconProps = { size, strokeWidth, 'aria-hidden': true as const }
  if (/thunder|storm|lightning/i.test(condition)) return <CloudLightning {...iconProps} />
  if (/snow|hail/i.test(condition)) return <Snowflake {...iconProps} />
  if (/rain|drizzle|shower/i.test(condition)) return <CloudRain {...iconProps} />
  if (/fog|mist|haze/i.test(condition)) return <CloudFog {...iconProps} />
  if (/overcast/i.test(condition)) return <Cloud {...iconProps} />
  if (/cloud/i.test(condition)) return <CloudSun {...iconProps} />
  return <Sun {...iconProps} />
}

export function weatherHeadline(weather: Weather | null | undefined): string {
  if (!weather) return 'Weather not set yet'
  if (weather.precipitation_probability >= 60) return 'Bring an umbrella'
  if (weather.apparent_temp <= 5) return 'Bundle up'
  if (weather.apparent_temp >= 32) return 'Keep it light and breathable'
  if (weather.apparent_temp >= 22) return 'Perfect for light layers'
  if (weather.apparent_temp >= 14) return 'Good layering weather'
  return 'Add a jacket'
}
