import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import selectStyles from './SelectField.module.css';

export interface SelectOption<Value extends string = string> {
  value: Value;
  label: ReactNode;
  disabled?: boolean;
}

interface SelectFieldProps<Value extends string> {
  value: Value;
  options: readonly SelectOption<Value>[];
  onChange: (value: Value) => void;
  ariaLabel: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  className?: string;
  disabled?: boolean;
  icon?: ReactNode;
  id?: string;
  name?: string;
  required?: boolean;
  variant?: 'default' | 'compact' | 'filter';
}

const joinClasses = (...names: Array<string | undefined | false>) => names.filter(Boolean).join(' ');

export function SelectField<Value extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  className,
  disabled,
  icon,
  id,
  name,
  required,
  variant = 'default',
}: SelectFieldProps<Value>) {
  const items = options.map((option) => ({
    label: option.label,
    value: option.value === '' ? null : option.value,
  }));
  const selectedValue = value === '' ? null : value;

  return (
    <Select.Root<string | null>
      id={id}
      name={name}
      value={selectedValue}
      items={items}
      required={required}
      disabled={disabled}
      onValueChange={(nextValue) => onChange((nextValue ?? '') as Value)}
    >
      <Select.Trigger
        className={joinClasses(selectStyles.trigger, selectStyles[variant], className)}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-required={required || undefined}
      >
        {icon ? <span className={selectStyles.leadingIcon}>{icon}</span> : null}
        <Select.Value className={selectStyles.value} />
        <Select.Icon className={selectStyles.icon}>
          <ChevronDown size={15} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className={selectStyles.positioner}
          align="start"
          side="bottom"
          sideOffset={6}
          collisionPadding={8}
          alignItemWithTrigger={false}
        >
          <Select.Popup className={selectStyles.popup} data-select-popup>
            <Select.List className={selectStyles.list}>
              {options.map((option) => {
                const optionValue = option.value === '' ? null : option.value;
                return (
                  <Select.Item
                    className={selectStyles.item}
                    key={option.value || '__empty'}
                    value={optionValue}
                    label={typeof option.label === 'string' ? option.label : undefined}
                    disabled={option.disabled}
                  >
                    <Select.ItemIndicator className={selectStyles.indicator}>
                      <Check size={15} aria-hidden="true" />
                    </Select.ItemIndicator>
                    <Select.ItemText className={selectStyles.itemText}>{option.label}</Select.ItemText>
                  </Select.Item>
                );
              })}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
