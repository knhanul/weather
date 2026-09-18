import { getSql } from "@/lib/db";
import { seedIfEmpty } from "./seed";
import { processJobTick } from "./collector";
import { runDueSchedules } from "./scheduler";

const g = globalThis as typeof globalThis & {
  __weatherBoot__?: Promise<void>;
  __weatherTick__?: ReturnType<typeof setInterval>;
};

export async function ensureWeatherReady(): Promise<void> {
  g.__weatherBoot__ ??= (async () => {
    const sql = await getSql();
    await seedIfEmpty(sql);
    if (!g.__weatherTick__) {
      g.__weatherTick__ = setInterval(() => {
        void (async () => {
          try {
            const db = await getSql();
            await runDueSchedules(db);
            for (let i = 0; i < 2; i += 1) {
              const r = await processJobTick(db);
              if (!r.progressed) break;
            }
          } catch (err) {
            console.error("[weather-hub] tick failed", err);
          }
        })();
      }, 8000);
      g.__weatherTick__.unref?.();
    }
  })();
  await g.__weatherBoot__;
}
