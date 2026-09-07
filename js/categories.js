/**
 * CATEGORIES.JS — Предустановленные категории для подростков и управление ими
 */

import { getCategories, saveCategories, addCategory, deleteCategory } from './db.js';

export const DEFAULT_CATEGORIES = [
  // Расходы
  { id: 'cat_fastfood', name: 'Фастфуд и кафе', type: 'expense', icon: '🍔', color: '#f97316', budget: 40 },
  { id: 'cat_games', name: 'Игры и подписки', type: 'expense', icon: '🎮', color: '#8b5cf6', budget: 25 },
  { id: 'cat_transport', name: 'Транспорт', type: 'expense', icon: '🚌', color: '#06b6d4', budget: 20 },
  { id: 'cat_shopping', name: 'Одежда и шопинг', type: 'expense', icon: '👕', color: '#ec4899', budget: 80 },
  { id: 'cat_fun', name: 'Развлечения', type: 'expense', icon: '🍿', color: '#eab308', budget: 35 },
  { id: 'cat_gifts_friends', name: 'Подарки друзьям', type: 'expense', icon: '🎁', color: '#ef4444', budget: 25 },
  { id: 'cat_study', name: 'Учеба и книги', type: 'expense', icon: '📚', color: '#3b82f6', budget: 15 },
  { id: 'cat_savings', name: 'В копилку', type: 'expense', icon: '🐷', color: '#10b981', budget: 0 },
  { id: 'cat_mobile', name: 'Связь и интернет', type: 'expense', icon: '📱', color: '#6366f1', budget: 15 },
  { id: 'cat_other_exp', name: 'Другое', type: 'expense', icon: '✨', color: '#64748b', budget: 0 },

  // Доходы
  { id: 'cat_pocket', name: 'Карманные деньги', type: 'income', icon: '💵', color: '#10b981' },
  { id: 'cat_part_time', name: 'Подработка', type: 'income', icon: '💼', color: '#6366f1' },
  { id: 'cat_gifts_in', name: 'Подарки', type: 'income', icon: '🎉', color: '#f59e0b' },
  { id: 'cat_sale', name: 'Продажа вещей', type: 'income', icon: '📦', color: '#ec4899' },
  { id: 'cat_cashback', name: 'Кешбэк и бонусы', type: 'income', icon: '⚡', color: '#06b6d4' },
  { id: 'cat_other_in', name: 'Другой доход', type: 'income', icon: '💰', color: '#14b8a6' }
];

export async function loadCategories() {
  const saved = await getCategories();
  if (!saved || saved.length === 0) {
    await saveCategories(DEFAULT_CATEGORIES);
    return DEFAULT_CATEGORIES;
  }
  return saved;
}

export function getCategoryMeta(categoryName, categoriesList = DEFAULT_CATEGORIES) {
  const found = categoriesList.find((c) => c.name.toLowerCase() === (categoryName || '').toLowerCase());
  if (found) return found;
  return {
    id: 'unknown',
    name: categoryName || 'Без категории',
    type: 'expense',
    icon: '🏷️',
    color: '#6366f1'
  };
}

export async function createNewCategory({ name, type, icon, color, budget = 0 }) {
  const newCat = {
    id: 'cat_' + Date.now(),
    name: name.trim(),
    type: type || 'expense',
    icon: icon || '🏷️',
    color: color || '#6366f1',
    budget: Number(budget) || 0
  };
  await addCategory(newCat);
  return newCat;
}

export async function removeCategory(catId) {
  return await deleteCategory(catId);
}
