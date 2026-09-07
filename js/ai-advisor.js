/**
 * AI-ADVISOR.JS — Умный финансовый ментор для подростков ("ФинМентор")
 * Сочетает мгновенный автономный эвристический анализ трат и поддержку Gemini API
 */

import { calculateSummary, filterTransactionsByPeriod } from './analytics.js';
import { getGoals } from './db.js';
import { getSetting } from './db.js';

export async function generateSmartSummaryTip(transactions) {
  const summary = calculateSummary(transactions, 'month');
  const goals = await getGoals();

  if (transactions.length === 0) {
    return `👋 Привет! Я твой личный финансовый ментор **Фин**! Начни записывать карманные деньги и покупки, и я подскажу, как накопить на всё, о чем ты мечтаешь! 🚀`;
  }

  const { totalIncome, totalExpense, balance, expenseByCategory } = summary;

  // 1. Проверка на дефицит
  if (totalExpense > totalIncome && totalIncome > 0) {
    const diff = totalExpense - totalIncome;
    return `⚠️ **Внимание:** В этом месяце траты превысили поступления на **${diff.toLocaleString()}**. Загляни в раздел категорий — возможно, стоит пару дней воздержаться от доставки и импульсивных покупок.`;
  }

  // 2. Анализ фастфуда и снеков
  const fastfood = expenseByCategory['Фастфуд и кафе'] || 0;
  if (fastfood > 0 && totalExpense > 0 && (fastfood / totalExpense) > 0.35) {
    const percent = Math.round((fastfood / totalExpense) * 100);
    return `🍔 **Латте-фактор в действии:** ${percent}% всех твоих трат (${fastfood.toLocaleString()}) уходит на фастфуд и перекусы. Если сократить эти траты всего на треть, ты освободишь порядка **${Math.round(fastfood * 0.33).toLocaleString()}** на свою мечту!`;
  }

  // 3. Анализ игр и подписок
  const games = expenseByCategory['Игры и подписки'] || 0;
  if (games > 0 && totalExpense > 0 && (games / totalExpense) > 0.3) {
    return `🎮 **Игровой баланс:** На донаты и подписки ушло **${games.toLocaleString()}**. Проверь, во все ли игры ты активно играешь? Отключение одной ненужной подписки сохранит тебе ощутимую сумму в год.`;
  }

  // 4. Похвала за накопления
  if (goals.length > 0) {
    const activeGoal = goals[0];
    const remaining = Math.max(0, activeGoal.targetAmount - activeGoal.currentAmount);
    if (activeGoal.currentAmount > 0 && remaining > 0) {
      return `🚀 **Движение к цели:** До твоей цели «${activeGoal.name}» осталось всего **${remaining.toLocaleString()}**! Ты уже собрал ${Math.round((activeGoal.currentAmount / activeGoal.targetAmount) * 100)}%. Не сбавляй темп!`;
    }
  }

  // 5. Отличная норма сбережений
  if (summary.savingsRate >= 30) {
    return `🔥 **Уровень: Будущий миллионер!** Ты сохраняешь **${summary.savingsRate}%** своих доходов. У большинства взрослых этот показатель меньше 10%. Ты отлично управляешь бюджетом!`;
  }

  return `💡 **Совет дня:** Используй правило 48 часов перед любой крупной покупкой. Подожди два дня: если желание не пропало — покупай, если забыл — ты только что сохранил деньги!`;
}

export const DEFAULT_MISTRAL_API_KEY = '';

/**
 * Обработка запросов к ИИ-консультанту
 */
export async function askAdvisor(userPrompt, transactions) {
  const mistralKey = await getSetting('mistral_api_key', '');
  const apiKey = (mistralKey && mistralKey.trim().length > 0) ? mistralKey.trim() : DEFAULT_MISTRAL_API_KEY;
  const summary = calculateSummary(transactions, 'month');
  const goals = await getGoals();

  // Если задан Mistral API ключ, отправляем прямой онлайн-запрос
  if (apiKey && apiKey.length > 5) {
    try {
      const response = await callMistralAPI(apiKey, userPrompt, summary, goals);
      return response;
    } catch (err) {
      console.warn('Ошибка вызова Mistral API:', err);
      const offlineReply = generateOfflineAdvisorResponse(userPrompt, summary, goals);

      let errorReason = err.message || 'Ошибка соединения';
      if (err.name === 'AbortError') {
        errorReason = 'Таймаут соединения (15 сек). Сервер api.mistral.ai не отвечает без VPN.';
      } else if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        errorReason = 'Браузеру не удалось связаться с api.mistral.ai (заблокировано провайдером/Cloudflare без VPN).';
      } else if (err.message && err.message.includes('Invalid API Key')) {
        errorReason = 'Указан неверный API-ключ Mistral. Проверь его в Настройках.';
      }

      return `⚠️ **Mistral AI:** *${errorReason}*\n\n🤖 **Ответ ФинМентора (офлайн-режим):**\n\n${offlineReply}`;
    }
  }

  // Если ключ не указан, используем автономный офлайн-движок с подростковой спецификой
  return generateOfflineAdvisorResponse(userPrompt, summary, goals);
}

