const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// 🔗 သင်၏ Render URL အစစ်အမှန်ကို ဤနေရာတွင် တိုက်ရိုက်သတ်မှတ်ပေးလိုက်ပါသည်
const RENDER_BACKEND_URL = "https://my-custom-chatbox.onrender.com"; 

let configStorage = {
    tgToken: '',
    fbToken: '',
    fbVerify: ''
};
let messageLogs = [];
let userList = [];

app.get('/', (req, res) => {
    res.send('🚀 Chatbox Backend Server အလုပ်လုပ်နေပါပြီ!');
});

// Dashboard မှ Token များ လှမ်းသိမ်းသည့်နေရာ
app.post('/api/save-config', async (req, res) => {
    const { tgToken, fbToken, fbVerify } = req.body;
    configStorage.tgToken = tgToken;
    configStorage.fbToken = fbToken;
    configStorage.fbVerify = fbVerify;
    console.log('✅ Token များကို Server တွင် သိမ်းဆည်းပြီးပါပြီ');

    // Webhook ကို Render URL အစစ်ဖြင့် အတင်းအကျပ် သတ်မှတ်ခြင်း
    if (tgToken) {
        try {
            const webhookUrl = `${RENDER_BACKEND_URL}/webhook/telegram`;
            console.log(`📡 Telegram သို့ Webhook Link ပို့နေသည်: ${webhookUrl}`);
            
            const tgRes = await axios.get(`https://api.telegram.org/bot${tgToken}/setWebhook?url=${webhookUrl}`);
            console.log('🟢 Telegram Response:', tgRes.data);
        } catch (error) {
            console.error('❌ Telegram Webhook ချိတ်ဆက်မှု မအောင်မြင်ပါ:', error.response ? error.response.data : error.message);
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

    if (platform === 'Telegram' && configStorage.tgToken) {
        try {
            await axios.post(`https://api.telegram.org/bot${configStorage.tgToken}/sendMessage`, {
                chat_id: userId,
                text: text
            });
        } catch (err) {
            console.error('❌ Telegram သို့ စာပို့မရပါ:', err.message);
        }
    }
    res.sendStatus(200);
});

app.post('/webhook/telegram', (req, res) => {
    console.log('📥 Telegram Webhook သို့ စာဝင်လာသည်:', JSON.stringify(req.body));
    
    const message = req.body.message;
    if (message) {
        const chatId = message.chat.id;
        const text = message.text || '';
        const firstName = message.chat.first_name || 'Unknown User';
        
        messageLogs.push({ userId: chatId, text, sender: 'user', timestamp: new Date() });

        const userExist = userList.find(u => u.id == chatId);
        if (!userExist) {
            userList.push({ id: chatId, name: firstName, platform: 'Telegram', lastMsg: text, gender: 'Not Specified', time: 'Just Now' });
        } else {
            userExist.lastMsg = text;
            userExist.time = 'Just Now';
        }
    }
    res.sendStatus(200);
});

app.get('/webhook/messenger', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === configStorage.fbVerify) {
            console.log('✅ Facebook Webhook အတည်ပြုချက် အောင်မြင်သည်!');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

app.post('/webhook/messenger', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhookEvent = entry.messaging[0];
            if (webhookEvent && webhookEvent.message) {
                const senderId = webhookEvent.sender.id;
                const text = webhookEvent.message.text;
                
                messageLogs.push({ userId: senderId, text, sender: 'user', timestamp: new Date() });

                const userExist = userList.find(u => u.id == senderId);
                if (!userExist) {
                    userList.push({ id: senderId, name: `FB User ${senderId.substring(0,5)}`, platform: 'Messenger', lastMsg: text, gender: 'Not Specified', time: 'Just Now' });
                } else {
                    userExist.lastMsg = text;
                    userExist.time = 'Just Now';
                }
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🎯 Server is running on port ${PORT}`);
});
