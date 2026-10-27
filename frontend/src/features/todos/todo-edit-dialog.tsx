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
import { DateInput } from '@/components/ui/date-input';
import { TargetPicker } from '@/components/target-picker';
import { applyAssignment, assignmentSections, assignmentValue } from './todo-assignment';

interface TodoEditDialogProps {
    todo: Todo | null;
    /** Groups offered for a collective todo; omit for a private one. */
    groups?: { id: number; name: string; memberCount?: number }[];
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
                            <DateInput
                                id="todo-edit-due"
                                value={form.dueDate}
                                clearable={false}
                                onChange={(dueDate) => set({ dueDate })}
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

                    {(groups || assignees) && todo.parentId === null && (
                        <div className="space-y-2">
                            <Label htmlFor="todo-edit-target">{t('todos.dialog.assignTo')}</Label>
                            <TargetPicker
                                id="todo-edit-target"
                                sections={assignmentSections(t, groups, assignees)}
                                value={assignmentValue(form.groupId, form.assigneeId)}
                                onChange={(values) => set(applyAssignment(values))}
                                noneLabel={t('todos.dialog.wholeSiteNobody')}
                                placeholder={t('todos.dialog.assignToPlaceholder')}
                                ariaLabel={t('todos.dialog.assignTo')}
                            />
                            {form.groupId !== '' && form.assigneeId === '' && (
                                <p className="text-[11px] text-muted-foreground">{t('todos.dialog.assignToTeamHint')}</p>
                            )}
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
