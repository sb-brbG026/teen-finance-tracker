/**
 * APP.JS — Главный контроллер приложения TeenFlow
 */

import {
  initDB,
  getTransactions,
  addTransaction,
  deleteTransaction,
  getGoals,
  addCategory,
  deleteCategory,
  saveGoal,
  getSetting,
  setSetting,
  exportAllData,
  importAllData,
  seedDemoData
} from './db.js';

import { loadCategories, getCategoryMeta, createNewCategory, removeCategory } from './categories.js';
import { loadGoals, addSavingsGoal, contributeToGoal, removeGoal, renderGoalCards } from './goals.js';
import { calculateSummary, renderDonutChart, renderBarChart, renderBudgetBars } from './analytics.js';
import { generateSmartSummaryTip, askAdvisor, DEFAULT_GEMINI_API_KEY } from './ai-advisor.js';
import { GUIDES_DATA, QUIZ_QUESTIONS } from './guides.js';
import {
  getSheetsWebhookUrl,
  saveSheetsWebhookUrl,
  testSheetsConnection,
  syncTransactionToSheets,
  batchSyncAllToSheets,
  exportToCSV,
  importFromCSV
} from './sheets-sync.js';

// Состояние приложения
const state = {
  currentTab: 'home',
  theme: 'dark',
  transactions: [],
  categories: [],
  goals: [],
  activeFilter: 'all',
  activePeriod: 'month',
  deferredInstallPrompt: null
};

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  await initDB();
  await refreshData();
  initNavigation();
  initEventListeners();
  initServiceWorker();
  renderApp();
});

// === ТЕМА ОФОРМЛЕНИЯ ===

async function initTheme() {
  const savedTheme = await getSetting('app_theme', 'dark');
  state.theme = savedTheme;
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeToggleIcon();
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  setSetting('app_theme', state.theme);
  updateThemeToggleIcon();
  vibrate(30);
  // Перерисовываем графики под новую тему
  renderAnalyticsTab();
}

function updateThemeToggleIcon() {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    btn.textContent = state.theme === 'dark' ? '☀️' : '🌙';
  }
}

// === НАВИГАЦИЯ ПО ВКЛАДКАМ ===

function initNavigation() {
  const navButtons = document.querySelectorAll('.bottom-nav .nav-item:not(.nav-item-add)');
  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // Кнопка быстрого добавления в центре навбара
  const addBtn = document.getElementById('btn-add-main');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openAddTransactionModal('expense');
    });
  }

  // Кнопка переключения темы в шапке
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }
}

