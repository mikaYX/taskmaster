import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TargetPicker } from '@/components/target-picker';
import type { DispatchTeam, Todo, UpdateTodoDto } from '@/api/todos';
import { assignmentSections, dispatchUpdate } from './todo-assignment';

interface TodoDispatchDialogProps {
    todo: Todo | null;
    /** Teams the current user leads. */
    teams: DispatchTeam[];
    saving?: boolean;
    onSave: (id: number, dto: UpdateTodoDto) => void;
    onClose: () => void;
}

export function TodoDispatchDialog({ todo, ...props }: TodoDispatchDialogProps) {
    if (!todo) return null;
    // Keyed so the picker starts empty for each todo, without syncing state in an effect.
    return <TodoDispatchForm key={todo.id} todo={todo} {...props} />;
}

function TodoDispatchForm({ todo, teams, saving = false, onSave, onClose }: Omit<TodoDispatchDialogProps, 'todo'> & { todo: Todo }) {
    const { t } = useTranslation();
    const [pick, setPick] = useState<string[]>([]);

    // A todo of one team goes to that team's people; one held in person may go to any team they lead.
    const scope = todo.groupId === null ? teams : teams.filter((team) => team.id === todo.groupId);
    const people = new Map<number, DispatchTeam['members'][number]>();
    scope.forEach((team) => team.members.forEach((member) => people.set(member.id, member)));
    const sections = assignmentSections(t, scope, [...people.values()]);

    const dto = dispatchUpdate(todo, pick[0]);

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('todos.dispatch.title')}</DialogTitle>
                    <DialogDescription>{t('todos.dispatch.description', { title: todo.title })}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Label htmlFor="todo-dispatch-target">{t('todos.dispatch.pick')}</Label>
                    <TargetPicker
                        id="todo-dispatch-target"
                        sections={sections}
                        value={pick}
                        onChange={setPick}
                        placeholder={t('todos.dispatch.placeholder')}
                        ariaLabel={t('todos.dispatch.pick')}
                    />
                </div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button type="button" disabled={!dto || saving} onClick={() => dto && onSave(todo.id, dto)}>
                        {saving ? t('common.saving') : t('todos.dispatch.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
