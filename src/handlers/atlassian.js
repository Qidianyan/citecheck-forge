// Thin wrappers around @forge/api requestConfluence / requestJira for CiteCheck's write-backs and reads.
// Everything runs asUser(). The api module is injectable so tests run without @forge/* installed;
// when it is not injected it is imported lazily on first use.

import { storageToText, adfToText } from './text.js';

function asJson(res) {
  return res && typeof res.json === 'function' ? res.json() : res;
}

/** Parsed JSON body when the response has one; otherwise the raw response (keeps old callers working). */
async function parsed(res) {
  if (res && typeof res.json === 'function') {
    try { return await res.json(); } catch { return res; }
  }
  return res;
}

async function assertOk(res) {
  const status = res?.status ?? res?.statusCode ?? 0;
  const ok = res?.ok !== undefined ? res.ok : status >= 200 && status < 300;
  if (ok) return res;
  let body = '';
  try {
    body = typeof res?.text === 'function' ? await res.text() : JSON.stringify(res?.body ?? '');
  } catch {
    body = '';
  }
  const short = String(body).slice(0, 200).trim();
  const err = new Error(`Atlassian API request failed: HTTP ${status}${short ? ` ${short}` : ''}`);
  err.status = status;
  throw err;
}

/**
 * @param {{ api?: object }} opts
 *   api: an @forge/api-shaped module — `asUser()` returning requestConfluence/requestJira, plus the
 *   `route` tagged template. Defaults to a lazy `await import('@forge/api')`.
 */
export function createAtlassianClient({ api } = {}) {
  let cached = api ?? null;
  const resolveApi = async () => {
    if (cached) return cached;
    const mod = await import('@forge/api');
    const base = mod.default ?? mod;
    cached = mod.route && !base.route ? { ...base, route: mod.route } : base;
    return cached;
  };

  async function route(strings, ...vals) {
    const a = await resolveApi();
    return a.route(strings, ...vals);
  }

  async function request(product, method, url, init) {
    const a = await resolveApi();
    // Forge's requestConfluence/requestJira take a fetch-style init: the body must be a JSON string.
    const opts = { method, headers: { Accept: 'application/json' } };
    if (init?.body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
    }
    const res = await (product === 'confluence' ? a.asUser().requestConfluence : a.asUser().requestJira)(await url, opts);
    return assertOk(res);
  }

  return {
    /** GET /wiki/api/v2/pages/{id}?body-format=storage → { id, title, version, text, url } */
    async getConfluencePage(contentId) {
      const res = await request('confluence', 'GET', route`/wiki/api/v2/pages/${contentId}?body-format=storage`);
      const page = await asJson(res);
      const storage = page?.body?.storage?.value ?? page?.body?.view?.value ?? '';
      const links = page?._links ?? {};
      return {
        id: String(page?.id ?? contentId),
        title: page?.title ?? '',
        status: page?.status ?? 'current',
        version: page?.version?.number ?? page?.versionNumber ?? null,
        spaceId: page?.spaceId != null ? String(page.spaceId) : null,
        text: storageToText(storage),
        url: links.webui ? `${links.base ?? ''}${links.webui}` : `/wiki/pages/${page?.id ?? contentId}`,
      };
    },

    /** GET /rest/api/3/issue/{key}?fields=summary,description,comment → { key, summary, text, url } */
    async getJiraIssue(issueKey) {
      const res = await request('jira', 'GET', route`/rest/api/3/issue/${issueKey}?fields=summary,description,comment`);
      const issue = await asJson(res);
      const fields = issue?.fields ?? {};
      const comments = fields.comment?.comments ?? [];
      const text = [fields.summary ?? '', adfToText(fields.description), ...comments.map((c) => adfToText(c?.body))]
        .filter(Boolean).join('\n');
      return {
        key: issue?.key ?? issueKey,
        summary: fields.summary ?? '',
        text,
        url: `/browse/${issue?.key ?? issueKey}`,
      };
    },

    /** GET /rest/api/3/issue/{key}?fields=labels → string[] of label names. */
    async getJiraLabels(issueKey) {
      const res = await request('jira', 'GET', route`/rest/api/3/issue/${issueKey}?fields=labels`);
      const issue = await asJson(res);
      return issue?.fields?.labels ?? [];
    },

    /** POST /wiki/api/v2/footer-comments */
    async postConfluenceFooterComment(contentId, storageHtml) {
      const res = await request('confluence', 'POST', route`/wiki/api/v2/footer-comments`, {
        body: { pageId: String(contentId), body: { representation: 'storage', value: storageHtml } },
      });
      return parsed(res);
    },

    /** POST /wiki/api/v2/pages → { id, url } (child page in the same space, storage body). */
    async createConfluencePage({ spaceId, parentId, title, storage }) {
      const res = await request('confluence', 'POST', route`/wiki/api/v2/pages`, {
        body: { spaceId: String(spaceId), status: 'current', title, parentId: String(parentId), body: { representation: 'storage', value: storage } },
      });
      const page = (await parsed(res)) ?? {};
      const links = page._links ?? {};
      return { id: String(page.id ?? ''), url: links.webui ? `${links.base ?? ''}${links.webui}` : `/wiki/pages/${page.id ?? ''}` };
    },

    /** GET /wiki/api/v2/pages/{id}/labels → string[] of label names (e.g. ['legal-review']). */
    async getConfluenceLabels(contentId) {
      const res = await request('confluence', 'GET', route`/wiki/api/v2/pages/${contentId}/labels`);
      const body = await asJson(res);
      return (body?.results ?? []).map((l) => l?.name).filter(Boolean);
    },

    /** POST /wiki/rest/api/content/{id}/label */
    async addConfluenceLabels(contentId, labels) {
      return request('confluence', 'POST', route`/wiki/rest/api/content/${contentId}/label`, {
        body: labels.map((name) => ({ prefix: 'global', name })),
      });
    },

    /** POST /rest/api/3/issue/{key}/comment */
    async postJiraComment(issueKey, adfDoc) {
      const res = await request('jira', 'POST', route`/rest/api/3/issue/${issueKey}/comment`, {
        body: { body: adfDoc },
      });
      return parsed(res);
    },

    /** PUT /rest/api/3/issue/{key}/assignee */
    async assignJiraIssue(issueKey, accountId) {
      return request('jira', 'PUT', route`/rest/api/3/issue/${issueKey}/assignee`, { body: { accountId } });
    },

    /** PUT /rest/api/3/issue/{key} */
    async addJiraLabels(issueKey, labels) {
      return request('jira', 'PUT', route`/rest/api/3/issue/${issueKey}`, {
        body: { update: { labels: labels.map((l) => ({ add: l })) } },
      });
    },
  };
}
