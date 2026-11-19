#!/usr/bin/env node
/**
 * Tooling review/audit inapmu.com → Linear (linear.app).
 *
 * Tujuan: setiap temuan review/audit kode dan setiap bug report jadi issue Linear,
 * lengkap dengan lokasi `file:line`, severity, dan penanda anti-duplikat. Re-run
 * dari file findings yang sama tidak membuat issue baru.
 *
 * Pemakaian:
 *   node scripts/linear.ts whoami
 *   node scripts/linear.ts teams
 *   node scripts/linear.ts list [--limit 20] [--team SMA]
 *   node scripts/linear.ts bug --title "..." [--body "..."] [--body-file FILE]
 *        [--severity high] [--priority 2] [--label Bug] [--file worker/index.ts] [--line 120]
 *        [--team SMA] [--dry-run] [--force]
 *   node scripts/linear.ts review findings.json [--team SMA] [--label Audit] [--dry-run] [--force]
 *        ("-" membaca JSON dari stdin)
 *   node scripts/linear.ts archive SMA-12
 *
 * Key dibaca dari `LINEAR_API_KEY` (environment menang atas .env.local).
 */

import { readFileSync } from "node:fs"

import {
  LinearApiError,
  LinearClient,
  fingerprint,
  fingerprintsIn,
  marker,
  type LinearIssue,
  type LinearPriority,
  type LinearTeam,
} from "./lib/linear.ts"

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Isi process.env dari .env.local lalu .env — environment asli tidak ditimpa. */
function loadEnvFiles(files: string[]): void {
  for (const file of files) {
    let text: string
    try {
      text = readFileSync(file, "utf8")
    } catch {
      continue
    }
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const separator = line.indexOf("=")
      if (separator < 1) continue
      const key = line.slice(0, separator).trim()
      if (process.env[key] !== undefined) continue
      let value = line.slice(separator + 1).trim()
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      if (quoted && value.length >= 2) value = value.slice(1, -1)
      process.env[key] = value
    }
  }
}

// ---------------------------------------------------------------------------
// Argumen
// ---------------------------------------------------------------------------

type Flags = Map<string, string | true>

type ParsedArgs = {
  command: string
  positional: string[]
  flags: Flags
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Flags = new Map()

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith("--")) {
      positional.push(arg)
      continue
    }
    const separator = arg.indexOf("=", 2)
    if (separator !== -1) {
      flags.set(arg.slice(2, separator), arg.slice(separator + 1))
      continue
    }
    const name = arg.slice(2)
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(name, next)
      index += 1
    } else {
      flags.set(name, true)
    }
  }
  return { command: positional.shift() ?? "", positional, flags }
}

function checkFlags(command: string, flags: Flags, allowed: string[]): void {
  for (const name of flags.keys()) {
    if (!allowed.includes(name)) {
      fail(
        `Opsi --${name} tidak dikenal untuk "${command}". Opsi: ${allowed.join(", ")}`,
      )
    }
  }
}

function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags.get(name)
  return typeof value === "string" ? value : undefined
}

function numberFlag(flags: Flags, name: string): number | undefined {
  const value = stringFlag(flags, name)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed))
    fail(`Opsi --${name} harus bilangan bulat (dapat "${value}").`)
  return parsed
}

/** Prioritas Linear: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
function priorityFlag(flags: Flags, name: string): LinearPriority | undefined {
  const value = numberFlag(flags, name)
  if (value === undefined) return undefined
  if (value < 0 || value > 4)
    fail(
      `Opsi --${name} harus 0-4 (0 none, 1 urgent, 2 high, 3 medium, 4 low).`,
    )
  return value as LinearPriority
}

function fail(message: string): never {
  process.stderr.write(`error: ${message}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Findings (output review/audit)
// ---------------------------------------------------------------------------

/** Satu temuan audit. `severity` dipetakan ke priority Linear. */
type Finding = {
  title: string
  description?: string
  severity?: string
  file?: string
  line?: number | string
  labels?: string[]
  fingerprint?: string
}

const SEVERITY_PRIORITY: Record<string, LinearPriority> = {
  critical: 1, // urgent
  urgent: 1,
  high: 2,
  medium: 3,
  moderate: 3,
  low: 4,
}

