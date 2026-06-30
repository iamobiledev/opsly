import { setTimeout as sleep } from "node:timers/promises";

async function main() {
  console.info("opsly-worker: started");

  while (!process.env.OPSLY_WORKER_EXIT_IMMEDIATELY) {
    await sleep(30_000);
  }
}

main().catch((error) => {
  console.error("opsly-worker: fatal", error);
  process.exit(1);
});