function generateOfflineAdvisorResponse(prompt, summary, goals) {
  const p = prompt.toLowerCase();

  if (p.includes('накопить') || p.includes('цель') || p.includes('быстрее')) {
    const goalName = goals.length > 0 ? `«${goals[0].name}»` : 'твою цель';
    return `🎯 **Как быстрее накопить на ${goalName}:**\n\n` +
      `1. **Правило первых 20%:** Как только получаешь карманные деньги или подарок — сразу откладывай 20-30% в копилку, не оставляй это «на конец недели».\n` +
      `2. **Оцифруй в днях:** Раздели оставшуюся сумму на дни. Например, 30 на 30 дней = всего 1 в день экономии (минус один перекус!).\n` +
      `3. **Продай то, чем не пользуешься:** Старые игры, книги, вещи могут принести от 10 до 50 за один вечер.\n` +
      `4. **Контролируй импульсивные покупки:** Мечта важнее сиюминутной шоколадки или скина! 🚀`;
  }

  if (p.includes('трачу') || p.includes('куда уходят') || p.includes('утечк') || p.includes('больше всего')) {
    const topCat = Object.entries(summary.expenseByCategory).sort((a, b) => b[1] - a[1])[0];
    if (!topCat || topCat[1] === 0) {
      return `📊 У тебя пока мало записанных трат. Добавь пару покупок, и я покажу, какая статья расходов съедает больше всего!`;
    }
    return `🔍 **Главная статья расходов:** Больше всего денег у тебя уходит на категорию **«${topCat[0]}»** — уже **${topCat[1].toLocaleString()}** в этом месяце.\n\n` +
      `Попробуй поставить лимит на эту категорию в настройках: если тратить всего на 20% меньше, к концу года скопится отличная сумма на крутой гаджет!`;
  }

  if (p.includes('50/30/20') || p.includes('распределить')) {
    const income = summary.totalIncome || 100;
    const needs = Math.round(income * 0.5);
    const wants = Math.round(income * 0.3);
    const savings = Math.round(income * 0.2);

    return `📐 **Адаптированное правило 50/30/20 для подростков:**\n\n` +
      `Если твой доход в месяц составляет, например, **${income.toLocaleString()}**:\n` +
      `• **50% (${needs.toLocaleString()}) — Базовые потребности:** Оплата связи, проездного, обязательные школьные перекусы.\n` +
      `• **30% (${wants.toLocaleString()}) — Удовольствия:** Игры, кино с друзьями, фастфуд, сладости.\n` +
      `• **20% (${savings.toLocaleString()}) — Неприкосновенная Копилка:** Откладывается сразу на важную цель или финансовую подушку безопасности.\n\n` +
      `Следуя этому правилу, ты никогда не останешься с нулем на балансе! 💡`;
  }

  if (p.includes('спонтан') || p.includes('купить') || p.includes('стоит ли')) {
    return `🛑 **Тест на импульсивную покупку (Правило 48 часов):**\n\n` +
      `Задай себе 3 вопроса:\n` +
      `1. **«Буду ли я пользоваться этим через месяц?»** (или вещь будет пылиться на полке?)\n` +
      `2. **«Сколько часов подработки или дней карманных денег это стоит?»**\n` +
      `3. **«Не отдаляет ли это меня от моей главной цели?»**\n\n` +
      `⏱️ Подожди ровно 48 часов. Если через 2 дня желание не утихло — смело покупай! В 70% случаев подростки благодарят себя за то, что не купили вещь сразу.`;
  }

  if (p.includes('заработать') || p.includes('подработк') || p.includes('деньги')) {
    return `💼 **Идеи заработка для подростка (12–17 лет):**\n\n` +
      `• **Цифровые навыки:** Монтаж коротких видео (Reels / TikTok), оформление групп ВК / Telegram, создание простых ботов или превью для YouTube.\n` +
      `• **Помощь соседям и знакомым:** Выгул собак, полив растений, настройка смартфонов и компьютеров для пожилых людей.\n` +
      `• **Ресейл и расхламление:** Продажа прочитанных книг, конструкторов LEGO или одежды, из которой вырос.\n` +
      `• **Репетиторство:** Помощь младшим школьникам с домашкой по английскому, математике или информатике.`;
  }

  return `🤖 **Совет от ФинМентора:** Финансовая грамотность — это суперсила, которая отличает успешных людей. Главное правило: управляй деньгами ты, иначе деньги будут управлять тобой. Попробуй откладывать хотя бы 10% от каждого поступления уже сегодня! 💪`;
}

/**
 * Вызов официального Mistral AI API
 * Модель: mistral-small-latest (быстрая, умная, без гео-блокировок в Беларуси)
 */
async function callMistralAPI(apiKey, userPrompt, summary, goals) {
  const url = 'https://api.mistral.ai/v1/chat/completions';

  const systemInstruction = `Ты — Фин, дружелюбный, крутой и современный финансовый ментор для подростков (12-18 лет). 
Общайся уважительно, на "ты", мотивируй, используй эмодзи, избегай скучной банковской терминологии.
Данные пользователя за текущий месяц:
- Доходы: ${summary.totalIncome}
- Расходы: ${summary.totalExpense}
- Баланс: ${summary.balance}
- Топ расходов по категориям: ${JSON.stringify(summary.expenseByCategory)}
- Текущие цели накопления: ${JSON.stringify(goals.map(g => ({ name: g.name, target: g.targetAmount, current: g.currentAmount })))}
Отвечай кратко (2-4 абзаца), практично и с юмором. Не используй значков валют.`;

  const payload = {
    model: 'mistral-small-latest',
    messages: [
      {
        role: 'system',
        content: systemInstruction
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    temperature: 0.7,
    max_tokens: 800
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!resp.ok) {
      let errorDetail = `HTTP ${resp.status}`;
      try {
        const errJson = await resp.json();
        if (errJson.detail) {
          errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        } else if (errJson.message) {
          errorDetail = errJson.message;
        }
      } catch (_) {}
      throw new Error(`Mistral API: ${errorDetail}`);
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content;
    return text ? text.trim() : 'Не удалось получить ответ от ИИ, попробуй позже.';
  } finally {
    clearTimeout(timeoutId);
  }
}
