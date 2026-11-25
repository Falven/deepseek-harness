/** The shared write-only credential input used by native and adapter-owned authentication controls. */
import type { ReactNode } from 'react'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import styles from './ModelsSection.module.css'

/** Write-only credential input data shared with provider authentication extensions. */
export interface ApiKeyFieldProps {
  label: string
  value: string
  placeholder: string
  error?: string
  disabled: boolean
  required: boolean
  autoFocus: boolean
  onChange: (value: string) => void
}

type ApiKeyFieldComponentProps = Pick<FactoryComponentPropsOf<'settings.models.api-key'>, keyof ApiKeyFieldProps>

/**
 * Render the Models page's write-only credential field.
 * @param props - credential draft and accessible field presentation.
 * @returns the shared credential input.
 */
export function ApiKeyField(props: ApiKeyFieldComponentProps): ReactNode {
  return (
    <div className={styles['field']}>
      <span className={styles['fieldLabel']}>{props.label}</span>
      <input
        className={styles['input']}
        type="password"
        autoComplete="new-password"
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.label}
        aria-invalid={props.error !== undefined}
        required={props.required}
        autoFocus={props.autoFocus}
        disabled={props.disabled}
        onChange={(event) => { props.onChange(event.target.value) }}
      />
      {props.error === undefined ? null : <p className={styles['error']}>{props.error}</p>}
    </div>
  )
}
