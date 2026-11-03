import pino from "pino";

const rootLogger = pino({ level: process.env.LOG_LEVEL || "info" });

export default rootLogger;
