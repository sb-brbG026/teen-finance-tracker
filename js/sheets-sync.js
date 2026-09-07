/**
 * SHEETS-SYNC.JS — Модуль синхронизации с Google Таблицами (через Webhook/GAS) и экспорт/импорт CSV
 */

import { getSetting, setSetting, getTransactions, addTransaction } from './db.js';

export async function getSheetsWebhookUrl() {
  return await getSetting('sheets_webhook_url', '');
}

export async function saveSheetsWebhookUrl(url) {
  return await setSetting('sheets_webhook_url', (url || '').trim());
}

/**
 * Проверка соединения с Google Таблицей
 */
export async function testSheetsConnection(webhookUrl) {
  if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com')) {
    return { success: false, message: 'URL должен начинаться с https://script.google.com/macros/s/...' };
  }

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // Используем text/plain для избежания CORS preflight
      body: JSON.stringify({ action: 'ping' })
    });

    const data = await resp.json();
    if (data.status === 'ok') {
      return { success: true, message: data.message || 'Связь успешно установлена!' };
    } else {
      return { success: false, message: data.error || 'Ошибка ответа таблицы' };
    }
  } catch (err) {
    // В ряде браузеров Apps Script редиректит с 302, что браузер может воспринимать как opaque response
    // Но если запрос дошел, он сохраняется. Проверяем также GET
    try {
      const getResp = await fetch(webhookUrl);
      if (getResp.ok) {
        return { success: true, message: 'Google Таблица доступна!' };
      }
    } catch (_) {}

    return {
      success: false,
      message: 'Не удалось подключиться. Убедитесь, что веб-приложение развернуто с доступом "Все" (Anyone).'
    };
  }
}

/**
 * Отправка одной транзакции в Google Таблицу
 */
export async function syncTransactionToSheets(transaction) {
  const webhookUrl = await getSheetsWebhookUrl();
  if (!webhookUrl) return false;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'add_transaction',
        transaction: {
          id: transaction.id,
          date: transaction.date,
          type: transaction.type,
          category: transaction.category,
          amount: transaction.amount,
          title: transaction.title || '',
          note: transaction.note || ''
        }
      })
    });
    return true;
  } catch (err) {
    console.warn('Ошибка синхронизации с Google Sheets:', err);
    return false;
  }
}

/**
 * Пакетная синхронизация всех транзакций
 */
export async function batchSyncAllToSheets() {
  const webhookUrl = await getSheetsWebhookUrl();
  if (!webhookUrl) {
    throw new Error('Google Sheets Webhook URL не настроен в настройках');
  }

  const transactions = await getTransactions();
  if (transactions.length === 0) {
    return { count: 0, message: 'Нет транзакций для синхронизации' };
  }

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'batch_sync',
      transactions: transactions.map((t) => ({
        id: t.id,
        date: t.date,
        type: t.type,
        category: t.category,
        amount: t.amount,
        title: t.title || '',
        note: t.note || ''
      }))
    })
  });

  const data = await resp.json();
  return { count: transactions.length, message: data.message || 'Синхронизировано' };
}

/**
 * Экспорт всех транзакций в CSV (с поддержкой кириллицы UTF-8 с BOM для Excel)
 */
export async function exportToCSV() {
  const transactions = await getTransactions();
  const headers = ['ID', 'Дата', 'Тип', 'Категория', 'Сумма', 'Название', 'Заметка'];
  
  const rows = transactions.map((t) => [
    `"${t.id}"`,
    `"${t.date}"`,
    `"${t.type === 'income' ? 'Доход' : 'Расход'}"`,
    `"${(t.category || '').replace(/"/g, '""')}"`,
    t.amount,
    `"${(t.title || '').replace(/"/g, '""')}"`,
    `"${(t.note || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `teenflow_transactions_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Импорт транзакций из CSV файла
 */
export async function importFromCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          resolve(0);
          return;
        }

        let importedCount = 0;
        // Пропускаем строку заголовков
        for (let i = 1; i < lines.length; i++) {
          const parts = parseCSVLine(lines[i]);
          if (parts.length >= 5) {
            const date = parts[1] || new Date().toISOString().split('T')[0];
            const typeStr = parts[2] || '';
            const type = typeStr.toLowerCase().includes('доход') ? 'income' : 'expense';
            const category = parts[3] || 'Другое';
            const amount = parseFloat(parts[4]) || 0;
            const title = parts[5] || '';
            const note = parts[6] || '';

            if (amount > 0) {
              await addTransaction({
                date,
                type,
                category,
                amount,
                title,
                note
              });
              importedCount++;
            }
          }
        }
        resolve(importedCount);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file, 'utf-8');
  });
}

function parseCSVLine(text) {
  const result = [];
  let current = '';
  let inQuotes = false;
  const separator = text.includes(';') ? ';' : ',';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((s) => s.replace(/^"|"$/g, ''));
}
