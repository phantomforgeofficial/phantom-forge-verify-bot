import express from "express";
import {
  Client, GatewayIntentBits, Partials,
  ActivityType, Events, EmbedBuilder
} from "discord.js";

const token = process.env.DISCORD_TOKEN;
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID || "1429121620194234478";
const BOT_LOGO_URL = process.env.BOT_LOGO_URL || ""; // bv. https://.../logo.png
const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS ?? 1000);
const PORT = process.env.PORT || 3000;

if (!token) throw new Error("DISCORD_TOKEN ontbreekt");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel, Partials.Message],
});

let startedAt = Date.now();
let statusMessageId = null;
let updating = false;

// --- helpers ---
const fmtUptime = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
};

function buildStatusEmbed() {
  const now = new Date();
  const dateTime = now.toLocaleString("nl-NL", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const footerTime = now.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

  return new EmbedBuilder()
    .setTitle("🕓 Phantom Forge Verify Bot Status")
    .setColor(0x6c2bd9)
    .setDescription("**Active:**\n✅ Online")
    .addFields(
      { name: "Uptime", value: `\`${fmtUptime(Date.now() - startedAt)}\``, inline: true },
      { name: "Ping", value: `${Math.round(client.ws.ping)} ms`, inline: true },
      { name: "Last update", value: dateTime, inline: false }
    )
    .setFooter({
      text: `Live updated every second | Phantom Forge • vandaag om ${footerTime}`,
      iconURL: BOT_LOGO_URL || client.user.displayAvatarURL(), // 👈 logo linksonder
    });
}

// Zoekt bestaand bericht van deze bot met de juiste titel (ook in pins)
async function findExistingStatusMessage(channel) {
  // Eerst pins (betrouwbaar, weinig)
  try {
    const pins = await channel.messages.fetchPinned();
    const pinned = pins.find(m => m.author?.id === client.user.id &&
      m.embeds?.[0]?.title === "🕓 Phantom Forge Verify Bot Status");
    if (pinned) return pinned.id;
  } catch {}
  // Dan recente history (vereist: Read Message History)
  const msgs = await channel.messages.fetch({ limit: 100 });
  const mine = msgs.find(m =>
    m.author?.id === client.user.id &&
    m.embeds?.[0]?.title === "🕓 Phantom Forge Verify Bot Status"
  );
  return mine?.id || null;
}

// Maakt alleen een nieuw bericht als er écht geen bestaat
async function ensureStatusMessage(channel) {
  // 1) bestaand ID in memory nog geldig?
  if (statusMessageId) {
    try { await channel.messages.fetch(statusMessageId); return statusMessageId; }
    catch { statusMessageId = null; }
  }
  // 2) zoeken
  const found = await findExistingStatusMessage(channel);
  if (found) { statusMessageId = found; return statusMessageId; }

  // 3) anti-dubbel guard: check direct vóór sturen nog één keer
  const recheck = await findExistingStatusMessage(channel);
  if (recheck) { statusMessageId = recheck; return statusMessageId; }

  // 4) maak één nieuw bericht en pin het (pin = nog betrouwbaarder terugvinden)
  const sent = await channel.send({ embeds: [buildStatusEmbed()] });
  try { await sent.pin().catch(() => {}); } catch {}
  statusMessageId = sent.id;
  return statusMessageId;
}

async function updateStatus() {
  if (updating) return; // lock
  updating = true;
  try {
    const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
    if (!channel?.isTextBased()) return;

    const id = await ensureStatusMessage(channel);
    const msg = await channel.messages.fetch(id);
    await msg.edit({ embeds: [buildStatusEmbed()] });
  } catch (e) {
    console.error("Update fout:", e.message);
  } finally {
    updating = false;
  }
}

let interval = null;

client.once(Events.ClientReady, async () => {
  console.log(`Ingelogd als ${client.user.tag}`);
  startedAt = Date.now();

  // Presence: watching (server name)
  const g = client.guilds.cache.first() || (await client.guilds.fetch()).first();
  const name = g?.name ?? "this server";
  await client.user.setPresence({ status: "online", activities: [{ name, type: ActivityType.Watching }] });

  await updateStatus();
  interval = setInterval(updateStatus, UPDATE_INTERVAL_MS);
});

process.on("SIGTERM", () => { if (interval) clearInterval(interval); process.exit(0); });
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(token);

// Web service (Render)
const app = express();
app.get("/", (_req, res) => res.status(200).send("Verify Status Bot is running."));
app.get("/health", (_req, res) => res.status(200).json({ ok: true, uptime: process.uptime(), ping: Math.round(client.ws.ping) }));
app.listen(PORT, () => console.log(`Listening on ${PORT} (/health)`));
