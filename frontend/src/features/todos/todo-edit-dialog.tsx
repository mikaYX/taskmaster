import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Todo, TodoPriority, UpdateTodoDto } from '@/api/todos';
import { buildTodoUpdate, formFromTodo } from './todo-update';
import { PRIORITY_VALUES } from './todo-priority';
import { REMIND_OPTIONS, remindToSelect } from './todo-schedule';

interface TodoEditDialogProps {
    todo: Todo | null;
    /** Groups offered for a collective todo; omit for a private one. */
    groups?: { id: number; name: string }[];
    /** People a collective todo can be assigned to; omit when assignment is not offered. */
    assignees?: { id: number; username: string; fullname: string | null }[];
    saving?: boolean;
    onSave: (id: number, dto: UpdateTodoDto) => void;
    onClose: () => void;
}

export function TodoEditDialog({ todo, ...props }: TodoEditDialogProps) {
    if (!todo) return null;
    // Keyed so the form starts from the todo being edited, without syncing state in an effect.
    return <TodoEditForm key={todo.id} todo={todo} {...props} />;
}

function TodoEditForm({
    todo,
    groups,
    assignees,
    saving = false,
    onSave,
    onClose,
}: Omit<TodoEditDialogProps, 'todo'> & { todo: Todo }) {
    const { t } = useTranslation();
    const [form, setForm] = useState(() => formFromTodo(todo));
    const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

    const canSave = form.title.trim().length > 0 && !saving;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        const dto = buildTodoUpdate(todo, form);
        if (Object.keys(dto).length === 0) {
            onClose();
            return;
        }
        onSave(todo.id, dto);
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[440px]">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>{t('todos.dialog.title')}</DialogTitle>
                        <DialogDescription>{t('todos.dialog.description')}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <Label htmlFor="todo-edit-title">{t('todos.dialog.titleField')}</Label>
                        <Input
                            id="todo-edit-title"
                            value={form.title}
                            maxLength={255}
                            autoFocus
                            onChange={(e) => set({ title: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="todo-edit-description">{t('todos.dialog.notes')}</Label>
                        <Textarea
                            id="todo-edit-description"
                            value={form.description}
                            maxLength={2000}
                            rows={3}
                            onChange={(e) => set({ description: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="todo-edit-due">{t('todos.dialog.dueDate')}</Label>
                        <div className="flex gap-2">
                            <Input
                                id="todo-edit-due"
                                type="date"
                                value={form.dueDate}
                                onChange={(e) => set({ dueDate: e.target.value })}
                            />
                            {form.dueDate && (
                                <Button type="button" variant="outline" onClick={() => set({ dueDate: '' })}>
                                    {t('todos.dialog.clear')}
                                </Button>
                            )}
                        </div>
                    </div>

                    {form.dueDate && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="todo-edit-time">{t('todos.dialog.dueTime')}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="todo-edit-time"
                                        type="time"
                                        value={form.dueTime}
                                        onChange={(e) => set({ dueTime: e.target.value })}
                                    />
                                    {form.dueTime && (
                                        <Button type="button" variant="outline" onClick={() => set({ dueTime: '' })}>
                                            {t('todos.dialog.clear')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="todo-edit-remind">{t('todos.dialog.remind')}</Label>
                                <Select value={form.remind} onValueChange={(value) => set({ remind: value })}>
                                    <SelectTrigger id="todo-edit-remind">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {REMIND_OPTIONS.map((option) => (
                                            <SelectItem key={option.key} value={remindToSelect(option.value)}>
                                                {t(`todos.remind.${option.key}`)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="todo-edit-priority">{t('todos.dialog.priority')}</Label>
                        <Select value={form.priority} onValueChange={(value) => set({ priority: value as TodoPriority })}>
                            <SelectTrigger id="todo-edit-priority">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PRIORITY_VALUES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {t(`todos.priorities.${value}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {groups && todo.parentId === null && (
                        <div className="space-y-2">
                            <Label htmlFor="todo-edit-group">{t('todos.dialog.group')}</Label>
                            <Select
                                value={form.groupId || 'none'}
                                onValueChange={(value) => set({ groupId: value === 'none' ? '' : value })}
                            >
                                <SelectTrigger id="todo-edit-group">
                                    <SelectValue placeholder={t('todos.wholeSite')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t('todos.wholeSite')}</SelectItem>
                                    {groups.map((group) => (
                                        <SelectItem key={group.id} value={group.id.toString()}>
                                            {group.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {assignees && todo.parentId === null && (
                        <div className="space-y-2">
                            <Label htmlFor="todo-edit-assignee">{t('todos.dialog.assignee')}</Label>
                            <Select
                                value={form.assigneeId || 'none'}
                                onValueChange={(value) => set({ assigneeId: value === 'none' ? '' : value })}
                            >
                                <SelectTrigger id="todo-edit-assignee">
                                    <SelectValue placeholder={t('todos.dialog.nobody')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t('todos.dialog.nobody')}</SelectItem>
                                    {assignees.map((person) => (
                                        <SelectItem key={person.id} value={person.id.toString()}>
                                            {person.fullname || person.username}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={!canSave}>
                            {saving ? t('common.saving') : t('common.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
