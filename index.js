import { Client, GatewayIntentBits, ActivityType, Events } from "discord.js";

const token = process.env.DISCORD_TOKEN;     // Vereist
const TARGET_GUILD_ID = process.env.GUILD_ID; // Optioneel: forceer een specifieke server

if (!token) {
  console.error("DISCORD_TOKEN ontbreekt in env.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds], // Alleen Guilds is genoeg
});

async function setWatchingPresence() {
  try {
    let guild;

    // Kies een server: specifieke (GUILD_ID) of de eerste waar de bot in zit
    if (TARGET_GUILD_ID) {
      guild = await client.guilds.fetch(TARGET_GUILD_ID);
    } else {
      // Pak uit cache of fetch lijst en neem de eerste
      guild = client.guilds.cache.first();
      if (!guild) {
        // fetch() geeft een Collection terug
        const all = await client.guilds.fetch();
        guild = all.first();
      }
    }

    const serverName = guild?.name ?? "this server";

    await client.user.setPresence({
      status: "online",
      activities: [{ name: serverName, type: ActivityType.Watching }],
    });

    console.log(`✅ Presence ingesteld: Watching ${serverName}`);
  } catch (err) {
    console.error("Kon presence niet instellen:", err);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`🔐 Ingelogd als ${client.user.tag}`);
  await setWatchingPresence();
});

// Als de bot aan een nieuwe server wordt toegevoegd/verwijderd, probeer presence te updaten
client.on(Events.GuildCreate, setWatchingPresence);
client.on(Events.GuildDelete, setWatchingPresence);

// Nettere foutlogs
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(token);
