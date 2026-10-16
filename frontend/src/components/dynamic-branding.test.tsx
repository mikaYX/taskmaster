import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamicBranding } from './dynamic-branding';

const state = vi.hoisted(() => ({ ready: true, values: {} as Record<string, string> }));
vi.mock('@/hooks/use-public-branding', () => ({ usePublicBranding: () => ({ isSuccess: state.ready, getSetting: (key: string) => state.values[key] }) }));

beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '<link rel="icon" href="/vite.svg">';
    document.documentElement.style.removeProperty('--primary');
    state.ready = true;
    state.values = {};
});
afterEach(() => vi.restoreAllMocks());

describe('public application branding', () => {
    it('applies settings then clears old cached branding when settings are reset', () => {
        state.values = { 'app.title': 'Maintenance', 'app.faviconUrl': '/custom.ico', 'ui.theme': 'green' };
        const view = render(<DynamicBranding />);
        expect(document.title).toBe('Maintenance');
        expect(document.querySelector('link')?.getAttribute('href')).toBe('/custom.ico');
        expect(document.documentElement.style.getPropertyValue('--primary')).not.toBe('');
        state.values = {};
        view.rerender(<DynamicBranding />);
        expect(document.title).toBe('Taskmaster');
        expect(document.querySelector('link')?.getAttribute('href')).toBe('/vite.svg');
        expect(localStorage.getItem('app.title')).toBeNull();
        expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
    });
    it('does not crash if browser storage is blocked', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
        state.ready = false;
        const view = render(<DynamicBranding />);
        state.ready = true;
        state.values = { 'app.title': 'Maintenance' };
        expect(() => view.rerender(<DynamicBranding />)).not.toThrow();
        expect(document.title).toBe('Maintenance');
    });
});
