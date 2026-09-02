const MODULE_LABELS = {
  politics: '政治常识',
  quantity: '数量关系',
  language: '言语理解',
  logic: '判断推理',
  data: '资料分析',
};

const PERSON_COLORS = {
  升: '#4e9cf5',
  强: '#a06cf5',
};

const PERSON_CHART_COLORS = {
  升: ['#4e9cf5', '#7cb9f8', '#c0ddff'],
  强: ['#a06cf5', '#bd93f9', '#e2d2ff'],
};

const MODULE_COLORS = {
  politics: '#3fc1b4',
  quantity: '#ffb454',
  language: '#5aa9f5',
  logic: '#ff8aa1',
  data: '#8cd06a',
};

const CHART_TEXT_COLOR = '#5f7087';
const CHART_GRID_COLOR = 'rgba(95, 112, 135, 0.15)';
const LOCAL_RECORDS_KEY = 'study-dashboard-local-records';
const WORKER_URL = 'https://getashore.hourunsheng.workers.dev';

const state = {
  users: [],
  modules: [],
  records: [],
  selectedPerson: 'all',
  selectedModule: 'all',
  charts: {},
  activeView: 'overview',
  viewDate: '',
  profilePerson: '升',
  profileModule: '',
  tablePage: 1,
  tablePageSize: 20,
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

function getLocalRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(LOCAL_RECORDS_KEY) || '[]');
    return Array.isArray(records) ? records : [];
  } catch (error) {
    return [];
  }
}

function saveLocalRecord(record) {
  const records = getLocalRecords();
  records.push(record);
  localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
}

