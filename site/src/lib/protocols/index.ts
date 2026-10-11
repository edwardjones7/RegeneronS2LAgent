import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Hand-authored demo protocols from protocols/*.json (see protocols/README.md).
 * Real recruiting trials, simplified to their key criteria.
 */

export type CriterionCheck = 'code' | 'jev' | 'review';

export interface ProtocolCriterion {
  id: string;
  type: 'inclusion' | 'exclusion';
  text: string;
  check: CriterionCheck;
  reason?: string;
  notes?: string;
}

export interface Protocol {
  nctId: string;
  title: string;
  shortTitle: string;
  sponsor: string;
  drug: string;
  phase: string;
  status: string;
  targetEnrollment: number | null;
  url: string;
  note: string;
  criteria: ProtocolCriterion[];
}

const PROTOCOLS_DIR = process.env.PROTOCOLS_PATH ?? path.join(process.cwd(), '..', 'protocols');

let protocols: Map<string, Protocol> | null = null;

function load(): Map<string, Protocol> {
  if (!protocols) {
    protocols = new Map();
    // The folder is optional: without it there are no hand-authored protocols, not a crash.
    if (!existsSync(PROTOCOLS_DIR)) return protocols;
    for (const file of readdirSync(PROTOCOLS_DIR).filter((f) => f.endsWith('.json'))) {
      const raw = JSON.parse(readFileSync(path.join(PROTOCOLS_DIR, file), 'utf8'));
      const protocol: Protocol = {
        nctId: raw.nctId,
        title: raw.title,
        shortTitle: raw.shortTitle ?? raw.title,
        sponsor: raw.sponsor,
        drug: raw.drug,
        phase: raw.phase,
        status: raw.status,
        targetEnrollment: raw.targetEnrollment ?? null,
        url: raw.url,
        note: raw.note ?? '',
        // Keep only display fields; the rule bodies are for the engine.
        criteria: (raw.criteria ?? []).map((c: ProtocolCriterion) => ({
          id: c.id,
          type: c.type,
          text: c.text,
          check: c.check,
          ...(c.reason ? { reason: c.reason } : {}),
          ...(c.notes ? { notes: c.notes } : {}),
        })),
      };
      protocols.set(protocol.nctId, protocol);
    }
  }
  return protocols;
}

export function listProtocolIds(): string[] {
  return [...load().keys()];
}

export function getProtocol(nctId: string): Protocol | null {
  return load().get(nctId) ?? null;
}
