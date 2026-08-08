import { app, io, serverconfig } from "../../../index.mjs";
import { generateId, sanitizeInput, getCastingMemberObject } from "../../../modules/functions/main.mjs";
import { saveChatMessage } from "../../../modules/functions/io.mjs";
import express from "express";
import fs from "fs";
import path from "path";

const WEBHOOKS_FILE = path.join(process.cwd(), "configs", "webhooks.json");

export function onLoad() {
    console.log("[Webhook Plugin] Loading Webhook API Routes...");

    if (!fs.existsSync(WEBHOOKS_FILE)) {
        fs.writeFileSync(WEBHOOKS_FILE, JSON.stringify({}));
    }

    app.post('/api/webhooks/:token', express.json(), async (req, res) => {
        try {
            const token = req.params.token;
            const webhooks = JSON.parse(fs.readFileSync(WEBHOOKS_FILE, 'utf-8'));

            let webhook = Object.values(webhooks).find(wh => wh.token === token);

            if (!webhook) {
                return res.status(404).json({ error: "Webhook not found" });
            }

            const content = req.body.content;
            if (!content) {
                return res.status(400).json({ error: "Message content is required" });
            }

            let messageid = generateId(12);
            let whId = webhook.id;
            let authorName = req.body.username || webhook.name || "Webhook";
            let authorAvatar = req.body.avatar_url || webhook.avatar || "";

            let fakeUserId = `webhook-${whId}`;

            let pluginConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "plugins", "webhook", "config.json"), 'utf-8'));

            serverconfig.servermembers[fakeUserId] = {
                id: fakeUserId,
                name: authorName,
                icon: authorAvatar,
                isOnline: false,
                status: "",
                aboutme: pluginConfig.default_aboutme || "A Webhook",
                joined: Date.now()
            };

            let member = {
                group: webhook.group,
                category: webhook.category,
                channel: webhook.channel,
                message: sanitizeInput(content),
                timestamp: new Date().getTime(),
                messageId: messageid,
                reply: { messageId: null },
                room: `${webhook.group}-${webhook.category}-${webhook.channel}`,
                author: {
                    id: fakeUserId,
                    name: authorName,
                    icon: authorAvatar,
                    isWebhook: true
                }
            };

            member.author = Object.assign(member.author, getCastingMemberObject(serverconfig.servermembers[fakeUserId]));
            member = Object.assign(member, getCastingMemberObject(member));

            await saveChatMessage(member, null);
            io.emit("messageCreate", member);

            res.status(204).send();
        } catch (e) {
            console.error("[Webhook Plugin] Error in webhook receiver:", e);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

}
