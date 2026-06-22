// Zod validation middleware. Validates and replaces req.body/query/params with
// the parsed (typed, coerced) values, or throws a ZodError the error handler
// turns into a 400. Use one schema per request part.
import type { RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        // req.query is read-only in Express 5-style getters; assign parsed copy.
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
        });
      }
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Helper to wrap a single body schema (the common case).
export const validateBody = (schema: ZodTypeAny): RequestHandler =>
  validate({ body: schema });

export { z };
