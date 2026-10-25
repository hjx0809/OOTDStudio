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
  if (/雷/.test(condition)) return <CloudLightning {...iconProps} />
  if (/雪|冰/.test(condition)) return <Snowflake {...iconProps} />
  if (/雨|毛毛/.test(condition)) return <CloudRain {...iconProps} />
  if (/雾/.test(condition)) return <CloudFog {...iconProps} />
  if (/阴/.test(condition)) return <Cloud {...iconProps} />
  if (/云/.test(condition)) return <CloudSun {...iconProps} />
  return <Sun {...iconProps} />
}

export function weatherHeadline(weather: Weather | null | undefined): string {
  if (!weather) return '天气待设置'
  if (weather.precipitation_probability >= 60) return '记得带伞'
  if (weather.apparent_temp <= 5) return '注意保暖'
  if (weather.apparent_temp >= 32) return '轻薄透气'
  if (weather.apparent_temp >= 22) return '适合轻装'
  if (weather.apparent_temp >= 14) return '适合叠穿'
  return '加一件外套'
}
