const MODULE_LABELS = {
  politics: '政治常识',
  quantity: '数量关系',
  language: '言语理解',
  logic: '判断推理',
  data: '资料分析',
};

const PERSON_COLORS = {
  A: '#4676f6',
  B: '#8b5cf6',
};

const MODULE_COLORS = {
  politics: '#4aa3a2',
  quantity: '#6bbd99',
  language: '#8ecae6',
  logic: '#a3c9a8',
  data: '#5b8def',
};

const state = {
  users: [],
  modules: [],
  records: [],
  selectedPerson: 'all',
  selectedModule: 'all',
  charts: {},
  activeView: 'overview',
};

const pageTitles = {
  overview: '今日总体看板',
  profile: '个人看板',
  table: '表格数据页',
  form: '提交表单',
};

async function loadJson(path) {
  const cacheBust = `?t=${Date.now()}`;
  const url = `${path}${path.includes('?') ? '&' : '?'}_=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`加载失败: ${path}`);
  }
  return res.json();
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0.00%';
  return `${(value * 100).toFixed(2)}%`;
}

function formatMinutes(minutes) {
  return `${Number(minutes).toFixed(1)} 分`;
}

function getAccuracy(record) {
  return record.questionCount ? record.correctCount / record.questionCount : 0;
}

function getAverageSeconds(record) {
  const minutes = Number(record.durationMinutes || 0);
  const totalSeconds = minutes * 60;
  return record.questionCount ? totalSeconds / record.questionCount : 0;
}

function getDateList(records) {
  const uniqueDates = new Set(records.map((r) => r.date));
  return [...uniqueDates].sort();
}

function getFilteredRecords() {
  return state.records.filter((record) => {
    const personMatch = state.selectedPerson === 'all' || record.person === state.selectedPerson;
    const moduleMatch = state.selectedModule === 'all' || record.module === state.selectedModule;
    return personMatch && moduleMatch;
  });
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function renderSummary() {
  const today = getTodayDate();
  const container = document.getElementById('summaryGrid');

  const cards = state.users.flatMap((user) => {
    const todayRecords = state.records.filter((r) => r.date === today && r.person === user.name);
    const totalQuestions = todayRecords.reduce((sum, r) => sum + Number(r.questionCount || 0), 0);
    const totalCorrect = todayRecords.reduce((sum, r) => sum + Number(r.correctCount || 0), 0);
    const accuracy = totalQuestions ? totalCorrect / totalQuestions : 0;

    return [
      {
        label: `${user.name} 今日刷题量`,
        value: totalQuestions,
        sub: `${today} 记录`,
        tone: user.name === 'A' ? 'primary' : 'green',
      },
      {
        label: `${user.name} 今日正确率`,
        value: formatPercent(accuracy),
        sub: `${totalCorrect}/${totalQuestions} 题`,
        tone: user.name === 'A' ? 'orange' : 'purple',
      },
    ];
  });

  container.innerHTML = cards
    .map(
      (card) => `
        <div class="summary-card ${card.tone}">
          <div class="label">
            <span>${card.label}</span>
            <span class="dot"></span>
          </div>
          <div class="value">${card.value}</div>
          <div class="sub">${card.sub}</div>
        </div>
      `
    )
    .join('');
}

function renderHeatmap() {
  const container = document.getElementById('heatmap');
  const allDates = getDateList(state.records);
  const endDate = allDates.length ? new Date(allDates[allDates.length - 1]) : new Date();
  const daysToRender = 84;
  const dayKeys = [];

  for (let i = daysToRender - 1; i >= 0; i -= 1) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    dayKeys.push(date.toISOString().slice(0, 10));
  }

  const weeksInView = Math.ceil(daysToRender / 7);

  container.innerHTML = state.users
    .map((user) => {
      const cells = dayKeys
        .map((date, index) => {
          const val = state.records
            .filter((r) => r.person === user.name && r.date === date)
            .reduce((sum, item) => sum + Number(item.questionCount || 0), 0);
          const level = val >= 40 ? 4 : val >= 25 ? 3 : val >= 10 ? 2 : val >= 4 ? 1 : 0;
          const weekIndex = Math.floor(index / 7);
          const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

          return `
            <div
              class="heatmap-day level-${level}"
              data-user="${user.name}"
              data-date="${date}"
              data-count="${val}"
              title="${user.name} / ${date} / ${val}题"
              aria-label="${user.name} 在 ${date} 刷题 ${val} 题"
              style="grid-column: ${weekIndex + 1}; grid-row: ${dayOfWeek + 1};"
            ></div>
          `;
        })
        .join('');

      return `
        <div class="heatmap-user-row">
          <div class="heatmap-label">${user.name}</div>
          <div class="heatmap-grid" style="grid-template-columns: repeat(${weeksInView}, 12px); grid-template-rows: repeat(7, 12px);">${cells}</div>
        </div>
      `;
    })
    .join('');
}

function renderRadarChart() {
  const today = getTodayDate();
  const modules = state.modules.map((module) => module.id);
  const labels = modules.map((id) => MODULE_LABELS[id]);
  const datasets = state.users.map((user) => {
    const values = modules.map((moduleId) => {
      const todayModuleRecords = state.records.filter(
        (r) => r.date === today && r.person === user.name && r.module === moduleId
      );
      const totalQ = todayModuleRecords.reduce((sum, r) => sum + Number(r.questionCount || 0), 0);
      const totalC = todayModuleRecords.reduce((sum, r) => sum + Number(r.correctCount || 0), 0);
      return totalQ ? totalC / totalQ : 0;
    });

    return {
      label: user.name,
      data: values,
      borderColor: PERSON_COLORS[user.name],
      backgroundColor: `${PERSON_COLORS[user.name]}33`,
      pointBackgroundColor: PERSON_COLORS[user.name],
      pointBorderColor: '#fff',
      pointHoverRadius: 5,
    };
  });

  const ctx = document.getElementById('radarChart');
  if (state.charts.radar) {
    state.charts.radar.destroy();
  }

  state.charts.radar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 1,
          ticks: {
            stepSize: 0.2,
            callback: (value) => `${value * 100}%`,
          },
        },
      },
      plugins: {
        legend: { position: 'bottom' },
      },
    },
  });
}

function renderLineChart() {
  const dates = getDateList(state.records);
  const datasets = state.users.map((user) => ({
    label: user.name,
    data: dates.map((date) =>
      state.records
        .filter((r) => r.person === user.name && r.date === date)
        .reduce((sum, item) => sum + Number(item.questionCount || 0), 0)
    ),
    borderColor: PERSON_COLORS[user.name],
    backgroundColor: `${PERSON_COLORS[user.name]}22`,
    tension: 0.35,
    fill: false,
    pointRadius: 3,
  }));

  const ctx = document.getElementById('lineChart');
  if (state.charts.line) {
    state.charts.line.destroy();
  }

  state.charts.line = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: '题目数量' } },
      },
    },
  });
}

function renderBarChart() {
  const today = getTodayDate();
  const labels = state.users.map((user) => user.name);
  const ctx = document.getElementById('barChart');

  const datasets = state.modules.map((module) => ({
    label: module.name,
    data: labels.map((name) =>
      state.records
        .filter((r) => r.person === name && r.date === today && r.module === module.id)
        .reduce((sum, item) => sum + Number(item.questionCount || 0), 0)
    ),
    backgroundColor: MODULE_COLORS[module.id],
    borderColor: MODULE_COLORS[module.id],
    borderWidth: 0,
    borderRadius: 0,
    borderSkipped: false,
    stack: 'questions',
    barPercentage: 0.76,
    categoryPercentage: 0.7,
  }));

  if (state.charts.bar) {
    state.charts.bar.destroy();
  }

  state.charts.bar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 10,
          right: 8,
          left: 8,
          bottom: 0,
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#475569',
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 10,
            boxHeight: 10,
            padding: 16,
            font: {
              weight: '600',
            },
          },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderWidth: 0,
          padding: 10,
          displayColors: true,
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false,
            drawBorder: false,
          },
          ticks: {
            color: '#475569',
            font: {
              weight: '600',
            },
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: {
            color: 'rgba(148, 163, 184, 0.18)',
            drawBorder: false,
          },
          ticks: {
            color: '#475569',
            stepSize: 10,
          },
          title: {
            display: true,
            text: '题目数量',
            color: '#334155',
            font: {
              weight: '700',
            },
          },
        },
      },
    },
  });
}

function renderProfileOverview() {
  const container = document.getElementById('profileOverview');

  container.innerHTML = state.users
    .map((user) => {
      const records = state.records.filter((r) => r.person === user.name);
      const totalQ = records.reduce((sum, r) => sum + Number(r.questionCount || 0), 0);
      const totalC = records.reduce((sum, r) => sum + Number(r.correctCount || 0), 0);
      const avgAccuracy = totalQ ? totalC / totalQ : 0;
      const dates = new Set(records.map((r) => r.date));
      const durationSum = records.reduce((sum, r) => sum + Number(r.durationMinutes || 0), 0);
      const avgMinutes = records.length ? durationSum / records.length : 0;

      return `
        <div class="profile-card">
          <div class="person">${user.name}</div>
          <p class="value">${totalQ}</p>
          <div class="detail">正确率 ${formatPercent(avgAccuracy)} · 平均 ${avgMinutes.toFixed(1)} 分</div>
          <div class="detail">活跃天数 ${dates.size}</div>
        </div>
      `;
    })
    .join('');
}

function renderModuleGrid() {
  const container = document.getElementById('moduleGrid');

  container.innerHTML = state.users
    .map((user) => {
      const userCards = state.modules
        .map((module) => {
          const records = state.records.filter((r) => r.person === user.name && r.module === module.id);
          const totalQ = records.reduce((sum, r) => sum + Number(r.questionCount || 0), 0);
          const totalC = records.reduce((sum, r) => sum + Number(r.correctCount || 0), 0);
          const avgAccuracy = totalQ ? totalC / totalQ : 0;
          const avgSeconds = records.length
            ? records.reduce((sum, r) => sum + getAverageSeconds(r), 0) / records.length
            : 0;

          const trendData = getDateList(state.records)
            .slice(-7)
            .map((date) => {
              const dayTotal = records
                .filter((r) => r.date === date)
                .reduce((sum, item) => sum + Number(item.questionCount || 0), 0);
              return dayTotal;
            });

          const linePath = trendData.length
            ? trendData
                .map((value, index) => {
                  const x = (index / Math.max(trendData.length - 1, 1)) * 100;
                  const y = 100 - (value / Math.max(Math.max(...trendData), 1)) * 100;
                  return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
                })
                .join(' ')
            : 'M 0 100 L 100 100';

          return `
            <div class="module-card">
              <h3>${MODULE_LABELS[module.id]}</h3>
              <div class="module-stats">
                <div class="module-stat">
                  <div class="k">总题数</div>
                  <div class="v">${totalQ}</div>
                </div>
                <div class="module-stat">
                  <div class="k">正确率</div>
                  <div class="v">${formatPercent(avgAccuracy)}</div>
                </div>
                <div class="module-stat">
                  <div class="k">答对</div>
                  <div class="v">${totalC}</div>
                </div>
                <div class="module-stat">
                  <div class="k">平均用时</div>
                  <div class="v">${avgSeconds.toFixed(0)}s</div>
                </div>
              </div>
              <div class="module-mini-chart">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="${linePath}" fill="none" stroke="${PERSON_COLORS[user.name]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="user-module-group">
          <h3 style="margin:0 0 12px; color: var(--text);">${user.name}</h3>
          <div style="display:grid; gap:12px;">${userCards}</div>
        </div>
      `;
    })
    .join('');
}

function renderTable() {
  const tbody = document.getElementById('recordTableBody');
  const filtered = getFilteredRecords();

  tbody.innerHTML = filtered
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((record) => {
      const accuracy = getAccuracy(record);
      const avgSeconds = getAverageSeconds(record);
      return `
        <tr>
          <td>${record.date}</td>
          <td>${record.person}</td>
          <td>${MODULE_LABELS[record.module] || record.module}</td>
          <td>${record.questionCount}</td>
          <td>${record.correctCount}</td>
          <td>${formatPercent(accuracy)}</td>
          <td>${formatMinutes(record.durationMinutes)}</td>
          <td>${avgSeconds.toFixed(0)} 秒</td>
        </tr>
      `;
    })
    .join('');
}

function populateFilters() {
  const personFilter = document.getElementById('personFilter');
  const moduleFilter = document.getElementById('moduleFilter');
  const recordPerson = document.getElementById('recordPerson');
  const recordModule = document.getElementById('recordModule');

  personFilter.innerHTML = ['<option value="all">全部人物</option>']
    .concat(state.users.map((user) => `<option value="${user.name}">${user.name}</option>`))
    .join('');

  moduleFilter.innerHTML = ['<option value="all">全部模块</option>']
    .concat(state.modules.map((module) => `<option value="${module.id}">${module.name}</option>`))
    .join('');

  recordPerson.innerHTML = state.users
    .map((user) => `<option value="${user.name}">${user.name}</option>`)
    .join('');

  recordModule.innerHTML = state.modules
    .map((module) => `<option value="${module.id}">${module.name}</option>`)
    .join('');

  document.getElementById('recordDate').valueAsDate = new Date();
}

function setActiveView(viewName) {
  state.activeView = viewName;

  document.querySelectorAll('.nav-item').forEach((item) => {
    const match = item.dataset.view === viewName;
    item.classList.toggle('active', match);
  });

  document.querySelectorAll('.view-section').forEach((section) => {
    const match = section.dataset.view === viewName;
    section.classList.toggle('active', match);
  });

  const titleEl = document.getElementById('pageTitle');
  if (titleEl) {
    titleEl.textContent = pageTitles[viewName] || '数据看板';
  }
}

function bindHeatmapTooltip() {
  const heatmapDays = document.querySelectorAll('.heatmap-day');
  const tooltip = document.createElement('div');
  tooltip.className = 'heatmap-tooltip';
  document.body.appendChild(tooltip);

  heatmapDays.forEach((day) => {
    day.addEventListener('mouseenter', () => {
      const date = day.dataset.date;
      const count = day.dataset.count;
      tooltip.textContent = `${date} · ${count} 题`;
      tooltip.style.display = 'block';
    });

    day.addEventListener('mousemove', (e) => {
      const rect = day.getBoundingClientRect();
      tooltip.style.left = `${rect.left + rect.width / 2}px`;
      tooltip.style.top = `${rect.top - 36}px`;
    });

    day.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      setActiveView(button.dataset.view);
    });
  });

  document.getElementById('personFilter').addEventListener('change', (e) => {
    state.selectedPerson = e.target.value;
    renderTable();
  });

  document.getElementById('moduleFilter').addEventListener('change', (e) => {
    state.selectedModule = e.target.value;
    renderTable();
  });

  document.getElementById('recordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const questionCount = Number(document.getElementById('questionCount').value);
    const correctCount = Number(document.getElementById('correctCount').value);

    if (correctCount > questionCount) {
      document.getElementById('formMessage').textContent = '正确数量不能大于题目数量';
      return;
    }

    const newRecord = {
      id: Date.now(),
      date: document.getElementById('recordDate').value,
      person: document.getElementById('recordPerson').value,
      module: document.getElementById('recordModule').value,
      questionCount,
      correctCount,
      durationMinutes: Number(document.getElementById('durationMinutes').value),
      note: '',
    };

    state.records.push(newRecord);
    form.reset();
    document.getElementById('recordDate').valueAsDate = new Date();
    document.getElementById('formMessage').textContent = '记录已添加';
    renderAll();
  });

  document.getElementById('refreshDataBtn').addEventListener('click', async () => {
    const newUsers = await loadJson('./data/users.json');
    const newModules = await loadJson('./data/modules.json');
    const newRecords = await loadJson('./data/records.json');
    state.users = newUsers;
    state.modules = newModules;
    state.records = newRecords;
    populateFilters();
    renderAll();
    bindHeatmapTooltip();
  });
}

function renderAll() {
  renderSummary();
  renderHeatmap();
  bindHeatmapTooltip();
  renderRadarChart();
  renderLineChart();
  renderBarChart();
  renderProfileOverview();
  renderModuleGrid();
  renderTable();
}

async function init() {
  try {
    state.users = await loadJson('./data/users.json');
    state.modules = await loadJson('./data/modules.json');
    state.records = await loadJson('./data/records.json');
    populateFilters();
    bindEvents();
    setActiveView(state.activeView);
    renderAll();
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `<div style="padding: 40px; color: #c00; font-family:sans-serif;">数据加载失败，请检查 data 目录是否存在。</div>`;
  }
}

init();
