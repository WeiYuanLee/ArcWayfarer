type SwitchBarProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  subLabel?: string
}

export function SwitchBar({ checked, onChange, label, disabled, subLabel }: SwitchBarProps) {
  return (
    <label className={`switch-bar-row ${disabled ? 'disabled' : ''}`}>
      <div className="switch-bar-label-group">
        <span className="switch-bar-label">{label}</span>
        {subLabel && <span className="switch-bar-sub">{subLabel}</span>}
      </div>
      <div className={`switch-bar-track ${checked ? 'checked' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="switch-bar-input"
        />
        <div className="switch-bar-thumb" />
      </div>
    </label>
  )
}
