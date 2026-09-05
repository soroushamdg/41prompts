import { main } from "./main";

main().catch((error: unknown) => {
  console.error("worker failed to start", error);
  process.exit(1);
});
