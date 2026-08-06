import { Queue } from "bullmq";
import config from "./index";

// BullMQ connection options
const connectionOptions = {
  host: config.redis_host || "localhost",
  port: parseInt(config.redis_port || "6379"),
  password: config.redis_password,
  db: parseInt(config.redis_db || "0"),
};

// Queue names
export const QUEUE_NAMES = {};

// Create queues

export { connectionOptions };
