import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getMember, setMember, addEvent, now, getConfig, incrementStat } from "../storage.js";

registerMainMenuItem({ label: "I'm human", data: "verify:human", order: 10 });

const composer = new Composer<Ctx>();

composer.callbackQuery("verify:human", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) {
    await ctx.reply("Could not verify — try again from the group.");
    return;
  }

  const config = await getConfig(chatId);
  const member = await getMember(chatId, userId);

  if (member?.verified) {
    await ctx.reply("You're already verified. You can post freely.", {
      reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
    });
    return;
  }

  const updated: import("../storage.js").Member = {
    userId,
    chatId,
    joinTime: member?.joinTime ?? now(),
    verified: true,
    trusted: member?.trusted ?? config.trustedUserIds.includes(userId),
    messageCount: member?.messageCount ?? 0,
    warnCount: member?.warnCount ?? 0,
  };
  await setMember(updated);

  await addEvent({
    id: `verify:${chatId}:${userId}:${now()}`,
    chatId,
    actionType: "verify",
    actor: userId,
    target: userId,
    reason: "User completed human verification",
    timestamp: now(),
  });

  await incrementStat(chatId, "verifiedMembers");
  await incrementStat(chatId, "totalActions");

  await ctx.reply("You're verified! You can now participate in the group.", {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
});

export default composer;