const PRIORITY_LABEL: Record<number, string> = {
  0: "none",
  1: "urgent",
  2: "high",
  3: "medium",
  4: "low",
}

/** Baca file teks dengan pesan kesalahan yang menyebut path-nya. */
function readTextFile(path: string): string {
  try {
    return readFileSync(path, "utf8")
  } catch (error) {
    return fail(
      `Tidak bisa membaca ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function asFindings(value: unknown): Finding[] {
  const container = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.findings)
      ? value.findings
      : isRecord(value) && Array.isArray(value.issues)
        ? value.issues
        : null
  if (!container) {
    fail(
      "Findings harus array, atau objek dengan properti `findings` / `issues`.",
    )
  }

  return container.map((entry, index) => {
    if (!isRecord(entry)) fail(`Findings[${index}] bukan objek.`)
    const title = entry.title
    if (typeof title !== "string" || !title.trim()) {
      fail(`Findings[${index}] tidak punya \`title\`.`)
    }
    const labels = Array.isArray(entry.labels)
      ? entry.labels.filter(
          (label): label is string => typeof label === "string",
        )
      : undefined
    return {
      title: title.trim(),
      description:
        typeof entry.description === "string" ? entry.description : undefined,
      severity: typeof entry.severity === "string" ? entry.severity : undefined,
      file: typeof entry.file === "string" ? entry.file : undefined,
      line:
        typeof entry.line === "number" || typeof entry.line === "string"
          ? entry.line
          : undefined,
      labels,
      fingerprint:
        typeof entry.fingerprint === "string" ? entry.fingerprint : undefined,
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8")
  } catch {
    return fail("Tidak bisa membaca stdin.")
  }
}

// ---------------------------------------------------------------------------
// Bangun body issue
// ---------------------------------------------------------------------------

type BodyInput = {
  text?: string
  severity?: string
  file?: string
  line?: number | string
  labels: string[]
}

function composeBody(input: BodyInput, fp: string): string {
  const sections: string[] = []
  if (input.text?.trim()) sections.push(input.text.trim())

  const meta = [`- Sumber: review/audit inapmu.com (scripts/linear.ts)`]
  if (input.severity) meta.unshift(`- Severity: ${input.severity}`)
  if (input.file)
    meta.push(
      `- Lokasi: \`${input.file}${
        input.line === undefined ? "" : `:${input.line}`
      }\``,
    )
  if (input.labels.length) meta.push(`- Label: ${input.labels.join(", ")}`)
  sections.push(`---\n${meta.join("\n")}`)

  // Baris terakhir wajib: dipakai dedupe saat tool dijalankan ulang.
  sections.push(marker(fp))
  return sections.join("\n\n")
}

// ---------------------------------------------------------------------------
// Konteks: team, dedupe, label cache
// ---------------------------------------------------------------------------

type Context = {
  client: LinearClient
  team: LinearTeam
  /** fingerprint → issue yang sudah ada, diisi sekali per run. */
  existing: Map<string, LinearIssue>
  labelIds: Map<string, string>
  force: boolean
  dryRun: boolean
  labelId: (name: string) => Promise<string>
}

async function createContext(flags: Flags): Promise<Context> {
  const client = new LinearClient(process.env.LINEAR_API_KEY ?? "")
  const team = await client.resolveTeam(
    stringFlag(flags, "team") ?? process.env.LINEAR_TEAM_KEY,
  )

  const existing = new Map<string, LinearIssue>()
  for (const issue of await client.issues(team.id)) {
    for (const fp of fingerprintsIn(issue.description)) existing.set(fp, issue)
  }

  const labelIds = new Map<string, string>()
  return {
    client,
    team,
    existing,
    labelIds,
    force: flags.has("force"),
    dryRun: flags.has("dry-run"),
    labelId: async (name: string) => {
      const cached = labelIds.get(name.toLowerCase())
      if (cached) return cached
      const id = (await client.ensureLabel(team.id, name)).id
      labelIds.set(name.toLowerCase(), id)
      return id
    },
  }
}

