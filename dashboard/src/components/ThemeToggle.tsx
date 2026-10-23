import { useTheme } from '../hooks/useTheme.js';

export function ThemeToggle() {
    const { theme, toggle } = useTheme();
    const next = theme === 'light' ? 'dark' : 'light';

    return (
        <button
            onClick={toggle}
            aria-label={`Switch to ${next} mode`}
            title={`Switch to ${next} mode`}
            style={{
                width: 36, height: 36, padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-md)',
            }}
        >
            {theme === 'light' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                     strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
            ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                     strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
            )}
        </button>
    );
}