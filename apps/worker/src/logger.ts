// Worker logger (winston). Never log secrets or message bodies.
import { createLogger, format, transports } from 'winston';
import { config } from './config';

export const logger = createLogger({
  level: config.log.level,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    config.isProd ? format.json() : format.simple(),
  ),
  transports: [new transports.Console()],
});
