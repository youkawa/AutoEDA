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
} from '../packages/schemas/src/index.ts';
import { zodToJsonSchema } from 'zod-to-json-schema';

function loadOpenAPI() {
  const p = path.resolve('dist/openapi.json');
  if (!fs.existsSync(p)) throw new Error('dist/openapi.json not found. Run schema:dump:openapi first.');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function buildZodSchemas() {
  const pairs = [
    ['EDAReport', EDAReportSchema],
    ['ChartCandidate', ChartCandidateSchema],
    ['Answer', AnswerSchema],
    ['PrioritizedAction', PrioritizedActionSchema],
    ['PIIScanResult', PIIScanResultSchema],
    ['LeakageScanResult', LeakageScanResultSchema],
  ];
  const out = {};
  for (const [name, schema] of pairs) {
    out[name] = zodToJsonSchema(schema, name);
  }
  return out;
}

function getPropsFromJsonSchema(js) {
  const props = js.properties ?? {};
  const map = {};
  for (const [k, v] of Object.entries(props)) {
    map[k] = {
      type: v.type,
      enum: v.enum ?? undefined,
      items: v.items ?? undefined,
    };
  }
  return map;
}

function compare(zodSchemas, openapi) {
  const comps = openapi.components?.schemas ?? {};
  const failures = [];
  for (const [name, zjs] of Object.entries(zodSchemas)) {
    const oapi = comps[name];
    if (!oapi) {
      failures.push(`Missing components.schemas.${name}`);
      continue;
    }
    const zProps = getPropsFromJsonSchema(zjs);
    const oProps = getPropsFromJsonSchema(oapi);
    for (const [prop, zinfo] of Object.entries(zProps)) {
      if (!oProps[prop]) {
        failures.push(`${name}: missing property ${prop} in OpenAPI`);
        continue;
      }
      const oinfo = oProps[prop];
      // basic type alignment: object/array/string/number/boolean
      const zType = zinfo.type || (zinfo.enum ? 'string' : undefined);
      const oType = oinfo.type || (oinfo.enum ? 'string' : undefined);
      if (zType && oType && zType !== oType) {
        failures.push(`${name}.${prop}: type mismatch (zod=${zType}, openapi=${oType})`);
      }
      // enum alignment (subset check)
      if (zinfo.enum && Array.isArray(oinfo.enum)) {
        const zset = new Set(zinfo.enum);
        const oset = new Set(oinfo.enum);
        for (const v of zset) if (!oset.has(v)) failures.push(`${name}.${prop}: enum missing value ${v} in OpenAPI`);
      }
    }
  }
  if (failures.length) {
    console.error('[schema-validate] Differences found:\n' + failures.map((f) => ` - ${f}`).join('\n'));
    process.exit(1);
  }
  console.log('[schema-validate] Zod vs OpenAPI basic type/enum check passed.');
}

function main() {
  const openapi = loadOpenAPI();
  const zodSchemas = buildZodSchemas();
  compare(zodSchemas, openapi);
}

main();