export function switchTab(tabName) {
  state.currentTab = tabName;
  vibrate(20);

  // Переключение контента
  document.querySelectorAll('.tab-content').forEach((el) => {
    el.classList.remove('active');
  });
  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) {
    targetTab.classList.add('active');
  }

  // Переключение активного пункта в навбаре
  document.querySelectorAll('.bottom-nav .nav-item').forEach((btn) => {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Вызов специфичных рендеров при переходе
  if (tabName === 'analytics') {
    renderAnalyticsTab();
  } else if (tabName === 'advisor') {
    renderAdvisorTab();
  } else if (tabName === 'guides') {
    renderGuidesTab();
  } else if (tabName === 'transactions') {
    renderTransactionsTab();
  } else if (tabName === 'home') {
    renderHomeTab();
  } else if (tabName === 'settings') {
    renderSettingsTab();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === ОБНОВЛЕНИЕ ДАННЫХ ===

async function refreshData() {
  state.transactions = await getTransactions();
  state.categories = await loadCategories();
  state.goals = await loadGoals();
}

async function renderApp() {
  renderHomeTab();
  renderTransactionsTab();
  renderAdvisorBanner();
}

// === ВКЛАДКА: ГЛАВНАЯ (ОБЗОР) ===

async function renderHomeTab() {
  const summary = calculateSummary(state.transactions, 'month');

  // Баланс и статистика
  const balanceEl = document.getElementById('hero-balance-val');
  const incomeEl = document.getElementById('hero-income-val');
  const expenseEl = document.getElementById('hero-expense-val');

  if (balanceEl) balanceEl.textContent = formatMoney(summary.balance);
  if (incomeEl) incomeEl.textContent = `+${formatMoney(summary.totalIncome)}`;
  if (expenseEl) expenseEl.textContent = `-${formatMoney(summary.totalExpense)}`;

  // Виджет копилок
  const goalsContainer = document.getElementById('home-goals-container');
  if (goalsContainer) {
    renderGoalCards(
      state.goals.slice(0, 2),
      goalsContainer,
      (goal) => openAddGoalMoneyModal(goal),
      (goal) => handleDeleteGoal(goal.id)
    );
  }

  // Последние 5 транзакций
  const recentListEl = document.getElementById('home-recent-txs');
  if (recentListEl) {
    renderTransactionList(state.transactions.slice(0, 5), recentListEl);
  }

  renderAdvisorBanner();
}

async function renderAdvisorBanner() {
  const tipEl = document.getElementById('home-advisor-tip');
  if (tipEl) {
    const tip = await generateSmartSummaryTip(state.transactions);
    tipEl.innerHTML = parseMarkdownToHtml(tip);
  }
}

// === ВКЛАДКА: ОПЕРАЦИИ (ИСТОРИЯ) ===

function renderTransactionsTab() {
  const container = document.getElementById('tx-full-list');
  if (!container) return;

  let filtered = [...state.transactions];

  if (state.activeFilter === 'expense') {
    filtered = filtered.filter((t) => t.type === 'expense');
  } else if (state.activeFilter === 'income') {
    filtered = filtered.filter((t) => t.type === 'income');
  }

  const searchQuery = (document.getElementById('tx-search-input')?.value || '').toLowerCase().trim();
  if (searchQuery) {
    filtered = filtered.filter((t) => {
      return (
        (t.title && t.title.toLowerCase().includes(searchQuery)) ||
        (t.category && t.category.toLowerCase().includes(searchQuery)) ||
        (t.note && t.note.toLowerCase().includes(searchQuery))
      );
    });
  }

  renderTransactionList(filtered, container, true);
}

function renderTransactionList(transactions, containerEl, allowDelete = true) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  if (transactions.length === 0) {
    containerEl.innerHTML = `
      <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
        <div style="font-size: 36px; margin-bottom: 8px;">💸</div>
        <div style="font-weight: 700;">Операций пока нет</div>
        <div style="font-size: 13px; margin-top: 4px;">Нажми «+» чтобы записать первую покупку или карманные деньги!</div>
      </div>
    `;
    return;
  }

  // Группировка по датам в стиле iOS Inset Grouped
  const groups = {};
  transactions.forEach((tx) => {
    const dateKey = tx.date || 'Без даты';
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(tx);
  });

  const sortedDates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

  sortedDates.forEach((dateStr) => {
    const groupLabel = document.createElement('div');
    groupLabel.className = 'tx-date-group';
    groupLabel.textContent = formatDateLabel(dateStr);
    containerEl.appendChild(groupLabel);

    const groupCard = document.createElement('div');
    groupCard.className = 'tx-group-card';

    groups[dateStr].forEach((tx) => {
      const meta = getCategoryMeta(tx.category, state.categories);
      const isIncome = tx.type === 'income';

      const item = document.createElement('div');
      item.className = 'tx-item';
      item.id = `tx-item-${tx.id}`;
      item.innerHTML = `
        <div class="tx-left">
          <div class="tx-icon" style="background: ${meta.color}20; color: ${meta.color};">
            ${meta.icon}
          </div>
          <div class="tx-details">
            <span class="tx-title">${escapeHtml(tx.title || tx.category)}</span>
            <span class="tx-subtitle">${escapeHtml(tx.category)}${tx.note ? ' • ' + escapeHtml(tx.note) : ''}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center;">
          <span class="tx-amount ${isIncome ? 'income' : 'expense'}">
            ${isIncome ? '+' : '-'}${formatMoney(tx.amount)}
          </span>
          ${
            allowDelete
              ? `<button class="tx-delete-btn" data-id="${tx.id}" title="Удалить" aria-label="Удалить операцию">✕</button>`
              : ''
          }
        </div>
      `;

      if (allowDelete) {
        item.querySelector('.tx-delete-btn')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          await handleDeleteTransaction(tx.id);
        });
      }

      groupCard.appendChild(item);
    });

    containerEl.appendChild(groupCard);
  });
}

// === ВКЛАДКА: АНАЛИТИКА ===

