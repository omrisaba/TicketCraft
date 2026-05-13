import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../utils/cn';
import { ChevronDown, Loader2 } from 'lucide-react';

interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  onSearch?: (query: string) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function Combobox({
  label,
  value,
  onChange,
  options,
  onSearch,
  loading = false,
  disabled = false,
  placeholder = 'Search...',
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label || '';

  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.value.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  const handleInputChange = useCallback(
    (text: string) => {
      setQuery(text);
      setHighlightIdx(-1);
      if (!open) setOpen(true);

      if (onSearch) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onSearch(text), 300);
      }
    },
    [onSearch, open],
  );

  const handleSelect = useCallback(
    (opt: ComboboxOption) => {
      onChange(opt.value);
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < filtered.length) {
      e.preventDefault();
      handleSelect(filtered[highlightIdx]);
    }
  };

  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="space-y-1" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">{label}</label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selectedLabel}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm transition-colors',
            'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
            'bg-white',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          onFocus={() => {
            setOpen(true);
            setQuery('');
            setHighlightIdx(-1);
          }}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          {loading ? (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>

        {open && (
          <ul
            ref={listRef}
            className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">
                {loading ? 'Loading...' : 'No results'}
              </li>
            ) : (
              filtered.map((opt, i) => (
                <li
                  key={opt.value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(opt);
                  }}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={cn(
                    'px-3 py-2 text-sm cursor-pointer',
                    i === highlightIdx && 'bg-blue-50 text-blue-700',
                    opt.value === value && i !== highlightIdx && 'font-medium text-gray-900',
                    opt.value !== value && i !== highlightIdx && 'text-gray-700 hover:bg-gray-50',
                  )}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
