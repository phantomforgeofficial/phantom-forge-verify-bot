import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  Events,
  EmbedBuilder,
} from "discord.js";

const token = process.env.DISCORD_TOKEN;
const TARGET_GUILD_ID = process.env.GUILD_ID;
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID || "1429121620194234478";
const STATUS_MESSAGE_ID = process.env.STATUS_MESSAGE_ID; // <-- vaste message ID
const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS ?? 1000);
const PORT = process.env.PORT || 3000;

if (!token) {
  console.error("❌ DISCORD_TOKEN ontbreekt in environment variables.");
  process.exit(1);
}

if (!STATUS_MESSAGE_ID) {
  console.error("❌ STATUS_MESSAGE_ID ontbreekt — voeg dit toe in je .env zodat de bot weet welk bericht hij moet bewerken.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel, Partials.Message],
});

let startedAt = Date.now();

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

async function resolveGuildName() {
  try {
    if (TARGET_GUILD_ID) {
      const g = await client.guilds.fetch(TARGET_GUILD_ID);
      return g?.name ?? "this server";
    }
    let g = client.guilds.cache.first();
    if (!g) {
      const all = await client.guilds.fetch();
      g = all.first();
    }
    return g?.name ?? "this server";
  } catch {
    return "this server";
  }
}

async function setWatchingPresence() {
  const name = await resolveGuildName();
  await client.user.setPresence({
    status: "online",
    activities: [{ name, type: ActivityType.Watching }],
  });
  console.log(`✅ Presence ingesteld: Watching ${name}`);
}

function buildStatusEmbed({ guildName }) {
  const now = new Date();

  const dateTime = now.toLocaleString("nl-NL", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const footerTime = now.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return new EmbedBuilder()
    .setTitle("🕰️ Phantom Forge Verify Bot Status")
    .setColor(0x6c2bd9)
    .setDescription("**Active:**\n✅ Online")
    .addFields(
      { name: "Uptime", value: `\`${fmtUptime(Date.now() - startedAt)}\``, inline: true },
      { name: "Ping", value: `${Math.round(client.ws.ping)} ms`, inline: true },
      { name: "Last update", value: dateTime, inline: false }
    )
    .setFooter({
      text: `🕯️ Live updated every second | Phantom Forge • vandaag om ${footerTime}`,
    });
}

async function updateExistingMessage() {
  try {
    const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
    const message = await channel.messages.fetch(STATUS_MESSAGE_ID);
    const embed = buildStatusEmbed({ guildName: await resolveGuildName() });
    await message.edit({ embeds: [embed] });
  } catch (err) {
    console.error("⚠️ Kon statusbericht niet bewerken:", err.message);
  }
}

let updater = null;

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Ingelogd als ${client.user.tag}`);
  startedAt = Date.now();
  await setWatchingPresence();

  // Direct eerste update
  await updateExistingMessage();

  // Elke seconde updaten
  updater = setInterval(updateExistingMessage, UPDATE_INTERVAL_MS);
});

client.on(Events.GuildCreate, setWatchingPresence);
client.on(Events.GuildDelete, setWatchingPresence);

process.on("SIGTERM", () => {
  if (updater) clearInterval(updater);
  process.exit(0);
});
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(token);

/* ---------- Mini Webserver voor Render ---------- */
const app = express();

app.get("/", (_req, res) => {
  res.status(200).send("Verify Status Bot is running.");
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    uptime: process.uptime(),
    ping: Math.round(client.ws.ping),
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Webserver luistert op port ${PORT} - /health`);
});
