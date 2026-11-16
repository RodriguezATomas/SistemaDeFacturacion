import * as PopoverPrimitive from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { useDebounced } from './common';

/** Selector con búsqueda remota (clientes, productos, comprobantes). */
export function EntityPicker<T extends { id: string }>({
  queryKey,
  fetcher,
  value,
  onSelect,
  renderItem,
  renderValue,
  placeholder = 'Seleccionar…',
  emptyText = 'Sin resultados',
  className,
  disabled,
  extra,
}: {
  queryKey: string;
  fetcher: (search: string) => Promise<T[]>;
  value: T | null;
  onSelect: (item: T | null) => void;
  renderItem: (item: T) => ReactNode;
  renderValue: (item: T) => ReactNode;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const { data, isFetching } = useQuery({ queryKey: [queryKey, 'picker', q], queryFn: () => fetcher(q), enabled: open });

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted-foreground')}>{value ? renderValue(value) : placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[280px] rounded-lg border bg-popover p-1 shadow-elevated data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <div className="relative p-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="h-8 pl-8" />
          </div>
          {extra}
          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {isFetching && !data && (
              <li className="flex items-center justify-center py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></li>
            )}
            {data?.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyText}</li>}
            {data?.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value?.id === item.id}
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">{renderItem(item)}</div>
                  {value?.id === item.id && <Check className="h-4 w-4 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
