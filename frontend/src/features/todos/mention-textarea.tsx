import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, User, Users } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useMentionTargets } from '@/hooks/use-todos';
import { cn } from '@/lib/utils';
import {
    activeMentionQuery,
    buildMentionOptions,
    filterMentionOptions,
    type MentionOption,
} from './todo-mentions';

export interface PickedMention {
    ref: string;
    label: string;
}

interface MentionTextareaProps {
    todoId: number;
    value: string;
    onChange: (value: string) => void;
    picked: PickedMention[];
    onPick: (mention: PickedMention) => void;
    onSubmit: () => void;
    label: string;
    placeholder: string;
    rows?: number;
    autoFocus?: boolean;
}

/** A comment box that suggests the people and teams of the todo after "@". */
export function MentionTextarea({
    todoId,
    value,
    onChange,
    onPick,
    onSubmit,
    label,
    placeholder,
    rows = 3,
    autoFocus,
}: MentionTextareaProps) {
    const { t } = useTranslation();
    const listId = useId();
    const ref = useRef<HTMLTextAreaElement>(null);
    const [caret, setCaret] = useState(0);
    const [active, setActive] = useState(0);
    const [dismissedAt, setDismissedAt] = useState<number | null>(null);

    const token = activeMentionQuery(value, caret);
    const open = token !== null && dismissedAt !== token.start;
    const targets = useMentionTargets(todoId, open);
    const options = open ? filterMentionOptions(buildMentionOptions(targets.data), token.query) : [];
    const highlighted = Math.min(active, Math.max(options.length - 1, 0));
    // A query with a space is most likely ordinary text after a finished name: stay quiet.
    const showEmpty = open && !targets.isLoading && !targets.isError && options.length === 0 && !/\s/.test(token.query);
    const showList = open && (targets.isLoading || targets.isError || options.length > 0 || showEmpty);

    const choose = (option: MentionOption) => {
        if (!token) return;
        const next = `${value.slice(0, token.start)}@${option.label} ${value.slice(caret)}`;
        const position = token.start + option.label.length + 2;
        onChange(next);
        onPick({ ref: option.ref, label: option.label });
        setActive(0);
        setCaret(position);
        // the name just inserted must not reopen the list (a name may contain spaces)
        setDismissedAt(token.start);
        requestAnimationFrame(() => {
            ref.current?.focus();
            ref.current?.setSelectionRange(position, position);
        });
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showList && options.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((highlighted + 1) % options.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((highlighted - 1 + options.length) % options.length);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                choose(options[highlighted]);
                return;
            }
        }
        if (showList && e.key === 'Escape' && token) {
            e.preventDefault();
            e.stopPropagation();
            setDismissedAt(token.start);
            return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSubmit();
    };

    return (
        <div className="relative">
            <Textarea
                ref={ref}
                value={value}
                maxLength={2000}
                rows={rows}
                autoFocus={autoFocus}
                aria-label={label}
                placeholder={placeholder}
                role="combobox"
                aria-expanded={showList}
                aria-controls={showList ? listId : undefined}
                aria-autocomplete="list"
                aria-activedescendant={showList && options.length > 0 ? `${listId}-${highlighted}` : undefined}
                onChange={(e) => {
                    onChange(e.target.value);
                    setCaret(e.target.selectionStart);
                    setActive(0);
                    setDismissedAt(null);
                }}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
                onKeyDown={onKeyDown}
            />
            {showList && (
                <ul
                    id={listId}
                    role="listbox"
                    aria-label={t('todos.mentions.suggestions')}
                    className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                >
                    {targets.isLoading && (
                        <li role="presentation" className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {t('todos.mentions.loading')}
                        </li>
                    )}
                    {targets.isError && (
                        <li role="presentation" className="px-2 py-1.5 text-xs text-destructive">
                            {t('todos.mentions.error')}
                        </li>
                    )}
                    {showEmpty && (
                        <li role="presentation" className="px-2 py-1.5 text-xs text-muted-foreground">
                            {t('todos.mentions.empty')}
                        </li>
                    )}
                    {options.map((option, index) => (
                        <li
                            key={option.ref}
                            id={`${listId}-${index}`}
                            role="option"
                            aria-selected={index === highlighted}
                            className={cn(
                                'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                                index === highlighted && 'bg-accent text-accent-foreground',
                            )}
                            // mousedown, not click: the textarea must not lose its caret first
                            onMouseDown={(e) => {
                                e.preventDefault();
                                choose(option);
                            }}
                        >
                            {option.kind === 'group' ? (
                                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            ) : (
                                <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            )}
                            <span className="min-w-0 flex-1 truncate">{option.label}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                                {option.kind === 'group' ? t('todos.mentions.team') : `@${option.hint}`}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
