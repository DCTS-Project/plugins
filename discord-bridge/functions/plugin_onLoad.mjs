// Example Imports
import path from "path";
import {initDiscordMessageSync} from "./discord/server-chat.mjs";
import JSONTools from "@hackthedev/json-tools";
import fs from "fs";
import {initDiscordChannelSync} from "./discord/channels.mjs";

import {Client, GatewayIntentBits, Events, Partials} from "discord.js";
import Logger from "@hackthedev/terminal-logger";
import {initRoleSync} from "./discord/roles.mjs";

let pluginConfig = JSONTools.tryParse(
    fs.readFileSync(path.join(__dirname, "../config.json"), "utf8"),
    "json"
);

export let pluginSettings = pluginConfig?.settings;
export let client = null;
export const UNCATEGORIZED_ID = "uncategorized";

registerDiscordBridgeBot();

export async function registerDiscordBridgeBot() {
    if(!pluginSettings.discord.bot_token){
        return Logger.warn("[discord-bridge] Bot Token not set!")
    }

    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildPresences,
        ],
        partials: [
            Partials.Message,
            Partials.Channel
        ]
    });

    client.once(Events.ClientReady, readyClient => {
        Logger.debug(`[discord-bridge] Logged in as ${readyClient.user.tag}`);
    });

    client.on(Events.MessageCreate, async message => {
        if (message.author.bot) return;
        if (!message.inGuild()) return;
    });

    client.login(pluginSettings.discord.bot_token);
    Logger.success("[discord-bridge] Bot is online!")

    Logger.info("[discord-bridge] Synchronizing data with discord...")
    initRoleSync();
    initDiscordChannelSync();
    initDiscordMessageSync();
}