import type { Sql } from "@/lib/db";
import { chunkRange } from "./chunk";
import { checksum, decryptSecret } from "./crypto";
import { asInt, asString } from "./db-rows";
import { ProviderError } from "./errors";
import { acquireRateLimit, withBackoff } from "./rate-limit";
import { getConnector } from "./providers/registry";
import { latestOfficialHour } from "./timezone";
import { upsertDaily, upsertHourly } from "./upsert";

type ProviderRow = {
  provider_code: string;
  api_key_ciphertext: string | null;
  api_key_source: string;
  requests_per_second: number;
  requests_per_minute: number;
  retry_count: number;
  timeout_seconds: number;
  chunk_days: number;
  preserve_raw: boolean;
  status: string;
};

async function providerForDataset(sql: Sql, datasetCode: string): Promise<ProviderRow | null> {
  const rows = await sql.query<ProviderRow>(
    `select provider_code, api_key_ciphertext, api_key_source,
            requests_per_second, requests_per_minute, retry_count, timeout_seconds,
            chunk_days, preserve_raw, status
       from weather_providers where service_code=$1 limit 1`,
    [datasetCode],
  );
  return rows[0] ?? null;
}

export async function resolveApiKey(sql: Sql, datasetCode: string): Promise<string | null> {
  const envKey = process.env.KMA_API_KEY?.trim();
  if (envKey) return envKey;
  const row = await providerForDataset(sql, datasetCode);
  if (row?.api_key_ciphertext) {
    try {
      return decryptSecret(row.api_key_ciphertext);
    } catch {
      return null;
    }
  }
  return null;
}

export async function testConnection(
  sql: Sql,
  datasetCode: string,
): Promise<{ ok: boolean; message: string; latest?: string; detail?: string }> {
  const connector = getConnector(datasetCode);
  if (!connector.meta.implemented) {
    return { ok: false, message: "이 데이터셋 커넥터는 아직 구현되지 않았습니다." };
  }
  const key = await resolveApiKey(sql, datasetCode);
  if (!key) {
    return {
      ok: false,
      message: "인증키가 등록되지 않았습니다. 공급원 화면에서 공공데이터포털 인증키를 등록하세요.",
    };
  }
  const latest = latestOfficialHour();
  try {
    const raw = await connector.fetch({
      stationId: "108",
      from: latest,
      to: latest,
      pageNo: 1,
      numOfRows: 1,
      apiKey: key,
      timeoutMs: 15000,
    });
    const validated = connector.validate(raw);
    if (!validated.ok) {
      return { ok: false, message: validated.resultMsg ?? "연결 실패", detail: validated.resultCode };
    }
    const tm = validated.items[0] ? String(validated.items[0].tm ?? latest) : latest;
    await sql.query(
      `update weather_providers
          set last_test_at=now(), last_test_status='OK', last_test_message=$1, updated_at=now()
        where service_code=$2`,
      [`정상 · 최근 관측 ${tm}`, datasetCode],
    );
    return { ok: true, message: "기상청 API 연결 정상", latest: tm };
  } catch (err) {
    const pe = err instanceof ProviderError ? err : new ProviderError("UNKNOWN", "연결 실패");
    await sql.query(
      `update weather_providers
          set last_test_at=now(), last_test_status='FAIL', last_test_message=$1, updated_at=now()
        where service_code=$2`,
      [pe.message, datasetCode],
    );
    return { ok: false, message: pe.message };
  }
}

export async function enqueueCollection(
  sql: Sql,
  opts: {
    datasetCode: string;
    stationIds: string[];
    from: string;
    to: string;
    triggerType: "MANUAL" | "SCHEDULED" | "RETRY";
    createdBy: string;
  },
): Promise<{ jobId: number; chunkTotal: number }> {
  const connector = getConnector(opts.datasetCode);
  if (!connector.meta.implemented) {
    throw new Error("이 데이터셋은 아직 수집할 수 없습니다.");
  }
  const provider = await providerForDataset(sql, opts.datasetCode);
  const chunkDays = provider?.chunk_days ?? (opts.datasetCode === "ASOS_DAILY" ? 31 : 7);
  const stations = opts.stationIds.length ? opts.stationIds : ["108"];
  const timeChunks = chunkRange(opts.from, opts.to, chunkDays);
  const job = await sql.query<{ id: number }>(
    `insert into weather_collection_jobs (
        dataset_code, provider, station_id, requested_from, requested_to, trigger_type,
        status, created_by, chunk_total
      ) values ($1,'KMA',$2,$3,$4,$5,'PENDING',$6,$7)
      returning id`,
    [
      opts.datasetCode,
      stations.length === 1 ? stations[0] : null,
      opts.from,
      opts.to,
      opts.triggerType,
      opts.createdBy,
      timeChunks.length * stations.length,
    ],
  );
  const jobId = job[0]!.id;
  for (const stationId of stations) {
    for (const chunk of timeChunks) {
      await sql.query(
        `insert into weather_collection_chunks (job_id, station_id, chunk_from, chunk_to, status)
         values ($1,$2,$3,$4,'PENDING')`,
        [jobId, stationId, chunk.from, chunk.to],
      );
    }
  }
  return { jobId, chunkTotal: timeChunks.length * stations.length };
}

