export function main(): void {
  console.log("worker up");

  const heartbeat = setInterval(() => {
    console.log(`worker heartbeat ${new Date().toISOString()}`);
  }, 60_000);

  const shutdown = (signal: "SIGTERM" | "SIGINT"): void => {
    console.log(`worker received ${signal}, shutting down`);
    clearInterval(heartbeat);
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
