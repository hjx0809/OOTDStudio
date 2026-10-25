import type { Weather } from '@/lib/types'
import { tomorrowISO } from '@/lib/utils'
import { SelectField, TextField } from 'oul-ui'

const CONDITION_OPTIONS = ['Clear', 'Partly cloudy', 'Overcast', 'Light rain', 'Heavy rain', 'Light snow', 'Thunderstorm']

function weatherIconFor(condition: string): string {
  const value = condition.toLowerCase()
  if (value.includes('thunder') || value.includes('storm')) return '⛈️'
  if (value.includes('snow')) return '🌨️'
  if (value.includes('rain')) return '🌧️'
  if (value.includes('overcast')) return '☁️'
  if (value.includes('cloud')) return '⛅'
  return '☀️'
}

export interface ManualWeatherState {
  tempMin: string
  tempMax: string
  apparent: string
  rain: string
  wind: string
  condition: string
  city: string
}

export function emptyManualWeather(city = ''): ManualWeatherState {
  return { tempMin: '', tempMax: '', apparent: '', rain: '0', wind: '0', condition: 'Clear', city }
}

export function manualFromWeather(weather: Weather, fallbackCity = ''): ManualWeatherState {
  return {
    tempMin: String(weather.temp_min),
    tempMax: String(weather.temp_max),
    apparent: String(weather.apparent_temp),
    rain: String(weather.precipitation_probability),
    wind: String(weather.wind_speed),
    condition: weather.condition,
    city: weather.city || fallbackCity,
  }
}

/** Returns null until the temperatures are complete and consistent. */
export function weatherFromManual(state: ManualWeatherState, fallbackCity: string | null): Weather | null {
  const tempMin = Number(state.tempMin)
  const tempMax = Number(state.tempMax)
  const apparent = Number(state.apparent)
  if (
    state.tempMin === '' ||
    state.tempMax === '' ||
    state.apparent === '' ||
    !Number.isFinite(tempMin) ||
    !Number.isFinite(tempMax) ||
    !Number.isFinite(apparent) ||
    tempMax < tempMin
  ) {
    return null
  }
  return {
    city: state.city || fallbackCity || null,
    date: tomorrowISO(),
    temp_min: tempMin,
    temp_max: tempMax,
    apparent_temp: apparent,
    precipitation_probability: Math.max(0, Math.min(100, Number(state.rain) || 0)),
    wind_speed: Math.max(0, Number(state.wind) || 0),
    condition: state.condition,
    icon: weatherIconFor(state.condition),
    source: 'manual',
  }
}

export function ManualWeatherFields({
  state,
  onChange,
}: {
  state: ManualWeatherState
  onChange: (state: ManualWeatherState) => void
}) {
  const set = (key: keyof ManualWeatherState, value: string) =>
    onChange({ ...state, [key]: value })
  const numberProps = { type: 'number', inputMode: 'decimal' as const }
  return (
    <div className="form-stack form-stack--tight">
      <div className="form-row form-row--three">
        <TextField
          {...numberProps}
          label="Low"
          suffix="°C"
          placeholder="16"
          value={state.tempMin}
          onChange={(event) => set('tempMin', event.target.value)}
        />
        <TextField
          {...numberProps}
          label="High"
          suffix="°C"
          placeholder="23"
          value={state.tempMax}
          onChange={(event) => set('tempMax', event.target.value)}
        />
        <TextField
          {...numberProps}
          label="Feels"
          suffix="°C"
          placeholder="19"
          value={state.apparent}
          onChange={(event) => set('apparent', event.target.value)}
        />
      </div>
      <SelectField
        label="Sky"
        value={state.condition}
        onChange={(event) => set('condition', event.target.value)}
      >
        {CONDITION_OPTIONS.map((condition) => (
          <option key={condition} value={condition}>
            {condition}
          </option>
        ))}
      </SelectField>
      <div className="form-row">
        <TextField
          {...numberProps}
          label="Rain"
          suffix="%"
          value={state.rain}
          onChange={(event) => set('rain', event.target.value)}
        />
        <TextField
          {...numberProps}
          label="Wind"
          suffix="km/h"
          value={state.wind}
          onChange={(event) => set('wind', event.target.value)}
        />
      </div>
    </div>
  )
}
