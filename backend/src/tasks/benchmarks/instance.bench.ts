import { InstanceService } from '../instance.service';
import { Task } from '@prisma/client';

// Mock Dependencies
const recurrenceMock = { getInstancesInRange: () => [] } as any;

const service = new InstanceService(recurrenceMock);

// Mock Task
const task: any = {
  id: 1,
  periodicity: 'DAILY',
  startDate: new Date('2024-01-01'),
  endDate: null,
  activeUntil: null,
  skipWeekends: false,
  skipHolidays: false,
};

const COUNT = 1000;
const DAYS = 90;
const START = new Date('2024-01-01');
const END = new Date('2024-03-31'); // 90 days

console.log(`Starting benchmark: ${COUNT} tasks, ${DAYS} days range`);

const start = performance.now();
const startMem = process.memoryUsage().heapUsed;

let totalInstances = 0;

for (let i = 0; i < COUNT; i++) {
  // Consume iterator entirely to measure full generation cost
  const iterator = service.computeInstances(task, START, END, 'FR');
  for (const _ of iterator) {
    totalInstances++;
  }
}

const end = performance.now();
const endMem = process.memoryUsage().heapUsed;

console.log(`Total Instances: ${totalInstances}`);
console.log(`Time: ${(end - start).toFixed(2)}ms`);
console.log(
  `Memory Delta: ${((endMem - startMem) / 1024 / 1024).toFixed(2)} MB`,
);
