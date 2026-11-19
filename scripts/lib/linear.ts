/**
 * Klien Linear (linear.app) GraphQL — dipakai tooling review/audit `scripts/linear.ts`.
 *
 * Hanya jalan di mesin developer/CI: key dibaca dari environment (`LINEAR_API_KEY`),
 * tidak pernah masuk bundel browser maupun Worker. Karena itu file ini SENGAJA tidak
 * terletak di dalam `worker/`, supaya tidak ikut ter-bundle ke Cloudflare.
 *
 * GraphQL Linear: https://api.linear.app/graphql (auth: header `Authorization` = API key).
 */

import { createHash } from "node:crypto"

export const LINEAR_ENDPOINT = "https://api.linear.app/graphql"

/** Prioritas Linear: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export type LinearPriority = 0 | 1 | 2 | 3 | 4

export type LinearViewer = {
  id: string
  name: string
  email: string
}

export type LinearTeam = {
  id: string
  key: string
  name: string
}

export type LinearLabel = {
  id: string
  name: string
}

export type LinearState = {
  name: string
  type: string
}
export type LinearIssue = {
  id: string
  identifier: string
  title: string
  description: string
  url: string
  priority: number
  archivedAt: string | null
  state: LinearState | null
  labels: string[]
}

export type IssueDraft = {
  teamId: string
  title: string
  description?: string
  priority?: LinearPriority
  labelIds?: string[]
  stateId?: string
}

type RawIssue = {
  id: string
  identifier: string
  title: string
  description: string | null
  url: string
  priority: number
  archivedAt: string | null
  state: LinearState | null
  labels: {
    nodes: LinearLabel[]
  }
}

const ISSUE_FIELDS = `id identifier title description url priority archivedAt state { name type } labels { nodes { name } }`

type GraphQLError = {
  message: string
}

export class LinearApiError extends Error {
  status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = "LinearApiError"
    this.status = status
  }
}

function normaliseIssue(raw: RawIssue): LinearIssue {
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    description: raw.description ?? "",
    url: raw.url,
    priority: raw.priority ?? 0,
    archivedAt: raw.archivedAt ?? null,
    state: raw.state ?? null,
    labels: raw.labels?.nodes?.map((label) => label.name) ?? [],
  }
}

export class LinearClient {
  #apiKey: string

  constructor(apiKey: string) {
    const key = apiKey.trim()
    if (!key) {
      throw new LinearApiError(
        "LINEAR_API_KEY kosong. Isi di .env.local atau export sebagai environment variable.",
      )
    }
    this.#apiKey = key
  }

  async request<T,>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const response = await fetch(LINEAR_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.#apiKey,
      },
      body: JSON.stringify({ query, variables }),
    })
    const text = await response.text()

    let payload: {
      data?: T
      errors?: GraphQLError[]
    }
    try {
      payload = (JSON.parse(text) as typeof payload)
    } catch {
      throw new LinearApiError(
        `Respons Linear bukan JSON (HTTP ${response.status}): ${text.slice(0, 200)}`,
        response.status,
      )
    }
    if (payload.errors?.length) {
      throw new LinearApiError(
        payload.errors.map((error) => error.message).join("; "),
        response.status,
      )
    }
    if (!response.ok) {
      throw new LinearApiError(
        `Linear HTTP ${response.status}: ${text.slice(0, 200)}`,
        response.status,
      )
    }
    if (!payload.data) {
      throw new LinearApiError("Respons Linear tidak memuat field `data`.")
    }
    return payload.data
  }

  async viewer(): Promise<LinearViewer> {
    const data = await this.request<{ viewer: LinearViewer }>(
      "query { viewer { id name email } }",
    )
    return data.viewer
  }

  async teams(): Promise<LinearTeam[]> {
    const data = await this.request<{ teams: { nodes: LinearTeam[] } }>(
      "query { teams { nodes { id key name } } }",
    )
    return data.teams.nodes
  }

  /** Terima key ("SMA"), nama, atau id. Tanpa argumen: pakai team satu-satunya. */
  async resolveTeam(keyOrId?: string): Promise<LinearTeam> {
    const teams = await this.teams()
    if (teams.length === 0) {
      throw new LinearApiError("Workspace Linear ini tidak punya team.")
    }
    const keys = teams.map((team) => team.key).join(", ")
    if (!keyOrId) {
      if (teams.length === 1) return teams[0]
      throw new LinearApiError(`Team tidak ditentukan. Tersedia: ${keys}`)
    }
    const wanted = keyOrId.trim().toLowerCase()
    const team = teams.find(
      (candidate) =>
        candidate.key.toLowerCase() === wanted ||
        candidate.id === keyOrId.trim() ||
        candidate.name.toLowerCase() === wanted,
    )
    if (!team) {
      throw new LinearApiError(`Team "${keyOrId}" tidak ada. Tersedia: ${keys}`)
    }
    return team
  }

  async labels(teamId: string): Promise<LinearLabel[]> {
    const data = await this.request<{
      team: { labels: { nodes: LinearLabel[] } } | null
    }>(
      "query ($teamId: String!) { team(id: $teamId) { labels { nodes { id name } } } }",
      { teamId },
    )
    return data.team?.labels.nodes ?? []
  }

  /** Label berdasarkan nama (case-insensitive); dibuat kalau belum ada. */
  async ensureLabel(teamId: string, name: string): Promise<LinearLabel> {
    const wanted = name.trim().toLowerCase()
    const existing = (await this.labels(teamId)).find(
      (label) => label.name.toLowerCase() === wanted,
    )
    if (existing) return existing

    const data = await this.request<{
      issueLabelCreate: { issueLabel: LinearLabel }
    }>(
      `mutation ($input: IssueLabelCreateInput!) {
         issueLabelCreate(input: $input) { issueLabel { id name } }
       }`,
      { input: { teamId, name: name.trim(), color: "#6B7280" } },
    )
    return data.issueLabelCreate.issueLabel
  }

  async createIssue(draft: IssueDraft): Promise<LinearIssue> {
    const data = await this.request<{ issueCreate: { issue: RawIssue } }>(
      `mutation ($input: IssueCreateInput!) {
         issueCreate(input: $input) { issue { ${ISSUE_FIELDS} } }
       }`,
      { input: draft },
    )
    return normaliseIssue(data.issueCreate.issue)
  }

  /** Semua issue aktif satu team (issue ter-archive tidak ikut), terbaru dulu. */
  async issues(teamId: string, limit = 500): Promise<LinearIssue[]> {
    const found: LinearIssue[] = []
    let after: string | null = null

    while (found.length < limit) {
      const data: {
        issues: {
          nodes: RawIssue[]
          pageInfo: {
            hasNextPage: boolean
            endCursor: string | null
          }
        }
      } = await this.request(
        `query ($teamId: ID!, $first: Int!, $after: String) {
           issues(first: $first, after: $after, includeArchived: false, filter: { team: { id: { eq: $teamId } } }) {
             nodes { ${ISSUE_FIELDS} }
             pageInfo { hasNextPage endCursor }
           }
         }`,
        { teamId, first: 100, after },
      )

      for (const node of data.issues.nodes) found.push(normaliseIssue(node))
      const { hasNextPage, endCursor } = data.issues.pageInfo
      if (!hasNextPage || !endCursor) break
      after = endCursor
    }
    return found.slice(0, limit)
  }

  /** Terima identifier ("SMA-12") atau UUID. Null kalau tidak ada. */
  async issue(idOrIdentifier: string): Promise<LinearIssue | null> {
    try {
      const data = await this.request<{ issue: RawIssue | null }>(
        `query ($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
        { id: idOrIdentifier.trim() },
      )
      return data.issue ? normaliseIssue(data.issue) : null
    } catch (error) {
      if (
        error instanceof LinearApiError &&
        /not found|could not find|entity not found/i.test(error.message)
      ) {
        return null
      }
      throw error
    }
  }

  /** Arsipkan issue (butuh identifier atau UUID). */
  async archive(idOrIdentifier: string): Promise<LinearIssue> {
    const issue = await this.issue(idOrIdentifier)
    if (!issue) {
      throw new LinearApiError(`Issue "${idOrIdentifier}" tidak ditemukan.`)
    }
    // IssueArchivePayload memakai `entity`, bukan `issue` seperti IssuePayload.
    const data = await this.request<{
      issueArchive: {
        success: boolean
        entity: RawIssue | null
      }
    }>(
      `mutation ($id: String!) { issueArchive(id: $id) { success entity { ${ISSUE_FIELDS} } } }`,
      { id: issue.id },
    )
    if (!data.issueArchive.success || !data.issueArchive.entity) {
      throw new LinearApiError(`Gagal mengarsipkan ${issue.identifier}.`)
    }
    return normaliseIssue(data.issueArchive.entity)
  }
}

// ---------------------------------------------------------------------------
// Fingerprint: penanda tak terlihat di body issue, supaya re-run tidak bikin duplikat.
// ---------------------------------------------------------------------------

const MARKER_PATTERN = /audit-fingerprint:\s*([a-f0-9]{16})/g

/** Id stabil dari bagian-bagian pembeda temuan (judul, file, baris, ...). */
export function fingerprint(
  parts: Array<string | number | null | undefined>,
): string {
  const material = parts
    .map((part) =>
      String(part ?? "")
        .trim()
        .toLowerCase(),
    )
    .join("\u0000")
  return createHash("sha256").update(material).digest("hex").slice(0, 16)
}

/**
 * Baris penanda di body issue. Teks biasa, bukan komentar HTML: Linear membuang
 * komentar HTML dari deskripsi, dan penanda harus tetap terbaca saat dedupe.
 */
export function marker(fp: string): string {
  return `audit-fingerprint: ${fp}`
}

/** Semua fingerprint yang tertulis di satu deskripsi issue. */
export function fingerprintsIn(description: string | null): string[] {
  if (!description) return []
  MARKER_PATTERN.lastIndex = 0
  return [...description.matchAll(MARKER_PATTERN)].map((match) => match[1])
}