type PushInput = {
  title: string
  description: string
  priority: LinearPriority
  labels: string[]
  fp: string
}
type PushResult = {
  status: "created" | "skipped"
  issue: LinearIssue
} | {
  status: "planned"
}

function report(result: PushResult, title: string): void {
  if (result.status === "planned") {
    process.stdout.write(`  dry-run  ${title}\n`)
    return
  }
  if (result.status === "skipped") {
    process.stdout.write(
      `  skip     ${result.issue.identifier}  ${title}  (fingerprint sudah ada)\n`,
    )
    return
  }
  process.stdout.write(
    `  buat     ${result.issue.identifier}  ${title}\n            ${result.issue.url}\n`,
  )
}

async function pushIssue(
  context: Context,
  input: PushInput,
): Promise<PushResult> {
  const duplicate = context.existing.get(input.fp)
  if (duplicate && !context.force)
    return { status: "skipped", issue: duplicate }

  const labelIds = await Promise.all(
    input.labels.map((name) => context.labelId(name)),
  )
  if (context.dryRun) return { status: "planned" }

  const issue = await context.client.createIssue({
    teamId: context.team.id,
    title: input.title,
    description: input.description,
    priority: input.priority,
    labelIds,
  })
  context.existing.set(input.fp, issue)
  return { status: "created", issue }
}

/** Gabung nama label, buang duplikat tanpa peduli huruf besar/kecil. */
function mergeLabels(...groups: Array<string[] | undefined>): string[] {
  const merged: string[] = []
  for (const name of groups.flatMap((group) => group ?? [])) {
    const clean = name.trim()
    if (
      clean &&
      !merged.some((existing) => existing.toLowerCase() === clean.toLowerCase())
    )
      merged.push(clean)
  }
  return merged
}

// ---------------------------------------------------------------------------
// Perintah
// ---------------------------------------------------------------------------

async function commandWhoami(client: LinearClient): Promise<void> {
  const viewer = await client.viewer()
  process.stdout.write(`${viewer.name} <${viewer.email}>  (${viewer.id})\n`)
}

async function commandTeams(client: LinearClient): Promise<void> {
  for (const team of await client.teams()) {
    const labels = (await client.labels(team.id))
      .map((label) => label.name)
      .join(", ")
    process.stdout.write(
      `${team.key}  ${team.name}  ${team.id}\n  label: ${labels || "-"}\n`,
    )
  }
}

async function commandList(client: LinearClient, flags: Flags): Promise<void> {
  const team = await client.resolveTeam(
    stringFlag(flags, "team") ?? process.env.LINEAR_TEAM_KEY,
  )
  const limit = numberFlag(flags, "limit") ?? 20
  const issues = (await client.issues(team.id, Math.max(limit, 1))).slice(
    0,
    limit,
  )

  process.stdout.write(`${team.key} — ${issues.length} issue aktif terbaru:\n`)
  for (const issue of issues) {
    const priority = PRIORITY_LABEL[issue.priority] ?? "none"
    process.stdout.write(
      `  ${issue.identifier}  [${priority}]  ${issue.state?.name ?? "-"}  ${issue.title}\n`,
    )
  }
}

async function commandBug(context: Context, flags: Flags): Promise<void> {
  const title = stringFlag(flags, "title") ?? fail("Opsi --title wajib diisi.")
  const bodyFile = stringFlag(flags, "body-file")
  const description =
    stringFlag(flags, "body") ?? (bodyFile ? readTextFile(bodyFile) : undefined)

  const severity = stringFlag(flags, "severity")
  const priority =
    priorityFlag(flags, "priority") ??
    SEVERITY_PRIORITY[severity?.toLowerCase() ?? ""] ??
    0
  const labels = mergeLabels(stringFlag(flags, "label")?.split(",") ?? ["Bug"])

  const fp = fingerprint(["bug", title])
  const result = await pushIssue(context, {
    title,
    description: composeBody(
      {
        text: description,
        severity,
        file: stringFlag(flags, "file"),
        line: numberFlag(flags, "line"),
        labels,
      },
      fp,
    ),
    priority,
    labels,
    fp,
  })
  report(result, title)
}

