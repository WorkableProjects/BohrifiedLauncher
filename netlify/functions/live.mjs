/**
 * Netlify Function: live sessions over HTTP (see netlify/lib/live-core.mjs).
 * Netlify cannot host a WebSocket server, so tutors and students poll this
 * endpoint instead. State lives in Netlify Blobs; no setup beyond deploying.
 *
 * CORS is open on purpose: a copy of Flow running on someone's own computer
 * (e.g. on a hotspot) uses this endpoint so people on other networks can join
 * at the hosted /join page. No cookies are involved; the session code is the
 * only thing a joiner needs, and the tutor key travels in the request body.
 */
import { getStore } from '@netlify/blobs';
import { blobsStore, handleLive } from '../lib/live-core.mjs';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const res = await handleLive(req, blobsStore(getStore({ name: 'live-sessions', consistency: 'strong' })));
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
};

export const config = { path: '/api/live/*' };
