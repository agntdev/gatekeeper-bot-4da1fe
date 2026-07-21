import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getMember, setMember, addEvent, now, incrementStat, getEventCount } from "../storage.js";

registerMainMenuItem({ label: "Moderation", data: "menu:moderation", order: 30 });

const composer = new Composer<Ctx>();

const MOD_ACTIONS = [
  { label: "Warn", data: "mod:warn" },
  { label: "Mute", data: "mod:mute" },
  { label: "Kick", data: "mod:kick" },
  { label: "Ban", data: "mod:ban" },
];

composer.callbackQuery("menu:moderation", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const total = await getEventCount(chatId);
  const lines = [
    "Admin moderation controls:",
    "",
    `Total events logged: ${total}`,
    "",
    "Select an action, then reply with the target user's ID.",
  ];

  const kb = inlineKeyboard([
    MOD_ACTIONS.map((a) => inlineButton(a.label, a.data)),
    [inlineButton("Back to menu", "menu:main")],
  ]);

  await ctx.editMessageText(lines.join("\n"), { reply_markup: kb });
});

async function handleModAction(ctx: Ctx, action: string) {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return;

  // Store action in session for follow-up.
  if (ctx.session) {
    ctx.session.step = "moderating";
    ctx.session.modAction = action;
  }

  await ctx.reply(
    `Action selected: ${action.toUpperCase()}\n\nReply with the target user's ID to proceed.`,
  );
}

composer.callbackQuery("mod:warn", async (ctx) => handleModAction(ctx, "warn"));
composer.callbackQuery("mod:mute", async (ctx) => handleModAction(ctx, "mute"));
composer.callbackQuery("mod:kick", async (ctx) => handleModAction(ctx, "kick"));
composer.callbackQuery("mod:ban", async (ctx) => handleModAction(ctx, "ban"));

// Handle follow-up text when moderating (target user ID).
composer.on("message:text", async (ctx, next) => {
  if (ctx.session?.step !== "moderating") return next();

  const chatId = ctx.chat?.id;
  const actorId = ctx.from?.id;
  const action = ctx.session.modAction;
  if (!chatId || !actorId || !action) return next();

  const targetText = ctx.message.text.trim();
  const targetId = parseInt(targetText, 10);
  if (isNaN(targetId)) {
    await ctx.reply("Invalid user ID. Reply with a numeric user ID.");
    return;
  }

  // Get or create member record.
  let member = await getMember(chatId, targetId);
  if (!member) {
    member = {
      userId: targetId,
      chatId,
      joinTime: now(),
      verified: false,
      trusted: false,
      messageCount: 0,
      warnCount: 0,
    };
  }

  const reason = `Admin action: ${action}`;

  switch (action) {
    case "warn":
      member.warnCount += 1;
      await ctx.reply(`Warned user ${targetId}. Warning count: ${member.warnCount}.`);
      break;
    case "mute":
      await ctx.reply(`Muted user ${targetId}.`);
      break;
    case "kick":
      await ctx.reply(`Kicked user ${targetId}.`);
      break;
    case "ban":
      await ctx.reply(`Banned user ${targetId}.`);
      break;
    default:
      await ctx.reply("Unknown action.");
      return next();
  }

  await setMember(member);
  await addEvent({
    id: `mod:${chatId}:${targetId}:${action}:${now()}`,
    chatId,
    actionType: action as import("../storage.js").ModerationEvent["actionType"],
    actor: actorId,
    target: targetId,
    reason,
    timestamp: now(),
  });
  await incrementStat(chatId, "totalActions");

  // Reset session.
  ctx.session.step = undefined;
  ctx.session.modAction = undefined;
});

export default composer;
