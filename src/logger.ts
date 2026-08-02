import winston from 'winston'; import { config } from './config.js';
export const logger = winston.createLogger({ level: config.logLevel, format: winston.format.combine(winston.format.timestamp(), winston.format.colorize(), winston.format.printf((i: any) => `${i.timestamp} ${i.level}: ${i.message}`)), transports: [new winston.transports.Console()] });
