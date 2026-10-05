#!/usr/bin/env node
// S16b/S25d — the code-review plugin's target-resolution + comment-body + budget helper.
//
// Three subcommands. resolve and comment-body are PURE READS; max-findings is the
// ONE writer (it persists a per-repo findings budget under the plugin data dir).
// The helper itself never posts — that stays the main agent's job (see the command).
//
//   target.mjs resolve [<target>]
//     Works out what to review and prints ONE JSON object:
//       { schemaVersion, kind, host, number, title, state, base, head, ref, path,
//         diffCommand, files, untracked, notes }
//     kind is one of: working | ref | pr | mr | path.
//     `diffCommand` is what the REVIEWER must run itself (fresh context);
//     `files` is for chunking; `untracked` lists files no diff contains.
//
//   target.mjs comment-body <report.json|->
//     Turns a findings report (the /code-review --json shape) into the exact
//     body of ONE plain PR/MR comment, printed to stdout. Shape mistakes are
//     refused (exit 2) instead of posting a malformed comment.
//
//   target.mjs max-findings set <n|all|default> | get
//     The STANDING findings budget for this repo — Claude Code's rule: the
//     choice is reused until `--max-findings default`. Stored in
//     $NEXRALL_PLUGIN_DATA (or ~/.nexrall/plugin-data/code-review), keyed by
//     the git toplevel so each project keeps its own.
//
// Exit codes (stable, documented — this is the CI-facing surface):
//   0 ok · 1 usage · 2 not a git repository · 3 gh/glab missing · 4 target did
//   not resolve (unknown ref/number/host) · 5 host tool failed
//
// Target precedence: a plain number is a PR/MR; otherwise a resolvable git ref;
// otherwise an existing path (prefix `./` when a file shares a branch's name).

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

export const EXIT = { ok: 0, usage: 1, notRepo: 2, toolMissing: 3, unresolved: 4, toolFailed: 5 };
export const REPORT_SCHEMA_VERSION = 1;
/** Files listed for chunking — past this the list stops and says so. */
export const MAX_FILES = 500;
/** A diff fetched for its file headers stops at this many bytes. */
const DIFF_HEADER_CAP = 20 * 1024 * 1024;

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: opts.maxBuffer ?? 4 * 1024 * 1024,
    timeout: 60_000,
    ...opts,
  });
}

function tryRun(cmd, args, opts = {}) {
  try {
    return { ok: true, out: run(cmd, args, opts) };
  } catch (e) {
    return { ok: false, out: '', err: String(e.stderr ?? e.message ?? e), status: e.status ?? null };
  }
}

export function commandExists(cmd) {
  const r = tryRun('sh', ['-c', `command -v -- ${cmd} >/dev/null 2>&1`]);
  return r.ok;
}

export function isGitRepo(cwd) {
  const r = tryRun('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
  return r.ok && r.out.trim() === 'true';
}

/** github.com / any gitlab host (incl. self-hosted) → 'github' | 'gitlab' | null. */
export function hostOf(remoteUrl) {
  if (!remoteUrl) return null;
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)[/:]?/i.exec(remoteUrl.trim());
  const host = (m?.[1] ?? '').toLowerCase();
  if (host.includes('github')) return 'github';
  if (host.includes('gitlab')) return 'gitlab';
  return null;
}

function originUrl(cwd) {
  const r = tryRun('git', ['remote', 'get-url', 'origin'], { cwd });
  return r.ok ? r.out.trim() : '';
}

/** File paths from raw diff headers (`diff --git a/x b/x`; deletions keep the a side). */
export function filesFromDiff(diffText) {
  const files = [];
  for (const line of diffText.split('\n')) {
    if (!line.startsWith('diff --git ')) continue;
    const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (!m) continue;
    const p = m[2] === '/dev/null' ? m[1] : m[2];
    if (p && !files.includes(p)) files.push(p);
  }
  return files;
}

function capFiles(files, notes) {
  if (files.length <= MAX_FILES) return files;
  notes.push(`file list truncated to ${MAX_FILES} (${files.length} in total)`);
  return files.slice(0, MAX_FILES);
}

