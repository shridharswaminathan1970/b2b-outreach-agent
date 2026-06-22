// Winston logger. Configured from env; never logs secrets directly.
import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

const prettyFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level} ${message}${rest}`;
  }),
);

const jsonFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: config.log.level,
  format: config.log.format === 'json' ? jsonFormat : prettyFormat,
  transports: [new winston.transports.Console()],
});
