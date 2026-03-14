declare module 'cron-parser' {
    export interface CronDate {
        toDate(): Date;
        toString(): string;
    }

    export interface CronExpression {
        next(): CronDate;
        prev(): CronDate;
        hasNext(): boolean;
        hasPrev(): boolean;
    }

    export function parseExpression(expression: string, options?: any): CronExpression;
}
