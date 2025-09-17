/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import {
  EDAReportSchema,
  ChartCandidateSchema,
  AnswerSchema,
  PrioritizedActionSchema,
  PIIScanResultSchema,
  LeakageScanResultSchema,
} from '../packages/schemas/src/index';
import { zodToJsonSchema } from 'zod-to-json-schema';

type JsonSchema = Record<string, any>;

function loadOpenAPI(): any {
  const p = path.resolve('dist/openapi.json');
  if (!fs.existsSync(p)) throw new Error('dist/openapi.json not found. Run schema:dump:openapi first.');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function buildZodSchemas(): Record<string, JsonSchema> {
  const pairs = [
    ['EDAReport', EDAReportSchema],
    ['ChartCandidate', ChartCandidateSchema],
    ['Answer', AnswerSchema],
    ['PrioritizedAction', PrioritizedActionSchema],
    ['PIIScanResult', PIIScanResultSchema],
    ['LeakageScanResult', LeakageScanResultSchema],
  ] as const;
  const out: Record<string, JsonSchema> = {};
  for (const [name, schema] of pairs) out[name] = zodToJsonSchema(schema, name) as JsonSchema;
  return out;
}

function getPropsFromJsonSchema(js: JsonSchema) {
  const props = js.properties ?? {};
  const map: Record<string, { type?: string; enum?: string[] }> = {};
  for (const [k, v] of Object.entries<any>(props)) {
    map[k] = { type: v.type, enum: v.enum };
  }
  return map;
}

function compare(zodSchemas: Record<string, JsonSchema>, openapi: any) {
  const comps: Record<string, JsonSchema> = openapi.components?.schemas ?? {};
  const failures: string[] = [];
  for (const [name, zjs] of Object.entries(zodSchemas)) {
    const oapi = comps[name];
    if (!oapi) { failures.push(`Missing components.schemas.${name}`); continue; }
    const zProps = getPropsFromJsonSchema(zjs);
    const oProps = getPropsFromJsonSchema(oapi);
    for (const [prop, zinfo] of Object.entries(zProps)) {
      if (!oProps[prop]) { failures.push(`${name}: missing property ${prop} in OpenAPI`); continue; }
      const oinfo = oProps[prop];
      const zType = zinfo.type || (zinfo.enum ? 'string' : undefined);
      const oType = oinfo.type || (oinfo.enum ? 'string' : undefined);
      if (zType && oType && zType !== oType) failures.push(`${name}.${prop}: type mismatch (zod=${zType}, openapi=${oType})`);
      if (zinfo.enum && Array.isArray(oinfo.enum)) {
        const zset = new Set(zinfo.enum);
        const oset = new Set(oinfo.enum);
        for (const v of zset) if (!oset.has(v)) failures.push(`${name}.${prop}: enum missing value ${v} in OpenAPI`);
      }
    }
  }
  if (failures.length) { console.error('[schema-validate] Differences:\n' + failures.map(f => ` - ${f}`).join('\n')); process.exit(1); }
  console.log('[schema-validate] Zod vs OpenAPI basic type/enum check passed.');
}

const openapi = loadOpenAPI();
const zodSchemas = buildZodSchemas();
compare(zodSchemas, openapi);

