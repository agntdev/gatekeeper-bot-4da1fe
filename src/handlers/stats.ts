import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getStats, getEventCount } from "../storage.js";

registerMainMenuItem({ label: "Stats", data: "menu:stats", order: 60 });

const composer = new Composer<Ctx>();

composer.callbackQuery("menu:stats", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const stats = await getStats(chatId);
  const totalEvents = await getEventCount(chatId);

  const lines = [
    "Moderation summary:",
    "",
    `Total moderation actions: ${stats.totalActions}`,
    `Verified members: ${stats.verifiedMembers}`,
    `Total members tracked: ${stats.totalMembers}`,
    `Events logged: ${totalEvents}`,
  ];

  await ctx.editMessageText(lines.join("\n"), {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
});

export default composer;
