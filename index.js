import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  Events,
  EmbedBuilder,
  time as discordTime,
  TimestampStyles,
} from "discord.js";

/* ---------- ENV ---------- */
const token = process.env.DISCORD_TOKEN;
const TARGET_GUILD_ID = process.env.GUILD_ID; // optioneel
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID || "1429121620194234478";
const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS ?? 1000);
const PORT = process.env.PORT || 3000;

if (!token) {
  console.error("❌ DISCORD_TOKEN ontbreekt in environment variables.");
  process.exit(1);
}

/* ---------- Discord Client ---------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages, // om berichten te fetchen/bijwerken
  ],
  partials: [Partials.Channel, Partials.Message],
});

let startedAt = Date.now();
let statusMsgId = null;

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
  const serverName = await resolveGuildName();
  await client.user.setPresence({
    status: "online",
    activities: [{ name: serverName, type: ActivityType.Watching }],
  });
  console.log(`✅ Presence ingesteld: Watching ${serverName}`);
}

function buildStatusEmbed({ guildName }) {
  const now = new Date();
  const lastUpdateRel = discordTime(Math.floor(now.getTime() / 1000), TimestampStyles.RelativeTime);
  const lastUpdateAbs = discordTime(Math.floor(now.getTime() / 1000), TimestampStyles.LongDateTime);

  const embed = new EmbedBuilder()
    .setTitle("🕰️ Phantom Forge Tickets Bot Status")
    .setColor(0x6c2bd9) // paars accent
    .setDescription("**Active:**\n✅ Online")
    .addFields(
      { name: "Uptime", value: `\`${fmtUptime(Date.now() - startedAt)}\``, inline: true },
      { name: "Ping", value: `${Math.round(client.ws.ping)} ms`, inline: true },
      { name: "Last update", value: `${lastUpdateAbs}`, inline: false },
    )
    .setFooter({ text: `Live updated every second | ${guildName}` });

  return embed;
}

async function upsertStatusMessage() {
  const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    console.error("❌ STATUS_CHANNEL_ID is geen tekstkanaal of onvindbaar.");
    return;
  }

  // 1) Probeer bestaand bericht (in geheugen) te editen
  if (statusMsgId) {
    try {
      const msg = await channel.messages.fetch(statusMsgId);
      await msg.edit({ embeds: [buildStatusEmbed({ guildName: await resolveGuildName() })] });
      return;
    } catch {
      // valt terug op zoeken of nieuw plaatsen
    }
  }

  // 2) Zoek laatste bericht van deze bot met onze titel
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const existing = messages.find(
      (m) =>
        m.author?.id === client.user.id &&
        m.embeds?.[0]?.title === "🕰️ Phantom Forge Tickets Bot Status"
    );
    if (existing) {
      statusMsgId = existing.id;
      await existing.edit({ embeds: [buildStatusEmbed({ guildName: await resolveGuildName() })] });
      return;
    }
  } catch (e) {
    console.warn("⚠️ Kon eerdere berichten niet fetchen:", e.message);
  }

  // 3) Plaats nieuw bericht
  const sent = await channel.send({
    embeds: [buildStatusEmbed({ guildName: await resolveGuildName() })],
  });
  statusMsgId = sent.id;
}

let updater = null;

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Ingelogd als ${client.user.tag}`);
  startedAt = Date.now();
  await setWatchingPresence();

  await upsertStatusMessage();
  updater = setInterval(upsertStatusMessage, UPDATE_INTERVAL_MS);
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
  res.status(200).send("Presence + Status Bot is running.");
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
