/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  EDAReportSchema,
  ChartCandidateSchema,
  AnswerSchema,
  PrioritizedActionSchema,
  PIIScanResultSchema,
  LeakageScanResultSchema,
} from '@autoeda/schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';

type Schemas = Record<string, ReturnType<typeof zodToJsonSchema>>;

function buildZodSchemas(): Schemas {
  const pairs: Array<[string, z.ZodTypeAny]> = [
    ['EDAReport', EDAReportSchema],
    ['ChartCandidate', ChartCandidateSchema],
    ['Answer', AnswerSchema],
    ['PrioritizedAction', PrioritizedActionSchema],
    ['PIIScanResult', PIIScanResultSchema],
    ['LeakageScanResult', LeakageScanResultSchema],
  ];
  const out: Schemas = {};
  for (const [name, schema] of pairs) {
    out[name] = zodToJsonSchema(schema, name);
  }
  return out;
}

function readOpenAPI(): any {
  const p = path.resolve('dist/openapi.json');
  if (!fs.existsSync(p)) {
    throw new Error(`dist/openapi.json not found. Run npm run schema:dump:openapi first.`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function assertPropertiesMatch(zodSchemas: Schemas, openapi: any) {
  const comp = openapi.components?.schemas ?? {};
  const failures: string[] = [];
  for (const [name, zschema] of Object.entries(zodSchemas)) {
    const oapi = comp[name];
    if (!oapi) {
      failures.push(`Missing in OpenAPI: components.schemas.${name}`);
      continue;
    }
    const zProps = Object.keys(zschema.properties ?? {});
    const oProps = Object.keys(oapi.properties ?? {});
    const missing = zProps.filter((k) => !oProps.includes(k));
    if (missing.length) {
      failures.push(`${name}: missing props in OpenAPI -> ${missing.join(', ')}`);
    }
  }
  if (failures.length) {
    console.error('Schema validation failed:\n' + failures.map((f) => ` - ${f}`).join('\n'));
    process.exit(1);
  }
}

function main() {
  const zodSchemas = buildZodSchemas();
  const openapi = readOpenAPI();
  assertPropertiesMatch(zodSchemas, openapi);
  console.log('Schema validation passed.');
}

main();

