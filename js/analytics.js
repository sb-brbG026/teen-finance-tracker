/**
 * ANALYTICS.JS — Аналитика, расчеты баланса и рендеринг интерактивных графиков (Canvas)
 */

import { getCategoryMeta } from './categories.js';

export function calculateSummary(transactions, period = 'all') {
  const filtered = filterTransactionsByPeriod(transactions, period);

  let totalIncome = 0;
  let totalExpense = 0;

  const expenseByCategory = {};
  const incomeByCategory = {};

  filtered.forEach((t) => {
    const amount = Number(t.amount) || 0;
    if (t.type === 'income') {
      totalIncome += amount;
      incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + amount;
    } else {
      totalExpense += amount;
      expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + amount;
    }
  });

  const balance = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100)) : 0;

  return {
    totalIncome,
    totalExpense,
    balance,
    savingsRate,
    expenseByCategory,
    incomeByCategory,
    transactionCount: filtered.length
  };
}

export function filterTransactionsByPeriod(transactions, period) {
  if (period === 'all') return transactions;

  const now = new Date();
  let startDate = new Date();

  if (period === 'week') {
    startDate.setDate(now.getDate() - 7);
  } else if (period === 'month') {
    startDate.setMonth(now.getMonth() - 1);
  } else if (period === 'year') {
    startDate.setFullYear(now.getFullYear() - 1);
  }

  return transactions.filter((t) => new Date(t.date) >= startDate);
}

/**
 * Рендерит современный Donut Chart (Круговая диаграмма) на Canvas и легенду под ним
 */
export function renderDonutChart(canvas, categoryData, categoriesList, legendContainer = null) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = (rect.width || 280) * dpr;
  canvas.height = 200 * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width || 280;
  const height = 200;
  ctx.clearRect(0, 0, width, height);

  const entries = Object.entries(categoryData).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, val]) => sum + val, 0);

  if (legendContainer) {
    legendContainer.innerHTML = '';
  }

  if (total === 0 || entries.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Нет данных о расходах за период', width / 2, height / 2);

    if (legendContainer) {
      legendContainer.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center; grid-column: 1 / -1; padding: 8px 0;">Нет расходов за выбранный период</div>';
    }
    return;
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const outerRadius = Math.min(centerX, centerY) - 15;
  const innerRadius = outerRadius * 0.65;

  let startAngle = -Math.PI / 2;

  entries.forEach(([catName, amount]) => {
    const meta = getCategoryMeta(catName, categoriesList);
    const sliceAngle = (amount / total) * 2 * Math.PI;

    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, startAngle, startAngle + sliceAngle);
    ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();

    ctx.fillStyle = meta.color || '#6366f1';
    ctx.fill();

    // Разделительная линия между долями
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.stroke();

    startAngle += sliceAngle;
  });

  // Текст в центре
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#f8fafc';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatMoneyShort(total), centerX, centerY - 8);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px sans-serif';
  ctx.fillText('Всего трат', centerX, centerY + 14);

  // Рендер наглядной легенды под круговой диаграммой
  if (legendContainer) {
    entries.forEach(([catName, amount]) => {
      const meta = getCategoryMeta(catName, categoriesList);
      const percent = Math.round((amount / total) * 100);

      const item = document.createElement('div');
      item.className = 'donut-legend-item';
      item.innerHTML = `
        <div class="donut-legend-dot" style="background: ${meta.color || '#6366f1'};"></div>
        <div class="donut-legend-info">
          <div class="donut-legend-name" title="${catName}">${meta.icon || '📦'} ${catName}</div>
          <div class="donut-legend-meta">
            <span class="donut-legend-percent">${percent}%</span>
            <span>${formatMoneyShort(amount)}</span>
          </div>
        </div>
      `;
      legendContainer.appendChild(item);
    });
  }
}

/**
 * Рендерит горизонтальную столбчатую диаграмму (рейтинг расходов по категориям)
 * Идеально для узких экранов смартфонов: названия не режутся, длина полосы наглядно сравнима
 */
