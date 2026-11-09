type Receipt = { taskId: number; kind: string; sentAt: Date };

/** An in-memory unique index; the production constraint remains PostgreSQL's. */
export function receiptStore() {
  const receipts: Receipt[] = [];
  const matches = (row: Receipt, where: any): boolean =>
    (where.taskId === undefined ||
      (typeof where.taskId === 'number'
        ? row.taskId === where.taskId
        : where.taskId.in.includes(row.taskId))) &&
    (where.kind === undefined ||
      (typeof where.kind === 'string'
        ? row.kind === where.kind
        : row.kind.startsWith(where.kind.startsWith))) &&
    (!where.sentAt ||
      (where.sentAt instanceof Date
        ? +row.sentAt === +where.sentAt
        : (where.sentAt.gte === undefined ||
            +row.sentAt >= +where.sentAt.gte) &&
          (where.sentAt.gt === undefined || +row.sentAt > +where.sentAt.gt) &&
          (where.sentAt.lte === undefined ||
            +row.sentAt <= +where.sentAt.lte))) &&
    (!where.OR || where.OR.some((part: any) => matches(row, part)));
  const notification = {
    findMany: jest.fn(async ({ where }) =>
      receipts.filter((row) => matches(row, where)),
    ),
    deleteMany: jest.fn(async ({ where }) => {
      const removed = receipts.filter((row) => matches(row, where));
      for (const row of removed) receipts.splice(receipts.indexOf(row), 1);
      return { count: removed.length };
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      const updated = receipts.filter((row) => matches(row, where));
      updated.forEach((row) => Object.assign(row, data));
      return { count: updated.length };
    }),
    findFirst: jest.fn(async ({ where }) =>
      receipts.find((row) => matches(row, where)),
    ),
    create: jest.fn(async ({ data }: { data: Receipt }) => {
      if (
        receipts.some(
          (row) =>
            row.taskId === data.taskId &&
            row.kind === data.kind &&
            +row.sentAt === +data.sentAt,
        )
      ) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      receipts.push({ ...data });
      return data;
    }),
    delete: jest.fn(async ({ where }) => {
      const index = receipts.findIndex((row) =>
        matches(row, where.taskId_kind_sentAt),
      );
      if (index >= 0) receipts.splice(index, 1);
    }),
    update: jest.fn(async ({ where, data }) => {
      const row = receipts.find((row) =>
        matches(row, where.taskId_kind_sentAt),
      );
      Object.assign(row!, data);
    }),
  };
  // Serialize claims as the transaction-scoped advisory lock does in production.
  let previous = Promise.resolve();
  const tx = { notification, $executeRaw: jest.fn().mockResolvedValue(1) };
  const $transaction = jest.fn(async (run) => {
    const result = previous.then(() => run(tx));
    previous = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  });
  return { receipts, notification, $transaction };
}
