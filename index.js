import express from "express";
import fs from "fs-extra";
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
const DATA_FILE = "./data.json";
const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS ?? 1000);
const PORT = process.env.PORT || 3000;

if (!token) throw new Error("❌ DISCORD_TOKEN ontbreekt in .env");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel, Partials.Message],
});

let startedAt = Date.now();
let statusMessageId = null;
let isUpdating = false;

/* ------------------ Helpers ------------------ */
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
    if (!g) g = (await client.guilds.fetch()).first();
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

/* ------------------ Embed ------------------ */
function buildStatusEmbed() {
  const now = new Date();

  const dateTime = now.toLocaleString("nl-NL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const footerTime = now.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return new EmbedBuilder()
    .setTitle("🕰️ Phantom Forge Verify Bot Status") // klokje emoji
    .setColor(0x6c2bd9)
    .setDescription("**Active:**\n✅ Online") // groene check emoji
    .addFields(
      { name: "⏱️ Uptime", value: `\`${fmtUptime(Date.now() - startedAt)}\``, inline: true },
      { name: "📡 Ping", value: `${Math.round(client.ws.ping)} ms`, inline: true },
      { name: "📅 Last update", value: dateTime, inline: false }
    )
    .setFooter({
      text: `🕯️ Live updated every second | Phantom Forge • vandaag om ${footerTime}`,
    });
}

/* ------------------ Update / Create Logic ------------------ */
async function updateOrCreateStatusMessage() {
  if (isUpdating) return;
  isUpdating = true;

  try {
    const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
    if (!channel?.isTextBased()) {
      console.error("❌ STATUS_CHANNEL_ID is geen tekstkanaal of niet gevonden.");
      return;
    }

    // lees lokaal opgeslagen bericht-ID
    if (!statusMessageId && fs.existsSync(DATA_FILE)) {
      const data = await fs.readJson(DATA_FILE).catch(() => ({}));
      statusMessageId = data.statusMessageId || null;
    }

    // probeer bestaand bericht te bewerken
    if (statusMessageId) {
      try {
        const msg = await channel.messages.fetch(statusMessageId);
        await msg.edit({ embeds: [buildStatusEmbed()] });
        return;
      } catch {
        console.warn("⚠️ Oud bericht niet gevonden, maak nieuw aan...");
        statusMessageId = null;
      }
    }

    // maak één nieuw bericht en sla ID op
    if (!statusMessageId) {
      const embed = buildStatusEmbed();
      const newMsg = await channel.send({ embeds: [embed] });
      statusMessageId = newMsg.id;
      await fs.writeJson(DATA_FILE, { statusMessageId }, { spaces: 2 });
      console.log(`💾 Nieuw statusbericht geplaatst (ID: ${statusMessageId})`);
    }
  } catch (err) {
    console.error("⚠️ updateOrCreateStatusMessage fout:", err.message);
  } finally {
    isUpdating = false;
  }
}

/* ------------------ Bot Setup ------------------ */
let interval = null;

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Ingelogd als ${client.user.tag}`);
  startedAt = Date.now();
  await setWatchingPresence();

  await updateOrCreateStatusMessage();
  interval = setInterval(updateOrCreateStatusMessage, UPDATE_INTERVAL_MS);
});

client.on(Events.GuildCreate, setWatchingPresence);
client.on(Events.GuildDelete, setWatchingPresence);

process.on("SIGTERM", () => {
  if (interval) clearInterval(interval);
  process.exit(0);
});
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(token);

/* ------------------ Webserver voor Render ------------------ */
const app = express();

app.get("/", (_req, res) => res.status(200).send("Verify Status Bot is running."));
app.get("/health", (_req, res) =>
  res.status(200).json({
    ok: true,
    uptime: process.uptime(),
    ping: Math.round(client.ws.ping),
  })
);

app.listen(PORT, () => console.log(`🌐 Webserver luistert op port ${PORT} → /health`));
