import { Worker } from "bullmq";

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

const worker = new Worker(
  "mitrede-jobs",
  async (job) => {
    console.info(`[worker] received ${job.name} (${job.id})`);
    throw new Error(`No processor registered for job type: ${job.name}`);
  },
  {
    connection: {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      password: redisUrl.password || undefined,
    },
  },
);

worker.on("ready", () => console.info("[worker] ready"));
worker.on("failed", (job, error) => {
  console.error(`[worker] job ${job?.id ?? "unknown"} failed: ${error.message}`);
});

async function shutdown() {
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

