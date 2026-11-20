import { Select } from '@chakra-ui/react'
import { formConfig } from '../../config/form'
import { FormWindow } from '../../helpers/form/types'

export const windowLabel = (w: FormWindow): string =>
  w === 'season' ? 'Season' : w === 1 ? 'Last game' : `Last ${w} games`

export function parseWindow(raw: string | null | undefined): FormWindow | null {
  if (raw === 'season') return 'season'
  const n = Number(raw)
  return formConfig.windowOptions.indexOf(n) !== -1 ? n : null
}

export const WindowSelect = ({
  value,
  onChange,
  label,
}: {
  value: FormWindow
  onChange: (w: FormWindow) => void
  label: string
}) => (
  <Select
    size={'sm'}
    maxW={'170px'}
    color={'quinary'}
    aria-label={label}
    value={String(value)}
    onChange={(e) => onChange(parseWindow(e.target.value) ?? formConfig.defaultWindow)}>
    {formConfig.windowOptions.map((w) => (
      <option key={String(w)} value={String(w)} style={{ color: 'black' }}>
        {windowLabel(w)}
      </option>
    ))}
  </Select>
)
