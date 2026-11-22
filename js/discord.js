import { CONFIG } from "./config.js";

export async function initDiscord() {
  const params = new URLSearchParams(window.location.search);
  const inDiscord = params.has("frame_id") && params.has("instance_id");

  if (!inDiscord) {
    const hashRoom = window.location.hash.replace("#", "").trim();
    return {
      isDiscord: false,
      sdk: null,
      roomId: hashRoom || "plane-party-public",
      channelId: null,
      guildId: null
    };
  }

  try {
    const mod = await import("../vendor/discord-sdk.mjs");
    const sdk = new mod.DiscordSDK(CONFIG.DISCORD_CLIENT_ID);
    await sdk.ready();

    return {
      isDiscord: true,
      sdk,
      roomId: sdk.instanceId || params.get("instance_id") || "discord-instance",
      channelId: sdk.channelId || null,
      guildId: sdk.guildId || null
    };
  } catch (err) {
    return {
      isDiscord: true,
      sdk: null,
      roomId: params.get("instance_id") || "discord-fallback",
      channelId: params.get("channel_id") || null,
      guildId: params.get("guild_id") || null,
      error: err
    };
  }
}