function renderAnalyticsTab() {
  const summary = calculateSummary(state.transactions, state.activePeriod);

  // Общие цифры
  const inEl = document.getElementById('analytics-income-total');
  const expEl = document.getElementById('analytics-expense-total');
  const rateEl = document.getElementById('analytics-savings-rate');

  if (inEl) inEl.textContent = formatMoney(summary.totalIncome);
  if (expEl) expEl.textContent = formatMoney(summary.totalExpense);
  if (rateEl) rateEl.textContent = `${summary.savingsRate}%`;

  // Круговая диаграмма Donut
  const donutCanvas = document.getElementById('donut-chart-canvas');
  if (donutCanvas) {
    renderDonutChart(donutCanvas, summary.expenseByCategory, state.categories);
  }

  // Столбчатый график 7 дней
  const barCanvas = document.getElementById('bar-chart-canvas');
  if (barCanvas) {
    renderBarChart(barCanvas, state.transactions);
  }

  // Шкалы бюджетов
  const budgetContainer = document.getElementById('budget-bars-container');
  if (budgetContainer) {
    renderBudgetBars(budgetContainer, state.transactions, state.categories);
  }

  // Список категорий с суммами
  const catListContainer = document.getElementById('analytics-cat-breakdown');
  if (catListContainer) {
    catListContainer.innerHTML = '';
    const sorted = Object.entries(summary.expenseByCategory).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([catName, amt]) => {
      const meta = getCategoryMeta(catName, state.categories);
      const percent = summary.totalExpense > 0 ? Math.round((amt / summary.totalExpense) * 100) : 0;

      const row = document.createElement('div');
      row.className = 'tx-item';
      row.style.marginBottom = '6px';
      row.innerHTML = `
        <div class="tx-left">
          <div class="tx-icon" style="background: ${meta.color}20;">${meta.icon}</div>
          <div>
            <div class="tx-title">${escapeHtml(catName)}</div>
            <div class="tx-subtitle">${percent}% от расходов</div>
          </div>
        </div>
        <span class="tx-amount expense">${formatMoney(amt)}</span>
      `;
      catListContainer.appendChild(row);
    });
  }
}

// === ВКЛАДКА: ИИ-МЕНТОР ===

async function renderAdvisorTab() {
  const summaryBox = document.getElementById('advisor-insights-box');
  if (summaryBox) {
    const tip = await generateSmartSummaryTip(state.transactions);
    summaryBox.innerHTML = parseMarkdownToHtml(tip);
  }
}

// === ВКЛАДКА: ШКОЛА ДЕНЕГ (ГАЙДЫ) ===

function renderGuidesTab() {
  const container = document.getElementById('guides-list-container');
  if (!container) return;
  container.innerHTML = '';

  GUIDES_DATA.forEach((guide) => {
    const card = document.createElement('div');
    card.className = 'guide-card';
    card.innerHTML = `
      <div class="guide-icon-badge">${guide.icon}</div>
      <div class="guide-content">
        <h4>${escapeHtml(guide.title)}</h4>
        <p>${escapeHtml(guide.summary)}</p>
        <span class="guide-tag" style="background: ${guide.tagColor}20; color: ${guide.tagColor};">
          ${escapeHtml(guide.tag)} • ${guide.readTime}
        </span>
      </div>
    `;

    card.addEventListener('click', () => {
      openGuideModal(guide);
    });

    container.appendChild(card);
  });
}

// === ВКЛАДКА: НАСТРОЙКИ И СИНХРОНИЗАЦИЯ ===

async function renderSettingsTab() {
  const urlInput = document.getElementById('sheets-url-input');
  if (urlInput) {
    urlInput.value = await getSheetsWebhookUrl();
  }

  const geminiInput = document.getElementById('gemini-key-input');
  if (geminiInput) {
    const savedKey = await getSetting('gemini_api_key', '');
    geminiInput.value = savedKey || DEFAULT_GEMINI_API_KEY;
  }

  // Список категорий для настройки
  const catSettingsContainer = document.getElementById('categories-settings-list');
  if (catSettingsContainer) {
    catSettingsContainer.innerHTML = '';
    state.categories.forEach((cat) => {
      const row = document.createElement('div');
      row.className = 'tx-item';
      row.style.marginBottom = '6px';
      row.innerHTML = `
        <div class="tx-left">
          <span style="font-size: 22px;">${cat.icon}</span>
          <div>
            <div class="tx-title">${escapeHtml(cat.name)}</div>
            <div class="tx-subtitle">
              ${cat.type === 'expense' ? 'Расход' : 'Доход'}
              ${cat.budget ? ' • Лимит: ' + formatMoney(cat.budget) : ''}
            </div>
          </div>
        </div>
        <button class="tx-delete-btn btn-del-cat" data-id="${cat.id}" title="Удалить категорию">🗑️</button>
      `;

      row.querySelector('.btn-del-cat').addEventListener('click', async () => {
        await handleDeleteCategory(cat.id);
      });

      catSettingsContainer.appendChild(row);
    });
  }
}