function mergeRecords(staticRecords) {
  const localRecords = getLocalRecords();
  const staticIds = new Set(staticRecords.map((record) => String(record.id)));
  return staticRecords.concat(localRecords.filter((record) => !staticIds.has(String(record.id))));
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

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayDate() {
  return formatLocalDate(new Date());
}

function getActiveDate() {
  return state.viewDate || getTodayDate();
}

function initOverviewDateControl() {
  const input = document.getElementById('overviewDate');
  const today = getTodayDate();
  input.max = today;
  input.value = state.viewDate || today;
}

function applyOverviewDate(value) {
  state.viewDate = value || '';
  const input = document.getElementById('overviewDate');
  if (input) {
    input.value = state.viewDate || getTodayDate();
  }
  renderSummary();
  renderDailyPieCharts();
  renderRadarChart();
  renderBarChart();
}

function renderSummary() {
  const today = getActiveDate();
  const container = document.getElementById('summaryGrid');

  const cards = state.users.flatMap((user) => {
    const todayRecords = state.records.filter((r) => r.date === today && r.person === user.name);
    const totalQuestions = todayRecords.reduce((sum, r) => sum + Number(r.questionCount || 0), 0);
    const totalCorrect = todayRecords.reduce((sum, r) => sum + Number(r.correctCount || 0), 0);
    const accuracy = totalQuestions ? totalCorrect / totalQuestions : 0;

    return [
      {
        label: `${user.name} 当日刷题量`,
        value: totalQuestions,
        sub: `${today} 记录`,
        tone: user.name === '升' ? 'primary' : 'green',
      },
      {
        label: `${user.name} 当日正确率`,
        value: formatPercent(accuracy),
        sub: `${totalCorrect}/${totalQuestions} 题`,
        tone: user.name === '升' ? 'orange' : 'purple',
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

function renderDailyPieCharts() {
  const container = document.getElementById('dailyPieCharts');
  const today = getActiveDate();

  Object.values(state.charts)
    .filter((chart) => chart && chart.canvas && chart.canvas.id.startsWith('dailyPieChart-'))
    .forEach((chart) => chart.destroy());

  container.innerHTML = state.users
    .map(
      (user) => `
        <article class="panel daily-pie-item">
          <div class="panel-header">
            <h2>${user.name} 当日刷题构成</h2>
          </div>
          <div class="daily-pie-title">${user.name}<span>${today}</span></div>
          <div class="daily-pie-wrap">
            <canvas id="dailyPieChart-${user.name}"></canvas>
          </div>
        </article>
      `
    )
    .join('');

  state.users.forEach((user) => {
    const moduleTotals = state.modules.map((module) =>
      state.records
        .filter((record) => record.person === user.name && record.date === today && record.module === module.id)
        .reduce((sum, record) => sum + Number(record.questionCount || 0), 0)
    );

    state.charts[`dailyPie-${user.name}`] = new Chart(
      document.getElementById(`dailyPieChart-${user.name}`),
      {
        type: 'doughnut',
        data: {
          labels: state.modules.map((module) => module.name),
          datasets: [{
            data: moduleTotals,
            backgroundColor: state.modules.map((module) => MODULE_COLORS[module.id]),
            borderColor: '#ffffff',
            borderWidth: 2,
            hoverOffset: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: CHART_TEXT_COLOR, usePointStyle: true },
            },
            tooltip: {
              callbacks: {
                label: (context) => `${context.label}: ${context.raw} 题`,
              },
            },
          },
        },
      }
    );
  });
}

function isCompactHeatmap() {
  return window.matchMedia('(max-width: 720px)').matches;
}

function renderHeatmap() {
  const container = document.getElementById('heatmapContainer');
  container.innerHTML = '';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayMs = 24 * 60 * 60 * 1000;
  const endDate = new Date();
  const today = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  // 移动端适度缩短热力图范围（桌面 6 个月 / 移动 5 个月）
  const rangeMonths = isCompactHeatmap() ? 5 : 6;
  const startDate = new Date(today);
  startDate.setMonth(today.getMonth() - rangeMonths);

  const gridStart = new Date(startDate);
  gridStart.setDate(startDate.getDate() - startDate.getDay());

  const gridEnd = new Date(today);
  gridEnd.setDate(today.getDate() + (6 - today.getDay()));

  const totalWeeks = Math.floor((gridEnd - gridStart) / dayMs / 7) + 1;

  const tooltip = document.getElementById('heatmapTooltip') || document.createElement('div');
  tooltip.id = 'heatmapTooltip';
  tooltip.className = 'heatmap-tooltip';
  if (!document.body.contains(tooltip)) {
    document.body.appendChild(tooltip);
  }

  state.users.forEach((user) => {
    const dataMap = state.records
      .filter((r) => r.person === user.name)
      .reduce((dailyTotals, record) => {
        const currentTotal = dailyTotals.get(record.date) || 0;
        dailyTotals.set(record.date, currentTotal + Number(record.questionCount || 0));
        return dailyTotals;
      }, new Map());

    const monthLabels = [];
    const monthTracker = new Map();
    const cells = [];

    const current = new Date(gridStart);
    while (current <= today) {
      const dateStr = formatLocalDate(current);
      const weekIndex = Math.floor((current - gridStart) / dayMs / 7);
      const dayIndex = current.getDay();
      const count = dataMap.get(dateStr) || 0;
      const level = count === 0 ? 0 : Math.min(4, Math.ceil(count / 10));

      if (current.getDate() === 1) {
        const monthKey = `${current.getFullYear()}-${current.getMonth()}`;
        if (!monthTracker.has(monthKey)) {
          monthTracker.set(monthKey, true);
          monthLabels.push({
            label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(current),
            weekIndex,
          });
        }
      }

      cells.push({
        dateStr,
        count,
        weekIndex,
        dayIndex,
        level,
      });

      current.setDate(current.getDate() + 1);
    }

    const showMonthLabels = user.name !== '强';

    const heatmapMarkup = `
      <div class="heatmap-user-row">
        <div class="heatmap-label">${user.name}</div>
        <div class="heatmap-content">
          ${showMonthLabels ? `
            <div class="heatmap-months" style="grid-template-columns: repeat(${totalWeeks}, var(--hm-cell));">
              ${monthLabels
                .map(
                  (item) => `
                    <div class="month-label" style="grid-column: ${item.weekIndex + 1};">
                      ${item.label}
                    </div>
                  `
                )
                .join('')}
            </div>
          ` : ''}
          <div class="heatmap-calendar">
            <div class="heatmap-days">
              ${dayNames
                .map(
                  (day, index) => `
                    <div class="day-label" style="grid-row: ${index + 1};">${day}</div>
                  `
                )
                .join('')}
            </div>
            <div class="heatmap-grid" style="grid-template-columns: repeat(${totalWeeks}, var(--hm-cell)); grid-template-rows: repeat(7, var(--hm-cell));">
              ${cells
                .map(
                  (cell) => `
                    <div
                      class="heatmap-day level-${cell.level}"
                      style="grid-column: ${cell.weekIndex + 1}; grid-row: ${cell.dayIndex + 1};"
                      data-date="${cell.dateStr}"
                      data-count="${cell.count}"
                      aria-label="${cell.dateStr} ${cell.count}题"
                    ></div>
                  `
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', heatmapMarkup);

    const insertedUserRow = container.lastElementChild;
    const dayCells = insertedUserRow.querySelectorAll('.heatmap-day');
    dayCells.forEach((cell) => {
      cell.addEventListener('mouseenter', (event) => {
        const date = cell.dataset.date;
        const count = Number(cell.dataset.count || 0);
        tooltip.innerHTML = `<strong>${date}</strong><br>${count} 题`;
        tooltip.style.display = 'block';
        tooltip.style.left = `${event.clientX + 12}px`;
        tooltip.style.top = `${event.clientY + 12}px`;
      });

      cell.addEventListener('mousemove', (event) => {
        tooltip.style.left = `${event.clientX + 12}px`;
        tooltip.style.top = `${event.clientY + 12}px`;
      });

      cell.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
      });
    });
  });
}

function renderRadarChart() {
  const today = getActiveDate();
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
      pointRadius: 3,
      pointHoverRadius: 6,
      borderWidth: 2,
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
          angleLines: { color: CHART_GRID_COLOR },
          grid: { color: CHART_GRID_COLOR },
          ticks: {
            color: CHART_TEXT_COLOR,
            stepSize: 0.2,
            callback: (value) => `${value * 100}%`,
          },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: CHART_TEXT_COLOR, usePointStyle: true },
        },
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
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 6,
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
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: CHART_TEXT_COLOR, usePointStyle: true },
        },
      },
      scales: {
        x: {
          ticks: { color: CHART_TEXT_COLOR },
          grid: { color: CHART_GRID_COLOR },
        },
        y: {
          beginAtZero: true,
          ticks: { color: CHART_TEXT_COLOR },
          grid: { color: CHART_GRID_COLOR },
          title: { display: true, text: '题目数量', color: CHART_TEXT_COLOR },
        },
      },
    },
  });
}

function renderBarChart() {
  const today = getActiveDate();
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
    borderColor: '#ffffff',
    borderWidth: 1,
    borderRadius: 2,
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
            color: CHART_TEXT_COLOR,
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
          backgroundColor: '#31465f',
          titleColor: '#ffffff',
          bodyColor: '#f4f8fc',
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
            color: CHART_TEXT_COLOR,
            font: {
              weight: '600',
            },
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: {
            color: CHART_GRID_COLOR,
            drawBorder: false,
          },
          ticks: {
            color: CHART_TEXT_COLOR,
            stepSize: 10,
          },
          title: {
            display: true,
            text: '题目数量',
            color: CHART_TEXT_COLOR,
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
  const user = state.users.find((item) => item.name === state.profilePerson) || state.users[0];

  if (!user) {
    container.innerHTML = '';
    return;
  }

  const records = state.records.filter((r) => r.person === user.name);
  const totalQ = records.reduce((sum, r) => sum + Number(r.questionCount || 0), 0);
  const totalC = records.reduce((sum, r) => sum + Number(r.correctCount || 0), 0);
  const avgAccuracy = totalQ ? totalC / totalQ : 0;
  const dates = new Set(records.map((r) => r.date));
  const durationSum = records.reduce((sum, r) => sum + Number(r.durationMinutes || 0), 0);
  const avgMinutes = records.length ? durationSum / records.length : 0;

  const personalCards = [
    {
      label: '累计刷题总数',
      value: `${totalQ}`,
      sub: `${dates.size} 个活跃日`,
      tone: 'primary',
    },
    {
      label: '累计答对数量',
      value: `${totalC}`,
      sub: `综合正确率 ${formatPercent(avgAccuracy)}`,
      tone: 'orange',
    },
    {
      label: '平均正确率',
      value: formatPercent(avgAccuracy),
      sub: `基于 ${totalQ} 道题`,
      tone: 'green',
    },
    {
      label: '平均用时',
      value: `${avgMinutes.toFixed(1)}<small> 分</small>`,
      sub: `共 ${records.length} 条记录`,
      tone: 'purple',
    },
  ];

  container.innerHTML = personalCards
    .map(
      (card) => `
        <div class="summary-card ${card.tone}">
          <div class="label"><span>${card.label}</span><span class="dot"></span></div>
          <div class="value">${card.value}</div>
          <div class="sub">${card.sub}</div>
        </div>
      `
    )
    .join('');

  document.querySelectorAll('.profile-person-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.person === user.name);
  });
}

function renderModuleGrid() {
  const container = document.getElementById('moduleGrid');
  const user = state.users.find((item) => item.name === state.profilePerson) || state.users[0];
  const module = state.modules.find((item) => item.id === state.profileModule) || state.modules[0];

  if (!user || !module) {
    container.innerHTML = '';
    return;
  }

  const userCard = [module]
        .map((module) => {
          const records = state.records.filter((r) => r.person === user.name && r.module === module.id);
          const totalQ = records.reduce((sum, r) => sum + Number(r.questionCount || 0), 0);
          const totalC = records.reduce((sum, r) => sum + Number(r.correctCount || 0), 0);
          const avgAccuracy = totalQ ? totalC / totalQ : 0;
          const totalDurationSeconds = records.reduce(
            (sum, record) => sum + Number(record.durationMinutes || 0) * 60,
            0
          );
          const avgSeconds = totalQ ? totalDurationSeconds / totalQ : 0;

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
            <div class="module-detail">
              <div class="module-detail-header">
                <h3>${MODULE_LABELS[module.id]}</h3>
                <span>${user.name} · 近期开题表现</span>
              </div>
              <div class="module-stat-cards">
                <div class="summary-card primary">
                  <div class="label"><span>总题数</span><span class="dot"></span></div>
                  <div class="value">${totalQ}</div>
                  <div class="sub">累计刷题数量</div>
                </div>
                <div class="summary-card orange">
                  <div class="label"><span>答对数量</span><span class="dot"></span></div>
                  <div class="value">${totalC}</div>
                  <div class="sub">累计答对题目</div>
                </div>
                <div class="summary-card green">
                  <div class="label"><span>正确率</span><span class="dot"></span></div>
                  <div class="value">${formatPercent(avgAccuracy)}</div>
                  <div class="sub">模块综合表现</div>
                </div>
                <div class="summary-card purple">
                  <div class="label"><span>平均用时</span><span class="dot"></span></div>
                  <div class="value">${avgSeconds.toFixed(0)}<small> 秒</small></div>
                  <div class="sub">每题平均耗时</div>
                </div>
              </div>
              <div class="module-chart-grid">
                <div class="module-chart-panel">
                  <div class="module-chart-title">模块答题总数趋势</div>
                  <div class="module-chart-wrap"><canvas id="moduleQuestionTrendChart"></canvas></div>
                </div>
                <div class="module-chart-panel">
                  <div class="module-chart-title">模块正确率按日变化</div>
                  <div class="module-chart-wrap"><canvas id="moduleAccuracyTrendChart"></canvas></div>
                </div>
              </div>
            </div>
          `;
        })
        .join('');

  container.innerHTML = userCard;
}

function renderProfileTrend() {
  const user = state.users.find((item) => item.name === state.profilePerson) || state.users[0];
  if (!user) return;
  const chartColors = PERSON_CHART_COLORS[user.name] || [PERSON_COLORS[user.name]];

  const dates = getDateList(state.records);
  const values = dates.map((date) =>
    state.records
      .filter((record) => record.person === user.name && record.date === date)
      .reduce((sum, record) => sum + Number(record.questionCount || 0), 0)
  );
  const ctx = document.getElementById('profileTrendChart');
  if (state.charts.profileTrend) state.charts.profileTrend.destroy();

  state.charts.profileTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: `${user.name} 刷题数`,
        data: values,
        borderColor: chartColors[0],
        backgroundColor: `${chartColors[0]}22`,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: chartColors[0],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { ticks: { color: CHART_TEXT_COLOR }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: CHART_TEXT_COLOR }, grid: { color: CHART_GRID_COLOR } },
      },
    },
  });
}

