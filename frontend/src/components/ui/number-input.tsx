import * as React from "react"
import { Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface NumberInputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
    value?: number
    onChange?: (value: number) => void
    min?: number
    max?: number
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
    ({ className, min, max, value, onChange, disabled, placeholder, ...props }, ref) => {
        const displayValue = value === undefined || Number.isNaN(value) ? "" : value

        const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
            const stringValue = e.target.value
            if (stringValue === "") {
                // Envoie NaN pour indiquer que le champ est vide
                onChange?.(NaN)
                return
            }
            const val = parseInt(stringValue, 10)
            if (Number.isNaN(val)) return
            onChange?.(val)
        }

        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            const val = parseInt(e.target.value, 10)
            if (Number.isNaN(val)) {
                props.onBlur?.(e)
                return
            }
            let clampedVal = val
            if (min !== undefined && clampedVal < min) clampedVal = min
            if (max !== undefined && clampedVal > max) clampedVal = max
            if (clampedVal !== value) {
                onChange?.(clampedVal)
            }
            props.onBlur?.(e)
        }

        const decrement = () => {
            const current = typeof value !== "number" || Number.isNaN(value) ? 0 : value
            const nextValue = current - 1
            if (min !== undefined && nextValue < min) return
            onChange?.(nextValue)
        }

        const increment = () => {
            const current = typeof value !== "number" || Number.isNaN(value) ? 0 : value
            const nextValue = current + 1
            if (max !== undefined && nextValue > max) return
            onChange?.(nextValue)
        }

        const safeValue = typeof value !== "number" || Number.isNaN(value) ? 0 : value
        const minusDisabled = disabled || (min !== undefined && safeValue <= min)
        const plusDisabled = disabled || (max !== undefined && safeValue >= max)

        return (
            <div className={cn("flex items-center space-x-2", className)}>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={decrement}
                    disabled={minusDisabled}
                    tabIndex={-1}
                >
                    <Minus className="h-4 w-4" />
                </Button>
                <Input
                    type="number"
                    ref={ref}
                    className="text-center flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={displayValue}
                    onChange={handleInput}
                    onBlur={handleBlur}
                    disabled={disabled}
                    placeholder={placeholder}
                    min={min}
                    max={max}
                    {...props}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={increment}
                    disabled={plusDisabled}
                    tabIndex={-1}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
        )
    }
)
NumberInput.displayName = "NumberInput"