export function renderCategoryHorizontalBars(container, categoryData, categoriesList, totalExpense) {
  if (!container) return;
  container.innerHTML = '';

  const entries = Object.entries(categoryData).sort((a, b) => b[1] - a[1]);
  const total = totalExpense || entries.reduce((sum, [, val]) => sum + val, 0);

  if (total === 0 || entries.length === 0) {
    container.innerHTML = `
      <div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 24px 12px;">
        Нет данных о расходах за выбранный период
      </div>
    `;
    return;
  }

  // Находим максимум для относительного масштабирования полос
  const maxVal = entries[0][1] || 1;

  entries.forEach(([catName, amount]) => {
    const meta = getCategoryMeta(catName, categoriesList);
    const percent = Math.round((amount / total) * 100);
    const barWidthPercent = Math.max(4, Math.round((amount / maxVal) * 100));

    const item = document.createElement('div');
    item.className = 'cat-bar-item';
    item.innerHTML = `
      <div class="cat-bar-header">
        <div class="cat-bar-title">
          <span>${meta.icon || '📦'}</span>
          <span>${catName}</span>
        </div>
        <div class="cat-bar-values">
          <span style="color: var(--text-primary); margin-right: 6px;">${formatMoneyShort(amount)}</span>
          <span style="color: var(--text-muted); font-size: 11px;">(${percent}%)</span>
        </div>
      </div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width: ${barWidthPercent}%; background: ${meta.color || '#6366f1'}; box-shadow: 0 0 10px ${meta.color || '#6366f1'}33;"></div>
      </div>
    `;
    container.appendChild(item);
  });
}

/**
 * Рендерит столбчатый график динамики трат за последние 7 дней
 */
export function renderBarChart(canvas, transactions) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = (rect.width || 320) * dpr;
  canvas.height = 160 * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width || 320;
  const height = 160;
  ctx.clearRect(0, 0, width, height);

  // Собираем последние 7 дней
  const days = [];
  const now = new Date();
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    days.push({
      dateStr,
      label: dayNames[d.getDay()],
      amount: 0
    });
  }

  transactions.forEach((t) => {
    if (t.type === 'expense') {
      const match = days.find((d) => d.dateStr === t.date);
      if (match) {
        match.amount += Number(t.amount) || 0;
      }
    }
  });

  const maxAmount = Math.max(...days.map((d) => d.amount), 100);
  const chartHeight = height - 40;
  const barWidth = Math.min(28, (width - 40) / 7 - 10);
  const spacing = (width - 30) / 7;

  days.forEach((day, index) => {
    const x = 20 + index * spacing + (spacing - barWidth) / 2;
    const barH = (day.amount / maxAmount) * (chartHeight - 20);
    const y = chartHeight - barH;

    // Фон столбика (пустой слот)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.roundRect(x, 10, barWidth, chartHeight - 10, 6);
    ctx.fill();

    // Заполненный столбик
    if (day.amount > 0) {
      const gradient = ctx.createLinearGradient(0, y, 0, chartHeight);
      gradient.addColorStop(0, '#f43f5e');
      gradient.addColorStop(1, '#6366f1');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [6, 6, 2, 2]);
      ctx.fill();
    }

    // Подпись дня
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(day.label, x + barWidth / 2, height - 12);
  });
}

/**
 * Рендерит шкалы бюджетов по категориям
 */
export function renderBudgetBars(containerEl, transactions, categoriesList) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  const currentMonthTxs = filterTransactionsByPeriod(transactions, 'month');
  const spentByCat = {};
  currentMonthTxs.forEach((t) => {
    if (t.type === 'expense') {
      spentByCat[t.category] = (spentByCat[t.category] || 0) + (Number(t.amount) || 0);
    }
  });

  const budgetedCategories = categoriesList.filter((c) => c.type === 'expense' && Number(c.budget) > 0);

  if (budgetedCategories.length === 0) {
    containerEl.innerHTML = `
      <div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 12px;">
        Установи лимиты трат в категориях, чтобы контролировать бюджет!
      </div>
    `;
    return;
  }

  budgetedCategories.forEach((cat) => {
    const spent = spentByCat[cat.name] || 0;
    const limit = cat.budget;
    const percent = Math.min(150, Math.round((spent / limit) * 100));
    const isExceeded = spent > limit;
    const isWarning = !isExceeded && percent >= 80;

    const fillGrad = isExceeded
      ? 'var(--danger)'
      : isWarning
      ? 'var(--warning)'
      : 'var(--success)';

    const item = document.createElement('div');
    item.style.marginBottom = '12px';
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
        <span style="font-weight: 600;">${cat.icon} ${cat.name}</span>
        <span style="font-weight: 700; color: ${isExceeded ? 'var(--danger)' : 'var(--text-secondary)'};">
          ${formatMoneyShort(spent)} / ${formatMoneyShort(limit)} ${isExceeded ? '⚠️ Превышен!' : ''}
        </span>
      </div>
      <div style="width: 100%; height: 8px; background: var(--tag-bg); border-radius: 999px; overflow: hidden;">
        <div style="width: ${Math.min(100, percent)}%; height: 100%; background: ${fillGrad}; border-radius: 999px; transition: width 0.4s ease;"></div>
      </div>
    `;
    containerEl.appendChild(item);
  });
}

function formatMoneyShort(val) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(num);
}