function renderModuleCharts() {
  const user = state.users.find((item) => item.name === state.profilePerson) || state.users[0];
  const module = state.modules.find((item) => item.id === state.profileModule) || state.modules[0];
  if (!user || !module) return;
  const chartColors = PERSON_CHART_COLORS[user.name] || [PERSON_COLORS[user.name]];

  const dates = getDateList(state.records);
  const moduleRecords = state.records.filter(
    (record) => record.person === user.name && record.module === module.id
  );
  const questionTotals = dates.map((date) =>
    moduleRecords
      .filter((record) => record.date === date)
      .reduce((sum, record) => sum + Number(record.questionCount || 0), 0)
  );
  const accuracyTotals = dates.map((date) => {
    const dailyRecords = moduleRecords.filter((record) => record.date === date);
    const questions = dailyRecords.reduce((sum, record) => sum + Number(record.questionCount || 0), 0);
    const correct = dailyRecords.reduce((sum, record) => sum + Number(record.correctCount || 0), 0);
    return questions ? correct / questions : 0;
  });

  if (state.charts.moduleQuestionTrend) state.charts.moduleQuestionTrend.destroy();
  if (state.charts.moduleAccuracyTrend) state.charts.moduleAccuracyTrend.destroy();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: CHART_TEXT_COLOR }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: CHART_TEXT_COLOR }, grid: { color: CHART_GRID_COLOR } },
    },
  };

  state.charts.moduleQuestionTrend = new Chart(document.getElementById('moduleQuestionTrendChart'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: '答题总数',
        data: questionTotals,
        borderColor: chartColors[1] || chartColors[0],
        backgroundColor: `${chartColors[1] || chartColors[0]}22`,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
      }],
    },
    options: chartOptions,
  });

  state.charts.moduleAccuracyTrend = new Chart(document.getElementById('moduleAccuracyTrendChart'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: '正确率',
        data: accuracyTotals,
        borderColor: chartColors[2] || chartColors[0],
        backgroundColor: `${chartColors[2] || chartColors[0]}22`,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
      }],
    },
    options: {
      ...chartOptions,
      scales: {
        ...chartOptions.scales,
        y: {
          ...chartOptions.scales.y,
          min: 0,
          max: 1,
          ticks: {
            color: CHART_TEXT_COLOR,
            callback: (value) => `${value * 100}%`,
          },
        },
      },
    },
  });
}

