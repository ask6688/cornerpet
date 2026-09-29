import { generationCapability } from '../../server/generate-pet.mjs';

export default async function generationCapability() {
  return new Response(JSON.stringify(generationCapability()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const config = { path: '/api/generation-capability', method: 'GET' };
