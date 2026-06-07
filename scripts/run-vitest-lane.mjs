import { spawnSync } from "node:child_process";

const lane = process.argv[2] ?? "unit";

const laneConfig = {
  unit: {
    config: "vitest.unit.config.ts",
    env: {
      SKIP_LIVE_TESTS: "true",
    },
  },
  db: {
    config: "vitest.db.config.ts",
    env: {},
  },
  live: {
    config: "vitest.live.config.ts",
    env: {},
  },
};

if (!Object.hasOwn(laneConfig, lane)) {
  console.error(`Unknown Vitest lane "${lane}". Expected one of: ${Object.keys(laneConfig).join(", ")}.`);
  process.exit(1);
}

const selectedLane = laneConfig[lane];
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npxCommand,
  ["vitest", "run", "--config", selectedLane.config],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...selectedLane.env,
    },
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
