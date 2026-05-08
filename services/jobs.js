'use strict';

const database = require('../database');
const { logger } = require('../lib/logger');
const places = require('./places');
const enrichment = require('./enrichment');
const webhookSvc = require('./webhooks');
const { buildKeyPool } = require('../lib/build-key-pool');

const running = new Map(); // jobId -> { abortController }

function getJobForUser(userId, id) {
  const j = database.jobs.get(id);
  if (!j || j.userId !== userId) return null;
  return j;
}

async function runBulkMaps(job) {
  const { userId } = job;
  const keyPool = buildKeyPool(userId, 'google_maps');
  if (!keyPool) {
    database.jobs.finish(job.id, {
      status: 'failed',
      error: 'Google Maps API key is not configured.',
      progress: { done: 0, total: 0 },
    });
    return;
  }

  const { queries = [], maxResultsPerQuery = 60, enrich = true, includeHistoryDedup = false } = job.params;
  const total = queries.length;

  // Resume support: pull prior progress so a restart doesn't redo finished work.
  const priorProgress = job.progress || {};
  const completedIndices = new Set(
    Array.isArray(priorProgress.completedIndices) ? priorProgress.completedIndices : [],
  );
  const allResults = Array.isArray(priorProgress.partialResultsList)
    ? priorProgress.partialResultsList.slice()
    : [];
  let textSearches = Number(priorProgress.textSearches || 0);
  let detailLookups = Number(priorProgress.detailLookups || 0);
  let geocodings = Number(priorProgress.geocodings || 0);
  let costInr = Number(priorProgress.costInr || 0);
  let done = completedIndices.size;

  const abortController = new AbortController();
  running.set(job.id, { abortController });

  const excludePlaceIds = new Set(includeHistoryDedup ? database.getUserPlaceIds(userId) : []);
  const seen = new Set(allResults.map((r) => r.placeId || r.id).filter(Boolean));
  for (const id of seen) excludePlaceIds.add(id);

  for (let qi = 0; qi < queries.length; qi += 1) {
    if (abortController.signal.aborted) break;
    if (completedIndices.has(qi)) continue;
    const query = queries[qi];
    try {
      const out = await places.runMapsSearch({
        keyPool,
        searchTerm: query.searchTerm || query.keyword || '',
        location: query.location || '',
        radiusMeters: query.radius || 5000,
        maxResults: maxResultsPerQuery,
        includedType: query.includedType || '',
        filters: query.filters || {},
        excludePlaceIds,
        signal: abortController.signal,
        onProgress: (p) => {
          database.jobs.updateProgress(job.id, 'running', {
            done,
            total,
            currentQuery: `${query.searchTerm} in ${query.location}`,
            currentBatch: p,
            partialResults: allResults.length,
            costInr,
            completedIndices: Array.from(completedIndices),
          });
        },
      });
      textSearches += out.summary.textSearches;
      detailLookups += out.summary.detailLookups;
      geocodings += out.summary.geocodings;
      costInr += out.cost.inr;
      for (const r of out.results) {
        const key = r.placeId || r.id;
        if (key && !seen.has(key)) {
          seen.add(key);
          excludePlaceIds.add(key);
          allResults.push(r);
        }
      }
      completedIndices.add(qi);
    } catch (err) {
      logger.warn({ err: err.message, query }, 'bulk job query failed');
      // Mark as done so resume doesn't retry forever.
      completedIndices.add(qi);
    }
    done = completedIndices.size;
    database.jobs.updateProgress(job.id, 'running', {
      done,
      total,
      partialResults: allResults.length,
      partialResultsList: allResults,
      costInr,
      textSearches,
      detailLookups,
      geocodings,
      completedIndices: Array.from(completedIndices),
    });
  }

  if (enrich) {
    await enrichment.enrichResults(allResults, {
      onProgress: ({ done: ed, total: et }) => {
        database.jobs.updateProgress(job.id, 'running', {
          done,
          total,
          partialResults: allResults.length,
          costInr,
          enriching: { done: ed, total: et },
        });
      },
      signal: abortController.signal,
    });
  }

  const extraction = database.createExtraction({
    userId,
    source: 'Google Maps (Bulk)',
    keyword: queries
      .map((q) => q.searchTerm)
      .filter(Boolean)
      .slice(0, 3)
      .join(' / '),
    location: queries[0]?.location || '',
    category: '',
    radius: queries[0]?.radius || null,
    maxResults: maxResultsPerQuery,
    resultCount: allResults.length,
    costInr,
    costUsd: 0,
    params: job.params,
    results: allResults,
    summary: {
      textSearches,
      detailLookups,
      geocodings,
      queryCount: total,
      resultCount: allResults.length,
    },
  });

  database.jobs.finish(job.id, {
    status: 'completed',
    progress: { done: total, total, partialResults: allResults.length, costInr },
    resultExtractionId: extraction.id,
  });
  running.delete(job.id);

  webhookSvc
    .deliver(userId, 'job.completed', {
      jobId: job.id,
      extractionId: extraction.id,
      resultCount: allResults.length,
      costInr,
    })
    .catch(() => undefined);
}

async function startJob(jobId) {
  const job = database.jobs.get(jobId);
  if (!job) return;
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return;
  database.jobs.updateProgress(job.id, 'running', job.progress || { done: 0, total: 0 });
  try {
    if (job.type === 'bulk-maps') await runBulkMaps(job);
    else
      database.jobs.finish(job.id, {
        status: 'failed',
        error: `Unknown job type: ${job.type}`,
        progress: job.progress,
      });
  } catch (err) {
    logger.error({ err: err.message, jobId }, 'job runner crashed');
    database.jobs.finish(job.id, { status: 'failed', error: err.message, progress: job.progress });
  }
}

function createJob({ userId, type, params }) {
  const id = database.jobs.create({ userId, type, params });
  // Fire and forget — caller polls /api/jobs/:id
  setImmediate(() => startJob(id));
  return id;
}

function cancelJob(userId, jobId) {
  const j = getJobForUser(userId, jobId);
  if (!j) return false;
  const r = running.get(jobId);
  if (r) r.abortController.abort();
  database.jobs.finish(jobId, { status: 'cancelled', progress: j.progress, error: 'Cancelled by user.' });
  running.delete(jobId);
  return true;
}

function resumeAll() {
  const list = database.jobs.listResumable();
  for (const j of list) {
    if (j.status === 'queued' || j.status === 'running') {
      logger.info({ jobId: j.id }, 'resuming job after restart');
      setImmediate(() => startJob(j.id));
    }
  }
}

module.exports = { createJob, cancelJob, getJobForUser, resumeAll, startJob };