// === МОДАЛЬНЫЕ ОКНА И ДЕЙСТВИЯ ===

let currentAddType = 'expense';
let selectedCategory = '';

export function openAddTransactionModal(type = 'expense') {
  currentAddType = type;
  const modal = document.getElementById('modal-add-tx');
  if (!modal) return;

  // Обновляем iOS переключатель доход/расход с плавающим слайдером
  const slider = document.getElementById('segmented-slider');
  const expBtn = document.getElementById('btn-type-expense');
  const incBtn = document.getElementById('btn-type-income');
  if (type === 'expense') {
    slider?.classList.remove('income');
    expBtn?.classList.add('active');
    incBtn?.classList.remove('active');
  } else {
    slider?.classList.add('income');
    incBtn?.classList.add('active');
    expBtn?.classList.remove('active');
  }

  // Заполняем дату сегодняшним днем
  const dateInput = document.getElementById('tx-input-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Сброс суммы и заметки
  const amountInput = document.getElementById('tx-input-amount');
  const titleInput = document.getElementById('tx-input-title');
  const noteInput = document.getElementById('tx-input-note');
  if (amountInput) amountInput.value = '';
  if (titleInput) titleInput.value = '';
  if (noteInput) noteInput.value = '';

  renderCategorySelectionGrid(type);

  modal.classList.add('active');
  vibrate(20);
}

function renderCategorySelectionGrid(type) {
  const grid = document.getElementById('tx-category-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const relevantCats = state.categories.filter((c) => c.type === type);
  selectedCategory = relevantCats[0]?.name || '';

  relevantCats.forEach((cat, idx) => {
    const tile = document.createElement('div');
    tile.className = `category-tile ${idx === 0 ? 'selected' : ''}`;
    tile.innerHTML = `
      <span class="tile-icon">${cat.icon}</span>
      <span class="tile-name">${escapeHtml(cat.name)}</span>
    `;

    tile.addEventListener('click', () => {
      document.querySelectorAll('#tx-category-grid .category-tile').forEach((t) => t.classList.remove('selected'));
      tile.classList.add('selected');
      selectedCategory = cat.name;
      vibrate(15);
    });

    grid.appendChild(tile);
  });
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// Добавление суммы в цель
function openAddGoalMoneyModal(goal) {
  const modal = document.getElementById('modal-goal-money');
  if (!modal) return;

  document.getElementById('goal-money-title').textContent = `Пополнить «${goal.name}»`;
  const amountInput = document.getElementById('goal-money-amount');
  if (amountInput) amountInput.value = '';

  const submitBtn = document.getElementById('btn-submit-goal-money');
  submitBtn.onclick = async () => {
    const amt = parseFloat(amountInput.value);
    if (!amt || amt <= 0) {
      showToast('Введи корректную сумму', 'error');
      return;
    }
    await contributeToGoal(goal.id, amt);
    // Также запишем операцию "В копилку"
    await addTransaction({
      date: new Date().toISOString().split('T')[0],
      type: 'expense',
      category: 'В копилку',
      amount: amt,
      title: `В цель: ${goal.name}`,
      note: 'Пополнение копилки'
    });

    closeModal('modal-goal-money');
    showToast(`В копилку добавлено ${formatMoney(amt)}! 🎯`, 'success');
    vibrate([40, 60, 40]);
    await refreshData();
    renderApp();
  };

  modal.classList.add('active');
}

// Открытие гайда
function openGuideModal(guide) {
  const modal = document.getElementById('modal-guide-detail');
  if (!modal) return;

  document.getElementById('guide-detail-title').textContent = guide.title;
  document.getElementById('guide-detail-body').innerHTML = guide.content;
  modal.classList.add('active');
}

// Удаление транзакции с Undo Snackbar (Material 3 / iOS HIG)
let pendingDeletedTx = null;
let undoTimeoutId = null;

async function handleDeleteTransaction(id) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;

  // Оптимистичное мгновенное удаление из UI
  state.transactions = state.transactions.filter((t) => t.id !== id);
  vibrate([20, 30]);
  renderApp();

  // Если уже было отложенное удаление, коммитим его в базу
  if (pendingDeletedTx) {
    await deleteTransaction(pendingDeletedTx.id);
  }
  pendingDeletedTx = tx;

  // Показываем Undo Snackbar
  const snackbar = document.getElementById('undo-snackbar');
  const snackbarText = document.getElementById('snackbar-text');
  const undoBtn = document.getElementById('snackbar-undo-btn');

  if (snackbar) {
    if (snackbarText) {
      snackbarText.innerHTML = `🗑️ Удалено: <strong>${escapeHtml(tx.title || tx.category)}</strong> (${formatMoney(tx.amount)})`;
    }
    snackbar.classList.add('show');

    if (undoTimeoutId) clearTimeout(undoTimeoutId);

    // 5 секунд на отмену, затем окончательное удаление из БД
    undoTimeoutId = setTimeout(async () => {
      snackbar.classList.remove('show');
      if (pendingDeletedTx) {
        await deleteTransaction(pendingDeletedTx.id);
        pendingDeletedTx = null;
      }
    }, 5000);

    undoBtn.onclick = async () => {
      if (undoTimeoutId) clearTimeout(undoTimeoutId);
      snackbar.classList.remove('show');
      if (pendingDeletedTx) {
        state.transactions.unshift(pendingDeletedTx);
        state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        pendingDeletedTx = null;
        vibrate(30);
        showToast('Операция восстановлена! ↩️', 'success');
        renderApp();
      }
    };
  }
}

// Удаление цели
async function handleDeleteGoal(id) {
  if (confirm('Удалить эту цель накопления?')) {
    await removeGoal(id);
    showToast('Цель удалена', 'info');
    await refreshData();
    renderHomeTab();
  }
}

// Удаление категории
async function handleDeleteCategory(id) {
  if (confirm('Удалить категорию?')) {
    await removeCategory(id);
    showToast('Категория удалена', 'info');
    await refreshData();
    renderSettingsTab();
  }
}

// === ОБРАБОТЧИКИ СОБЫТИЙ ===

function initEventListeners() {
  // Быстрые кнопки на главном экране
  document.getElementById('quick-add-income')?.addEventListener('click', () => {
    openAddTransactionModal('income');
  });

  document.getElementById('quick-add-expense')?.addEventListener('click', () => {
    openAddTransactionModal('expense');
  });

  document.getElementById('quick-sync-btn')?.addEventListener('click', async () => {
    await handleSyncWithSheets();
  });

  // Закрытие модалок
  document.querySelectorAll('.btn-close-modal').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  // Закрытие по клику на оверлей
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  // iOS Переключение типа в модалке (Расход/Доход) со слайдером
  document.getElementById('btn-type-expense')?.addEventListener('click', () => {
    currentAddType = 'expense';
    document.getElementById('segmented-slider')?.classList.remove('income');
    document.getElementById('btn-type-expense')?.classList.add('active');
    document.getElementById('btn-type-income')?.classList.remove('active');
    renderCategorySelectionGrid('expense');
    vibrate(15);
  });

  document.getElementById('btn-type-income')?.addEventListener('click', () => {
    currentAddType = 'income';
    document.getElementById('segmented-slider')?.classList.add('income');
    document.getElementById('btn-type-income')?.classList.add('active');
    document.getElementById('btn-type-expense')?.classList.remove('active');
    renderCategorySelectionGrid('income');
    vibrate(15);
  });

  // Быстрые суммы (+100, +500, +1000)
  document.querySelectorAll('.quick-amount-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const addAmt = Number(pill.getAttribute('data-amt')) || 0;
      const input = document.getElementById('tx-input-amount');
      if (input) {
        const current = Number(input.value) || 0;
        input.value = current + addAmt;
        vibrate(15);
      }
    });
  });

  // Сабмит новой транзакции
  document.getElementById('form-add-tx')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('tx-input-amount')?.value);
    const date = document.getElementById('tx-input-date')?.value || new Date().toISOString().split('T')[0];
    const title = document.getElementById('tx-input-title')?.value.trim();
    const note = document.getElementById('tx-input-note')?.value.trim();

    if (!amount || amount <= 0) {
      showToast('Введи сумму больше 0', 'error');
      return;
    }

    const tx = {
      date,
      type: currentAddType,
      category: selectedCategory || (currentAddType === 'income' ? 'Другой доход' : 'Другое'),
      amount,
      title: title || selectedCategory,
      note
    };

    await addTransaction(tx);
    closeModal('modal-add-tx');
    showToast(currentAddType === 'income' ? `+${formatMoney(amount)} записано!` : `-${formatMoney(amount)} записано!`, 'success');
    vibrate(30);

    // Фоновая синхронизация с Google Таблицей, если настроена
    syncTransactionToSheets(tx).catch(console.warn);

    await refreshData();
    renderApp();
  });

  // Фильтры в списке операций
  document.querySelectorAll('#tx-filters .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#tx-filters .chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeFilter = chip.getAttribute('data-filter');
      vibrate(15);
      renderTransactionsTab();
    });
  });

  // Поиск по операциям
  document.getElementById('tx-search-input')?.addEventListener('input', () => {
    renderTransactionsTab();
  });

  // Фильтры периода в аналитике
  document.querySelectorAll('#analytics-period-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#analytics-period-chips .chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.activePeriod = chip.getAttribute('data-period');
      vibrate(15);
      renderAnalyticsTab();
    });
  });

  // Вопросы к ИИ-консультанту
  document.querySelectorAll('.ai-prompt-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const q = btn.textContent.trim();
      await handleAskAdvisor(q);
    });
  });

  document.getElementById('btn-send-advisor')?.addEventListener('click', async () => {
    const input = document.getElementById('advisor-custom-input');
    const q = input?.value.trim();
    if (!q) return;
    input.value = '';
    await handleAskAdvisor(q);
  });

  // Создание новой цели
  document.getElementById('btn-open-create-goal')?.addEventListener('click', () => {
    const modal = document.getElementById('modal-create-goal');
    if (modal) modal.classList.add('active');
  });

  document.getElementById('form-create-goal')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name-input')?.value;
    const target = parseFloat(document.getElementById('goal-target-input')?.value);
    const icon = document.getElementById('goal-icon-input')?.value || '🎯';

    if (!name || !target || target <= 0) {
      showToast('Укажи название и сумму цели', 'error');
      return;
    }

    await addSavingsGoal({ name, targetAmount: target, icon });
    closeModal('modal-create-goal');
    showToast('Новая цель создана! 🚀', 'success');
    await refreshData();
    renderHomeTab();
  });

  // Создание новой категории в настройках
  document.getElementById('btn-open-create-category')?.addEventListener('click', () => {
    const modal = document.getElementById('modal-create-category');
    if (modal) modal.classList.add('active');
  });

  document.getElementById('form-create-category')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cat-name-input')?.value;
    const type = document.getElementById('cat-type-select')?.value;
    const icon = document.getElementById('cat-icon-input')?.value || '🏷️';
    const color = document.getElementById('cat-color-input')?.value || '#6366f1';
    const budget = parseFloat(document.getElementById('cat-budget-input')?.value) || 0;

    if (!name) {
      showToast('Укажи название категории', 'error');
      return;
    }

    await createNewCategory({ name, type, icon, color, budget });
    closeModal('modal-create-category');
    showToast('Категория добавлена', 'success');
    await refreshData();
    renderSettingsTab();
  });

  // Сохранение настроек Google Sheets и Gemini
  document.getElementById('btn-save-sheets-url')?.addEventListener('click', async () => {
    const url = document.getElementById('sheets-url-input')?.value;
    await saveSheetsWebhookUrl(url);
    showToast('Ссылка на Google Таблицу сохранена', 'success');
  });

  document.getElementById('btn-test-sheets')?.addEventListener('click', async () => {
    const url = document.getElementById('sheets-url-input')?.value;
    showToast('Проверяем связь...', 'info');
    const res = await testSheetsConnection(url);
    if (res.success) {
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'error');
    }
  });

  document.getElementById('btn-save-gemini-key')?.addEventListener('click', async () => {
    const key = document.getElementById('gemini-key-input')?.value;
    await setSetting('gemini_api_key', (key || '').trim());
    showToast('Gemini API ключ сохранен', 'success');
  });

  // Кнопка показа скрипта для копирования
  document.getElementById('btn-view-gas-script')?.addEventListener('click', () => {
    const modal = document.getElementById('modal-gas-script');
    if (modal) modal.classList.add('active');
  });

  // Экспорт и импорт
  document.getElementById('btn-export-csv')?.addEventListener('click', exportToCSV);

  document.getElementById('btn-export-json')?.addEventListener('click', async () => {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teenflow_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Резервная копия скачана', 'success');
  });

  document.getElementById('csv-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const count = await importFromCSV(file);
      showToast(`Импортировано транзакций: ${count}`, 'success');
      await refreshData();
      renderApp();
    } catch (err) {
      showToast('Ошибка импорта CSV: ' + err.message, 'error');
    }
    e.target.value = '';
  });

  // Заполнение демо-данными
  document.getElementById('btn-seed-demo')?.addEventListener('click', async () => {
    if (confirm('Заполнить приложение готовыми примерами операций и целей?')) {
      await seedDemoData();
      showToast('Демо-данные успешно добавлены! 🎉', 'success');
      await refreshData();
      renderApp();
    }
  });

  // Запуск финансового квиза
  document.getElementById('btn-start-quiz')?.addEventListener('click', startQuiz);

  // iOS-стиль: закрытие модальных окон свайпом вниз (Pull-to-dismiss)
  initModalSwipeToDismiss();
}

