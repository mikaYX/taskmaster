import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  subWeeks,
  subMonths,
  subYears,
} from 'date-fns';

@ValidatorConstraint({ name: 'isValidRecurrenceDate', async: false })
export class IsValidRecurrenceDateConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const object = args.object as any;

    // Adapt to both requested names and existing schema
    const recurrence = (object.recurrence || object.periodicity)?.toUpperCase();
    const startDate = object.startDate;
    const dueDate = object.dueDate || object.endDate;

    if (!recurrence || recurrence === 'ONCE') return true;

    const now = new Date();
    const today = startOfDay(now);

    switch (recurrence) {
      case 'DAILY':
        if (startDate && new Date(startDate) < today) {
          return false;
        }
        break;

      case 'WEEKLY':
        const previousWeekStart = startOfWeek(subWeeks(now, 1), {
          weekStartsOn: 1,
        });
        if (dueDate && new Date(dueDate) < previousWeekStart) {
          return false;
        }
        break;

      case 'MONTHLY':
        const previousMonthStart = startOfMonth(subMonths(now, 1));
        if (dueDate && new Date(dueDate) < previousMonthStart) {
          return false;
        }
        break;

      case 'YEARLY':
        const previousYearStart = startOfYear(subYears(now, 1));
        if (dueDate && new Date(dueDate) < previousYearStart) {
          return false;
        }
        break;

      case 'CUSTOM':
      case 'CRON':
        if (dueDate && new Date(dueDate) < today) {
          return false;
        }
        break;

      default:
        return true;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    const object = args.object as any;
    const recurrence = (object.recurrence || object.periodicity)?.toUpperCase();
    const now = new Date();

    switch (recurrence) {
      case 'DAILY':
        return 'Daily tasks must have a start date of today or later';

      case 'WEEKLY':
        const previousWeekStart = startOfWeek(subWeeks(now, 1), {
          weekStartsOn: 1,
        });
        return `Weekly tasks must have a due date no earlier than ${previousWeekStart.toISOString().split('T')[0]}`;

      case 'MONTHLY':
        const previousMonthStart = startOfMonth(subMonths(now, 1));
        return `Monthly tasks must have a due date no earlier than ${previousMonthStart.toISOString().split('T')[0]}`;

      case 'YEARLY':
        const previousYearStart = startOfYear(subYears(now, 1));
        return `Yearly tasks must have a due date no earlier than ${previousYearStart.toISOString().split('T')[0]}`;

      case 'CUSTOM':
      case 'CRON':
        return 'Custom tasks cannot have a due date in the past';

      default:
        return 'Invalid date for this recurrence type';
    }
  }
}
