import { spawn } from "node:child_process";

const role = (process.env.VEIL_PROCESS ?? "web").trim().toLowerCase();

const commands = {
  web: {
    command: "npx",
    args: ["next", "start", "-p", process.env.PORT ?? "3002"],
  },
  worker: {
    command: process.execPath,
    args: ["scripts/spend-worker.mjs"],
  },
};

const selected = commands[role];

if (!selected) {
  console.error(`Unsupported VEIL_PROCESS="${role}". Expected "web" or "worker".`);
  process.exit(1);
}

const child = spawn(selected.command, selected.args, {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