export async function processJobTick(sql: Sql, jobId?: number): Promise<{ progressed: boolean; jobId?: number }> {
  const jobRows = jobId
    ? await sql.query<Record<string, unknown>>(
        `select * from weather_collection_jobs where id=$1`,
        [jobId],
      )
    : await sql.query<Record<string, unknown>>(
        `select * from weather_collection_jobs
          where status in ('PENDING','RUNNING')
          order by id asc limit 1`,
      );
  const job = jobRows[0];
  if (!job) return { progressed: false };
  const id = asInt(job.id);
  if (asString(job.status) === "PENDING") {
    await sql.query(
      `update weather_collection_jobs set status='RUNNING', started_at=coalesce(started_at, now()) where id=$1`,
      [id],
    );
  }
  const chunkRows = await sql.query<Record<string, unknown>>(
    `select * from weather_collection_chunks
      where job_id=$1 and status in ('PENDING','FAILED')
      order by id asc limit 1`,
    [id],
  );
  const chunk = chunkRows[0];
  if (!chunk) {
    await finalizeJob(sql, id);
    return { progressed: true, jobId: id };
  }
  await processChunk(sql, id, asString(job.dataset_code), chunk);
  const remaining = await sql.query<{ n: number }>(
    `select count(*)::int as n from weather_collection_chunks where job_id=$1 and status in ('PENDING','FAILED')`,
    [id],
  );
  if ((remaining[0]?.n ?? 0) === 0) await finalizeJob(sql, id);
  return { progressed: true, jobId: id };
}

