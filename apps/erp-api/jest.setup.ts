/// <reference types="jest" />
import { Logger } from '@nestjs/common';

// Override NestJS Logger to be silent
Logger.overrideLogger(false);

// Mock global console methods to silence direct console calls
// We use spyOn to allow restoring if needed, but for tests we want silence.
beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => { });
    jest.spyOn(console, 'warn').mockImplementation(() => { });
    jest.spyOn(console, 'error').mockImplementation(() => { });
    jest.spyOn(console, 'info').mockImplementation(() => { });
    jest.spyOn(console, 'debug').mockImplementation(() => { });
});

afterAll(() => {
    jest.restoreAllMocks();
});

// Also mute process.stdout/stderr if Nest uses them directly (unlikely with default logger but possible)
// const noop = () => true;
// process.stdout.write = noop as any;
// process.stderr.write = noop as any;
