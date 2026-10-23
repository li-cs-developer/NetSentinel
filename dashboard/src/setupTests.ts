import '@testing-library/jest-dom';

// Stub out fetch so tests don't try to reach a real server.
// Individual tests can override this if they need to assert on request shape.
import { vi } from 'vitest';
vi.stubGlobal('fetch', vi.fn());