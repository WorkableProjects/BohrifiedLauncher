/**
 * Netlify Function: live sessions over HTTP (see netlify/lib/live-core.mjs).
 * Netlify cannot host a WebSocket server, so tutors and students poll this
 * endpoint instead. State lives in Netlify Blobs; no setup beyond deploying.
 */
import { getStore } from '@netlify/blobs';
import { blobsStore, handleLive } from '../lib/live-core.mjs';

export default async (req) => handleLive(req, blobsStore(getStore({ name: 'live-sessions', consistency: 'strong' })));

export const config = { path: '/api/live/*' };
