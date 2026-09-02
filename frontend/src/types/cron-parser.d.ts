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

    export interface CronExpressionOptions {
        currentDate?: Date | string | number;
        endDate?: Date | string | number;
        iterator?: boolean;
        strict?: boolean;
        tz?: string;
    }

    export function parseExpression(expression: string, options?: CronExpressionOptions): CronExpression;
}
