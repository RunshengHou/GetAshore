// 上岸学习数据看板 - Cloudflare Worker
// 功能：接收前端表单提交，通过 GitHub API 将新记录写入 data/records.json
//
// 需要配置的环境变量（Variables）：
//   GITHUB_OWNER  = RunshengHou
//   GITHUB_REPO   = GetAshore
//   GITHUB_BRANCH = main
//
// 需要配置的 Secret：
//   GITHUB_TOKEN  = 你的 Fine-grained Personal Access Token
//     (仓库权限 Contents: Read and write)

const RECORD_FILE = 'data/records.json';
const FILE_URL = (owner, repo, branch) =>
  `https://api.github.com/repos/${owner}/${repo}/contents/${RECORD_FILE}?ref=${branch}`;

const ALLOWED_MODULES = new Set(['politics', 'quantity', 'language', 'logic', 'data']);
const ALLOWED_PERSONS = new Set(['升', '强']);

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function readRecords(env, authHeaders) {
  const url = FILE_URL(env.GITHUB_OWNER, env.GITHUB_REPO, env.GITHUB_BRANCH);
  const res = await fetch(url, { headers: authHeaders });
  if (res.status === 404) {
    return { ok: true, records: [], sha: null };
  }
  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, error: `读取记录失败: ${res.status}`, detail: detail.slice(0, 400) };
  }
  const fileData = await res.json();
  try {
    return { ok: true, records: JSON.parse(base64Decode(fileData.content)), sha: fileData.sha };
  } catch (error) {
    return { ok: false, error: 'records.json 内容解析失败' };
  }
}

async function writeRecords(env, authHeaders, sha, records, message) {
  const url = FILE_URL(env.GITHUB_OWNER, env.GITHUB_REPO, env.GITHUB_BRANCH);
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: base64Encode(JSON.stringify(records, null, 2)),
      sha,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, error: `写入记录失败: ${res.status}`, detail };
  }
  return { ok: true };
}

function base64Encode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64Decode(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function validateRecord(record) {
  if (!record || typeof record !== 'object') return '记录格式不正确';
  if (!ALLOWED_PERSONS.has(record.person)) return '人物不合法';
  if (!ALLOWED_MODULES.has(record.module)) return '题目类型不合法';

  const questionCount = Number(record.questionCount);
  const correctCount = Number(record.correctCount);
  const durationMinutes = Number(record.durationMinutes);

  if (!Number.isFinite(questionCount) || questionCount <= 0) return '题目数量必须大于 0';
  if (!Number.isFinite(correctCount) || correctCount < 0) return '正确数量不合法';
  if (correctCount > questionCount) return '正确数量不能大于题目数量';
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return '完成时长必须大于 0';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')) return '日期格式不正确';

  return null;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return jsonResponse({ ok: true });
    }

    const { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, GITHUB_TOKEN } = env;
    const missingVars = ['GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_BRANCH', 'GITHUB_TOKEN'].filter(
      (key) => !env[key]
    );
    if (missingVars.length) {
      return jsonResponse({ ok: false, error: `缺少环境变量: ${missingVars.join(', ')}` }, 500);
    }

    const authHeaders = {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'GetAshore-Worker',
    };

    // GET：返回仓库 main 分支最新的 records（避免 GitHub Pages 部署延迟导致数据滞后）
    if (request.method === 'GET') {
      const result = await readRecords(env, authHeaders);
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error, detail: result.detail }, 502);
      }
      return jsonResponse({ ok: true, records: result.records });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: '仅支持 GET / POST 请求' }, 405);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return jsonResponse({ ok: false, error: '请求体不是有效的 JSON' }, 400);
    }

    // 读取当前 records.json
    const readResult = await readRecords(env, authHeaders);
    if (!readResult.ok) {
      return jsonResponse({ ok: false, error: readResult.error, detail: readResult.detail }, 502);
    }
    const records = readResult.records;
    const sha = readResult.sha;

    let nextRecords;
    let commitMessage;
    let deletedRecord = null;

    if (payload && payload.action === 'delete') {
      const id = payload.id;
      if (id === undefined || id === null || id === '') {
        return jsonResponse({ ok: false, error: '缺少记录 ID' }, 400);
      }
      const targetIndex = records.findIndex((r) => String(r.id) === String(id));
      if (targetIndex === -1) {
        return jsonResponse({ ok: false, error: '未找到该记录' }, 404);
      }
      nextRecords = records.slice();
      deletedRecord = nextRecords.splice(targetIndex, 1)[0];
      commitMessage = `chore: remove study record ${String(id)}`;
    } else {
      const validationError = validateRecord(payload);
      if (validationError) {
        return jsonResponse({ ok: false, error: validationError }, 400);
      }
      const newRecord = {
        id: Date.now(),
        date: payload.date,
        person: payload.person,
        module: payload.module,
        questionCount: Number(payload.questionCount),
        correctCount: Number(payload.correctCount),
        durationMinutes: Number(payload.durationMinutes),
        note: payload.note || '',
      };
      nextRecords = records.concat(newRecord);
      commitMessage = `feat: add study record ${newRecord.date} ${newRecord.person}`;
    }

    // 写回文件
    const writeResult = await writeRecords(env, authHeaders, sha, nextRecords, commitMessage);
    if (!writeResult.ok) {
      return jsonResponse({ ok: false, error: writeResult.error, detail: writeResult.detail }, 502);
    }

    return jsonResponse({
      ok: true,
      total: nextRecords.length,
      ...(deletedRecord ? { deleted: { id: deletedRecord.id } } : {}),
    });
  },
};
