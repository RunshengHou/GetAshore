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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
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

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: '仅支持 POST 请求' }, 405);
    }

    const { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, GITHUB_TOKEN } = env;
    const missingVars = ['GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_BRANCH', 'GITHUB_TOKEN'].filter(
      (key) => !env[key]
    );
    if (missingVars.length) {
      return jsonResponse({ ok: false, error: `缺少环境变量: ${missingVars.join(', ')}` }, 500);
    }

    let record;
    try {
      record = await request.json();
    } catch (error) {
      return jsonResponse({ ok: false, error: '请求体不是有效的 JSON' }, 400);
    }

    const validationError = validateRecord(record);
    if (validationError) {
      return jsonResponse({ ok: false, error: validationError }, 400);
    }

    const authHeaders = {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    try {
      // 1. 读取当前文件，拿到 sha 和内容
      const getResponse = await fetch(FILE_URL(GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH), {
        headers: authHeaders,
      });

      let records = [];
      let sha = null;

      if (getResponse.status === 404) {
        // 文件尚不存在，从空数组开始
        records = [];
      } else if (!getResponse.ok) {
        const bodyText = await getResponse.text();
        return jsonResponse(
          { ok: false, error: `读取记录失败: ${getResponse.status}`, detail: bodyText.slice(0, 400) },
          502
        );
      } else {
        const fileData = await getResponse.json();
        sha = fileData.sha;
        const content = atob(fileData.content.replace(/\n/g, ''));
        try {
          records = JSON.parse(content);
        } catch (error) {
          return jsonResponse({ ok: false, error: 'records.json 内容解析失败' }, 502);
        }
      }

      const newRecord = {
        id: Date.now(),
        date: record.date,
        person: record.person,
        module: record.module,
        questionCount: Number(record.questionCount),
        correctCount: Number(record.correctCount),
        durationMinutes: Number(record.durationMinutes),
        note: record.note || '',
      };

      records.push(newRecord);

      // 2. 写回文件
      const putResponse = await fetch(FILE_URL(GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH), {
        method: 'PUT',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `feat: add study record ${newRecord.date} ${newRecord.person}`,
          content: btoa(JSON.stringify(records, null, 2)),
          sha,
        }),
      });

      if (!putResponse.ok) {
        const detail = await putResponse.text();
        return jsonResponse({ ok: false, error: `写入记录失败: ${putResponse.status}`, detail }, 502);
      }

      return jsonResponse({ ok: true, record: newRecord, total: records.length });
    } catch (error) {
      return jsonResponse({ ok: false, error: 'Worker 内部错误', detail: String(error) }, 500);
    }
  },
};
