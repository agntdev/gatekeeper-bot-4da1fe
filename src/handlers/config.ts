import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getConfig, setConfig } from "../storage.js";

registerMainMenuItem({ label: "Settings", data: "menu:config", order: 50 });

const composer = new Composer<Ctx>();

async function showConfig(ctx: Ctx) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const config = await getConfig(chatId);
  const lines = [
    "Owner settings:",
    "",
    `Welcome: ${config.welcomeText.slice(0, 60)}${config.welcomeText.length > 60 ? "…" : ""}`,
    `Rules: ${config.rulesText.slice(0, 60)}${config.rulesText.length > 60 ? "…" : ""}`,
    `Spam threshold: ${config.spamThreshold} messages`,
    `Flood threshold: ${config.floodThreshold} messages/minute`,
    `Detectors: ${config.detectorsEnabled ? "ON" : "OFF"}`,
    `Trusted users: ${config.trustedUserIds.length}`,
    `Verification window: ${config.verificationMinutes} min`,
  ];

  const kb = inlineKeyboard([
    [inlineButton("Welcome text", "config:welcome"), inlineButton("Rules text", "config:rules")],
    [inlineButton("Spam threshold", "config:spam"), inlineButton("Flood threshold", "config:flood")],
    [inlineButton("Toggle detectors", "config:detectors")],
    [inlineButton("Trusted users", "config:trusted")],
    [inlineButton("Back to menu", "menu:main")],
  ]);

  await ctx.editMessageText(lines.join("\n"), { reply_markup: kb });
}

composer.callbackQuery("menu:config", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showConfig(ctx);
});

composer.callbackQuery("config:welcome", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const config = await getConfig(chatId);
  await ctx.editMessageText(
    `Current welcome text:\n\n${config.welcomeText}\n\nReply with new welcome text to update it.`,
    { reply_markup: inlineKeyboard([[inlineButton("Back to settings", "menu:config")]]) },
  );
  if (ctx.session) ctx.session.step = "config_welcome";
});

composer.callbackQuery("config:rules", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const config = await getConfig(chatId);
  await ctx.editMessageText(
    `Current rules text:\n\n${config.rulesText}\n\nReply with new rules text to update it.`,
    { reply_markup: inlineKeyboard([[inlineButton("Back to settings", "menu:config")]]) },
  );
  if (ctx.session) ctx.session.step = "config_rules";
});

composer.callbackQuery("config:spam", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const config = await getConfig(chatId);
  await ctx.editMessageText(
    `Current spam threshold: ${config.spamThreshold} messages.\n\nReply with a new number to update.`,
    { reply_markup: inlineKeyboard([[inlineButton("Back to settings", "menu:config")]]) },
  );
  if (ctx.session) ctx.session.step = "config_spam";
});

composer.callbackQuery("config:flood", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const config = await getConfig(chatId);
  await ctx.editMessageText(
    `Current flood threshold: ${config.floodThreshold} messages/minute.\n\nReply with a new number to update.`,
    { reply_markup: inlineKeyboard([[inlineButton("Back to settings", "menu:config")]]) },
  );
  if (ctx.session) ctx.session.step = "config_flood";
});

composer.callbackQuery("config:detectors", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const config = await getConfig(chatId);
  const newState = !config.detectorsEnabled;
  await setConfig(chatId, { detectorsEnabled: newState });
  await ctx.editMessageText(
    `Spam detectors are now ${newState ? "ON" : "OFF"}.`,
    { reply_markup: inlineKeyboard([[inlineButton("Back to settings", "menu:config")]]) },
  );
});

composer.callbackQuery("config:trusted", async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const config = await getConfig(chatId);
  const list = config.trustedUserIds.length > 0
    ? config.trustedUserIds.map((id) => `• ${id}`).join("\n")
    : "No trusted users configured.";
  await ctx.editMessageText(
    `Trusted users:\n\n${list}\n\nReply with a user ID to toggle trust status.`,
    { reply_markup: inlineKeyboard([[inlineButton("Back to settings", "menu:config")]]) },
  );
  if (ctx.session) ctx.session.step = "config_trusted";
});

// Handle config text follow-ups.
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session?.step;
  if (!step?.startsWith("config_")) return next();

  const chatId = ctx.chat?.id;
  if (!chatId) return next();

  const text = ctx.message.text.trim();

  switch (step) {
    case "config_welcome": {
      await setConfig(chatId, { welcomeText: text });
      await ctx.reply("Welcome text updated.", {
        reply_markup: inlineKeyboard([[inlineButton("Back to settings", "menu:config")]]),
      });
      break;
    }
    case "config_rules": {
      await setConfig(chatId, { rulesText: text });
      await ctx.reply("Rules text updated.", {
        reply_markup: inlineKeyboard([[inlineButton("Back to settings", "menu:config")]]),
      });
      break;
    }
    case "config_spam": {
      const num = parseInt(text, 10);
      if (isNaN(num) || num < 1) {
        await ctx.reply("Please enter a valid number (1 or higher).");
        return;
      }
      await setConfig(chatId, { spamThreshold: num });
      await ctx.reply(`Spam threshold set to ${num}.`, {
        reply_markup: inlineKeyboard([[inlineButton("Back to settings", "menu:config")]]),
      });
      break;
    }
    case "config_flood": {
      const num = parseInt(text, 10);
      if (isNaN(num) || num < 1) {
        await ctx.reply("Please enter a valid number (1 or higher).");
        return;
      }
      await setConfig(chatId, { floodThreshold: num });
      await ctx.reply(`Flood threshold set to ${num}.`, {
        reply_markup: inlineKeyboard([[inlineButton("Back to settings", "menu:config")]]),
      });
      break;
    }
    case "config_trusted": {
      const uid = parseInt(text, 10);
      if (isNaN(uid)) {
        await ctx.reply("Please enter a valid numeric user ID.");
        return;
      }
      const config = await getConfig(chatId);
      const idx = config.trustedUserIds.indexOf(uid);
      let msg: string;
      if (idx >= 0) {
        config.trustedUserIds.splice(idx, 1);
        msg = `Removed user ${uid} from trusted list.`;
      } else {
        config.trustedUserIds.push(uid);
        msg = `Added user ${uid} to trusted list.`;
      }
      await setConfig(chatId, { trustedUserIds: config.trustedUserIds });
      await ctx.reply(msg, {
        reply_markup: inlineKeyboard([[inlineButton("Back to settings", "menu:config")]]),
      });
      break;
    }
    default:
      return next();
  }

  ctx.session.step = undefined;
});

export default composer;
