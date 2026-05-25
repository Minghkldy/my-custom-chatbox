const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());

const RENDER_BACKEND_URL = "https://my-custom-chatbox.onrender.com"; 

let configStorage = {
    tgToken: '',
    fbToken: '',
    fbVerify: process.env.MESSENGER_VERIFY_TOKEN || 'mySecretVerify123'
};
let messageLogs = [];
let userList = [];

app.get('/', (req, res) => {
    res.send('🚀 Chatbox Backend Server အလုပ်လုပ်နေပါပြီ!');
});

app.post('/api/save-config', async (req, res) => {
    const { tgToken, fbToken, fbVerify } = req.body;
    configStorage.tgToken = tgToken;
    configStorage.fbToken = fbToken;
    configStorage.fbVerify = fbVerify;
    console.log('✅ Token များကို Server တွင် သိမ်းဆည်းပြီးပါပြီ');

    if (tgToken) {
        try {
            const webhookUrl = `${RENDER_BACKEND_URL}/webhook/telegram`;
            const tgRes = await axios.get(`https://api.telegram.org/bot${tgToken}/setWebhook?url=${webhookUrl}`);
            console.log('🟢 Telegram Response:', tgRes.data);
        } catch (error) {
            console.error('❌ Telegram Webhook ချိတ်ဆက်မှု မအောင်မြင်ပါ:', error.message);
        }
    }
    res.sendStatus(200);
});

app.get('/api/messages', (req, res) => {
    res.json({ users: userList, logs: messageLogs });
});

app.post('/api/send-message', async (req, res) => {
    const { text, userId, platform } = req.body;
    messageLogs.push({ userId, text, sender: 'admin', timestamp: new Date() });

    const user = userList.find(u => u.id == userId);
    if (user) {
        user.unread = 0;
        user.lastMsg = text.startsWith('http') && (text.match(/\.(jpeg|jpg|gif|png)$/) || text.includes('file/bot') || text.includes('api.imgbb.com')) ? '📷 Photo' : text;
        user.time = 'Just Now';
        userList = [user, ...userList.filter(u => u.id != userId)];
    }

    if (platform === 'Telegram' && configStorage.tgToken) {
        try {
            const isPhoto = text.startsWith('http') && (text.match(/\.(jpeg|jpg|gif|png)$/) || text.includes('file/bot') || text.includes('api.imgbb.com'));
            if (isPhoto) {
                await axios.post(`https://api.telegram.org/bot${configStorage.tgToken}/sendPhoto`, { chat_id: userId, photo: text });
            } else {
                await axios.post(`https://api.telegram.org/bot${configStorage.tgToken}/sendMessage`, { chat_id: userId, text: text });
            }
        } catch (err) {
            console.error('❌ Telegram သို့ စာပို့မရပါ:', err.message);
        }
    }

    if ((platform === 'Messenger' || platform === 'Facebook') && configStorage.fbToken) {
        try {
            const isPhoto = text.startsWith('http') && (text.match(/\.(jpeg|jpg|gif|png)$/) || text.includes('api.imgbb.com'));
            let messagePayload = { text: text };
            if (isPhoto) {
                messagePayload = { attachment: { type: "image", payload: { url: text, is_reusable: true } } };
            }
            // Version အသစ် v20.0 သို့ ပြောင်းလဲထားသည်
            await axios.post(`https://graph.facebook.com/v20.0/me/messages?access_token=${configStorage.fbToken}`, {
                recipient: { id: userId },
                message: messagePayload
            });
            console.log(`🟢 FB User ${userId} ထံသို့ စာ/ပုံ ပို့ဆောင်မှု အောင်မြင်သည်`);
        } catch (err) {
            console.error('❌ Facebook Messenger သို့ စာပို့မရပါ:', err.response ? err.response.data : err.message);
        }
    }
    res.sendStatus(200);
});