function renderTable() {
  const tbody = document.getElementById('recordTableBody');
  const filtered = getFilteredRecords().sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.tablePageSize));
  state.tablePage = Math.min(state.tablePage, totalPages);
  const startIndex = (state.tablePage - 1) * state.tablePageSize;
  const pageRecords = filtered.slice(startIndex, startIndex + state.tablePageSize);

  tbody.innerHTML = pageRecords
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

  const pagination = document.getElementById('tablePagination');
  if (!filtered.length) {
    pagination.innerHTML = '<span class="table-pagination-info">暂无符合条件的记录</span>';
    return;
  }

  const pageButtons = Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;
    return `<button type="button" class="table-page-button${page === state.tablePage ? ' active' : ''}" data-page="${page}">${page}</button>`;
  }).join('');

  pagination.innerHTML = `
    <span class="table-pagination-info">共 ${filtered.length} 条，每页 ${state.tablePageSize} 条</span>
    <div class="table-pagination-actions">
      <button type="button" class="table-page-button" data-page="${state.tablePage - 1}" ${state.tablePage === 1 ? 'disabled' : ''}>上一页</button>
      ${pageButtons}
      <button type="button" class="table-page-button" data-page="${state.tablePage + 1}" ${state.tablePage === totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  `;
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

  const switcher = document.getElementById('profilePersonSwitcher');
  switcher.innerHTML = state.users
    .map((user) => `<button class="profile-person-button" type="button" data-person="${user.name}">${user.name}</button>`)
    .join('');

  const moduleSwitcher = document.getElementById('profileModuleSwitcher');
  moduleSwitcher.innerHTML = state.modules
    .map((module) => `<button class="profile-module-button" type="button" data-module="${module.id}">${module.name}</button>`)
    .join('');

  if (!state.modules.some((module) => module.id === state.profileModule)) {
    state.profileModule = state.modules[0]?.id || '';
  }

  if (!state.users.some((user) => user.name === state.profilePerson)) {
    state.profilePerson = state.users[0]?.name || '';
  }

  document.getElementById('recordDate').valueAsDate = new Date();
  initOverviewDateControl();
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

  const dateControl = document.getElementById('overviewDateControl');
  if (dateControl) {
    dateControl.style.display = viewName === 'overview' ? '' : 'none';
  }
}

