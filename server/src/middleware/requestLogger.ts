import type { Request, Response, NextFunction } from 'express';

const SENSITIVE_HEADERS = new Set([
  'x-gemini-key',
  'x-jira-token',
  'authorization',
  'cookie',
]);

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, path } = req;

  const safeHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      safeHeaders[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      safeHeaders[key] = value;
    }
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method,
      path,
      status: res.statusCode,
      durationMs: duration,
    };
    console.log(JSON.stringify(logEntry));
  });

  next();
}
