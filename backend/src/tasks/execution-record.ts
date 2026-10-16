import { BadRequestException } from '@nestjs/common';
import { ChecklistStepDto, ExecutionAnswerDto } from './dto/execution.dto';

export interface ExecutionAnswerSnapshot {
  id: string;
  label: string;
  kind: ChecklistStepDto['kind'];
  required: boolean;
  value: string | number | boolean;
}

export function prepareExecutionRecord(
  checklist: unknown,
  answers: ExecutionAnswerDto[] | undefined,
  status: string,
): ExecutionAnswerSnapshot[] | undefined {
  const steps = Array.isArray(checklist)
    ? (checklist as ChecklistStepDto[])
    : [];
  if (!steps.length && !answers?.length) return undefined;
  if (answers === undefined && status !== 'SUCCESS') return undefined;
  const byId = new Map<string, unknown>();
  for (const answer of answers ?? []) {
    if (byId.has(answer.id) || !steps.some((step) => step.id === answer.id)) {
      throw new BadRequestException('Unknown or duplicate checklist step');
    }
    byId.set(answer.id, answer.value);
  }
  return steps.flatMap((step) => {
    const value = byId.get(step.id);
    const absent = value === undefined || value === null || value === '';
    if (
      status === 'SUCCESS' &&
      step.required &&
      (absent || (step.kind === 'CHECK' && value !== true))
    ) {
      throw new BadRequestException(
        `Required checklist step is incomplete: ${step.label}`,
      );
    }
    if (absent) return [];
    const valid =
      step.kind === 'CHECK'
        ? typeof value === 'boolean'
        : step.kind === 'NUMBER'
          ? typeof value === 'number' && Number.isFinite(value)
          : step.kind === 'PHOTO'
            ? typeof value === 'string' &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                value,
              )
            : typeof value === 'string' &&
              value.trim().length > 0 &&
              value.length <= 2000;
    if (!valid)
      throw new BadRequestException(
        `Invalid answer for checklist step: ${step.label}`,
      );
    return [
      {
        id: step.id,
        label: step.label,
        kind: step.kind,
        required: step.required,
        value: value as string | number | boolean,
      },
    ];
  });
}