async function commandReview(
  context: Context,
  positional: string[],
  flags: Flags,
): Promise<void> {
  const source =
    positional[0] ?? fail('Sebutkan file findings (JSON) atau "-" untuk stdin.')
  const raw = source === "-" ? readStdin() : readFileSync(source, "utf8")

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return fail(
      `Findings bukan JSON valid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  const findings = asFindings(parsed)
  const defaultLabels = mergeLabels(
    stringFlag(flags, "label")?.split(",") ?? ["Audit"],
  )

  process.stdout.write(
    `${findings.length} temuan → ${context.team.key}${
      context.dryRun ? " (dry-run)" : ""
    }\n`,
  )

  let created = 0
  let skipped = 0
  for (const finding of findings) {
    const fp =
      finding.fingerprint?.trim() ||
      fingerprint(["audit", finding.title, finding.file, finding.line])
    const labels = mergeLabels(defaultLabels, finding.labels)
    const result = await pushIssue(context, {
      title: finding.title,
      description: composeBody(
        {
          text: finding.description,
          severity: finding.severity,
          file: finding.file,
          line: finding.line,
          labels,
        },
        fp,
      ),
      priority: SEVERITY_PRIORITY[finding.severity?.toLowerCase() ?? ""] ?? 0,
      labels,
      fp,
    })
    report(result, finding.title)
    if (result.status === "created") created += 1
    if (result.status === "skipped") skipped += 1
  }

  process.stdout.write(
    `\nRingkasan: ${created} dibuat, ${skipped} dilewati, ${findings.length} total.\n`,
  )
  if (skipped > 0 && !context.force) {
    process.stdout.write(
      "Pakai --force kalau issue duplikat itu memang harus dibuat ulang.\n",
    )
  }
}

async function commandArchive(
  client: LinearClient,
  positional: string[],
): Promise<void> {
  const identifier =
    positional[0] ?? fail("Sebutkan identifier issue, mis. SMA-12.")
  const issue = await client.archive(identifier)
  process.stdout.write(`diarsipkan: ${issue.identifier}  ${issue.title}\n`)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const USAGE = `Tooling review/audit → Linear (docs: worker/README.md)

  node scripts/linear.ts whoami
  node scripts/linear.ts teams
  node scripts/linear.ts list [--limit 20] [--team SMA]
  node scripts/linear.ts bug --title "..." [--body "..."] [--body-file FILE]
      [--severity critical|high|medium|low] [--priority 1..4] [--label Bug]
      [--file worker/index.ts] [--line 120] [--team SMA] [--dry-run] [--force]
  node scripts/linear.ts review findings.json [--team SMA] [--label Audit] [--dry-run] [--force]
  node scripts/linear.ts archive SMA-12
`

async function main(): Promise<void> {
  loadEnvFiles([".env.local", ".env"])
  const { command, positional, flags } = parseArgs(process.argv.slice(2))
  const teamFlags = ["team"]

  switch (command) {
    case "whoami":
      checkFlags(command, flags, [])
      return commandWhoami(new LinearClient(process.env.LINEAR_API_KEY ?? ""))
    case "teams":
      checkFlags(command, flags, [])
      return commandTeams(new LinearClient(process.env.LINEAR_API_KEY ?? ""))
    case "list": {
      checkFlags(command, flags, [...teamFlags, "limit"])
      const client = new LinearClient(process.env.LINEAR_API_KEY ?? "")
      return commandList(client, flags)
    }
    case "bug":
      checkFlags(command, flags, [
        ...teamFlags,
        "title",
        "body",
        "body-file",
        "severity",
        "priority",
        "label",
        "file",
        "line",
        "dry-run",
        "force",
      ])
      return commandBug(await createContext(flags), flags)
    case "review":
      checkFlags(command, flags, [...teamFlags, "label", "dry-run", "force"])
      return commandReview(await createContext(flags), positional, flags)
    case "archive":
      checkFlags(command, flags, [])
      return commandArchive(
        new LinearClient(process.env.LINEAR_API_KEY ?? ""),
        positional,
      )
    default:
      process.stdout.write(USAGE)
      if (command) fail(`Perintah "${command}" tidak dikenal.`)
  }
}

try {
  await main()
} catch (error) {
  if (error instanceof LinearApiError) fail(error.message)
  throw error
}
