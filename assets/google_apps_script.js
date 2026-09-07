/**
 * Google Apps Script для синхронизации TeenFlow (Трекера финансов)
 * 
 * ИНСТРУКЦИЯ ПО НАСТРОЙКЕ ЗА 2 МИНУТЫ:
 * 1. Откройте Google Таблицы (https://sheets.new) и создайте новую таблицу.
 * 2. Назовите первый лист "Транзакции" (или оставьте как есть, скрипт настроит его сам).
 * 3. В верхнем меню нажмите: Расширения (Extensions) -> Apps Script.
 * 4. Удалите стандартный код и вставьте этот файл полностью.
 * 5. Нажмите "Развернуть" (Deploy) -> "Новое развертывание" (New deployment).
 * 6. Выберите тип: "Веб-приложение" (Web app).
 * 7. В поле "У кого есть доступ" (Who has access) обязательно выберите:
 *    "Все" (Anyone) — чтобы приложение могло отправлять данные без сложной авторизации.
 * 8. Нажмите "Развернуть" (Deploy), разрешите доступ и скопируйте полученный "URL веб-приложения".
 * 9. Вставьте этот URL в настройках приложения TeenFlow на вкладке "Синхронизация".
 */

function doPost(e) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000); // Ожидание до 10 секунд для предотвращения конфликтов записи

    var sheet = getOrCreateSheet();
    var contents = JSON.parse(e.postData.contents);
    var action = contents.action || 'add_transaction';

    if (action === 'ping') {
      return jsonResponse({ status: 'ok', message: 'Связь с Google Таблицей успешно установлена!' });
    }

    if (action === 'add_transaction') {
      var t = contents.transaction;
      sheet.appendRow([
        t.id,
        t.date,
        t.type === 'income' ? 'Доход' : 'Расход',
        t.category,
        t.amount,
        t.title || '',
        t.note || '',
        new Date().toISOString()
      ]);
      return jsonResponse({ status: 'ok', message: 'Транзакция добавлена' });
    }

    if (action === 'batch_sync') {
      var transactions = contents.transactions || [];
      transactions.forEach(function(t) {
        sheet.appendRow([
          t.id,
          t.date,
          t.type === 'income' ? 'Доход' : 'Расход',
          t.category,
          t.amount,
          t.title || '',
          t.note || '',
          new Date().toISOString()
        ]);
      });
      return jsonResponse({ status: 'ok', message: 'Синхронизировано транзакций: ' + transactions.length });
    }

    return jsonResponse({ status: 'error', message: 'Неизвестное действие' });
  } catch (error) {
    return jsonResponse({ status: 'error', error: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return jsonResponse({
    status: 'ok',
    message: 'TeenFlow Webhook активен и готов к синхронизации!'
  });
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Транзакции');
  if (!sheet) {
    sheet = ss.insertSheet('Транзакции');
    // Оформляем заголовки
    var headers = ['ID', 'Дата', 'Тип', 'Категория', 'Сумма', 'Название', 'Заметка', 'Время добавления'];
    sheet.appendRow(headers);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#6366F1');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
