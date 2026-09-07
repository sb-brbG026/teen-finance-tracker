/**
 * DB.JS — Хранилище данных на IndexedDB с автоматическим fallback на localStorage
 */

const DB_NAME = 'TeenFlowDB';
const DB_VERSION = 1;

let dbInstance = null;

export async function initDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB не поддерживается, переключение на localStorage');
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('date', 'date', { unique: false });
        txStore.createIndex('category', 'category', { unique: false });
        txStore.createIndex('type', 'type', { unique: false });
      }

      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('goals')) {
        db.createObjectStore('goals', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Ошибка открытия IndexedDB:', event.target.error);
      resolve(null);
    };
  });
}

// Вспомогательные функции транзакций хранилища
async function getStore(storeName, mode = 'readonly') {
  const db = await initDB();
  if (!db) return null;
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

// === ТРАНЗАКЦИИ ===

export async function getTransactions() {
  const store = await getStore('transactions');
  if (!store) {
    const raw = localStorage.getItem('tf_transactions');
    return raw ? JSON.parse(raw) : [];
  }

  return new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const list = request.result || [];
      // Сортируем от новых к старым
      list.sort((a, b) => new Date(b.date) - new Date(a.date));
      resolve(list);
    };
    request.onerror = () => resolve([]);
  });
}

