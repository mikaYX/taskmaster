import { useState } from 'react';
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
import type { Todo, TodoPriority, TodoRecurrence, UpdateTodoDto } from '@/api/todos';
import { buildTodoUpdate, formFromTodo } from './todo-update';
import { PRIORITY_OPTIONS, RECURRENCE_OPTIONS } from './todo-priority';

interface TodoEditDialogProps {
    todo: Todo | null;
    /** Groups offered for a collective todo; omit for a private one. */
    groups?: { id: number; name: string }[];
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
    saving = false,
    onSave,
    onClose,
}: Omit<TodoEditDialogProps, 'todo'> & { todo: Todo }) {
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
            <DialogContent className="sm:max-w-[440px]">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Modifier la tâche</DialogTitle>
                        <DialogDescription>Changez le titre, les notes, l&apos;échéance, la priorité, la répétition ou le groupe.</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <Label htmlFor="todo-edit-title">Titre</Label>
                        <Input
                            id="todo-edit-title"
                            value={form.title}
                            maxLength={255}
                            autoFocus
                            onChange={(e) => set({ title: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="todo-edit-description">Notes</Label>
                        <Textarea
                            id="todo-edit-description"
                            value={form.description}
                            maxLength={2000}
                            rows={3}
                            onChange={(e) => set({ description: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="todo-edit-due">Échéance</Label>
                        <div className="flex gap-2">
                            <Input
                                id="todo-edit-due"
                                type="date"
                                value={form.dueDate}
                                onChange={(e) => set({ dueDate: e.target.value })}
                            />
                            {form.dueDate && (
                                <Button type="button" variant="outline" onClick={() => set({ dueDate: '' })}>
                                    Effacer
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="todo-edit-priority">Priorité</Label>
                        <Select value={form.priority} onValueChange={(value) => set({ priority: value as TodoPriority })}>
                            <SelectTrigger id="todo-edit-priority">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PRIORITY_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {todo.parentId === null && (
                        <div className="space-y-2">
                            <Label htmlFor="todo-edit-recurrence">Répétition</Label>
                            <Select
                                value={form.recurrence}
                                onValueChange={(value) => set({ recurrence: value as TodoRecurrence })}
                            >
                                <SelectTrigger id="todo-edit-recurrence">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {RECURRENCE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {form.recurrence !== 'NONE' && (
                                <p className="text-xs text-muted-foreground">
                                    Une nouvelle tâche est créée à la prochaine échéance quand celle-ci est cochée.
                                </p>
                            )}
                        </div>
                    )}

                    {groups && todo.parentId === null && (
                        <div className="space-y-2">
                            <Label htmlFor="todo-edit-group">Groupe</Label>
                            <Select
                                value={form.groupId || 'none'}
                                onValueChange={(value) => set({ groupId: value === 'none' ? '' : value })}
                            >
                                <SelectTrigger id="todo-edit-group">
                                    <SelectValue placeholder="Tout le site" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Tout le site</SelectItem>
                                    {groups.map((group) => (
                                        <SelectItem key={group.id} value={group.id.toString()}>
                                            {group.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>
                            Annuler
                        </Button>
                        <Button type="submit" disabled={!canSave}>
                            {saving ? 'Enregistrement...' : 'Enregistrer'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
