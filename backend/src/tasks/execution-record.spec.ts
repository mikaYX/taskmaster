import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChecklistStepDto } from './dto/execution.dto';
import { SetStatusDto } from './dto/manage-status.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { prepareExecutionRecord } from './execution-record';

const check: ChecklistStepDto = {
  id: 'check',
  label: 'Inspect the panel',
  kind: 'CHECK',
  required: true,
};

describe('execution record validation', () => {
  it('keeps legacy tasks compatible without an execution payload', () => {
    expect(
      prepareExecutionRecord(undefined, undefined, 'SUCCESS'),
    ).toBeUndefined();
    expect(prepareExecutionRecord([], [], 'FAILED')).toBeUndefined();
  });
  it('requires every mandatory step before success', () => {
    expect(() => prepareExecutionRecord([check], undefined, 'SUCCESS')).toThrow(
      'incomplete',
    );
    expect(() =>
      prepareExecutionRecord(
        [check],
        [{ id: 'check', value: false }],
        'SUCCESS',
      ),
    ).toThrow('incomplete');
  });
  it('stores an independent snapshot of the labels and step kinds', () => {
    const step = { ...check };
    const record = prepareExecutionRecord(
      [step],
      [{ id: 'check', value: true }],
      'SUCCESS',
    );
    step.label = 'Renamed later';
    expect(record?.[0]).toEqual({ ...check, value: true });
  });
  it('allows failed controls to include partial answers or no answers', () => {
    expect(
      prepareExecutionRecord([check], undefined, 'FAILED'),
    ).toBeUndefined();
    expect(
      prepareExecutionRecord(
        [check],
        [{ id: 'check', value: false }],
        'FAILED',
      )?.[0].value,
    ).toBe(false);
  });
  it('accepts a zero measurement and skips missing optional steps', () => {
    expect(
      prepareExecutionRecord(
        [
          { ...check, kind: 'NUMBER' },
          { ...check, id: 'note', kind: 'TEXT', required: false },
        ],
        [{ id: 'check', value: 0 }],
        'SUCCESS',
      ),
    ).toHaveLength(1);
  });
  it.each([Infinity, NaN, '12', {}, true])(
    'rejects an invalid measurement %s',
    (value) => {
      expect(() =>
        prepareExecutionRecord(
          [{ ...check, kind: 'NUMBER' }],
          [{ id: 'check', value }],
          'SUCCESS',
        ),
      ).toThrow('Invalid answer');
    },
  );
  it('rejects blank text, unknown steps, duplicate answers, and arbitrary photo URLs', () => {
    expect(() =>
      prepareExecutionRecord(
        [{ ...check, kind: 'TEXT' }],
        [{ id: 'check', value: '  ' }],
        'SUCCESS',
      ),
    ).toThrow();
    expect(() =>
      prepareExecutionRecord(
        [check],
        [{ id: 'other', value: true }],
        'SUCCESS',
      ),
    ).toThrow();
    expect(() =>
      prepareExecutionRecord(
        [check],
        [
          { id: 'check', value: true },
          { id: 'check', value: true },
        ],
        'SUCCESS',
      ),
    ).toThrow();
    expect(() =>
      prepareExecutionRecord(
        [{ ...check, kind: 'PHOTO' }],
        [{ id: 'check', value: 'https://example.com/photo' }],
        'SUCCESS',
      ),
    ).toThrow();
  });
  it('validates nested status DTOs including corrective action dates and null payloads', async () => {
    const valid = plainToInstance(SetStatusDto, {
      date: '2026-10-16',
      status: 'FAILED',
      executionAnswers: [{ id: 'check', value: false }],
      correctiveAction: { title: ' Repair panel ', dueDate: '2026-10-20' },
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.correctiveAction?.title).toBe('Repair panel');
    for (const payload of [
      { executionAnswers: null },
      { executionAnswers: [null] },
      { correctiveAction: null },
      { correctiveAction: { title: 'Fix panel', dueDate: '2026-02-31' } },
    ]) {
      expect(
        (
          await validate(
            plainToInstance(SetStatusDto, {
              date: '2026-10-16',
              status: 'FAILED',
              ...payload,
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
  });
  it('rejects null and duplicated checklist definitions', async () => {
    for (const executionChecklist of [null, [null], [check, check]]) {
      const errors = await validate(
        plainToInstance(CreateTaskDto, { executionChecklist }),
      );
      expect(
        errors.some((error) => error.property === 'executionChecklist'),
      ).toBe(true);
    }
  });
});
