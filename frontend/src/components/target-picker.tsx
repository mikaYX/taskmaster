import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface TargetPickerItem {
    /** Unique across all sections, e.g. `user:3` or `group:4`. */
    value: string;
    label: string;
    /** Small text on the right, e.g. a member count. */
    hint?: string;
}

export interface TargetPickerSection {
    key: string;
    label: string;
    items: TargetPickerItem[];
    /** Shown under the title while the section has no item at all (not while a search matches nothing). */
    emptyLabel?: string;
}

interface TargetPickerProps {
    sections: TargetPickerSection[];
    /** Selected values (a single one at most when `multiple` is off). */
    value: string[];
    onChange: (value: string[]) => void;
    /** Several choices: the menu stays open and offers "select all". Otherwise a pick closes it. */
    multiple?: boolean;
    /** Single mode only: a first entry that clears the choice. */
    noneLabel?: string;
    placeholder: string;
    ariaLabel: string;
    id?: string;
    className?: string;
}

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * One searchable menu for people and teams, shared by the todo form (pick one) and the task
 * delegations (pick many). Sections keep the order they are given in.
 */
export function TargetPicker({ sections, value, onChange, multiple = false, noneLabel, placeholder, ariaLabel, id, className }: TargetPickerProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        const needle = normalize(search.trim());
        return sections
            .map((section) => ({
                ...section,
                items: section.items.filter((item) => !needle || normalize(item.label).includes(needle)),
                // A section that is empty on purpose stays, so people see why nothing can be picked there.
                isEmpty: section.items.length === 0 && !!section.emptyLabel && !needle,
            }))
            .filter((section) => section.items.length > 0 || section.isEmpty);
    }, [sections, search]);

    const visibleValues = filtered.flatMap((section) => section.items.map((item) => item.value));
    const labelOf = (v: string) => sections.flatMap((section) => section.items).find((item) => item.value === v)?.label ?? v;

    const summary = (() => {
        if (value.length === 0) return placeholder;
        if (!multiple || value.length === 1) return labelOf(value[0]);
        return t('targetPicker.selectedCount', { count: value.length });
    })();

    const toggle = (v: string) => {
        if (!multiple) {
            onChange([v]);
            setOpen(false);
            return;
        }
        onChange(value.includes(v) ? value.filter((other) => other !== v) : [...value, v]);
    };

    const selectAllVisible = () => onChange([...new Set([...value, ...visibleValues])]);
    const clearVisible = () => onChange(value.filter((v) => !visibleValues.includes(v)));
    const allVisibleSelected = visibleValues.length > 0 && visibleValues.every((v) => value.includes(v));

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setSearch('');
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-label={ariaLabel}
                    className={cn('w-full justify-between bg-background font-normal', value.length === 0 && 'text-muted-foreground', className)}
                >
                    <span className="truncate">{summary}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
                <div className="flex items-center gap-2 border-b px-3">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('targetPicker.search')}
                        aria-label={t('targetPicker.search')}
                        className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                </div>

                {multiple && visibleValues.length > 0 && (
                    <div className="flex justify-end gap-1 border-b px-2 py-1">
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={allVisibleSelected} onClick={selectAllVisible}>
                            {t('targetPicker.selectAll')}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={!visibleValues.some((v) => value.includes(v))} onClick={clearVisible}>
                            {t('targetPicker.clear')}
                        </Button>
                    </div>
                )}

                <div role="listbox" aria-multiselectable={multiple} className="max-h-64 overflow-y-auto p-1">
                    {!multiple && noneLabel && !search.trim() && (
                        <Option label={noneLabel} selected={value.length === 0} onSelect={() => { onChange([]); setOpen(false); }} />
                    )}
                    {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('targetPicker.empty')}</p>}
                    {filtered.map((section) => (
                        <div key={section.key} role="group" aria-label={section.label}>
                            <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</p>
                            {section.isEmpty && <p className="px-2 py-1.5 text-xs text-muted-foreground">{section.emptyLabel}</p>}
                            {section.items.map((item) => (
                                <Option key={item.value} label={item.label} hint={item.hint} selected={value.includes(item.value)} onSelect={() => toggle(item.value)} />
                            ))}
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function Option({ label, hint, selected, onSelect }: { label: string; hint?: string; selected: boolean; onSelect: () => void }) {
    return (
        <button
            type="button"
            role="option"
            aria-selected={selected}
            onClick={onSelect}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        >
            <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {hint && <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>}
        </button>
    );
}