/**
 * Реализация нативного свайпа вниз для закрытия шторок модальных окон (iOS HIG)
 */
function initModalSwipeToDismiss() {
  document.querySelectorAll('.modal-overlay').forEach((modal) => {
    const sheet = modal.querySelector('.modal-sheet');
    if (!sheet) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    sheet.addEventListener('touchstart', (e) => {
      if (sheet.scrollTop <= 0) {
        startY = e.touches[0].clientY;
        isDragging = true;
        sheet.style.transition = 'none';
      }
    }, { passive: true });

    sheet.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      currentY = e.touches[0].clientY;
      const deltaY = currentY - startY;
      if (deltaY > 0) {
        sheet.style.transform = `translateY(${deltaY}px)`;
      }
    }, { passive: true });

    sheet.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;
      const deltaY = currentY - startY;
      sheet.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';

      if (deltaY > 80) {
        sheet.style.transform = 'translateY(100%)';
        vibrate(20);
        setTimeout(() => {
          modal.classList.remove('active');
          sheet.style.transform = '';
        }, 220);
      } else {
        sheet.style.transform = '';
      }
      startY = 0;
      currentY = 0;
    });
  });
}

// Отправка вопроса в ИИ-чат
async function handleAskAdvisor(question) {
  const chatContainer = document.getElementById('advisor-chat-messages');
  if (!chatContainer) return;

  // Сообщение пользователя
  const userMsg = document.createElement('div');
  userMsg.className = 'ai-bubble';
  userMsg.style.background = 'var(--primary-light)';
  userMsg.style.borderColor = 'rgba(99, 102, 241, 0.3)';
  userMsg.style.marginLeft = '20px';
  userMsg.innerHTML = `<strong>Ты:</strong> ${escapeHtml(question)}`;
  chatContainer.appendChild(userMsg);

  // Плейсхолдер ответа ИИ
  const aiMsg = document.createElement('div');
  aiMsg.className = 'ai-bubble animate-fade-in';
  aiMsg.innerHTML = `<em>Фин думает... 🤖</em>`;
  chatContainer.appendChild(aiMsg);
  aiMsg.scrollIntoView({ behavior: 'smooth' });

  try {
    const answer = await askAdvisor(question, state.transactions);
    aiMsg.innerHTML = parseMarkdownToHtml(answer);
    vibrate(20);
  } catch (err) {
    aiMsg.innerHTML = `⚠️ Ошибка: не удалось получить ответ.`;
  }
}

