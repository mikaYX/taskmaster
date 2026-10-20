import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TodosController } from './todos.controller';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import {
  CreateTodoCommentDto,
  ReorderTodosDto,
  UpdateTodoPreferencesDto,
} from './dto/todo-extras.dto';

const routeOf = (method: keyof TodosController) => ({
  path: Reflect.getMetadata(
    'path',
    TodosController.prototype[method],
  ) as string,
  verb: Reflect.getMetadata(
    'method',
    TodosController.prototype[method],
  ) as number,
});

describe('TodosController routes', () => {
  // Express matches in declaration order: a literal path declared after `:id` would be
  // taken for an id ("reorder" -> id) and never reached.
  const declared = Object.getOwnPropertyNames(TodosController.prototype).filter(
    (name) => name !== 'constructor',
  );

  it.each([
    ['reorder', 'update'],
    ['clearCompleted', 'remove'],
  ] as const)('declares %s before %s', (literal, withId) => {
    expect(declared.indexOf(literal)).toBeLessThan(declared.indexOf(withId));
  });

  it('serves the literal routes the screens call', () => {
    expect(routeOf('summary').path).toBe('summary');
    expect(routeOf('history').path).toBe('history');
    expect(routeOf('preferences').path).toBe('preferences');
    expect(routeOf('reorder').path).toBe('reorder');
    expect(routeOf('clearCompleted').path).toBe('completed');
  });
});

const errors = async (cls: new () => object, payload: object) =>
  (await validate(plainToInstance(cls, payload))).map((e) => e.property);

describe('todo DTO validation', () => {
  it('accepts a complete creation', async () => {
    expect(
      await errors(CreateTodoDto, {
        title: 'Call',
        description: 'x',
        dueDate: '2026-11-02',
        dueTime: '09:30',
        remindBeforeMinutes: 60,
        scope: 'COLLECTIVE',
        priority: 'HIGH',
        recurrence: 'WEEKLY',
        groupId: 4,
        assigneeId: 3,
      }),
    ).toEqual([]);
  });

  it.each(['9:30', '24:00', '12:60', 'noon', '12:5'])(
    'refuses the time %s',
    async (dueTime) => {
      expect(await errors(CreateTodoDto, { title: 'x', dueTime })).toEqual([
        'dueTime',
      ]);
      expect(await errors(UpdateTodoDto, { dueTime })).toEqual(['dueTime']);
    },
  );

  it('lets an update clear the time, the lead time and the assignee with null', async () => {
    expect(
      await errors(UpdateTodoDto, {
        dueTime: null,
        remindBeforeMinutes: null,
        assigneeId: null,
        dueDate: null,
        description: null,
        groupId: null,
      }),
    ).toEqual([]);
  });

  it('keeps the lead time between nothing and a week', async () => {
    expect(
      await errors(CreateTodoDto, { title: 'x', remindBeforeMinutes: -1 }),
    ).toEqual(['remindBeforeMinutes']);
    expect(
      await errors(CreateTodoDto, { title: 'x', remindBeforeMinutes: 10081 }),
    ).toEqual(['remindBeforeMinutes']);
    expect(
      await errors(CreateTodoDto, { title: 'x', remindBeforeMinutes: 0 }),
    ).toEqual([]);
  });

  it('bounds comments, reorders and preferences', async () => {
    expect(await errors(CreateTodoCommentDto, { body: '' })).toEqual(['body']);
    expect(
      await errors(CreateTodoCommentDto, { body: 'x'.repeat(2001) }),
    ).toEqual(['body']);
    expect(await errors(ReorderTodosDto, { ids: [] })).toEqual(['ids']);
    expect(await errors(ReorderTodosDto, { ids: ['a'] })).toEqual(['ids']);
    expect(await errors(ReorderTodosDto, { ids: [3, 1, 2] })).toEqual([]);
    expect(await errors(UpdateTodoPreferencesDto, { email: 'yes' })).toEqual([
      'email',
    ]);
    expect(
      await errors(UpdateTodoPreferencesDto, { email: false, push: true }),
    ).toEqual([]);
  });
});
