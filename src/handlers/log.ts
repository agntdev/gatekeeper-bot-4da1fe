import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, paginate, registerMainMenuItem } from "../toolkit/index.js";
import { getEvents, getEventCount } from "../storage.js";

registerMainMenuItem({ label: "Moderation log", data: "menu:log", order: 40 });

const composer = new Composer<Ctx>();

const PAGE_SIZE = 10;

function formatEvent(ev: import("../storage.js").ModerationEvent): string {
  const time = new Date(ev.timestamp).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `• ${time} — ${ev.actionType.toUpperCase()} by ${ev.actor} → ${ev.target}\n  Reason: ${ev.reason}`;
}

async function showLog(ctx: Ctx, page: number) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const total = await getEventCount(chatId);
  if (total === 0) {
    await ctx.editMessageText("No moderation events yet.", {
      reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
    });
    return;
  }

  const allEvents = await getEvents(chatId, total);
  const { page: actualPage, pageItems, controls, totalPages } = paginate(allEvents, {
    page,
    perPage: PAGE_SIZE,
    callbackPrefix: "log",
  });

  const lines = pageItems.map(formatEvent);
  const header = `Moderation log (${total} events, page ${actualPage + 1}/${totalPages}):\n\n`;
  const text = header + lines.join("\n\n");

  const kb = inlineKeyboard([
    ...controls.inline_keyboard.map((row) => row),
    [inlineButton("Back to menu", "menu:main")],
  ]);

  await ctx.editMessageText(text, { reply_markup: kb });
}

composer.command("log", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const total = await getEventCount(chatId);
  if (total === 0) {
    await ctx.reply("No moderation events yet.", {
      reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
    });
    return;
  }

  const events = await getEvents(chatId, PAGE_SIZE);
  const { pageItems, controls, totalPages } = paginate(events, {
    page: 0,
    perPage: PAGE_SIZE,
    callbackPrefix: "log",
  });

  const lines = pageItems.map(formatEvent);
  const header = `Moderation log (${total} events, page 1/${totalPages}):\n\n`;
  const text = header + lines.join("\n\n");

  const kb = inlineKeyboard([
    ...controls.inline_keyboard.map((row) => row),
    [inlineButton("Back to menu", "menu:main")],
  ]);

  await ctx.reply(text, { reply_markup: kb });
});

composer.callbackQuery("menu:log", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showLog(ctx, 0);
});

composer.callbackQuery(/^log:prev:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match[1], 10);
  await showLog(ctx, page);
});

composer.callbackQuery(/^log:next:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match[1], 10);
  await showLog(ctx, page);
});

export default composer;
