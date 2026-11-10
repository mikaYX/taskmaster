import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { resolveAvatarSrc } from '@/lib/avatar';
import { cn } from '@/lib/utils';
import type { TodoPerson } from '@/api/types';

interface PersonAvatarProps {
    person: Pick<TodoPerson, 'username' | 'fullname' | 'avatarUrl'>;
    className?: string;
}

/** Profile photo of a todo's assignee or completer, with their initials as a fallback. */
export function PersonAvatar({ person, className }: PersonAvatarProps) {
    const name = person.fullname || person.username;
    return (
        <Avatar className={cn('size-4', className)}>
            <AvatarImage src={resolveAvatarSrc(person.avatarUrl)} alt="" className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-[8px] font-semibold text-primary">
                {name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
        </Avatar>
    );
}
