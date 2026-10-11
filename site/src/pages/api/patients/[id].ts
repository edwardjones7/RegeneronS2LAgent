import type { NextApiRequest, NextApiResponse } from 'next';
import { getPatientOutreach, type PatientOutreach } from '@/lib/caller';
import { getPatient, type PatientDetail } from '@/lib/patients';
import { DEMO_PRACTICE } from '@/lib/practice';

export interface PatientDetailResponse {
  patient: PatientDetail;
  outreach: PatientOutreach[];
}

/**
 * One of this practice's patients, for the patient drawer. Identifiable data, so it stays inside the
 * practice's own app: the lookup is scoped to the practice's county (AGENTS.MD §5).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const id = String(req.query.id ?? '');
  try {
    const patient = getPatient(id, DEMO_PRACTICE.county);
    if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
    const data: PatientDetailResponse = { patient, outreach: await getPatientOutreach(patient.id) };
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(`[api/patients/${id}] failed:`, error);
    return res.status(500).json({ success: false, error: 'Could not load this patient' });
  }
}