app.post('/api/broadcast', async (req, res) => {
    const { text, imageUrl } = req.body;
    for (const user of userList) {
        if (user.platform === 'Telegram' && configStorage.tgToken) {
            try {
                if (imageUrl) await axios.post(`https://api.telegram.org/bot${configStorage.tgToken}/sendPhoto`, { chat_id: user.id, photo: imageUrl });
                if (text) await axios.post(`https://api.telegram.org/bot${configStorage.tgToken}/sendMessage`, { chat_id: user.id, text: text });
            } catch (err) { console.error(`❌ TG Broadcast ပို့မရပါ:`, err.message); }
        }
        if ((user.platform === 'Messenger' || user.platform === 'Facebook') && configStorage.fbToken) {
            try {
                if (imageUrl) await axios.post(`https://graph.facebook.com/v20.0/me/messages?access_token=${configStorage.fbToken}`, { recipient: { id: user.id }, message: { attachment: { type: "image", payload: { url: imageUrl, is_reusable: true } } } });
                if (text) await axios.post(`https://graph.facebook.com/v20.0/me/messages?access_token=${configStorage.fbToken}`, { recipient: { id: user.id }, message: { text: text } });
            } catch (err) { console.error(`❌ FB Broadcast ပို့မရပါ:`, err.response ? err.response.data : err.message); }
        }
    }
    res.status(200).send({ success: true, message: 'Broadcast sent successfully!' });
});

app.post('/api/mark-read', (req, res) => {
    const { userId } = req.body;
    const user = userList.find(u => u.id == userId);
    if (user) user.unread = 0;
    res.sendStatus(200);
});

// ပြင်ဆင်ထားသည့် Telegram Webhook Handler အသစ်
app.post('/webhook/telegram', async (req, res) => {
    const message = req.body.message;
    if (message) {
        const chatId = message.chat.id;
        const firstName = message.chat.first_name || 'Unknown User';
        let text = message.text || '';
        if (message.photo) {
            try {
                const fileId = message.photo[message.photo.length - 1].file_id;
                const fileRes = await axios.get(`https://api.telegram.org/bot${configStorage.tgToken}/getFile?file_id=${fileId}`);
                text = `https://api.telegram.org/file/bot${configStorage.tgToken}/${fileRes.data.result.file_path}`;
            } catch (pErr) { text = '📷 Photo'; }
        }
        messageLogs.push({ userId: chatId, text, sender: 'user', timestamp: new Date() });
        const userIdx = userList.findIndex(u => u.id == chatId);
        if (userIdx !== -1) {
            userList[userIdx].lastMsg = text.startsWith('http') ? '📷 Photo' : text;
            userList[userIdx].unread = (userList[userIdx].unread || 0) + 1;
            userList.unshift(userList.splice(userIdx, 1)[0]);
        } else {
            userList.unshift({ id: chatId, name: firstName, platform: 'Telegram', lastMsg: text.startsWith('http') ? '📷 Photo' : text, unread: 1 });
        }
    }
    res.sendStatus(200);
});

app.get('/webhook/messenger', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === configStorage.fbVerify) res.status(200).send(challenge);
    else res.sendStatus(403);
});

app.post('/webhook/messenger', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            if (!entry.messaging) return;
            const event = entry.messaging[0];
            if (event && event.message) {
                const senderId = event.sender.id;
                let text = event.message.text || (event.message.attachments ? event.message.attachments[0].payload.url : '');
                messageLogs.push({ userId: senderId, text, sender: 'user', timestamp: new Date() });
                const userIdx = userList.findIndex(u => u.id == senderId);
                if (userIdx !== -1) {
                    userList[userIdx].lastMsg = text.startsWith('http') ? '📷 Photo' : text;
                    userList[userIdx].unread = (userList[userIdx].unread || 0) + 1;
                    userList.unshift(userList.splice(userIdx, 1)[0]);
                } else {
                    userList.unshift({ id: senderId, name: `FB User ${senderId.substring(0,5)}`, platform: 'Messenger', lastMsg: text.startsWith('http') ? '📷 Photo' : text, unread: 1 });
                }
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else res.sendStatus(404);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🎯 Server is running on port ${PORT}`));
