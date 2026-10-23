import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useTheme } from './useTheme';

describe('useTheme', () => {
    beforeEach(() => {
        localStorage.clear();
        // The hook reads and writes document.documentElement's data-theme
        // attribute. Reset it so tests don't leak state into each other.
        document.documentElement.removeAttribute('data-theme');
    });

    it('defaults to light mode when no preference is stored', () => {
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe('light');
    });

    it('restores a stored preference', () => {
        localStorage.setItem('netsentinel-theme', 'dark');
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe('dark');
    });

    it('toggles theme and persists to localStorage', () => {
        const { result } = renderHook(() => useTheme());

        act(() => { result.current.toggle(); });

        expect(result.current.theme).toBe('dark');
        expect(localStorage.getItem('netsentinel-theme')).toBe('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('toggles back to light and clears the dark attribute', () => {
        const { result } = renderHook(() => useTheme());

        act(() => { result.current.toggle(); });
        act(() => { result.current.toggle(); });

        expect(result.current.theme).toBe('light');
        expect(localStorage.getItem('netsentinel-theme')).toBe('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('ignores invalid stored values and falls back to light', () => {
        localStorage.setItem('netsentinel-theme', 'chartreuse');
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe('light');
    });
});