async function processChunk(
  sql: Sql,
  jobId: number,
  datasetCode: string,
  chunk: Record<string, unknown>,
) {
  const chunkId = asInt(chunk.id);
  const stationId = asString(chunk.station_id);
  const from = asString(chunk.chunk_from);
  const to = asString(chunk.chunk_to);
  await sql.query(
    `update weather_collection_chunks set status='RUNNING', started_at=now(), attempt_count=attempt_count+1 where id=$1`,
    [chunkId],
  );
  const provider = await providerForDataset(sql, datasetCode);
  const key = await resolveApiKey(sql, datasetCode);
  if (!key) {
    await failChunk(sql, chunkId, jobId, "인증키가 등록되지 않았습니다.");
    return;
  }
  const connector = getConnector(datasetCode);
  try {
    await acquireRateLimit({
      provider: "KMA",
      requestsPerSecond: provider?.requests_per_second ?? 2,
      requestsPerMinute: provider?.requests_per_minute ?? 50,
    });
    const raw = await withBackoff(
      provider?.retry_count ?? 3,
      () =>
        connector.fetch({
          stationId,
          from,
          to,
          pageNo: 1,
          numOfRows: 999,
          apiKey: key,
          timeoutMs: (provider?.timeout_seconds ?? 20) * 1000,
        }),
      (err) => {
        if (err instanceof ProviderError) {
          return err.code === "TIMEOUT" || err.code === "SERVER" || err.code === "RATE_LIMIT" || err.code === "UNREACHABLE";
        }
        return false;
      },
    );
    const validated = connector.validate(raw);
    if (!validated.ok && validated.resultCode && !["03"].includes(validated.resultCode)) {
      throw new ProviderError("UNKNOWN", validated.resultMsg ?? "수집 실패");
    }
    if (validated.unknownFields.length) {
      await sql.query(
        `insert into weather_alerts (severity, code, title, message)
         values ('WARN','SCHEMA_DRIFT','응답 스키마 변경 의심', $1)`,
        [
          `${datasetCode} 응답에 알려지지 않은 필드가 있습니다: ${validated.unknownFields.join(", ")}. 원본은 보존하고 임의 매핑하지 않았습니다.`,
        ],
      );
    }
    let importId: number | null = null;
    if (provider?.preserve_raw) {
      const inserted = await sql.query<{ id: number }>(
        `insert into weather_raw_imports (
            provider, dataset_code, job_id, requested_from, requested_to, station_id,
            request_parameters_json, response_raw, response_format, checksum, status, unknown_fields_json
          ) values ('KMA',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          returning id`,
        [
          datasetCode,
          jobId,
          from,
          to,
          stationId,
          JSON.stringify({ stationId, from, to }),
          raw.body.slice(0, 900_000),
          raw.format,
          checksum(raw.body),
          validated.ok ? "OK" : "WARN",
          validated.unknownFields.length ? JSON.stringify(validated.unknownFields) : null,
        ],
      );
      importId = inserted[0]?.id ?? null;
    }

    let counts = { inserted: 0, updated: 0, skipped: 0, received: validated.items.length };
    if (datasetCode === "ASOS_HOURLY" && connector.normalizeHourly) {
      const rows = connector.normalizeHourly(validated.items);
      const up = await upsertHourly(sql, rows, { importId, jobId });
      counts = { ...up, received: rows.length };
    } else if (datasetCode === "ASOS_DAILY" && connector.normalizeDaily) {
      const rows = connector.normalizeDaily(validated.items);
      const up = await upsertDaily(sql, rows, { importId, jobId });
      counts = { ...up, received: rows.length };
    }

    await sql.query(
      `update weather_collection_chunks
          set status='COMPLETED', completed_at=now(),
              received_count=$2, inserted_count=$3, updated_count=$4, skipped_count=$5, error_message=null
        where id=$1`,
      [chunkId, counts.received, counts.inserted, counts.updated, counts.skipped],
    );
    await sql.query(
      `update weather_collection_jobs set
          received_count = received_count + $2,
          inserted_count = inserted_count + $3,
          updated_count = updated_count + $4,
          skipped_count = skipped_count + $5,
          chunk_done = chunk_done + 1
        where id=$1`,
      [jobId, counts.received, counts.inserted, counts.updated, counts.skipped],
    );
    await sql.query(
      `update weather_providers set last_collect_at=now(), updated_at=now() where service_code=$1`,
      [datasetCode],
    );
  } catch (err) {
    const message = err instanceof ProviderError ? err.message : "수집 구간 처리 중 오류가 발생했습니다.";
    await failChunk(sql, chunkId, jobId, message);
  }
}

async function failChunk(sql: Sql, chunkId: number, jobId: number, message: string) {
  await sql.query(
    `update weather_collection_chunks
        set status='FAILED', completed_at=now(), error_message=$2
      where id=$1`,
    [chunkId, message],
  );
  await sql.query(
    `update weather_collection_jobs set error_count = error_count + 1, error_message=$2, chunk_done = chunk_done + 1 where id=$1`,
    [jobId, message],
  );
}

async function finalizeJob(sql: Sql, jobId: number) {
  const rows = await sql.query<Record<string, unknown>>(
    `select
        (select count(*) from weather_collection_chunks where job_id=$1) as total,
        (select count(*) from weather_collection_chunks where job_id=$1 and status='COMPLETED') as ok,
        (select count(*) from weather_collection_chunks where job_id=$1 and status='FAILED') as fail
     `,
    [jobId],
  );
  const total = asInt(rows[0]?.total);
  const ok = asInt(rows[0]?.ok);
  const fail = asInt(rows[0]?.fail);
  let status: string = "COMPLETED";
  if (fail > 0 && ok > 0) status = "PARTIAL_SUCCESS";
  if (fail > 0 && ok === 0) status = "FAILED";
  if (total === 0) status = "COMPLETED";
  await sql.query(
    `update weather_collection_jobs set status=$2, completed_at=now() where id=$1 and status <> 'CANCELLED'`,
    [jobId, status],
  );
}

export async function retryFailedChunks(sql: Sql, jobId: number) {
  await sql.query(
    `update weather_collection_chunks set status='PENDING', error_message=null where job_id=$1 and status='FAILED'`,
    [jobId],
  );
  await sql.query(
    `update weather_collection_jobs set status='RUNNING', completed_at=null, error_message=null where id=$1`,
    [jobId],
  );
}

export async function cancelJob(sql: Sql, jobId: number) {
  await sql.query(
    `update weather_collection_chunks set status='SKIPPED' where job_id=$1 and status='PENDING'`,
    [jobId],
  );
  await sql.query(
    `update weather_collection_jobs set status='CANCELLED', completed_at=now() where id=$1`,
    [jobId],
  );
}