function nameOnly(cwd, args) {
  // Callers pass the FULL git-diff args with --name-only already placed before any
  // `--` path separator (git treats everything after `--` as a path — appending the
  // flag here turned it into a pathspec once, which is exactly the bug this notes).
  const r = tryRun('git', args, { cwd });
  if (!r.ok) return null;
  return r.out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function untrackedUnder(cwd, pathArg) {
  const r = tryRun('git', ['ls-files', '--others', '--exclude-standard', ...(pathArg ? ['--', pathArg] : [])], { cwd });
  if (!r.ok) return [];
  return r.out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

const dedupe = (xs) => [...new Set(xs)];

/**
 * Resolve one optional target into the review plan. Returns { json, code }.
 * `code` is the process exit code; `json` is always an object (error included).
 */
export function resolveTarget(cwd, targets) {
  const notes = [];
  if (!isGitRepo(cwd)) {
    return { code: EXIT.notRepo, json: { error: 'not a git repository', cwd } };
  }
  if (targets.length > 1) {
    return {
      code: EXIT.usage,
      json: { error: 'one target at a time (quote paths containing spaces)', got: targets },
    };
  }
  const target = targets[0];

  // ── no target: the uncommitted working tree ────────────────────────────────
  if (target === undefined) {
    const files = capFiles(
      dedupe((nameOnly(cwd, ['diff', '--name-only', 'HEAD']) ?? []).concat(untrackedUnder(cwd, null))),
      notes,
    );
    const tracked = nameOnly(cwd, ['diff', '--name-only', 'HEAD']) ?? [];
    if (!files.length) notes.push('clean tree — no working-tree changes to review');
    else if (!tracked.length) notes.push('all changes are untracked files (no diff lines — read them in full)');
    return {
      code: EXIT.ok,
      json: {
        schemaVersion: 1,
        kind: 'working',
        host: hostOf(originUrl(cwd)),
        number: null,
        diffCommand: 'git diff HEAD',
        files,
        untracked: untrackedUnder(cwd, null),
        notes,
      },
    };
  }

  // ── a number: a PR/MR on the origin host ───────────────────────────────────
  if (/^\d+$/.test(target) && Number(target) > 0) {
    const host = hostOf(originUrl(cwd));
    if (!host) {
      return {
        code: EXIT.unresolved,
        json: {
          error: `"${target}" looks like a PR/MR number, but the origin remote is not a GitHub/GitLab repository`,
          origin: originUrl(cwd) || '(no origin remote)',
        },
      };
    }
    const tool = host === 'github' ? 'gh' : 'glab';
    if (!commandExists(tool)) {
      return {
        code: EXIT.toolMissing,
        json: { error: `"${tool}" is not installed — needed to review ${host} ${target}` },
      };
    }
    const number = Number(target);
    return host === 'github' ? resolveGithubPr(cwd, number, notes) : resolveGitlabMr(cwd, number, notes);
  }

  // ── a resolvable ref ───────────────────────────────────────────────────────
  const refOk = tryRun('git', ['rev-parse', '--verify', '--quiet', `${target}^{commit}`], { cwd });
  if (refOk.ok) {
    const files = capFiles(nameOnly(cwd, ['diff', '--name-only', `${target}...HEAD`]) ?? [], notes);
    if (!files.length)
      notes.push(`no changes between ${target} and HEAD (three-dot: what HEAD adds since the merge base)`);
    return {
      code: EXIT.ok,
      json: {
        schemaVersion: 1,
        kind: 'ref',
        host: hostOf(originUrl(cwd)),
        number: null,
        ref: target,
        diffCommand: `git diff ${target}...HEAD`,
        files,
        untracked: [],
        notes,
      },
    };
  }

  // ── an existing path ───────────────────────────────────────────────────────
  const abs = path.resolve(cwd, target);
  if (fs.existsSync(abs)) {
    const rel = path.relative(cwd, abs) || '.';
    const files = capFiles(
      dedupe((nameOnly(cwd, ['diff', '--name-only', 'HEAD', '--', rel]) ?? []).concat(untrackedUnder(cwd, rel))),
      notes,
    );
    const untracked = untrackedUnder(cwd, rel);
    if (!files.length) notes.push(`no changes under ${rel}`);
    return {
      code: EXIT.ok,
      json: {
        schemaVersion: 1,
        kind: 'path',
        host: hostOf(originUrl(cwd)),
        number: null,
        path: rel,
        diffCommand: `git diff HEAD -- ${rel}`,
        files,
        untracked,
        notes,
      },
    };
  }

  return {
    code: EXIT.unresolved,
    json: { error: `"${target}" is not a number, a known git ref, or an existing path` },
  };
}

function resolveGithubPr(cwd, number, notes) {
  const info = tryRun('gh', ['pr', 'view', number, '--json', 'number,title,headRefName,baseRefName,state']);
  if (!info.ok) {
    return { code: EXIT.unresolved, json: { error: `gh could not resolve PR ${number}`, detail: info.err.trim() } };
  }
  let meta = {};
  try {
    meta = JSON.parse(info.out);
  } catch {
    notes.push('gh pr view returned unparsable JSON — metadata omitted');
  }
  let files = nameOnlyGh(cwd, number);
  if (files === null) {
    notes.push('gh pr diff --name-only failed — deriving files from the diff headers instead');
    files = githubFilesFromDiff(cwd, number, notes);
  }
  const untracked = [];
  return {
    code: EXIT.ok,
    json: {
      schemaVersion: 1,
      kind: 'pr',
      host: 'github',
      number,
      title: typeof meta.title === 'string' ? meta.title : undefined,
      state: typeof meta.state === 'string' ? meta.state : undefined,
      base: typeof meta.baseRefName === 'string' ? meta.baseRefName : undefined,
      head: typeof meta.headRefName === 'string' ? meta.headRefName : undefined,
      diffCommand: `gh pr diff ${number}`,
      files: capFiles(files, notes),
      untracked,
      notes,
    },
  };
}

function nameOnlyGh(cwd, number) {
  const r = tryRun('gh', ['pr', 'diff', number, '--name-only'], { cwd });
  if (!r.ok) return null;
  return r.out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function githubFilesFromDiff(cwd, number, notes) {
  const r = tryRun('gh', ['pr', 'diff', number], { cwd, maxBuffer: DIFF_HEADER_CAP });
  if (!r.ok) {
    notes.push('could not fetch the PR diff either — chunking falls back to the reviewer reading the diff itself');
    return [];
  }
  return filesFromDiff(r.out);
}

function resolveGitlabMr(cwd, number, notes) {
  // glab's JSON flag is not available on every version — the plain view is the fallback,
  // and metadata is simply omitted then (the diff is what matters).
  const info = tryRun('glab', ['mr', 'view', number, '-F', 'json']);
  let meta = {};
  if (!info.ok) {
    const plain = tryRun('glab', ['mr', 'view', number]);
    if (!plain.ok) {
      return {
        code: EXIT.unresolved,
        json: { error: `glab could not resolve MR ${number}`, detail: plain.err.trim() },
      };
    }
    // Extract "title:" from glab's plain output when present.
    const t = /^title:\s*(.+)$/m.exec(plain.out);
    if (t) meta = { title: t[1].trim() };
    notes.push('glab mr view has no JSON output on this version — metadata is best-effort');
  } else {
    try {
      meta = JSON.parse(info.out);
    } catch {
      notes.push('glab mr view -F json returned unparsable JSON — metadata omitted');
    }
  }
  // File list: parse the diff headers (glab has no --name-only).
  const diff = tryRun('glab', ['mr', 'diff', number], { cwd, maxBuffer: DIFF_HEADER_CAP });
  let files = [];
  if (diff.ok) files = filesFromDiff(diff.out);
  else notes.push('glab mr diff failed — the reviewer will fetch the diff itself');
  const title = typeof meta.title === 'string' ? meta.title : undefined;
  return {
    code: EXIT.ok,
    json: {
      schemaVersion: 1,
      kind: 'mr',
      host: 'gitlab',
      number,
      title,
      state: typeof meta.state === 'string' ? meta.state : undefined,
      base: typeof meta.target_branch === 'string' ? meta.target_branch : undefined,
      head: typeof meta.source_branch === 'string' ? meta.source_branch : undefined,
      diffCommand: `glab mr diff ${number}`,
      files: capFiles(files, notes),
      untracked: [],
      notes,
    },
  };
}

// ─── comment-body ───────────────────────────────────────────────────────────────

const SEVERITY_EMOJI = { critical: '🔴', warning: '🟡', suggestion: '🟢' };

/** Validate the report shape; returns { ok: true, report } or { ok: false, error }. */
export function validateReport(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return { ok: false, error: 'report must be a JSON object' };
  const r = raw;
  if (r.schemaVersion !== undefined && r.schemaVersion !== REPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `unsupported schemaVersion ${JSON.stringify(r.schemaVersion)} (want ${REPORT_SCHEMA_VERSION})`,
    };
  }
  if (r.verdict !== 'approve' && r.verdict !== 'request_changes') {
    return { ok: false, error: `verdict must be "approve" or "request_changes" (got ${JSON.stringify(r.verdict)})` };
  }
  if (typeof r.summary !== 'string' || !r.summary.trim())
    return { ok: false, error: 'summary must be a non-empty string' };
  if (!Array.isArray(r.findings)) return { ok: false, error: 'findings must be an array (empty is fine)' };
  for (const [i, f] of r.findings.entries()) {
    if (typeof f !== 'object' || f === null) return { ok: false, error: `findings[${i}] must be an object` };
    if (!(f.severity in SEVERITY_EMOJI)) {
      return {
        ok: false,
        error: `findings[${i}].severity must be critical|warning|suggestion (got ${JSON.stringify(f.severity)})`,
      };
    }
    if (typeof f.file !== 'string' || !f.file.trim())
      return { ok: false, error: `findings[${i}].file must be a non-empty string` };
    if (f.line !== undefined && !(Number.isInteger(f.line) && f.line > 0)) {
      return { ok: false, error: `findings[${i}].line must be a positive integer when present` };
    }
    if (typeof f.issue !== 'string' || !f.issue.trim())
      return { ok: false, error: `findings[${i}].issue must be a non-empty string` };
    for (const k of ['why', 'fix']) {
      if (f[k] !== undefined && typeof f[k] !== 'string')
        return { ok: false, error: `findings[${i}].${k} must be a string when present` };
    }
  }
  if (r.omitted !== undefined && !(Number.isInteger(r.omitted) && r.omitted >= 0)) {
    return { ok: false, error: 'omitted must be a non-negative integer when present' };
  }
  if (r.reviewed !== undefined) {
    const v = r.reviewed;
    if (typeof v !== 'object' || v === null) return { ok: false, error: 'reviewed must be an object when present' };
    if (v.files !== undefined && !(Number.isInteger(v.files) && v.files >= 0)) {
      return { ok: false, error: 'reviewed.files must be a non-negative integer' };
    }
    if (v.chunks !== undefined && !(Number.isInteger(v.chunks) && v.chunks >= 0)) {
      return { ok: false, error: 'reviewed.chunks must be a non-negative integer' };
    }
  }
  return { ok: true, report: r };
}

/**
 * The comment body, pinned by tests. ONE plain comment: findings as text, an
 * attribution line, no inline-review machinery (the caller posts it with
 * `gh pr comment` / `glab mr note`, never `gh pr review`).
 */
export function commentBody(report) {
  const lines = ['**Code review — Nexrall Code**', '', report.summary.trim(), ''];
  const findings = report.findings;
  if (findings.length) {
    lines.push(`**Findings (${findings.length})**`, '');
    for (const f of findings) {
      const where = f.line ? `${f.file}:${f.line}` : f.file;
      lines.push(`${SEVERITY_EMOJI[f.severity]} **${f.severity}** — \`${where}\` — ${f.issue.trim()}`);
      if (f.why?.trim()) lines.push(`   Why: ${f.why.trim()}`);
      if (f.fix?.trim()) lines.push(`   Fix: ${f.fix.trim()}`);
      lines.push('');
    }
  } else {
    lines.push('No findings — the reviewed change looks good.', '');
  }
  const omitted = report.omitted ?? 0;
  if (omitted > 0) {
    lines.push(`_${omitted} lower-priority finding${omitted === 1 ? '' : 's'} omitted (findings budget)._`, '');
  }
  if (report.reviewed && (report.reviewed.files !== undefined || report.reviewed.chunks !== undefined)) {
    const bits = [];
    if (report.reviewed.files !== undefined) bits.push(`${report.reviewed.files} file(s)`);
    if (report.reviewed.chunks !== undefined) bits.push(`${report.reviewed.chunks} chunk(s)`);
    lines.push(`Reviewed: ${bits.join(' · ')}.`, '');
  }
  lines.push(
    '_Generated by [Nexrall Code](https://nexrall.com) · automated review, file:line findings only — no inline comments._',
  );
  return lines.join('\n') + '\n';
}

// ─── S25d: the persisted findings budget ─────────────────────────────────────
//
// CC's `/code-review --max-findings <n>` choice is reused until `--max-findings
// default` — a per-repo preference, not a per-invocation one. The helper owns
// the storage because it is the one part of the plugin that runs as a real
// script; the state lives in the plugin's data dir (the SAME directory
// $NEXRALL_PLUGIN_DATA names for hooks/MCP), keyed by the repo's git toplevel.
//
// Exit codes match the rest of this helper: 0 ok · 1 usage (bad value / unknown verb).

const BUDGET_MIN = 1;
const BUDGET_MAX = 999;
/** Keep the state file bounded: the OLDEST repo keys fall out first. */
const BUDGET_KEYS_CAP = 50;

function budgetStateDir() {
  const env = (process.env.NEXRALL_PLUGIN_DATA ?? '').trim();
  return env || path.join(os.homedir(), '.nexrall', 'plugin-data', 'code-review');
}

function budgetFile() {
  return path.join(budgetStateDir(), 'max-findings.json');
}

/** A repo's identity: the git toplevel when there is one, else the cwd. */
function budgetRepoKey() {
  const r = tryRun('git', ['rev-parse', '--show-toplevel']);
  return r.ok && r.out.trim() ? r.out.trim() : process.cwd();
}

function readBudgetMap() {
  try {
    const raw = JSON.parse(fs.readFileSync(budgetFile(), 'utf-8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {}; // no state yet (or unreadable): a fresh start, never a crash
  }
}

function writeBudgetMap(map) {
  fs.mkdirSync(budgetStateDir(), { recursive: true });
  const keys = Object.keys(map);
  const kept = {};
  for (const k of keys.slice(-BUDGET_KEYS_CAP)) kept[k] = map[k];
  fs.writeFileSync(budgetFile(), JSON.stringify(kept, null, 2) + '\n');
}

export function maxFindingsCommand(args) {
  const [verb, value] = args;
  if (verb === 'get') {
    const v = readBudgetMap()[budgetRepoKey()];
    if (typeof v === 'string' && v) process.stdout.write(v + '\n');
    return EXIT.ok;
  }
  if (verb === 'set') {
    if (value === undefined || value === '') {
      process.stderr.write('target.mjs: max-findings set needs <n|all|default>\n' + USAGE);
      return EXIT.usage;
    }
    const map = readBudgetMap();
    const key = budgetRepoKey();
    if (value === 'default') {
      delete map[key];
      writeBudgetMap(map);
      process.stdout.write('default\n');
      return EXIT.ok;
    }
    const n = /^\d+$/.test(value) ? Number(value) : NaN;
    if (value !== 'all' && !(Number.isInteger(n) && n >= BUDGET_MIN && n <= BUDGET_MAX)) {
      process.stderr.write(
        `target.mjs: "${value}" is not a findings budget (${BUDGET_MIN}-${BUDGET_MAX}, or all, or default)\n` + USAGE,
      );
      return EXIT.usage;
    }
    map[key] = value === 'all' ? 'all' : String(n);
    writeBudgetMap(map);
    process.stdout.write(map[key] + '\n');
    return EXIT.ok;
  }
  process.stderr.write(USAGE);
  return EXIT.usage;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const USAGE = `usage:
  target.mjs resolve [<target>]        # one JSON review plan (kind/diffCommand/files/untracked)
  target.mjs comment-body <file|->     # the exact body of ONE PR/MR comment
  target.mjs max-findings get          # the standing findings budget for this repo ('' when unset)
  target.mjs max-findings set <n|all|default>   # persist / clear it
exit: 0 ok · 1 usage · 2 not a git repository · 3 gh/glab missing · 4 target did not resolve · 5 host tool failed
`;

function main(argv) {
  const [sub, ...rest] = argv;
  if (sub === 'resolve') {
    const { json, code } = resolveTarget(process.cwd(), rest);
    if (code !== EXIT.ok) process.stderr.write(`target.mjs: ${json.error}\n`);
    process.stdout.write(JSON.stringify(json, null, 2) + '\n');
    return code;
  }
  if (sub === 'comment-body') {
    const src = rest[0];
    if (!src) {
      process.stderr.write('target.mjs: comment-body needs a report file (or "-" for stdin)\n' + USAGE);
      return EXIT.usage;
    }
    let text;
    try {
      text = src === '-' ? fs.readFileSync(0, 'utf-8') : fs.readFileSync(src, 'utf-8');
    } catch (e) {
      process.stderr.write(`target.mjs: cannot read ${src}: ${e.message}\n`);
      return EXIT.usage;
    }
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      process.stderr.write(`target.mjs: report is not valid JSON: ${e.message}\n`);
      return EXIT.usage;
    }
    const v = validateReport(raw);
    if (!v.ok) {
      process.stderr.write(`target.mjs: bad report — ${v.error}\n`);
      return EXIT.usage;
    }
    process.stdout.write(commentBody(v.report));
    return EXIT.ok;
  }
  if (sub === 'max-findings') return maxFindingsCommand(rest);
  process.stderr.write(USAGE);
  return EXIT.usage;
}

// Only run when executed, not when imported by tests.
const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) process.exit(main(process.argv.slice(2)));
