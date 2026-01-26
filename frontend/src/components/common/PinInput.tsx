import { useState, useRef, useEffect, type KeyboardEvent } from 'react';

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  darkMode?: boolean;
}

export function PinInput({
  length = 4,
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  darkMode = true,
}: PinInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focused, setFocused] = useState(false);

  // Split value into array
  const digits = value.split('').slice(0, length);
  while (digits.length < length) {
    digits.push('');
  }

  useEffect(() => {
    // Focus first empty input
    if (!disabled && focused) {
      const emptyIndex = digits.findIndex(d => d === '');
      const focusIndex = emptyIndex === -1 ? length - 1 : emptyIndex;
      inputRefs.current[focusIndex]?.focus();
    }
  }, [value, disabled, focused, digits, length]);

  const handleChange = (index: number, inputValue: string) => {
    if (disabled) return;

    // Only allow digits
    const digit = inputValue.replace(/\D/g, '').slice(-1);

    const newDigits = [...digits];
    newDigits[index] = digit;
    const newValue = newDigits.join('');

    onChange(newValue);

    // Move to next input if we entered a digit
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Call onComplete if all digits are filled
    if (digit && index === length - 1 && newValue.length === length) {
      onComplete?.(newValue);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Move to previous input if current is empty
        inputRefs.current[index - 1]?.focus();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        onChange(newDigits.join(''));
      } else {
        const newDigits = [...digits];
        newDigits[index] = '';
        onChange(newDigits.join(''));
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    if (disabled) return;

    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      if (pastedData.length === length) {
        onComplete?.(pastedData);
      }
    }
  };

  const baseClasses = darkMode
    ? 'bg-secondary-700 border-secondary-600 text-white'
    : 'bg-white border-secondary-300 text-secondary-900';

  const filledClasses = darkMode
    ? 'bg-primary-500/20 border-primary-500'
    : 'bg-primary-50 border-primary-400';

  const errorClasses = 'border-red-500 bg-red-500/10';

  return (
    <div className="flex justify-center gap-3">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={el => { inputRefs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          onChange={e => handleChange(index, e.target.value)}
          onKeyDown={e => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          className={`
            w-14 h-16 text-center text-2xl font-bold
            border-2 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500
            transition-all duration-200
            ${error ? errorClasses : digit ? filledClasses : baseClasses}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary-400'}
          `}
          aria-label={`PIN digit ${index + 1}`}
        />
      ))}
    </div>
  );
}
