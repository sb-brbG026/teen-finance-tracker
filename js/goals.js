/**
 * GOALS.JS — Управление копилками и целями накоплений ("Копилка на мечту")
 */

import { getGoals, saveGoal, deleteGoal } from './db.js';

export async function loadGoals() {
  return await getGoals();
}

export async function addSavingsGoal({ name, targetAmount, currentAmount = 0, icon = '🎯', targetDate = '' }) {
  const goal = {
    id: 'goal_' + Date.now(),
    name: name.trim(),
    targetAmount: Math.max(1, Number(targetAmount)),
    currentAmount: Math.max(0, Number(currentAmount)),
    icon: icon || '🎯',
    targetDate: targetDate || '',
    createdAt: new Date().toISOString()
  };
  await saveGoal(goal);
  return goal;
}

export async function contributeToGoal(goalId, amount) {
  const goals = await getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return null;

  goal.currentAmount = Math.max(0, goal.currentAmount + Number(amount));
  await saveGoal(goal);
  return goal;
}

export async function removeGoal(goalId) {
  return await deleteGoal(goalId);
}

export function renderGoalCards(goals, containerEl, onAddMoneyClick, onDeleteClick) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  if (!goals || goals.length === 0) {
    containerEl.innerHTML = `
      <div style="text-align: center; padding: 24px 16px; color: var(--text-muted);">
        <div style="font-size: 36px; margin-bottom: 8px;">🎯</div>
        <div style="font-weight: 700; margin-bottom: 4px;">У тебя пока нет целей накопления</div>
        <div style="font-size: 13px;">Создай свою первую копилку на кроссовки, игру или подарок!</div>
      </div>
    `;
    return;
  }

  goals.forEach((goal) => {
    const percent = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
    const isCompleted = percent >= 100;
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

    const card = document.createElement('div');
    card.className = 'goal-card';
    card.innerHTML = `
      <div class="goal-top">
        <div class="goal-title-wrap">
          <span class="goal-icon">${goal.icon || '🎯'}</span>
          <div>
            <div class="goal-name">${escapeHtml(goal.name)}</div>
            <div class="goal-numbers">
              <span class="text-success font-bold">${formatMoney(goal.currentAmount)}</span> / ${formatMoney(goal.targetAmount)}
            </div>
          </div>
        </div>
        <span style="font-weight: 800; font-size: 14px; color: ${isCompleted ? 'var(--success)' : 'var(--primary)'};">
          ${isCompleted ? '🎉 Готово!' : `${percent}%`}
        </span>
      </div>

      <div class="goal-progress-bar">
        <div class="goal-progress-fill" style="width: ${percent}%; ${isCompleted ? 'background: var(--success);' : ''}"></div>
      </div>

      <div class="goal-footer">
        <span>${isCompleted ? 'Цель достигнута!' : `Осталось накопить: ${formatMoney(remaining)}`}</span>
        <div style="display: flex; gap: 6px;">
          <button class="btn-icon btn-add-money" data-id="${goal.id}" title="Добавить в копилку" style="width: 28px; height: 28px; font-size: 12px; color: var(--success);">
            ➕
          </button>
          <button class="btn-icon btn-delete-goal" data-id="${goal.id}" title="Удалить цель" style="width: 28px; height: 28px; font-size: 12px; color: var(--text-muted);">
            🗑️
          </button>
        </div>
      </div>
    `;

    card.querySelector('.btn-add-money').addEventListener('click', () => {
      if (onAddMoneyClick) onAddMoneyClick(goal);
    });

    card.querySelector('.btn-delete-goal').addEventListener('click', () => {
      if (onDeleteClick) onDeleteClick(goal);
    });

    containerEl.appendChild(card);
  });
}

function formatMoney(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(num);
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
