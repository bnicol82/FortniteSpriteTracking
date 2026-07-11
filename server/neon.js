const NEON_API_BASE = 'https://console.neon.tech/api/v2';

export async function resolveNeonDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) return null;

  const params = new URLSearchParams({
    database_name: process.env.NEON_DATABASE_NAME || 'neondb',
    role_name: process.env.NEON_ROLE_NAME || 'neondb_owner',
    pooled: process.env.NEON_POOLED === 'false' ? 'false' : 'true'
  });

  const response = await fetch(
    `${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/connection_uri?${params}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      }
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Neon API ${response.status}: ${detail}`);
  }

  const data = await response.json();
  if (!data?.uri) throw new Error('Neon API did not return a connection URI.');
  return data.uri;
}
