import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino(
  isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
        level: process.env.LOG_LEVEL ?? "info",
      }
    : {
        level: process.env.LOG_LEVEL ?? "info",
      }
);
