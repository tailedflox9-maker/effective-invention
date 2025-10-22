// src/components/CustomSelect.tsx
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function CustomSelect({ options, value, onChange, placeholder = "Select..." }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={selectRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="input-style flex items-center justify-between w-full text-left"
      >
        <span className={selectedOption ? 'text-white' : 'text-gray-400'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-lg animate-fade-in max-h-60 overflow-y-auto">
          <ul className="p-1">
            {options.map(option => (
              <li
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`flex items-center justify-between p-2 text-sm rounded-md cursor-pointer transition-colors ${
                  value === option.value
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>{option.label}</span>
                {value === option.value && <Check size={16} className="text-blue-300" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
