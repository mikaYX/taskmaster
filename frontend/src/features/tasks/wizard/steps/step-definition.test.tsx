import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { StepDefinition } from './step-definition';
import type { CreateTaskFormValues } from '../../schemas/task-creation.schema';

let latest: CreateTaskFormValues | undefined;

function Harness({ excluded }: { excluded?: boolean }) {
    const form = useForm<CreateTaskFormValues>({
        defaultValues: { name: 'Backup', periodicity: 'daily', priority: 'MEDIUM', excludeFromAnalytics: excluded } as never,
    });
    latest = form.watch();
    return (
        <Form {...form}>
            <FormProvider {...form}>
                <StepDefinition />
            </FormProvider>
        </Form>
    );
}

describe('StepDefinition - exclusion from analytics', () => {
    it('is off by default and can be turned on and off again', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        const box = screen.getByRole('checkbox', { name: 'Exclude from analytics' });
        expect(box).not.toBeChecked();
        expect(screen.getByText(/still runs and notifies as usual/i)).toBeInTheDocument();

        await user.click(box);
        expect(latest?.excludeFromAnalytics).toBe(true);
        await user.click(box);
        expect(latest?.excludeFromAnalytics).toBe(false);
    });

    it('shows the stored value when a task is edited', () => {
        render(<Harness excluded />);

        expect(screen.getByRole('checkbox', { name: 'Exclude from analytics' })).toBeChecked();
    });
});
