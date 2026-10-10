// docs/STATS_RULES.md 를 stats-engine.mjs 의 규칙 문장에서 다시 만든다(화면 '계산 기준'과 같은 문장)
import fs from "node:fs";
import { RULES, LIFE_RULES, METRICS } from "../stats-engine.mjs";
const L = ["# 날씨 통계 계산 기준", "", "이 문서는 `stats-engine.mjs` 의 `RULES`·`LIFE_RULES`·`METRICS` 에서 생성했습니다(화면 \"계산 기준\"과 같은 문장). 다시 만들기: `node scripts/gen-stats-rules.mjs`.", "", "## 공통", ...RULES.map((r) => `- ${r}`), "", "## 지표"];
for (const [id, m] of Object.entries(METRICS)) L.push(`- **${m.label}** (\`${id}\`, ${m.unit}): ${m.def}`);
const names = { heat: "더위가 일찍 올까", streaks: "연속 강수·무강수", weekend: "주말·평일 강수", day: "기념일·생일(같은 월·일)", outdoor: "산책·러닝(시간자료)", commute: "출퇴근 강수(시간자료)", tropical: "열대야 추정(시간자료)", records: "날씨 기록", snow: "눈" };
for (const [k, list] of Object.entries(LIFE_RULES)) L.push("", `## ${names[k] || k}`, ...list.map((r) => `- ${r}`));
fs.writeFileSync(new URL("../docs/STATS_RULES.md", import.meta.url), L.join("\n") + "\n");
