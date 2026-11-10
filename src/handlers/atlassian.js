// Thin wrappers around @forge/api requestConfluence / requestJira for CiteCheck's write-backs and reads.
// Everything runs asUser(). The api module is injectable so tests run without @forge/* installed;
// when it is not injected it is imported lazily on first use.

import { storageToText, adfToText } from './text.js';

function asJson(res) {
  return res && typeof res.json === 'function' ? res.json() : res;
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
  throw new Error(`Atlassian API request failed: HTTP ${status}${short ? ` ${short}` : ''}`);
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
    const res = await (product === 'confluence' ? a.asUser().requestConfluence : a.asUser().requestJira)(url, { method, ...init });
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
        version: page?.version?.number ?? page?.versionNumber ?? null,
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

    /** POST /wiki/api/v2/footer-comments */
    async postConfluenceFooterComment(contentId, storageHtml) {
      return request('confluence', 'POST', route`/wiki/api/v2/footer-comments`, {
        body: { pageId: String(contentId), body: { representation: 'storage', value: storageHtml } },
      });
    },

    /** POST /wiki/rest/api/content/{id}/label */
    async addConfluenceLabels(contentId, labels) {
      return request('confluence', 'POST', route`/wiki/rest/api/content/${contentId}/label`, {
        body: labels.map((name) => ({ prefix: 'global', name })),
      });
    },

    /** POST /rest/api/3/issue/{key}/comment */
    async postJiraComment(issueKey, adfDoc) {
      return request('jira', 'POST', route`/rest/api/3/issue/${issueKey}/comment`, {
        body: { body: adfDoc },
      });
    },

    /** PUT /rest/api/3/issue/{key} */
    async addJiraLabels(issueKey, labels) {
      return request('jira', 'PUT', route`/rest/api/3/issue/${issueKey}`, {
        body: { update: { labels: labels.map((l) => ({ add: l })) } },
      });
    },
  };
}
