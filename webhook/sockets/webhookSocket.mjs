import fs from "fs";
import path from "path";
import { generateId, validateMemberId } from "../../../modules/functions/main.mjs";
import { hasPermission } from "../../../modules/functions/chat/main.mjs";

const WEBHOOKS_FILE = path.join(process.cwd(), "configs", "webhooks.json");

export default (socket) => {
    socket.on('getWebhooks', (data, response) => {
        if (validateMemberId(data?.id, socket, data?.token) === true) {
            if (!hasPermission(data.id, "manageChannels", data.channelId)) {
                return response({ type: 'error', error: "No permission" });
            }

            const channelId = data.channelId;
            const webhooks = fs.existsSync(WEBHOOKS_FILE) ? JSON.parse(fs.readFileSync(WEBHOOKS_FILE, 'utf-8')) : {};

            let channelWebhooks = Object.values(webhooks).filter(wh => wh.channel === channelId);
            response({ type: 'success', data: channelWebhooks });
        }
    });

    socket.on('createWebhook', (data, response) => {
        if (validateMemberId(data?.id, socket, data?.token) === true) {
            if (!hasPermission(data.id, "manageChannels", data.channelId)) {
                return response({ type: 'error', error: "No permission" });
            }

            const group = data.group;
            const category = data.category;
            const channelId = data.channelId;
            const name = data.name || "New Webhook";

            const webhooks = fs.existsSync(WEBHOOKS_FILE) ? JSON.parse(fs.readFileSync(WEBHOOKS_FILE, 'utf-8')) : {};
            let whId = generateId(8);
            let whToken = generateId(32);

            let newWh = {
                id: whId,
                token: whToken,
                group: group,
                category: category,
                channel: channelId,
                name: name,
                avatar: ""
            };

            webhooks[whId] = newWh;
            fs.writeFileSync(WEBHOOKS_FILE, JSON.stringify(webhooks, null, 2));

            response({ type: 'success', data: newWh });
        }
    });

    socket.on('deleteWebhook', (data, response) => {
        if (validateMemberId(data?.id, socket, data?.token) === true) {
            if (!hasPermission(data.id, "manageChannels", data.channelId)) {
                return response({ type: 'error', error: "No permission" });
            }
            const webhooks = fs.existsSync(WEBHOOKS_FILE) ? JSON.parse(fs.readFileSync(WEBHOOKS_FILE, 'utf-8')) : {};

            if (webhooks[data.webhookId]) {
                delete webhooks[data.webhookId];
                fs.writeFileSync(WEBHOOKS_FILE, JSON.stringify(webhooks, null, 2));
                response({ type: 'success' });
            } else {
                response({ type: 'error', error: "Not found" });
            }
        }
    });
};