// Синхронизация с таблицей
async function handleSyncWithSheets() {
  showToast('Синхронизация с Google Таблицей...', 'info');
  try {
    const res = await batchSyncAllToSheets();
    showToast(`Успешно! Отправлено: ${res.count} строк 🎉`, 'success');
    vibrate([30, 50, 30]);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === ФИНАНСОВЫЙ КВИЗ ===

let currentQuestionIdx = 0;
let quizScore = 0;

function startQuiz() {
  currentQuestionIdx = 0;
  quizScore = 0;
  const modal = document.getElementById('modal-quiz');
  if (!modal) return;
  modal.classList.add('active');
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const container = document.getElementById('quiz-content');
  if (!container) return;

  if (currentQuestionIdx >= QUIZ_QUESTIONS.length) {
    // Конец квиза
    let badge = '⭐ Новичок в финансах';
    if (quizScore >= 4) badge = '👑 Фин-Магистр 80lvl';
    else if (quizScore >= 2) badge = '🚀 Продвинутый сберегатель';

    container.innerHTML = `
      <div style="text-align: center; padding: 20px 0;">
        <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
        <h3 style="font-size: 20px; font-weight: 800; margin-bottom: 8px;">Квиз завершен!</h3>
        <p style="font-size: 15px; color: var(--text-secondary); margin-bottom: 14px;">
          Правильных ответов: <strong>${quizScore} из ${QUIZ_QUESTIONS.length}</strong>
        </p>
        <div style="display: inline-block; padding: 8px 18px; border-radius: var(--radius-full); background: var(--purple-light); color: var(--purple); font-weight: 800; font-size: 15px; margin-bottom: 20px;">
          ${badge}
        </div>
        <button class="btn-primary btn-close-modal" style="margin-top: 10px;">Отлично!</button>
      </div>
    `;
    return;
  }

  const q = QUIZ_QUESTIONS[currentQuestionIdx];
  container.innerHTML = `
    <div style="font-size: 12px; font-weight: 700; color: var(--primary); margin-bottom: 6px;">
      Вопрос ${currentQuestionIdx + 1} из ${QUIZ_QUESTIONS.length}
    </div>
    <h4 style="font-size: 16px; font-weight: 700; margin-bottom: 16px;">${escapeHtml(q.question)}</h4>
    <div style="display: flex; flex-direction: column; gap: 10px;" id="quiz-options-box"></div>
    <div id="quiz-feedback" style="margin-top: 14px; font-size: 13px; display: none;"></div>
  `;

  const optBox = container.querySelector('#quiz-options-box');
  q.options.forEach((optText, idx) => {
    const btn = document.createElement('button');
    btn.className = 'btn-quick-action';
    btn.style.textAlign = 'left';
    btn.style.justifyContent = 'flex-start';
    btn.textContent = optText;

    btn.addEventListener('click', () => {
      handleQuizAnswer(idx, q);
    });

    optBox.appendChild(btn);
  });
}

function handleQuizAnswer(selectedIdx, questionData) {
  const isCorrect = selectedIdx === questionData.correct;
  if (isCorrect) quizScore++;

  const feedback = document.getElementById('quiz-feedback');
  if (feedback) {
    feedback.style.display = 'block';
    feedback.style.color = isCorrect ? 'var(--success)' : 'var(--danger)';
    feedback.innerHTML = `<strong>${isCorrect ? '✅ Правильно!' : '❌ Не совсем.'}</strong> ${questionData.explanation}`;
  }

  vibrate(isCorrect ? 30 : [50, 50]);

  // Блокируем кнопки
  document.querySelectorAll('#quiz-options-box button').forEach((b, idx) => {
    b.disabled = true;
    if (idx === questionData.correct) {
      b.style.borderColor = 'var(--success)';
      b.style.color = 'var(--success)';
    } else if (idx === selectedIdx && !isCorrect) {
      b.style.borderColor = 'var(--danger)';
      b.style.color = 'var(--danger)';
    }
  });

  setTimeout(() => {
    currentQuestionIdx++;
    renderQuizQuestion();
  }, 1800);
}

// === PWA & SERVICE WORKER ===

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(
      (reg) => console.log('SW зарегистрирован:', reg.scope),
      (err) => console.log('Ошибка регистрации SW:', err)
    );
  }

  // Перехват события установки PWA
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    const installBanner = document.getElementById('pwa-install-banner');
    if (installBanner) installBanner.style.display = 'flex';
  });

  document.getElementById('btn-pwa-install')?.addEventListener('click', async () => {
    if (state.deferredInstallPrompt) {
      state.deferredInstallPrompt.prompt();
      const { outcome } = await state.deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        const installBanner = document.getElementById('pwa-install-banner');
        if (installBanner) installBanner.style.display = 'none';
      }
      state.deferredInstallPrompt = null;
    }
  });
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (_) {}
  }
}

function formatMoney(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(num);
}

function formatDateLabel(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterday) return 'Вчера';

  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[m]);
}

function parseMarkdownToHtml(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  // Жирный шрифт **текст**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Курсив *текст*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Списки
  html = html.replace(/•\s+(.*?)(?=\n|$)/g, '<li>$1</li>');
  // Переносы строк
  html = html.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  return html;
}