function bindHeatmapTooltip() {
  // ECharts 已经内置悬停提示，不需要额外处理
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      setActiveView(button.dataset.view);
    });
  });

  document.getElementById('personFilter').addEventListener('change', (e) => {
    state.selectedPerson = e.target.value;
    state.tablePage = 1;
    renderTable();
  });

  document.getElementById('moduleFilter').addEventListener('change', (e) => {
    state.selectedModule = e.target.value;
    state.tablePage = 1;
    renderTable();
  });

  document.getElementById('tablePagination').addEventListener('click', (e) => {
    const button = e.target.closest('[data-page]');
    if (!button || button.disabled) return;
    state.tablePage = Number(button.dataset.page);
    renderTable();
  });

  document.getElementById('overviewDate').addEventListener('change', (e) => {
    applyOverviewDate(e.target.value);
  });

  document.getElementById('overviewDate').addEventListener('input', (e) => {
    applyOverviewDate(e.target.value);
  });

  document.getElementById('overviewTodayBtn').addEventListener('click', () => {
    applyOverviewDate('');
  });

  document.getElementById('profilePersonSwitcher').addEventListener('click', (e) => {
    const button = e.target.closest('.profile-person-button');
    if (!button) return;
    state.profilePerson = button.dataset.person;
    renderProfileOverview();
    renderProfileTrend();
    renderModuleGrid();
    renderModuleCharts();
  });

  document.getElementById('profileModuleSwitcher').addEventListener('click', (e) => {
    const button = e.target.closest('.profile-module-button');
    if (!button) return;
    state.profileModule = button.dataset.module;
    document.querySelectorAll('.profile-module-button').forEach((item) => {
      item.classList.toggle('active', item.dataset.module === state.profileModule);
    });
    renderModuleGrid();
    renderModuleCharts();
  });

  document.getElementById('recordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const questionCount = Number(document.getElementById('questionCount').value);
    const correctCount = Number(document.getElementById('correctCount').value);
    const formMessage = document.getElementById('formMessage');

    if (correctCount > questionCount) {
      formMessage.textContent = '正确数量不能大于题目数量';
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

    formMessage.textContent = '正在提交...';

    if (WORKER_URL) {
      try {
        const response = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newRecord),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
          formMessage.textContent = `提交失败: ${result.error || response.status}`;
          return;
        }
        state.records.push(newRecord);
        form.reset();
        document.getElementById('recordDate').valueAsDate = new Date();
        formMessage.textContent = '记录已保存到 GitHub，正在刷新数据...';
        const newRecords = await loadJson('./data/records.json');
        state.records = mergeRecords(newRecords);
        renderAll();
      } catch (error) {
        formMessage.textContent = '提交失败，请检查网络或 Worker 配置';
      }
    } else {
      // 尚未配置 Worker 时，退回本机保存
      state.records.push(newRecord);
      saveLocalRecord(newRecord);
      form.reset();
      document.getElementById('recordDate').valueAsDate = new Date();
      formMessage.textContent = '记录已保存到本机浏览器（未配置 Worker）';
      renderAll();
    }
  });

  document.getElementById('refreshDataBtn').addEventListener('click', async () => {
    const newUsers = await loadJson('./data/users.json');
    const newModules = await loadJson('./data/modules.json');
    const newRecords = await loadJson('./data/records.json');
    state.users = newUsers;
    state.modules = newModules;
    state.records = mergeRecords(newRecords);
    populateFilters();
    renderAll();
    bindHeatmapTooltip();
  });

  // 跨移动端断点时自动重绘热力图，避免布局残留
  let lastCompactHeatmap = isCompactHeatmap();
  window.addEventListener('resize', () => {
    const compact = isCompactHeatmap();
    if (compact !== lastCompactHeatmap) {
      lastCompactHeatmap = compact;
      renderHeatmap();
    }
  });
}

function renderAll() {
  renderSummary();
  renderDailyPieCharts();
  renderHeatmap();
  bindHeatmapTooltip();
  renderRadarChart();
  renderLineChart();
  renderBarChart();
  renderProfileOverview();
  renderProfileTrend();
  renderModuleGrid();
  renderModuleCharts();
  document.querySelectorAll('.profile-module-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.module === state.profileModule);
  });
  renderTable();
}

async function init() {
  try {
    state.users = await loadJson('./data/users.json');
    state.modules = await loadJson('./data/modules.json');
    state.records = mergeRecords(await loadJson('./data/records.json'));
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
