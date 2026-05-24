const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// ဒေတာများကို ခေတ္တသိမ်းဆည်းထားမည့် Memory Storage
let configStorage = {
    tgToken: '',
    fbToken: '',
    fbVerify: ''
};
let messageLogs = [];
let userList = [];

// ၁။ Server အလုပ်လုပ်၊ မလုပ် စမ်းသပ်ရန် လမ်းကြောင်း
app.get('/', (req, res) => {
    res.send('🚀 Chatbox Backend Server အလုပ်လုပ်နေပါပြီ!');
});

// ၂။ Dashboard ကနေ Token တွေလှမ်းသိမ်းရင် လက်ခံမည့်နေရာ (ဒီအပိုင်း လိုအပ်နေခဲ့တာပါ)
app.post('/api/save-config', async (req, res) => {
    const { tgToken, fbToken, fbVerify } = req.body;
    configStorage.tgToken = tgToken;
    configStorage.fbToken = fbToken;
    configStorage.fbVerify = fbVerify;
    console.log('✅ Token များကို Server တွင် သိမ်းဆည်းပြီးပါပြီ');

    // Telegram Webhook ကို Bot ထံသို့ အလိုအလျောက် သွားရောက်ချိတ်ဆက်ပေးခြင်း
    if (tgToken) {
        try {
            const webhookUrl = `${req.protocol}://${req.get('host')}/webhook/telegram`;
            await axios.get(`https://api.telegram.org/bot${tgToken}/setWebhook?url=${webhookUrl}`);
            console.log(`🔗 Telegram Webhook Set Successfully: ${webhookUrl}`);
        } catch (error) {
            console.error('❌ Telegram Webhook ချိတ်ဆက်မှု မအောင်မြင်ပါ:', error.message);
        }
    }
    res.sendStatus(200);
});

// ၃။ Dashboard ကနေ ၃ စက္ကန့်တစ်ကြိမ် စာအသစ်ဝင်မဝင် လှမ်းဆွဲမည့်နေရာ
app.get('/api/messages', (req, res) => {
    res.json({ users: userList, logs: messageLogs });
});

// ၄။ Dashboard ပေါ်ကနေ ယူဆာဆီ စာပြန်ရိုက်ပို့လျှင် အလုပ်လုပ်မည့်နေရာ
app.post('/api/send-message', async (req, res) => {
    const { text, userId, platform } = req.body;
    
    // ပို့လိုက်တဲ့စာကို ဒိုင်ခွက်ထဲမှာ မှတ်သားထားရန်
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

// ၅။ TELEGRAM WEBHOOK (Telegram မှ စာဝင်လာလျှင် ဖမ်းမည့်နေရာ)
app.post('/webhook/telegram', (req, res) => {
    const message = req.body.message;
    if (message) {
        const chatId = message.chat.id;
        const text = message.text;
        const firstName = message.chat.first_name || 'Unknown User';
        
        console.log(`📩 Telegram Message ရရှိသည်: [ID: ${chatId}] - ${text}`);
        
        // စာဝင်လာလျှင် သိမ်းဆည်းခြင်း
        messageLogs.push({ userId: chatId, text, sender: 'user', timestamp: new Date() });

        // User စာရင်းထဲ မရှိသေးရင် အသစ်ထည့်ခြင်း၊ ရှိပြီးသားဆိုရင် နောက်ဆုံးစာကို Update လုပ်ခြင်း
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

// ၆။ MESSENGER WEBHOOK (Facebook က လာစစ်လျှင် အတည်ပြုပေးမည့်နေရာ)
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

// ၇။ MESSENGER WEBHOOK (Messenger မှ စာဝင်လာလျှင် ဖမ်းမည့်နေရာ)
app.post('/webhook/messenger', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhookEvent = entry.messaging[0];
            if (webhookEvent && webhookEvent.message) {
                const senderId = webhookEvent.sender.id;
                const text = webhookEvent.message.text;
                console.log(`📩 Messenger Message ရရှိသည်: [ID: ${senderId}] - ${text}`);
                
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

// Server ကို Port ဖွင့်၍ မောင်းနှင်ခြင်း
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🎯 Server is running on port ${PORT}`);
});
