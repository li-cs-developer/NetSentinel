export function ErrorBanner({ message }: { message: string }) {
    return (
        <div
            role="alert"
            style={{
                background: 'rgba(248,113,113,0.1)',
                border: '1px solid var(--status-error)',
                color: 'var(--status-error)',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
            }}
        >
            {message}
        </div>
    );
}