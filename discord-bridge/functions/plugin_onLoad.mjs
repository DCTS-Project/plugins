// Example Imports
import Logger from "../../../modules/functions/logger.mjs";
import path from "path";
import {initDiscordMessageSync} from "./discord/server-chat.mjs";
import JSONTools from "@hackthedev/json-tools";
import fs from "fs";
import {initDiscordChannelSync} from "./discord/channels.mjs";

import {Client, GatewayIntentBits, Events, Partials} from "discord.js";
import logger from "../../../modules/functions/logger.mjs";
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
        return logger.warn("[discord-bridge] Bot Token not set!")
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
        console.log(`Logged in as ${readyClient.user.tag}`);
    });

    client.on(Events.MessageCreate, async message => {
        if (message.author.bot) return;
        if (!message.inGuild()) return;
    });

    initRoleSync();
    initDiscordChannelSync();
    initDiscordMessageSync();

    client.login(pluginSettings.discord.bot_token);

    logger.success("[discord-bridge] Bot is online!")
}