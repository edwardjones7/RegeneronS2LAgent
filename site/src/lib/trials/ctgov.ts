/**
 * Minimal client for the public ClinicalTrials.gov API v2 (no key needed).
 * Rate limit is ~50 requests/minute per IP, so pages are spaced out.
 */

const BASE_URL = 'https://clinicaltrials.gov/api/v2';
const PAGE_SIZE = 1000;
const PAGE_DELAY_MS = 1300;
const MAX_ATTEMPTS = 4;

/** Only the sections we store. Skips results/document sections, which are large. */
const FIELDS = 'protocolSection,derivedSection.conditionBrowseModule';

/* ————————— Response shapes (only the fields we read) ————————— */

interface DateStruct {
  date?: string;
}

interface MeshTerm {
  id: string;
  term: string;
}

export interface CtgovContact {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
}

export interface CtgovLocation {
  facility?: string;
  status?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  geoPoint?: { lat: number; lon: number };
  contacts?: CtgovContact[];
}

export interface CtgovStudy {
  protocolSection: {
    identificationModule: { nctId: string; briefTitle?: string; officialTitle?: string };
    statusModule: {
      overallStatus: string;
      startDateStruct?: DateStruct;
      primaryCompletionDateStruct?: DateStruct;
      lastUpdatePostDateStruct?: DateStruct;
    };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string; class?: string } };
    descriptionModule?: { briefSummary?: string };
    conditionsModule?: { conditions?: string[]; keywords?: string[] };
    designModule?: { studyType?: string; phases?: string[]; enrollmentInfo?: { count?: number } };
    armsInterventionsModule?: {
      interventions?: { type?: string; name?: string; otherNames?: string[] }[];
    };
    eligibilityModule?: {
      eligibilityCriteria?: string;
      healthyVolunteers?: boolean;
      sex?: string;
      minimumAge?: string;
      maximumAge?: string;
      stdAges?: string[];
    };
    contactsLocationsModule?: { locations?: CtgovLocation[] };
  };
  derivedSection?: {
    conditionBrowseModule?: { meshes?: MeshTerm[]; ancestors?: MeshTerm[] };
  };
}

interface StudiesPage {
  studies: CtgovStudy[];
  nextPageToken?: string;
}

/* ————————— Requests ————————— */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) return (await res.json()) as T;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      const body = await res.text();
      throw new Error(`ClinicalTrials.gov ${res.status} for ${url}: ${body.slice(0, 200)}`);
    }
    await sleep(PAGE_DELAY_MS * 2 ** attempt);
  }
}

/** When ClinicalTrials.gov last refreshed its data. Unchanged timestamp = nothing new to sync. */
export async function getDataTimestamp(): Promise<string> {
  const { dataTimestamp } = await getJson<{ dataTimestamp: string }>(`${BASE_URL}/version`);
  return dataTimestamp;
}

/** Yields pages of studies matching `params`, following nextPageToken. */
export async function* fetchStudyPages(params: Record<string, string>): AsyncGenerator<CtgovStudy[]> {
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({
      ...params,
      fields: FIELDS,
      pageSize: String(PAGE_SIZE),
      ...(pageToken ? { pageToken } : {}),
    });
    const page = await getJson<StudiesPage>(`${BASE_URL}/studies?${query}`);
    yield page.studies;

    pageToken = page.nextPageToken;
    if (pageToken) await sleep(PAGE_DELAY_MS);
  } while (pageToken);
}
