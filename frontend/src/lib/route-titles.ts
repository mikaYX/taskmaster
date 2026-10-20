/** Title of the header per route, most specific prefix first. */
const ROUTE_TITLES: [string, string][] = [
    ['/task-definitions/new', 'taskWizard.title'],
    ['/task-definitions/archive', 'taskArchive.title'],
    ['/task-definitions', 'nav.taskDefinitions'],
    ['/corrective-actions', 'nav.correctiveActions'],
    ['/todos', 'nav.todoList'],
    ['/analytics', 'nav.analytics'],
    ['/exports', 'nav.exports'],
    ['/backups', 'nav.backups'],
    ['/settings', 'nav.settings'],
    ['/profile', 'profile.myProfile'],
    ['/admin', 'nav.auditLog'],
];

export function titleKeyForPath(pathname: string): string {
    const match = ROUTE_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    return match ? match[1] : 'nav.taskBoard';
}