export async function addTransaction(transaction) {
  if (!transaction.id) {
    transaction.id = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }
  if (!transaction.createdAt) {
    transaction.createdAt = new Date().toISOString();
  }

  const store = await getStore('transactions', 'readwrite');
  if (!store) {
    const list = await getTransactions();
    list.unshift(transaction);
    localStorage.setItem('tf_transactions', JSON.stringify(list));
    return transaction;
  }

  return new Promise((resolve, reject) => {
    const request = store.put(transaction);
    request.onsuccess = () => resolve(transaction);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function updateTransaction(transaction) {
  if (!transaction || !transaction.id) {
    throw new Error('Transaction ID is required for update');
  }
  transaction.updatedAt = new Date().toISOString();

  const store = await getStore('transactions', 'readwrite');
  if (!store) {
    let list = await getTransactions();
    const idx = list.findIndex((t) => t.id === transaction.id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...transaction };
    } else {
      list.unshift(transaction);
    }
    localStorage.setItem('tf_transactions', JSON.stringify(list));
    return transaction;
  }

  return new Promise((resolve, reject) => {
    const request = store.put(transaction);
    request.onsuccess = () => resolve(transaction);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteTransaction(id) {
  const store = await getStore('transactions', 'readwrite');
  if (!store) {
    let list = await getTransactions();
    list = list.filter((t) => t.id !== id);
    localStorage.setItem('tf_transactions', JSON.stringify(list));
    return true;
  }

  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

// === КАТЕГОРИИ ===

export async function getCategories() {
  const store = await getStore('categories');
  if (!store) {
    const raw = localStorage.getItem('tf_categories');
    return raw ? JSON.parse(raw) : null;
  }

  return new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result && request.result.length > 0 ? request.result : null);
    request.onerror = () => resolve(null);
  });
}

export async function saveCategories(categoriesList) {
  const store = await getStore('categories', 'readwrite');
  if (!store) {
    localStorage.setItem('tf_categories', JSON.stringify(categoriesList));
    return categoriesList;
  }

  return new Promise((resolve) => {
    store.clear().onsuccess = () => {
      categoriesList.forEach((cat) => store.put(cat));
      resolve(categoriesList);
    };
  });
}

export async function addCategory(category) {
  if (!category.id) {
    category.id = 'cat_' + Date.now();
  }
  const store = await getStore('categories', 'readwrite');
  if (!store) {
    const cats = (await getCategories()) || [];
    cats.push(category);
    localStorage.setItem('tf_categories', JSON.stringify(cats));
    return category;
  }
  return new Promise((resolve) => {
    store.put(category).onsuccess = () => resolve(category);
  });
}

export async function deleteCategory(categoryId) {
  const store = await getStore('categories', 'readwrite');
  if (!store) {
    let cats = (await getCategories()) || [];
    cats = cats.filter(c => c.id !== categoryId);
    localStorage.setItem('tf_categories', JSON.stringify(cats));
    return true;
  }
  return new Promise((resolve) => {
    store.delete(categoryId).onsuccess = () => resolve(true);
  });
}

// === ЦЕЛИ / КОПИЛКА НА МЕЧТУ ===

export async function getGoals() {
  const store = await getStore('goals');
  if (!store) {
    const raw = localStorage.getItem('tf_goals');
    return raw ? JSON.parse(raw) : [];
  }

  return new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

export async function saveGoal(goal) {
  if (!goal.id) {
    goal.id = 'goal_' + Date.now();
  }
  const store = await getStore('goals', 'readwrite');
  if (!store) {
    const list = await getGoals();
    const idx = list.findIndex(g => g.id === goal.id);
    if (idx >= 0) list[idx] = goal;
    else list.push(goal);
    localStorage.setItem('tf_goals', JSON.stringify(list));
    return goal;
  }

  return new Promise((resolve) => {
    store.put(goal).onsuccess = () => resolve(goal);
  });
}

export async function deleteGoal(id) {
  const store = await getStore('goals', 'readwrite');
  if (!store) {
    let list = await getGoals();
    list = list.filter(g => g.id !== id);
    localStorage.setItem('tf_goals', JSON.stringify(list));
    return true;
  }

  return new Promise((resolve) => {
    store.delete(id).onsuccess = () => resolve(true);
  });
}

// === НАСТРОЙКИ ===

export async function getSetting(key, defaultValue = null) {
  const store = await getStore('settings');
  if (!store) {
    const val = localStorage.getItem('tf_set_' + key);
    return val !== null ? JSON.parse(val) : defaultValue;
  }

  return new Promise((resolve) => {
    const request = store.get(key);
    request.onsuccess = () => {
      resolve(request.result ? request.result.value : defaultValue);
    };
    request.onerror = () => resolve(defaultValue);
  });
}

export async function setSetting(key, value) {
  const store = await getStore('settings', 'readwrite');
  if (!store) {
    localStorage.setItem('tf_set_' + key, JSON.stringify(value));
    return value;
  }

  return new Promise((resolve) => {
    store.put({ key, value }).onsuccess = () => resolve(value);
  });
}

// === ЭКСПОРТ И ИМПОРТ ВСЕХ ДАННЫХ ===

export async function exportAllData() {
  const transactions = await getTransactions();
  const categories = await getCategories();
  const goals = await getGoals();
  return {
    version: 1,
    exportDate: new Date().toISOString(),
    transactions,
    categories,
    goals
  };
}

export async function importAllData(data) {
  if (!data) throw new Error('Файл резервной копии пуст');

  const txList = Array.isArray(data) ? data : data.transactions;
  if (!txList || !Array.isArray(txList)) {
    throw new Error('Некорректный формат: не найден список операций');
  }

  let categoriesCount = 0;
  if (Array.isArray(data.categories) && data.categories.length > 0) {
    await saveCategories(data.categories);
    categoriesCount = data.categories.length;
  }

  let txCount = 0;
  for (const t of txList) {
    await addTransaction(t);
    txCount++;
  }

  let goalsCount = 0;
  if (Array.isArray(data.goals)) {
    for (const g of data.goals) {
      await saveGoal(g);
      goalsCount++;
    }
  }

  return {
    transactionsCount: txCount,
    categoriesCount,
    goalsCount
  };
}

// === ГЕНЕРАТОР ДЕМО-ДАННЫХ ДЛЯ ТЕСТИРОВАНИЯ ===

export async function seedDemoData() {
  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];

  const d0 = fmt(today);
  const d1 = fmt(new Date(today.getTime() - 1 * 86400000));
  const d2 = fmt(new Date(today.getTime() - 3 * 86400000));
  const d3 = fmt(new Date(today.getTime() - 5 * 86400000));
  const d4 = fmt(new Date(today.getTime() - 8 * 86400000));

  const demoTxs = [
    { id: 'tx_demo_1', date: d4, type: 'income', category: 'Карманные деньги', amount: 50, title: 'Карманные на неделю', note: 'От родителей' },
    { id: 'tx_demo_2', date: d4, type: 'expense', category: 'Фастфуд и кафе', amount: 8, title: 'Кафе с друзьями', note: 'Комбо и напиток' },
    { id: 'tx_demo_3', date: d3, type: 'expense', category: 'Игры и подписки', amount: 6, title: 'Подписка на музыку', note: 'Музыкальный сервис' },
    { id: 'tx_demo_4', date: d3, type: 'income', category: 'Подработка', amount: 25, title: 'Помощь с сайтом', note: 'Сверстал баннер' },
    { id: 'tx_demo_5', date: d2, type: 'expense', category: 'Транспорт', amount: 2, title: 'Поездка на автобусе', note: 'Талончик' },
    { id: 'tx_demo_6', date: d2, type: 'expense', category: 'В копилку', amount: 15, title: 'Отложил на наушники', note: 'В цель AirPods' },
    { id: 'tx_demo_7', date: d1, type: 'expense', category: 'Развлечения', amount: 10, title: 'Билет в кино', note: 'Новый фильм' },
    { id: 'tx_demo_8', date: d0, type: 'income', category: 'Подарки', amount: 30, title: 'Подарок от бабушки', note: 'С Днем Рождения' },
    { id: 'tx_demo_9', date: d0, type: 'expense', category: 'Фастфуд и кафе', amount: 5, title: 'Бабл-ти и пончик', note: 'После школы' }
  ];

  for (const tx of demoTxs) {
    await addTransaction(tx);
  }

  // Демо-цели под цены Беларуси
  await saveGoal({
    id: 'goal_demo_1',
    name: 'Беспроводные наушники',
    targetAmount: 150,
    currentAmount: 60,
    icon: '🎧',
    targetDate: '2026-11-01'
  });

  await saveGoal({
    id: 'goal_demo_2',
    name: 'Новые кроссовки',
    targetAmount: 90,
    currentAmount: 75,
    icon: '👟',
    targetDate: '2026-10-15'
  });

  return true;
}
