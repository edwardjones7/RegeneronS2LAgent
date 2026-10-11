/** Reads a required env var. Throws if it is unset so misconfiguration fails loudly. */
export function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable not set: ${key}`);
  }
  return value;
}

export function getEnvOptional(key: string): string | undefined {
  return process.env[key];
}
