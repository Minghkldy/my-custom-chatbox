const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// ၁။ Server အလုပ်လုပ်၊ မလုပ် စမ်းသပ်ရန် လမ်းကြောင်း
app.get('/', (req, res) => {
    res.send('🚀 Chatbox Backend Server အလုပ်လုပ်နေပါပြီ!');
});

// ၂။ TELEGRAM WEBHOOK (Telegram မှ စာဝင်လာလျှင် ဖမ်းမည့်နေရာ)
app.post('/webhook/telegram', (req, res) => {
    const message = req.body.message;
    if (message) {
        const chatId = message.chat.id;
        const text = message.text;
        console.log(`📩 Telegram Message ရရှိသည်: [ID: ${chatId}] - ${text}`);
        
        // အနာဂတ်မှာ ဒီနေရာကနေ ကိုယ့် Website Dashboard ဆီ မက်ဆေ့ခ်ျ လှမ်းပို့ပေးမှာပါ
    }
    res.sendStatus(200);
});

// ၃။ MESSENGER WEBHOOK (Facebook က လာစစ်လျှင် အတည်ပြုပေးမည့်နေရာ)
app.get('/webhook/messenger', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.MESSENGER_VERIFY_TOKEN) {
            console.log('✅ Facebook Webhook အတည်ပြုချက် အောင်မြင်သည်!');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

// ၄။ MESSENGER WEBHOOK (Messenger မှ စာဝင်လာလျှင် ဖမ်းမည့်နေရာ)
app.post('/webhook/messenger', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhookEvent = entry.messaging[0];
            if (webhookEvent && webhookEvent.message) {
                const senderId = webhookEvent.sender.id;
                const text = webhookEvent.message.text;
                console.log(`📩 Messenger Message ရရှိသည်: [ID: ${senderId}] - ${text}`);
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
