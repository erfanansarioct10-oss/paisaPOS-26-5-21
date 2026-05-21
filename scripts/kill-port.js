/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require("child_process");

try {
  console.log("[PaisaPOS] Checking for processes running on port 3000...");
  let stdout = "";
  if (process.platform === "win32") {
    // Windows: search netstat connections for port :3000
    try {
      stdout = execSync("netstat -ano | findstr :3000", { encoding: "utf8" });
    } catch {
      // Non-zero exit code of findstr means no process was found
      stdout = "";
    }

    if (stdout) {
      const lines = stdout.split("\n");
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        // The last token in the netstat output line is the PID
        if (parts.length >= 5) {
          const pid = parts[parts.length - 1];
          if (/^\d+$/.test(pid) && pid !== "0") {
            pids.add(pid);
          }
        }
      }

      for (const pid of pids) {
        console.log(`[PaisaPOS] Killing Windows process PID ${pid} running on port 3000...`);
        try {
          execSync(`taskkill /F /PID ${pid}`);
        } catch (err) {
          console.warn(`[PaisaPOS] Could not kill PID ${pid}:`, err.message);
        }
      }
    } else {
      console.log("[PaisaPOS] Port 3000 is already free.");
    }
  } else {
    // macOS / Linux: search using lsof
    try {
      stdout = execSync("lsof -t -i:3000", { encoding: "utf8" });
    } catch {
      stdout = "";
    }

    if (stdout) {
      const pids = stdout.trim().split("\n");
      for (const pid of pids) {
        console.log(`[PaisaPOS] Killing UNIX process PID ${pid} running on port 3000...`);
        try {
          execSync(`kill -9 ${pid}`);
        } catch (err) {
          console.warn(`[PaisaPOS] Could not kill PID ${pid}:`, err.message);
        }
      }
    } else {
      console.log("[PaisaPOS] Port 3000 is already free.");
    }
  }
} catch (e) {
  console.error("[PaisaPOS] Failed to scan or kill port 3000:", e.message);
}
